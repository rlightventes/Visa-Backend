const axios = require('axios');
const fs = require('fs');
const path = require('path');
// Create uploads folder if not exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const app = express();
const morgan = require('morgan');
// Initialize Socket.IO service
const socketService = require('./services/socket.service');
// Create HTTP server
const server = http.createServer(app);
// Initialize Socket.IO
socketService.initialize(server);
// Enable max limit of 100mb for the request body
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// ✅ IMPROVED CORS Configuration
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://stellarevisa.com',
      'https://www.stellarevisa.com',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    ];
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(null, true); // Allow anyway for now (can be stricter later)
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 3600,
  optionsSuccessStatus: 200
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Database connection
const { sequelize } = require('./models');
const { verifyAdminToken, verifyToken, verifyVendorToken } = require('./middlewares/auth.middleware');

// sequelize.sync()
//     .then(() => console.log('Database connected'))
//     .catch(err => console.error('Database connection error:', err));
// Proxy fix for frontend double-URL issue
app.get(/^\/https?:\/\/(.*)$/, async (req, res) => {
    const fullUrl = req.url.slice(1);
    try {
        const response = await axios({
            method: 'get',
            url: fullUrl,
            responseType: 'stream'
        });
        res.setHeader('Content-Type', response.headers['content-type']);
        response.data.pipe(res);
    } catch (err) {
        console.error('Proxy fetch error:', err.message);
        res.status(502).json({ success: false, message: 'Failed to fetch resource' });
    }
});

// Test endpoint to check if API is working
app.get('/', (req, res) => {
    res.status(200).json({ message: 'API is working fine!' });
});
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
    console.log(`✅ CORS enabled for frontend access`);
});
