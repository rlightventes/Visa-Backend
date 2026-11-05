require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const morgan = require('morgan');
const path = require('path');
const net = require('net');

const app = express();

// Initialize Socket.IO service
const socketService = require('./services/socket.service');

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
socketService.initialize(server);

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(cors());

app.use(express.json({
    limit: '100mb'
}));

app.use(express.urlencoded({
    limit: '100mb',
    extended: true
}));

app.use(morgan('dev'));


// ======================================================
// DATABASE
// ======================================================

const { sequelize } = require('./models');

const {
    verifyAdminToken,
    verifyToken,
    verifyVendorToken
} = require('./middlewares/auth.middleware');


// ======================================================
// TEST API
// ======================================================

app.get('/', (req, res) => {
    return res.status(200).json({
        message: 'API is working fine!'
    });
});


// ======================================================
// TEMPORARY MYSQL TCP TEST
// ======================================================

app.get('/debug-mysql-tcp', (req, res) => {

    const host = process.env.DB_HOST || '193.203.184.158';
    const port = Number(process.env.DB_PORT || 3306);

    console.log(`Testing TCP connection to ${host}:${port}`);

    const socket = net.createConnection({
        host: host,
        port: port
    });

    let responseSent = false;

    const sendResponse = (statusCode, data) => {

        if (responseSent) {
            return;
        }

        responseSent = true;

        try {
            socket.destroy();
        } catch (error) {
            // Ignore socket cleanup errors
        }

        return res.status(statusCode).json(data);
    };

    socket.setTimeout(10000);

    socket.on('connect', () => {

        console.log(`TCP_CONNECTED to ${host}:${port}`);

        return sendResponse(200, {
            result: 'TCP_CONNECTED',
            host: host,
            port: port
        });

    });

    socket.on('timeout', () => {

        console.error(`TCP_TIMEOUT to ${host}:${port}`);

        return sendResponse(504, {
            result: 'TCP_TIMEOUT',
            host: host,
            port: port
        });

    });

    socket.on('error', (err) => {

        console.error(
            `TCP_ERROR to ${host}:${port}`,
            err.code,
            err.message
        );

        return sendResponse(500, {
            result: 'TCP_ERROR',
            code: err.code,
            message: err.message,
            host: host,
            port: port
        });

    });

});


// ======================================================
// TEMPORARY SEQUELIZE DATABASE TEST
// ======================================================

app.get('/debug-database', async (req, res) => {

    try {

        const startTime = Date.now();

        await sequelize.authenticate();

        const duration = Date.now() - startTime;

        console.log(
            `Database connection successful in ${duration} ms`
        );

        return res.status(200).json({
            success: true,
            message: 'Database connection successful',
            duration: `${duration} ms`,
            host: process.env.DB_HOST || 'NOT SET',
            port: process.env.DB_PORT || 3306
        });

    } catch (error) {

        console.error(
            'Database connection failed:',
            error
        );

        return res.status(500).json({
            success: false,
            message: 'Database connection failed',
            error: error.message,
            code:
                error.original?.code ||
                error.parent?.code ||
                error.code ||
                null,
            host: process.env.DB_HOST || 'NOT SET',
            port: process.env.DB_PORT || 3306
        });

    }

});


// ======================================================
// API ROUTES
// ======================================================

app.use(
    '/auth',
    require('./routes/auth.routes')
);

app.use(
    '/admin',
    require('./routes/admin.routes')
);

app.use(
    '/vendor',
    require('./routes/vendor.routes')
);

app.use(
    '/user',
    require('./routes/user.routes')
);

app.use(
    '/coupon',
    require('./routes/coupon.routes')
);

app.use(
    '/notifications',
    require('./routes/notification.routes')
);

app.use(
    '/support',
    require('./routes/support.routes')
);


// ======================================================
// STATIC FILES
// ======================================================

app.use(
    '/uploads',
    express.static(
        path.join(__dirname, 'uploads')
    )
);


// ======================================================
// 404 HANDLER
// ======================================================

app.use((req, res) => {

    return res.status(404).json({
        success: false,
        message: 'Route not found'
    });

});


// ======================================================
// ERROR HANDLER
// ======================================================

app.use((err, req, res, next) => {

    console.error(
        'Unhandled application error:',
        err
    );

    return res.status(500).json({
        success: false,
        message: 'Internal server error'
    });

});


// ======================================================
// START SERVER
// ======================================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {

    console.log('======================================');

    console.log(
        `Server running on port ${PORT}`
    );

    console.log(
        `Environment: ${process.env.NODE_ENV || 'development'}`
    );

    console.log(
        `Database Host: ${process.env.DB_HOST || 'NOT SET'}`
    );

    console.log(
        `Database Port: ${process.env.DB_PORT || 3306}`
    );

    console.log(
        'Socket.IO server initialized'
    );

    console.log('======================================');

});
