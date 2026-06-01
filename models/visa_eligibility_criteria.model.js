module.exports = (sequelize, DataTypes) => {
    const VisaEligibilityCriterion = sequelize.define('VisaEligibilityCriterion', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        visa_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        criteria_id: {
            type: DataTypes.UUID,
            allowNull: false
        }
    }, {
        tableName: 'visa_eligibility_criteria',
        timestamps: false,
        underscored: true
    });

    VisaEligibilityCriterion.associate = models => {
        VisaEligibilityCriterion.belongsTo(models.Visa, { foreignKey: 'visa_id', as: 'visa' });
        VisaEligibilityCriterion.belongsTo(models.EligibilityCriterion, { foreignKey: 'criteria_id', as: 'criteria' });
    };

    return VisaEligibilityCriterion;
};
