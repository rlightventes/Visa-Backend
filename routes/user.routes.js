const express = require('express');
const router = express.Router();
const userController = require('../controller/user.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const upload = require('../middlewares/upload.middleware');

const uploadFields = [
    { name: 'passport_size_photo', maxCount: 1 },
    { name: 'passport_front_photo', maxCount: 1 },
    { name: 'passport_back_photo', maxCount: 1 },
    { name: 'passport_external_cover', maxCount: 1 },
    { name: 'profile', maxCount: 1 },
];

const imageUpload = upload.fields(uploadFields);

// Visa Application Routes
router.post('/create-visa-application', verifyToken, imageUpload, userController.createVisaApplication);
router.get('/get-visa-applications', verifyToken, userController.getUserVisaApplications);
router.get('/get-visa-application/:id', verifyToken, userController.getVisaApplicationDetails);
router.get('/get-visa-applications-for-support', verifyToken, userController.getVisaApplicationsForSupport);

router.get('/get-profile', verifyToken, userController.getUserProfile);
router.put('/update-profile', verifyToken, imageUpload, userController.updateUserProfile);

// add api to update existing user account password
router.put('/update-password', verifyToken, userController.updatePassword);

// Passport scanning routes
router.post('/scan-passport', upload.single('passport_image'), userController.scanPassport);
router.post('/scan-passport-with-validation', verifyToken, upload.single('passport_image'), userController.scanPassportWithValidation);

// Contact us route
router.post('/contact-us', userController.contactUs);

module.exports = router; 