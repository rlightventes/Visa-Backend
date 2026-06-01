module.exports = (sequelize, DataTypes) => {
  const SupportTicket = sequelize.define('SupportTicket', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    ticket_number: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'user',
        key: 'id'
      }
    },
    visa_application_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'visa_applications',
        key: 'id'
      }
    },
    subject: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    category: {
      type: DataTypes.ENUM('Visa Issue', 'Payment Issue', 'Technical Issue', 'Other'),
      allowNull: false
    },
    priority: {
      type: DataTypes.ENUM('Low', 'Medium', 'High', 'Critical'),
      defaultValue: 'Medium',
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('Open', 'In Progress', 'Resolved', 'Closed'),
      defaultValue: 'Open',
      allowNull: false
    },
    assigned_to: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'user',
        key: 'id'
      }
    },
    resolved_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    closed_at: {
      type: DataTypes.DATE,
      allowNull: true
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
    tableName: 'support_tickets',
    timestamps: false
  });

  SupportTicket.associate = function(models) {
    SupportTicket.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    SupportTicket.belongsTo(models.VisaApplication, { foreignKey: 'visa_application_id', as: 'visa_application' });
    SupportTicket.belongsTo(models.User, { foreignKey: 'assigned_to', as: 'assigned_user' });
    SupportTicket.hasMany(models.SupportTicketMessage, { foreignKey: 'ticket_id', as: 'messages' });
    SupportTicket.hasMany(models.SupportTicketAttachment, { foreignKey: 'ticket_id', as: 'attachments' });
  };

  return SupportTicket;
}; 