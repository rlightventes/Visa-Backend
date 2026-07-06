const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log('CLOUDINARY CONFIG CHECK:', {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key_exists: !!process.env.CLOUDINARY_API_KEY,
    api_secret_exists: !!process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: (req, file) => {
        // FIX: Some browsers/OS (mobile Safari, some Android upload flows) send
        // 'application/octet-stream' or a blank mimetype for PDFs instead of
        // 'application/pdf'. Relying only on mimetype caused PDFs to be stored
        // with resource_type 'image' instead of 'raw', which later breaks
        // fetching them (Cloudinary has no 'raw' asset for that public_id).
        // Now we also fall back to checking the file extension.
     const publicId =
    file.fieldname
        .replace(/\[(\d+)\]/g, '_$1')
        .replace(/\[([^\]]+)\]/g, '_$1')
        .replace(/[^a-zA-Z0-9_\-]/g, '_') +
    '-' +
    Date.now() +
    '-' +
    Math.round(Math.random() * 1e9) +
    (isPDF ? '.pdf' : '');

       return {
    folder: 'documents',
    resource_type: isPDF ? 'raw' : 'image',
    public_id: publicId
};
    }
});

const fileFilter = (req, file, cb) => {
    const allowedMimes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf'
    ];

    // FIX: Also allow PDFs whose mimetype was reported incorrectly by the
    // browser, as long as the filename extension is .pdf. Without this,
    // such files could get rejected outright by the filter before even
    // reaching the storage engine above.
    const isPDFByExtension = /\.pdf$/i.test(file.originalname || '');

    if (allowedMimes.includes(file.mimetype) || isPDFByExtension) {
        cb(null, true);
    } else {
        cb(new Error(`❌ Invalid file type: ${file.mimetype}. Only images and PDFs are allowed!`), false);
    }
};

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
