const couponService = require('../services/coupon.service');
const { validationResult } = require('express-validator');
const db = require('../models');

class CouponController {

    /**
     * Verify coupon code and calculate discount
     * POST /api/coupon/verify
     */
    async verifyCoupon(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: "Validation failed",
                    errors: errors.array()
                });
            }

            const { coupon_code, order_amount, from = 'user' } = req.body;
            const userId = req.user.id;
            const userType = from === 'vendor' ? 'vendor' : 'user';

            // Validate coupon
            const result = await couponService.validateCouponCode(
                coupon_code, 
                parseFloat(order_amount), 
                userId, 
                userType
            );

            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    message: result.message
                });
            }

            return res.status(200).json({
                success: true,
                message: "Coupon verified successfully",
                data: {
                    coupon_id: result.data.coupon_id,
                    code: result.data.code,
                    name: result.data.name,
                    discount_type: result.data.discount_type,
                    discount_value: result.data.discount_value,
                    discount_amount: result.data.discount_amount,
                    original_amount: parseFloat(order_amount),
                    final_amount: result.data.final_amount,
                    savings: result.data.discount_amount
                }
            });

        } catch (error) {
            console.error('verifyCoupon error:', error);
            return res.status(500).json({
                success: false,
                message: "Internal server error"
            });
        }
    }

    /**
     * Get active coupons for user
     * GET /api/coupon/active
     */
    async getActiveCoupons(req, res) {
        try {
            const { from = 'user' } = req.query;
            const userType = from === 'vendor' ? 'vendor' : 'user';

            const coupons = await couponService.getActiveCouponsForUser(userType);

            return res.status(200).json({
                success: true,
                message: "Active coupons fetched successfully",
                data: {
                    coupons: coupons,
                    count: coupons.length
                }
            });

        } catch (error) {
            console.error('getActiveCoupons error:', error);
            return res.status(500).json({
                success: false,
                message: "Internal server error"
            });
        }
    }

    /**
     * Get user's coupon usage history
     * GET /api/coupon/usage-history
     */
    async getCouponUsageHistory(req, res) {
        try {
            const userId = req.user.id;
            const { page = 1, limit = 10 } = req.query;

            const offset = (page - 1) * limit;

            const usageHistory = await db.CouponUsage.findAndCountAll({
                where: { user_id: userId },
                include: [
                    {
                        model: db.Coupon,
                        as: 'coupon',
                        attributes: ['code', 'name', 'discount_type']
                    },
                    {
                        model: db.VisaApplication,
                        as: 'visaApplication',
                        attributes: ['application_id']
                    }
                ],
                order: [['used_at', 'DESC']],
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            return res.status(200).json({
                success: true,
                message: "Coupon usage history fetched successfully",
                data: {
                    usage_history: usageHistory.rows,
                    pagination: {
                        current_page: parseInt(page),
                        total_pages: Math.ceil(usageHistory.count / limit),
                        total_records: usageHistory.count,
                        per_page: parseInt(limit)
                    }
                }
            });

        } catch (error) {
            console.error('getCouponUsageHistory error:', error);
            return res.status(500).json({
                success: false,
                message: "Internal server error"
            });
        }
    }

    /**
     * Remove coupon from order (before payment)
     * POST /api/coupon/remove
     */
    async removeCoupon(req, res) {
        try {
            const { visa_application_id } = req.body;
            const userId = req.user.id;

            if (!visa_application_id) {
                return res.status(400).json({
                    success: false,
                    message: "Application ID is required"
                });
            }

            const transaction = await db.sequelize.transaction();

            try {
                // Get the application
                const application = await db.VisaApplication.findOne({
                    where: {
                        id: visa_application_id,
                        user_id: userId
                    },
                    transaction
                });

                if (!application) {
                    await transaction.rollback();
                    return res.status(404).json({
                        success: false,
                        message: "Application not found"
                    });
                }

                if (application.payment_status === 1) {
                    await transaction.rollback();
                    return res.status(400).json({
                        success: false,
                        message: "Cannot remove coupon from paid application"
                    });
                }

                // Remove coupon and reset discount
                await application.update({
                    coupon_code: null,
                    coupon_id: null,
                    discount: 0,
                    amount: parseFloat(application.amount) + parseFloat(application.discount || 0)
                }, { transaction });

                await transaction.commit();

                return res.status(200).json({
                    success: true,
                    message: "Coupon removed successfully",
                    data: {
                        new_amount: application.amount + (application.discount || 0)
                    }
                });

            } catch (error) {
                await transaction.rollback();
                throw error;
            }

        } catch (error) {
            console.error('removeCoupon error:', error);
            return res.status(500).json({
                success: false,
                message: "Internal server error"
            });
        }
    }
}

module.exports = new CouponController();
