module.exports = (sequelize, DataTypes) => {
    const UserCountries = sequelize.define('UserCountries', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      country_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
    }, {
      tableName: 'user_countries',
      timestamps: false
    });
  
    UserCountries.associate = models => {
      UserCountries.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
      UserCountries.belongsTo(models.Country, { foreignKey: 'country_id', as: 'country' });
    };
  
    return UserCountries;
  };