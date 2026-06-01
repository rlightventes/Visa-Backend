require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const app = express();
const morgan = require('morgan');
const path = require('path');

// Initialize Socket.IO service
const socketService = require('./services/socket.service');

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
socketService.initialize(server);

// Enable max limit of 100mb for the request body
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Database connection
const { sequelize } = require('./models');
const { verifyAdminToken, verifyToken, verifyVendorToken } = require('./middlewares/auth.middleware');

// sequelize.sync()
//     .then(() => console.log('Database connected'))
//     .catch(err => console.error('Database connection error:', err));

// Routes

// Test endpoint to check if API is working
app.get('/', (req, res) => {
    res.status(200).json({ message: 'API is working fine!' });
});

// Define your API endpoints
app.use('/auth', require('./routes/auth.routes'));
app.use('/admin',  require('./routes/admin.routes'));
app.use('/vendor',  require('./routes/vendor.routes'));
app.use('/user', require('./routes/user.routes'));
app.use('/coupon', require('./routes/coupon.routes'));
app.use('/notifications', require('./routes/notification.routes'));
app.use('/support', require('./routes/support.routes'));

// Error-handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Serve static files from the uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Socket.IO server initialized on port ${PORT}`);
});
