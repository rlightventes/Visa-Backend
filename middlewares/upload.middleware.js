const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Cloudinary storage for multer
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: (req, file) => {
        return {
            folder: 'documents',
            resource_type: 'auto',
            public_id: file.fieldname + '-' + Date.now() + '-' + Math.round(Math.random() * 1E9)
        };
    }
});

// File filter - only images and PDFs allowed
const fileFilter = (req, file, cb) => {
    const allowedMimes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf'
    ];

    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`❌ Invalid file type: ${file.mimetype}. Only images and PDFs are allowed!`), false);
    }
};

// Create multer instance
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024,
        files: 130,
        fields: 150,
    },
    fileFilter: fileFilter,
    onError: (err, next) => {
        console.error('Multer Error:', err.message);
        next(err);
    }
});

module.exports = upload;
