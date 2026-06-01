module.exports = (sequelize, DataTypes) => {
    const VisaEligibleNationality = sequelize.define('VisaEligibleNationality', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        visa_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        country_id: {
            type: DataTypes.UUID,
            allowNull: false
        }
    }, {
        tableName: 'visa_eligible_nationalities',
        timestamps: false,
        underscored: true
    });

    VisaEligibleNationality.associate = models => {
        VisaEligibleNationality.belongsTo(models.Visa, { foreignKey: 'visa_id', as: 'visa' });
        VisaEligibleNationality.belongsTo(models.Country, { foreignKey: 'country_id', as: 'country' });
    };

    return VisaEligibleNationality;
};