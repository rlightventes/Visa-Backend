const db = require("../models");
const { Op } = require('sequelize');

class CouponService {
    
    /**
     * Validate coupon code and return coupon details
     * @param {string} code - Coupon code
     * @param {number} orderAmount - Order amount to validate against
     * @param {string} userId - User ID applying the coupon
     * @param {string} userType - User type (user/vendor)
     * @returns {Object} Validation result with coupon details or error
     */
    async validateCouponCode(code, orderAmount, userId, userType = 'user') {
        try {
            // Find the coupon
            const coupon = await db.Coupon.findOne({
                where: {
                    code: code.toUpperCase().trim(),
                    is_deleted: false
                }
            });

            if (!coupon) {
                return {
                    success: false,
                    message: "Invalid coupon code"
                };
            }

            // Check if coupon is valid using model method
            if (!coupon.isValid()) {
                const now = new Date();
                let errorMessage = "Coupon is not valid";
                
                if (!coupon.is_active) {
                    errorMessage = "Coupon is inactive";
                } else if (now < coupon.valid_from) {
                    errorMessage = "Coupon is not yet active";
                } else if (now > coupon.valid_until) {
                    errorMessage = "Coupon has expired";
                } else if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
                    errorMessage = "Coupon usage limit exceeded";
                }

                return {
                    success: false,
                    message: errorMessage
                };
            }

            // Check user type eligibility
            if (coupon.user_types && Array.isArray(coupon.user_types) && !coupon.user_types.includes(userType)) {
                return {
                    success: false,
                    message: `This coupon is not available for ${userType} accounts`
                };
            }

            // Check minimum order amount
            if (orderAmount < (coupon.minimum_order_amount || 0)) {
                return {
                    success: false,
                    message: `Minimum order amount for this coupon is ₹${coupon.minimum_order_amount}`
                };
            }


            // Check per-user usage limit if user ID is provided
            if (userId && coupon.per_user_limit) {
                const userUsageCount = await this.getUserCouponUsageCount(coupon.id, userId);
                if (userUsageCount >= coupon.per_user_limit) {
                    return {
                        success: false,
                        message: "You have already used this coupon the maximum number of times"
                    };
                }
            }

            // Calculate discount
            const discount = coupon.calculateDiscount(parseFloat(orderAmount));

            return {
                success: true,
                data: {
                    coupon_id: coupon.id,
                    code: coupon.code,
                    name: coupon.name,
                    discount_type: coupon.discount_type,
                    discount_value: coupon.discount_value,
                    discount_amount: discount,
                    final_amount: parseFloat(orderAmount) - discount
                }
            };

        } catch (error) {
            console.error('validateCouponCode error:', error);
            return {
                success: false,
                message: 'Error validating coupon'
            };
        }
    }

    /**
     * Apply coupon to an order/application
     * @param {string} couponId - Coupon ID
     * @param {string} userId - User ID
     * @param {string} applicationId - Application ID
     * @param {number} orderAmount - Original order amount
     * @param {string} userType - User type (user/vendor)
     * @returns {Object} Application result
     */
    async applyCoupon(couponId, userId, applicationId, orderAmount, userType = 'user') {
        const transaction = await db.sequelize.transaction();
        
        try {
            const coupon = await db.Coupon.findByPk(couponId, { transaction });
            
            if (!coupon || !coupon.isValid()) {
                await transaction.rollback();
                return {
                    success: false,
                    message: "Invalid or expired coupon"
                };
            }

            // Check per-user limit
            if (coupon.per_user_limit) {
                const userUsageCount = await this.getUserCouponUsageCount(couponId, userId);
                if (userUsageCount >= coupon.per_user_limit) {
                    await transaction.rollback();
                    return {
                        success: false,
                        message: "Coupon usage limit exceeded for this user"
                    };
                }
            }

            // Calculate discount
            const discountAmount = coupon.calculateDiscount(orderAmount);
            const finalAmount = orderAmount - discountAmount;

            // Track coupon usage
            await db.CouponUsage.create({
                coupon_id: couponId,
                user_id: userId,
                visa_application_id: applicationId,
                discount_amount: discountAmount,
                original_amount: orderAmount,
                final_amount: finalAmount,
                user_type: userType
            }, { transaction });

            await transaction.commit();

            return {
                success: true,
                data: {
                    coupon_id: couponId,
                    discount_amount: discountAmount,
                    final_amount: finalAmount
                }
            };

        } catch (error) {
            await transaction.rollback();
            console.error('applyCoupon error:', error);
            return {
                success: false,
                message: 'Error applying coupon'
            };
        }
    }

    /**
     * Get user's usage count for a specific coupon
     * @param {string} couponId - Coupon ID
     * @param {string} userId - User ID
     * @returns {number} Usage count
     */
    async getUserCouponUsageCount(couponId, userId) {
        try {
            const usageCount = await db.CouponUsage.count({
                where: {
                    coupon_id: couponId,
                    user_id: userId
                }
            });
            return usageCount;
        } catch (error) {
            console.error('getUserCouponUsageCount error:', error);
            return 0;
        }
    }

    /**
     * Get active coupons for a user
     * @param {string} userType - User type (user, vendor, etc.)
     * @returns {Array} List of active coupons
     */
    async getActiveCouponsForUser(userType = 'user') {
        try {
            const now = new Date();
            let whereConditions = {
                is_active: true,
                is_deleted: false,
                valid_from: { [Op.lte]: now },
                valid_until: { [Op.gte]: now },
                [Op.or]: [
                    { usage_limit: null },
                    { usage_limit: { [Op.gt]: db.sequelize.col('used_count') } }
                ]
            };

            // Filter by user type
            whereConditions[Op.or] = [
                { user_types: null },
                { user_types: { [Op.contains]: [userType] } }
            ];


            const coupons = await db.Coupon.findAll({
                where: whereConditions,
                attributes: [
                    'id', 'code', 'name', 'description', 
                    'discount_type', 'discount_value',
                    'minimum_order_amount', 'maximum_discount_amount',
                    'valid_until'
                ],
                order: [['created_at', 'DESC']]
            });

            return coupons;

        } catch (error) {
            console.error('getActiveCouponsForUser error:', error);
            return [];
        }
    }

    /**
     * Get coupon statistics for admin dashboard
     * @returns {Object} Coupon statistics
     */
    async getCouponStats() {
        try {
            const now = new Date();
            
            const stats = await Promise.all([
                // Total coupons
                db.Coupon.count({
                    where: { is_deleted: false }
                }),
                // Active coupons
                db.Coupon.count({
                    where: {
                        is_active: true,
                        is_deleted: false,
                        valid_from: { [Op.lte]: now },
                        valid_until: { [Op.gte]: now }
                    }
                }),
                // Expired coupons
                db.Coupon.count({
                    where: {
                        is_deleted: false,
                        valid_until: { [Op.lt]: now }
                    }
                }),
                // Usage limit reached
                db.Coupon.count({
                    where: {
                        is_deleted: false,
                        usage_limit: { [Op.not]: null },
                        [Op.and]: db.sequelize.where(
                            db.sequelize.col('used_count'),
                            '>=',
                            db.sequelize.col('usage_limit')
                        )
                    }
                }),
                // Total usage count
                db.Coupon.sum('used_count', {
                    where: { is_deleted: false }
                })
            ]);

            return {
                total_coupons: stats[0] || 0,
                active_coupons: stats[1] || 0,
                expired_coupons: stats[2] || 0,
                usage_limit_reached: stats[3] || 0,
                total_usage_count: stats[4] || 0
            };

        } catch (error) {
            console.error('getCouponStats error:', error);
            return {
                total_coupons: 0,
                active_coupons: 0,
                expired_coupons: 0,
                usage_limit_reached: 0,
                total_usage_count: 0
            };
        }
    }
}

module.exports = new CouponService();
