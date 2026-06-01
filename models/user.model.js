module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      unique_code: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      company_name: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      first_name: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },
      last_name: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true,
        // validate: { len: [10, 15] }, // Validates phone number length
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isEmail: true }, // Ensures valid email format
      },
      password: {
        type: DataTypes.STRING,
        allowNull: true, // Make password nullable for Google OAuth users
      },
      user_type: {
        type: DataTypes.ENUM("super-admin", "admin", "vendor", "user"),
        allowNull: false,
      },
      vendor_type: {
        type: DataTypes.ENUM("regular", "third-party"),
        allowNull: true,
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      address_line_2: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      city: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      state: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      pincode: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: { len: [5, 10] }, // Ensures pincode length
      },
      emergency_number: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: { len: [10, 15] },
      },
      alternate_number: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: { len: [0, 15] },
      },
      country_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      pan_card: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },
      aadhar_number: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      aadhar_card: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      is_deleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      dob: {
        type: DataTypes.STRING(20),
        defaultValue: false,
      },
      gender: {
        type: DataTypes.ENUM("Male", "Female", "Other"),
        allowNull: true,
      },
      passport_number: {
        type: DataTypes.STRING(20),
        defaultValue: false,
      },
      passport_issue_date: {
        type: DataTypes.STRING(20),
        defaultValue: false,
      },
      passport_expiry_date: {
        type: DataTypes.STRING(20),
        defaultValue: false,
      },
      visa_type: {
        type: DataTypes.STRING(50),
        defaultValue: false,
      },
      country_visit: {
        type: DataTypes.STRING(50),
        defaultValue: false,
      },
      purpose: {
        type: DataTypes.TEXT("long"),
        defaultValue: false,
      },
      intended_arr_date: {
        type: DataTypes.STRING(20),
        defaultValue: false,
      },
      intended_depart_date: {
        type: DataTypes.STRING(20),
        defaultValue: false,
      },
      places_to_visit: {
        type: DataTypes.TEXT("long"),
        defaultValue: false,
      },
      gst_number: {
        type: DataTypes.STRING(20),
        defaultValue: false,
      },
      gst_certificate_img: {
        type: DataTypes.STRING(200),
        defaultValue: false,
      },
      cancel_cheque_img: {
        type: DataTypes.STRING(200),
        defaultValue: false,
      },
      office_img: {
        type: DataTypes.STRING(200),
        defaultValue: false,
      },
      is_visited: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      created_by: {
        type: DataTypes.STRING,
        defaultValue: false,
      },
      google_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      google_email: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      google_profile_picture: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      auth_provider: {
        type: DataTypes.ENUM("local", "google"),
        defaultValue: "local",
        allowNull: false,
      },
      profile: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },
    },
    {
      tableName: "user",
      timestamps: true,
      underscored: true,
    }
  );

  User.associate = (models) => {
    User.hasMany(models.UserModule, { foreignKey: 'user_id', as: 'user_module' });
    User.hasMany(models.UserPermission, { foreignKey: 'user_id', as: 'user_permissions' });
    User.hasMany(models.UserCountries, { foreignKey: 'user_id', as: 'countries' });
    User.belongsTo(models.Country, { foreignKey: 'country_id', as: 'country' });
  };

  return User;
};
