module.exports = (sequelize, DataTypes) => {
    const Country = sequelize.define('Country', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING(128),
            allowNull: false
        },
        iso2: {
            type: DataTypes.STRING(2),
            allowNull: true,
            unique: true
        },
        iso3: {
            type: DataTypes.STRING(3),
            allowNull: true,
            unique: true
        },
        phonecode: {
            type: DataTypes.STRING(8),
            allowNull: true
        },
        currency: {
            type: DataTypes.STRING(8),
            allowNull: true
        },
        capital: {
            type: DataTypes.STRING(64),
            allowNull: true
        },
        region: {
            type: DataTypes.STRING(64),
            allowNull: true
        },
        subregion: {
            type: DataTypes.STRING(64),
            allowNull: true
        },
        allow_minor_to_apply: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
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
        tableName: 'countries',
        timestamps: false,
        hooks: {
            beforeValidate(country) {
                const optionalFields = [
                    'iso2', 'iso3', 'phonecode',
                    'currency', 'capital', 'region', 'subregion', 'allow_minor_to_apply'
                ];
                optionalFields.forEach(field => {
                    if (country[field] === '') {
                        country[field] = null;
                    }
                });
            }
        }
    });

    return Country;
};