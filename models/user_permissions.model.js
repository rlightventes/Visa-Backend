module.exports = (sequelize, DataTypes) => {
    const UserPermission = sequelize.define('UserPermission', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      user_module_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      permission_id: {
        type: DataTypes.UUID,
        allowNull: false
      }
    }, {
      tableName: 'user_permissions',
      timestamps: false
    });
  
    UserPermission.associate = models => {
      UserPermission.belongsTo(models.Permission, { foreignKey: 'permission_id', as: 'permission' });
    };
  
    return UserPermission;
  };