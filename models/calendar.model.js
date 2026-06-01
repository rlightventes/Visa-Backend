
module.exports = (sequelize, DataTypes) => {
    const Calendar = sequelize.define('Calendar', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        country_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        from_date: {
            type: DataTypes.DATE,
            allowNull: false
        },
        to_date: {
            type: DataTypes.DATE,
            allowNull: false
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
        tableName: 'calendar',
        timestamps: false,
    });

    Calendar.associate = (models) => {
        Calendar.belongsTo(models.Country, { foreignKey: 'country_id', as: 'country' });
    }

    return Calendar;
}