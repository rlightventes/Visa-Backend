module.exports = (sequelize, DataTypes) => {
    const Order = sequelize.define('Order', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        quantity: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
        },
        amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
        },
        coconut_price: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
        },
        payment_mode: {
            type: DataTypes.ENUM('cash', 'online'),
            allowNull: false
        },
    }, {
        tableName: 'order',
        timestamps: true,
        underscored: true
    });

    Order.associate = (models) => {
        Order.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    };

    return Order;
};
