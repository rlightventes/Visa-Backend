module.exports = (sequelize, DataTypes) => {
    const Module = sequelize.define('Module', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
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
        tableName: 'modules',
        timestamps: false
    });

    Module.associate = models => {
        Module.hasMany(models.Permission, { foreignKey: 'module_id', as: 'permissions' });
        Module.hasMany(models.UserPermission, { foreignKey: 'module_id', as: 'userPermissions' });
    };

    return Module;
};