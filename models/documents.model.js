
module.exports = (sequelize, DataTypes) => {
    const Documents = sequelize.define('Documents', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        reference_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        file_name: {
            type: DataTypes.STRING(500),
            defaultValue: false
        },
        file_type: {
            type: DataTypes.ENUM('passport', 'photo', 'itinery', 'hotel', 'bank', 'employment', 'business', 'tax', 'id_proof', 'additional'),
            defaultValue: false
        },
    }, {
        tableName: 'documents',
        timestamps: true,
        underscored: true
    });
    return Documents;
}