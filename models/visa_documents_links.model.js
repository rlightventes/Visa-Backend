module.exports = (sequelize, DataTypes) => {
    const VisaDocumentLinks = sequelize.define('VisaDocumentLinks', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        visa_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        document_id: {
            type: DataTypes.UUID,
            allowNull: false
        }
    }, {
        tableName: 'visa_document_links',
        timestamps: false,
        underscored: true
    });

    VisaDocumentLinks.associate = models => {
        VisaDocumentLinks.belongsTo(models.Visa, { foreignKey: 'visa_id', as: 'visa' });
        VisaDocumentLinks.belongsTo(models.VisaDocuments, { foreignKey: 'document_id', as: 'document' });
    };

    return VisaDocumentLinks;
};
