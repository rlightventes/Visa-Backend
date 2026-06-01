const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const couponController = require('../controller/coupon.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

/**
 * @route POST /api/coupon/verify
 * @description Verify coupon code and calculate discount
 * @access Private (Both User and Vendor)
 */
router.post('/verify', 
    verifyToken,
    [
        body('coupon_code')
            .notEmpty()
            .withMessage('Coupon code is required')
            .trim()
            .isLength({ min: 1, max: 50 })
            .withMessage('Coupon code must be between 1 and 50 characters'),
        body('order_amount')
            .notEmpty()
            .withMessage('Order amount is required')
            .isNumeric()
            .withMessage('Order amount must be a number')
            .custom(value => {
                if (parseFloat(value) <= 0) {
                    throw new Error('Order amount must be greater than 0');
                }
                return true;
            }),
        body('from')
            .optional()
            .isIn(['user', 'vendor'])
            .withMessage('From parameter must be either "user" or "vendor"')
    ],
    couponController.verifyCoupon
);

/**
 * @route GET /api/coupon/active
 * @description Get active coupons for user type
 * @access Private (Both User and Vendor)
 */
router.get('/active',
    verifyToken,
    [
        query('from')
            .optional()
            .isIn(['user', 'vendor'])
            .withMessage('From parameter must be either "user" or "vendor"')
    ],
    couponController.getActiveCoupons
);

/**
 * @route GET /api/coupon/usage-history
 * @description Get user's coupon usage history
 * @access Private (Both User and Vendor)
 */
router.get('/usage-history',
    verifyToken,
    [
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Page must be a positive integer'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100')
    ],
    couponController.getCouponUsageHistory
);

/**
 * @route POST /api/coupon/remove
 * @description Remove coupon from application (before payment)
 * @access Private (Both User and Vendor)
 */
router.post('/remove',
    verifyToken,
    [
        body('visa_application_id')
            .notEmpty()
            .withMessage('Visa application ID is required')
            .isUUID()
            .withMessage('Visa application ID must be a valid UUID')
    ],
    couponController.removeCoupon
);

module.exports = router;
