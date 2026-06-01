module.exports = (sequelize, DataTypes) => {
    const CouponUsage = sequelize.define('CouponUsage', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        coupon_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'coupons',
                key: 'id'
            },
            comment: 'Reference to the coupon used'
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            },
            comment: 'User who used the coupon'
        },
        visa_application_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'visa_applications',
                key: 'id'
            },
            comment: 'Visa application where coupon was used'
        },
        discount_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            comment: 'Actual discount amount applied'
        },
        original_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            comment: 'Original amount before discount'
        },
        final_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            comment: 'Final amount after discount'
        },
        user_type: {
            type: DataTypes.ENUM('user', 'vendor'),
            allowNull: false,
            comment: 'Type of user who used the coupon'
        },
        used_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            allowNull: false,
            comment: 'When the coupon was used'
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
        tableName: 'coupon_usages',
        timestamps: false,
        indexes: [
            {
                fields: ['coupon_id', 'user_id']
            },
            {
                fields: ['user_id']
            },
            {
                fields: ['visa_application_id']
            },
            {
                unique: true,
                fields: ['visa_application_id'],
                name: 'unique_coupon_per_application'
            }
        ]
    });

    // Define associations
    CouponUsage.associate = function(models) {
        CouponUsage.belongsTo(models.Coupon, {
            foreignKey: 'coupon_id',
            as: 'coupon'
        });
        
        CouponUsage.belongsTo(models.User, {
            foreignKey: 'user_id',
            as: 'user'
        });

        CouponUsage.belongsTo(models.VisaApplication, {
            foreignKey: 'visa_application_id',
            as: 'visaApplication'
        });
    };

    return CouponUsage;
};
