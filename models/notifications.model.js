module.exports = (sequelize, DataTypes) => {
    const Notification = sequelize.define('Notification', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false,
            comment: 'Recipient user ID'
        },
        sender_id: {
            type: DataTypes.UUID,
            allowNull: true,
            comment: 'Sender user ID (nullable for system notifications)'
        },
        type: {
            type: DataTypes.ENUM(
                'visa_application_received',
                'visa_status_updated',
                'payment_completed',
                'payment_failed',
                'document_uploaded',
                'assignment_changed',
                'system_notification',
                'support_ticket_created',
                'support_ticket_status_updated',
                'support_ticket_reply'
            ),
            allowNull: false,
            comment: 'Type of notification'
        },
        title: {
            type: DataTypes.STRING(255),
            allowNull: false,
            comment: 'Notification title'
        },
        message: {
            type: DataTypes.TEXT,
            allowNull: false,
            comment: 'Notification message body'
        },
        data: {
            type: DataTypes.JSON,
            allowNull: true,
            comment: 'Additional notification data (visa_application_id, reference links, etc.)'
        },
        redirect_url: {
            type: DataTypes.STRING(500),
            allowNull: true,
            comment: 'URL to redirect when notification is clicked'
        },
        is_read: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false,
            comment: 'Whether the notification has been read'
        },
        read_at: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'Timestamp when notification was read'
        },
        reference_id: {
            type: DataTypes.UUID,
            allowNull: true,
            comment: 'Reference ID for the notification'
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false,
            comment: 'Soft delete flag'
        },
        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            allowNull: false
        },
        updated_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            allowNull: false
        }
    }, {
        tableName: 'notifications',
        timestamps: false,
        underscored: true,
        indexes: [
            {
                fields: ['user_id', 'is_read', 'is_deleted']
            },
            {
                fields: ['type']
            },
            {
                fields: ['created_at']
            }
        ]
    });

    Notification.associate = models => {
        // Recipient user
        Notification.belongsTo(models.User, { 
            foreignKey: 'user_id', 
            as: 'recipient' 
        });
        
        // Sender user (optional)
        Notification.belongsTo(models.User, { 
            foreignKey: 'sender_id', 
            as: 'sender' 
        });
    };

    return Notification;
}; 