module.exports = (sequelize, DataTypes) => {
  const VisaApplicationTraveller = sequelize.define('VisaApplicationTraveller', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    visa_application_id: {
      type: DataTypes.UUID,
      allowNull: false
    }
  }, {
    tableName: 'visa_application_travellers',
    timestamps: false
  });

  VisaApplicationTraveller.associate = function(models) {
    // Define relationship with VisaApplication
    VisaApplicationTraveller.belongsTo(models.VisaApplication, {
      foreignKey: 'visa_application_id',
      as: 'application'
    });

    // Define relationship with Country
    VisaApplicationTraveller.belongsTo(models.Country, {
      foreignKey: 'country_id',
      as: 'country'
    });

    // Define relationship with VisaApplicationField
    // VisaApplicationTraveller.hasMany(models.VisaApplicationField, {
    //   foreignKey: 'visa_traveller_id',
    //   as: 'fields'
    // });
  };

  return VisaApplicationTraveller;
}; 