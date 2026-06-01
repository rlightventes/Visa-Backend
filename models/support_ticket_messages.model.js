module.exports = (sequelize, DataTypes) => {
  const SupportTicketMessage = sequelize.define('SupportTicketMessage', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    ticket_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'support_tickets',
        key: 'id'
      }
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'user',
        key: 'id'
      }
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    message_type: {
      type: DataTypes.ENUM('user_message', 'admin_reply', 'system_message'),
      allowNull: false
    },
    is_internal: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      comment: 'Internal messages only visible to admin/staff'
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
    tableName: 'support_ticket_messages',
    timestamps: false
  });

  SupportTicketMessage.associate = function(models) {
    SupportTicketMessage.belongsTo(models.SupportTicket, { foreignKey: 'ticket_id', as: 'ticket' });
    SupportTicketMessage.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    SupportTicketMessage.hasMany(models.SupportTicketAttachment, { foreignKey: 'message_id', as: 'attachments' });
  };

  return SupportTicketMessage;
}; 