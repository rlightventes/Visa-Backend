const router = require('express').Router();
const authController = require('../controller/auth.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/profile', verifyToken, authController.profile);

router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

router.post('/validate-token', authController.validateToken);

// Google OAuth routes
router.post('/google-login', authController.googleLogin);

module.exports = router;