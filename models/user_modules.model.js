module.exports = (sequelize, DataTypes) => {
  const UserModule = sequelize.define('UserModule', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    module_id: {
      type: DataTypes.UUID,
      allowNull: false
    }
  }, {
    tableName: 'user_modules',
    timestamps: false
  });

  UserModule.associate = models => {
    UserModule.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    UserModule.belongsTo(models.Module, { foreignKey: 'module_id', as: 'module' });
    UserModule.hasMany(models.UserPermission, { foreignKey: 'user_module_id', as: 'user_module' });
  };

  return UserModule;
};