module.exports = (sequelize, DataTypes) => {
    const VisaUploads = sequelize.define('VisaUploads', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        visa_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        image_path: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
    }, {
        tableName: 'visa_uploads',
        timestamps: false   
    });

    return VisaUploads;
};