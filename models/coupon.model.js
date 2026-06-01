module.exports = (sequelize, DataTypes) => {
    const Coupon = sequelize.define('Coupon', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        code: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true,
            comment: 'Unique coupon code'
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false,
            comment: 'Display name for the coupon'
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Coupon description'
        },
        discount_type: {
            type: DataTypes.ENUM('percentage', 'fixed_amount'),
            allowNull: false,
            defaultValue: 'percentage',
            comment: 'Type of discount: percentage or fixed amount'
        },
        discount_value: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            comment: 'Discount value (percentage or amount)'
        },
        minimum_order_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
            defaultValue: 0,
            comment: 'Minimum order amount to apply coupon'
        },
        maximum_discount_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
            comment: 'Maximum discount amount for percentage coupons'
        },
        usage_limit: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Total usage limit (null for unlimited)'
        },
        used_count: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: 'Number of times coupon has been used'
        },
        per_user_limit: {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: 1,
            comment: 'Usage limit per user (null for unlimited)'
        },
        valid_from: {
            type: DataTypes.DATE,
            allowNull: false,
            comment: 'Coupon valid from date'
        },
        valid_until: {
            type: DataTypes.DATE,
            allowNull: false,
            comment: 'Coupon expiry date'
        },
        user_types: {
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: ['user', 'vendor'],
            comment: 'User types eligible for this coupon'
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
            comment: 'Whether the coupon is active'
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            comment: 'Soft delete flag'
        },
        created_by: {
            type: DataTypes.UUID,
            allowNull: true,
            comment: 'ID of admin who created the coupon'
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        tableName: 'coupons',
        timestamps: false,
        indexes: [
            {
                unique: true,
                fields: ['code']
            },
            {
                fields: ['is_active', 'is_deleted']
            },
            {
                fields: ['valid_from', 'valid_until']
            }
        ],
        hooks: {
            beforeValidate(coupon) {
                if (coupon.code) {
                    coupon.code = coupon.code.toUpperCase().trim();
                }
            }
        }
    });

    // Instance methods
    Coupon.prototype.isValid = function() {
        const now = new Date();
        return this.is_active && 
               !this.is_deleted && 
               now >= this.valid_from && 
               now <= this.valid_until &&
               (this.usage_limit === null || this.used_count < this.usage_limit);
    };

    Coupon.prototype.calculateDiscount = function(orderAmount) {
        if (!this.isValid() || orderAmount < (this.minimum_order_amount || 0)) {
            return 0;
        }

        let discount = 0;
        if (this.discount_type === 'percentage') {
            discount = (orderAmount * this.discount_value) / 100;
            if (this.maximum_discount_amount && discount > this.maximum_discount_amount) {
                discount = this.maximum_discount_amount;
            }
        } else if (this.discount_type === 'fixed_amount') {
            discount = Math.min(this.discount_value, orderAmount);
        }

        return Math.round(discount * 100) / 100; // Round to 2 decimal places
    };

    // Define associations
    Coupon.associate = function(models) {
        // Coupon belongs to User (creator)
        Coupon.belongsTo(models.User, {
            foreignKey: 'created_by',
            as: 'creator'
        });
    };

    return Coupon;
};
