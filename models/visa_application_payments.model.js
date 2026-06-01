module.exports = (sequelize, DataTypes) => {
  const VisaApplicationPayment = sequelize.define('VisaApplicationPayment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    visa_application_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    payment_method: {
      type: DataTypes.ENUM('online', 'offline'),
      allowNull: false,
    },
    payment_status: {
      type: DataTypes.ENUM('pending', 'completed', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
    },
    txn_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    payment_date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    payment_reference: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    payment_gateway: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    payment_info: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    payment_currency: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    }
  }, {
    tableName: 'visa_application_payments',
    timestamps: false
  });

  VisaApplicationPayment.associate = function (models) {
    VisaApplicationPayment.belongsTo(models.VisaApplication, { foreignKey: 'visa_application_id', as: 'visa_application' });
    VisaApplicationPayment.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return VisaApplicationPayment;
};
