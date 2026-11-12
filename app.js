require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');
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
// CLOUDINARY FILE PROXY
// ======================================================
// Safely serves only files from this project's Cloudinary account.
// Use ?download=1 to force download; otherwise files are served inline.
const normalizeCloudinaryUrl = (value) => {
    if (!value) return '';

    let url = String(value).trim();
    const marker = 'https://res.cloudinary.com/';
    const markerIndex = url.lastIndexOf(marker);

    // Handles accidentally prefixed values such as:
    // https://api.stellarevisa.com/https://res.cloudinary.com/...
    if (markerIndex >= 0) {
        url = url.substring(markerIndex);
    }

    return url;
};

const sanitizeDownloadFilename = (value) => {
    return String(value || 'document')
        .replace(/[\r\n"]/g, '')
        .replace(/[\\/:*?<>|]/g, '_')
        .slice(0, 180) || 'document';
};

app.get('/file-proxy', (req, res) => {
    const fileUrl = normalizeCloudinaryUrl(req.query.url);
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

    if (!fileUrl || !cloudName) {
        return res.status(400).json({
            success: false,
            message: 'Invalid file request'
        });
    }

    let parsed;
    try {
        parsed = new URL(fileUrl);
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: 'Invalid file URL'
        });
    }

    // Prevent SSRF: only allow this project's Cloudinary delivery host/path.
    if (
        parsed.protocol !== 'https:' ||
        parsed.hostname !== 'res.cloudinary.com' ||
        !parsed.pathname.startsWith(`/${cloudName}/`)
    ) {
        return res.status(403).json({
            success: false,
            message: 'File host not allowed'
        });
    }

    const requestedName = sanitizeDownloadFilename(
        req.query.filename ||
        decodeURIComponent(parsed.pathname.split('/').pop() || 'document')
    );

    const disposition = req.query.download === '1' ? 'attachment' : 'inline';

    const pipeCloudinary = (url, redirects = 0) => {
        if (redirects > 3) {
            return res.status(502).json({
                success: false,
                message: 'Too many redirects while fetching file'
            });
        }

        const upstreamRequest = https.get(url, (upstream) => {
            const statusCode = upstream.statusCode || 500;

            if ([301, 302, 307, 308].includes(statusCode) && upstream.headers.location) {
                upstream.resume();
                const redirectUrl = new URL(upstream.headers.location, url).toString();
                return pipeCloudinary(redirectUrl, redirects + 1);
            }

            if (statusCode < 200 || statusCode >= 300) {
                upstream.resume();
                return res.status(statusCode).json({
                    success: false,
                    message: `Cloudinary returned HTTP ${statusCode}`
                });
            }

            if (upstream.headers['content-type']) {
                res.setHeader('Content-Type', upstream.headers['content-type']);
            }

            if (upstream.headers['content-length']) {
                res.setHeader('Content-Length', upstream.headers['content-length']);
            }

            res.setHeader(
                'Content-Disposition',
                `${disposition}; filename="${requestedName}"`
            );
            res.setHeader('Cache-Control', 'private, max-age=60');

            upstream.pipe(res);
        });

        upstreamRequest.setTimeout(20000, () => {
            upstreamRequest.destroy(new Error('Cloudinary request timed out'));
        });

        upstreamRequest.on('error', (error) => {
            console.error('Cloudinary file proxy error:', error.message);

            if (!res.headersSent) {
                return res.status(502).json({
                    success: false,
                    message: 'Unable to fetch document'
                });
            }

            res.end();
        });
    };

    return pipeCloudinary(fileUrl);
});


// ======================================================
// LEGACY MALFORMED CLOUDINARY URL COMPATIBILITY
// ======================================================
// Handles old/cached Admin/Super Admin requests like:
// /https://res.cloudinary.com/<cloud>/...
app.use((req, res, next) => {
    if (!req.originalUrl.startsWith('/https://res.cloudinary.com/')) {
        return next();
    }

    const repairedUrl = req.originalUrl.substring(1);
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

    let parsed;
    try {
        parsed = new URL(repairedUrl);
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: 'Invalid Cloudinary file URL'
        });
    }

    if (
        parsed.protocol !== 'https:' ||
        parsed.hostname !== 'res.cloudinary.com' ||
        !cloudName ||
        !parsed.pathname.startsWith(`/${cloudName}/`)
    ) {
        return res.status(403).json({
            success: false,
            message: 'Cloudinary file host not allowed'
        });
    }

    const requestedName = sanitizeDownloadFilename(
        decodeURIComponent(parsed.pathname.split('/').pop() || 'document')
    );

    const pipeLegacyCloudinary = (url, redirects = 0) => {
        if (redirects > 3) {
            return res.status(502).json({
                success: false,
                message: 'Too many redirects while fetching file'
            });
        }

        const upstreamRequest = https.get(url, (upstream) => {
            const statusCode = upstream.statusCode || 500;

            if (
                [301, 302, 307, 308].includes(statusCode) &&
                upstream.headers.location
            ) {
                upstream.resume();

                let redirectUrl;
                try {
                    redirectUrl = new URL(upstream.headers.location, url);
                } catch (error) {
                    return res.status(502).json({
                        success: false,
                        message: 'Invalid redirect from Cloudinary'
                    });
                }

                if (
                    redirectUrl.protocol !== 'https:' ||
                    redirectUrl.hostname !== 'res.cloudinary.com'
                ) {
                    return res.status(403).json({
                        success: false,
                        message: 'Redirect host not allowed'
                    });
                }

                return pipeLegacyCloudinary(
                    redirectUrl.toString(),
                    redirects + 1
                );
            }

            if (statusCode < 200 || statusCode >= 300) {
                upstream.resume();

                return res.status(statusCode).json({
                    success: false,
                    message: `Cloudinary returned HTTP ${statusCode}`
                });
            }

            if (upstream.headers['content-type']) {
                res.setHeader(
                    'Content-Type',
                    upstream.headers['content-type']
                );
            }

            if (upstream.headers['content-length']) {
                res.setHeader(
                    'Content-Length',
                    upstream.headers['content-length']
                );
            }

            res.setHeader(
                'Content-Disposition',
                `inline; filename="${requestedName}"`
            );

            res.setHeader(
                'Cache-Control',
                'private, max-age=60'
            );

            upstream.pipe(res);
        });

        upstreamRequest.setTimeout(20000, () => {
            upstreamRequest.destroy(
                new Error('Cloudinary request timed out')
            );
        });

        upstreamRequest.on('error', (error) => {
            console.error(
                'Legacy Cloudinary proxy error:',
                error.message
            );

            if (!res.headersSent) {
                return res.status(502).json({
                    success: false,
                    message: 'Unable to fetch document'
                });
            }

            res.end();
        });
    };

    return pipeLegacyCloudinary(repairedUrl);
});

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
