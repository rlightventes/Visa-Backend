module.exports = (sequelize, DataTypes) => {
  const SupportTicketAttachment = sequelize.define('SupportTicketAttachment', {
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
    message_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'support_ticket_messages',
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
    original_filename: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    stored_filename: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    file_path: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    file_size: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    mime_type: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false
    }
  }, {
    tableName: 'support_ticket_attachments',
    timestamps: false
  });

  SupportTicketAttachment.associate = function(models) {
    SupportTicketAttachment.belongsTo(models.SupportTicket, { foreignKey: 'ticket_id', as: 'ticket' });
    SupportTicketAttachment.belongsTo(models.SupportTicketMessage, { foreignKey: 'message_id', as: 'message' });
    SupportTicketAttachment.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return SupportTicketAttachment;
}; 