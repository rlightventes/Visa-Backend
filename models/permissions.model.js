module.exports = (sequelize, DataTypes) => {
    const Permission = sequelize.define('Permission', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      module_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true
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
      tableName: 'permissions',
      timestamps: false
    });
  
    Permission.associate = models => {
      Permission.belongsTo(models.Module, { foreignKey: 'module_id', as: 'module' });
      Permission.hasMany(models.UserPermission, { foreignKey: 'permission_id', as: 'userPermissions' });
    };
  
    return Permission;
  };