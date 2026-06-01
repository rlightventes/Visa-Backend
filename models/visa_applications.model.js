module.exports = (sequelize, DataTypes) => {
  const VisaApplication = sequelize.define('VisaApplication', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    application_id: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    visa_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    visa_type: {
      type: DataTypes.ENUM('tourist', 'business', 'student', 'transit', 'other'),
      allowNull: false
    },
    entry_type: {
      type: DataTypes.ENUM('single', 'multiple'),
      allowNull: false
    },
    departure_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    return_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    number_of_travellers: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    payment_status: {
      type: DataTypes.TINYINT(1),
      defaultValue: 0,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending_payment', 'pending', 'approved', 'rejected', 'cancelled', 'expired', 'processing', 'completed', 'vendor_assigned', 'vendor_accepted', 'vendor_rejected'),
      defaultValue: 'pending_payment',
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    reference_number: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    uploaded_document: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    remark: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    assign_to: {
      type: DataTypes.UUID,
      allowNull: true
    },
    assign_by: {
      type: DataTypes.UUID,
      allowNull: true
    },
    type: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    discount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      allowNull: false,
    },
    coupon_code: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Applied coupon code'
    },
    coupon_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'coupons',
        key: 'id'
      },
      comment: 'Reference to applied coupon'
    },
    amendment_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    amendment_enabled_until: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    amendment_duration_hours: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    amendment_duration_minutes: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false
    }
  }, {
    tableName: 'visa_applications',
    timestamps: false
  });

  VisaApplication.associate = function (models) {
    VisaApplication.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    VisaApplication.belongsTo(models.User, { foreignKey: 'assign_to', as: 'assign_to_user' });
    VisaApplication.belongsTo(models.User, { foreignKey: 'assign_by', as: 'assign_by_user' });
    VisaApplication.belongsTo(models.Visa, { foreignKey: 'visa_id', as: 'visa' });
    VisaApplication.belongsTo(models.Coupon, { foreignKey: 'coupon_id', as: 'coupon' });
    VisaApplication.hasMany(models.VisaApplicationField, { foreignKey: 'visa_application_id', as: 'visa_application_fields' });
    VisaApplication.hasMany(models.VisaApplicationPayment, { foreignKey: 'visa_application_id', as: 'visa_application_payments' });
    VisaApplication.hasOne(models.CouponUsage, { foreignKey: 'visa_application_id', as: 'coupon_usage' });
  };

  return VisaApplication;
}; 