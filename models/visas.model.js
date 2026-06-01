module.exports = (sequelize, DataTypes) => {
  const Visa = sequelize.define(
    "Visa",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      application_id: {
        type: DataTypes.STRING(10),
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      country_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      short_description: {
        type: DataTypes.TEXT,
      },
      detailed_description: {
        type: DataTypes.TEXT,
      },
      visa_type: {
        type: DataTypes.ENUM(
          "tourist",
          "business",
          "student",
          "transit",
          "other"
        ),
        allowNull: false,
      },
      entry_type: {
        type: DataTypes.ENUM("single", "multiple"),
        allowNull: false,
      },
      validity_days: {
        type: DataTypes.SMALLINT,
        allowNull: false,
      },
      stay_duration_details: {
        type: DataTypes.STRING(255),
      },
      base_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      processing_time_standard: {
        type: DataTypes.SMALLINT,
        allowNull: true,
      },
      processing_price_standard: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      processing_time_express: {
        type: DataTypes.SMALLINT,
        allowNull: true,
      },
      processing_price_express: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      processing_time_urgent: {
        type: DataTypes.SMALLINT,
        allowNull: true,
      },
      processing_price_urgent: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      discount_percent: {
        type: DataTypes.TINYINT,
        defaultValue: 0,
      },
      b2b_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      b2b_processing_type: {
        type: DataTypes.ENUM("hour", "day"),
        allowNull: true,
      },
      b2b_processing_time: {
        type: DataTypes.SMALLINT,
        allowNull: true,
      },
      b2b_discount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
        allowNull: true,
      },
      b2c_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      b2c_processing_type: {
        type: DataTypes.ENUM("hour", "day"),
        allowNull: true,
      },
      b2c_processing_time: {
        type: DataTypes.SMALLINT,
        allowNull: true,
      },
      b2c_discount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
        allowNull: true,
      },
      is_featured: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      is_deleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      display_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: false,
      },
    },
    {
      tableName: "visas",
      timestamps: true,
      underscored: true,
    }
  );

  Visa.associate = models => {
    Visa.belongsTo(models.Country, { foreignKey: 'country_id', as: 'country' });
    Visa.hasMany(models.VisaEligibleNationality, { foreignKey: 'visa_id', as: 'nationalities' });
    Visa.hasMany(models.VisaEligibilityCriterion, { foreignKey: 'visa_id', as: 'eligiblities' });
    Visa.hasMany(models.VisaUploads, { foreignKey: 'visa_id', as: 'uploads' });
    Visa.hasMany(models.VisaDocumentLinks, { foreignKey: 'visa_id', as: 'documents' });
  };

  return Visa;
};