const { Op } = require("sequelize");
const db = require("../models");
const path = require("path");
const fs = require("fs");
const notificationService = require("../services/notification.service");
const { sendSupportTicketCreatedEmail, sendSupportTicketStatusUpdateEmail } = require("../services/email.service");

// Helper function to generate ticket number
const generateTicketNumber = () => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `TKT${timestamp}${random}`;
};

// Create a new support ticket
exports.createTicket = async (req, res) => {
  try {
    const { subject, description, category, visa_application_id, priority } = req.body;
    const user_id = req.user.id;

    // Validate required fields
    if (!subject || !description || !category) {
      return res.status(400).json({
        success: false,
        message: "Subject, description, and category are required"
      });
    }

    // Validate category
    const validCategories = ['Visa Issue', 'Payment Issue', 'Technical Issue', 'Other'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category. Must be one of: " + validCategories.join(', ')
      });
    }

    let visaAssignedTo = null;

    // Validate visa application if provided
    if (visa_application_id) {
      const visaApplication = await db.VisaApplication.findOne({
        where: { id: visa_application_id, user_id },
        include: [
          {
            model: db.Visa,
            as: 'visa',
            required: true,
            attributes: ['id', 'created_by']
          }
        ]
      });

      if (!visaApplication) {
        return res.status(404).json({
          success: false,
          message: "Visa application not found or not accessible"
        });
      }

      if (visaApplication.assign_to) {
        visaAssignedTo = visaApplication.assign_to;
      } else {
        visaAssignedTo = visaApplication.visa.created_by;
      }
    }

    // Generate unique ticket number
    let ticket_number;
    let isUnique = false;
    while (!isUnique) {
      ticket_number = generateTicketNumber();
      const existingTicket = await db.SupportTicket.findOne({ where: { ticket_number } });
      if (!existingTicket) {
        isUnique = true;
      }
    }

    // Create the ticket
    const ticket = await db.SupportTicket.create({
      ticket_number,
      user_id,
      visa_application_id: visa_application_id || null,
      subject,
      description,
      category,
      priority: priority || 'Medium',
      assigned_to: visaAssignedTo
    });

    // Create initial message
    await db.SupportTicketMessage.create({
      ticket_id: ticket.id,
      user_id,
      message: description,
      message_type: 'user_message'
    });

    // Handle file attachments if any
    if (req.files && req.files.length > 0) {
      const attachments = req.files.map(file => ({
        ticket_id: ticket.id,
        user_id,
        original_filename: file.originalname,
        stored_filename: file.filename,
        file_path: file.path,
        file_size: file.size,
        mime_type: file.mimetype
      }));

      await db.SupportTicketAttachment.bulkCreate(attachments);
    }

    // Get user details for notification
    const user = await db.User.findByPk(user_id, {
      attributes: ['id', 'first_name', 'last_name', 'email', 'user_type']
    });

    // Get visa application details if provided for notification
    let visaApplication = null;
    if (visa_application_id) {
      visaApplication = await db.VisaApplication.findByPk(visa_application_id, {
        attributes: ['id', 'application_id', 'visa_id', 'assign_to']
      });
    }

    // Send notifications
    try {
      await notificationService.handleSupportTicketCreated(ticket, user, visaApplication);
    } catch (notificationError) {
      console.error('Failed to send support ticket creation notification:', notificationError);
      // Don't fail the ticket creation if notification fails
    }

    // Send email notification to admin and support team
    try {
      await sendSupportTicketCreatedEmail({
        ticket,
        user,
        visaApplication
      });
    } catch (emailError) {
      console.error('Failed to send support ticket creation email:', emailError);
      // Don't fail the ticket creation if email fails
    }

    res.status(201).json({
      success: true,
      message: "Support ticket created successfully",
      data: { ticket_number: ticket.ticket_number, ticket_id: ticket.id }
    });

  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};

// Get user's tickets
exports.getUserTickets = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { page = 1, limit = 10, status, category } = req.query;
    const offset = (page - 1) * limit;

    let where = { user_id };

    if (status) {
      where.status = status;
    }

    if (category) {
      where.category = category;
    }

    // Get ticket counts by status for this user
    const totalTickets = await db.SupportTicket.count({ where: { user_id } });
    const openTickets = await db.SupportTicket.count({
      where: { user_id, status: 'Open' }
    });
    const inProgressTickets = await db.SupportTicket.count({
      where: { user_id, status: 'In Progress' }
    });
    const resolvedTickets = await db.SupportTicket.count({
      where: { user_id, status: 'Resolved' }
    });
    const closedTickets = await db.SupportTicket.count({
      where: { user_id, status: 'Closed' }
    });

    // Calculate solved tickets (Resolved + Closed)
    const solvedTickets = resolvedTickets + closedTickets;

    const { count, rows: tickets } = await db.SupportTicket.findAndCountAll({
      where,
      include: [
        {
          model: db.VisaApplication,
          as: 'visa_application',
          attributes: ['id', 'application_id', 'visa_type', 'status']
        },
        {
          model: db.User,
          as: 'assigned_user',
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.status(200).json({
      success: true,
      data: {
        tickets,
        summary: {
          total: totalTickets,
          open: openTickets,
          in_progress: inProgressTickets,
          resolved: resolvedTickets,
          closed: closedTickets,
          solved: solvedTickets // Resolved + Closed
        },
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get user tickets error:', error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};

// Get all tickets (Admin only)
exports.getAllTickets = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, category, priority, assigned_to, search } = req.query;
    const offset = (page - 1) * limit;

    let where = {};

    // Basic filters
    if (status) where.status = status;
    if (category) where.category = category;
    if (priority) where.priority = priority;
    if (assigned_to) where.assigned_to = assigned_to;

    // Search functionality using proper Sequelize syntax
    if (search) {
      where[Op.or] = [
        // Search in ticket fields
        { ticket_number: { [Op.like]: `%${search}%` } },
        { subject: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
        // Search in related visa application fields
        { '$visa_application.application_id$': { [Op.like]: `%${search}%` } },
        { '$visa_application.reference_number$': { [Op.like]: `%${search}%` } },
        { '$visa_application.visa_type$': { [Op.like]: `%${search}%` } },
        // Search in ticket creator (user) fields
        { '$user.first_name$': { [Op.like]: `%${search}%` } },
        { '$user.last_name$': { [Op.like]: `%${search}%` } },
        { '$user.email$': { [Op.like]: `%${search}%` } },
        { '$user.phone$': { [Op.like]: `%${search}%` } },
        { '$user.company_name$': { [Op.like]: `%${search}%` } },
        // Search in assigned user fields
        { '$assigned_user.first_name$': { [Op.like]: `%${search}%` } },
        { '$assigned_user.last_name$': { [Op.like]: `%${search}%` } },
        { '$assigned_user.email$': { [Op.like]: `%${search}%` } }
      ];
    }

    if (['admin', 'vendor'].includes(req.user.user_type)) {
      where.assigned_to = req.user.id;
    }

    const { count, rows: tickets } = await db.SupportTicket.findAndCountAll({
      where,
      include: [
        {
          model: db.User,
          as: 'user',
          attributes: ['id', 'first_name', 'last_name', 'email', 'phone', 'company_name'],
          required: false
        },
        {
          model: db.VisaApplication,
          as: 'visa_application',
          attributes: ['id', 'application_id', 'reference_number', 'visa_type', 'status'],
          required: false
        },
        {
          model: db.User,
          as: 'assigned_user',
          attributes: ['id', 'first_name', 'last_name', 'email'],
          required: false
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true // Important: prevents duplicate counting when using includes
    });

    res.status(200).json({
      success: true,
      data: {
        tickets,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get all tickets error:', error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};

// Get ticket details
exports.getTicketDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;
    const user_type = req.user.user_type;

    let where = { id };

    if (user_type === 'vendor' && req.user.vendor_type === 'third-party') {
      where.assigned_to = user_id;
    } else if ((user_type === 'vendor' && req.user.vendor_type === 'regular') || user_type === 'user') {
      where.user_id = user_id;
    } else if (user_type === 'admin') {
      where.assigned_to = user_id;
    }

    const ticket = await db.SupportTicket.findOne({
      where,
      include: [
        {
          model: db.User,
          as: 'user',
          attributes: ['id', 'first_name', 'last_name', 'email', 'phone']
        },
        {
          model: db.VisaApplication,
          as: 'visa_application',
          attributes: ['id', 'application_id', 'visa_type', 'status']
        },
        {
          model: db.User,
          as: 'assigned_user',
          attributes: ['id', 'first_name', 'last_name', 'email']
        },
        {
          model: db.SupportTicketAttachment,
          as: 'attachments',
          where: { message_id: null },
          required: false,
          attributes: ['id', 'original_filename', 'stored_filename', 'file_size', 'mime_type']
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found"
      });
    }

    // Get messages separately with explicit ordering
    const messagesWhere = ['user', 'vendor'].includes(user_type) ? { is_internal: false } : {};
    const messages = await db.SupportTicketMessage.findAll({
      where: {
        ticket_id: id,
        ...messagesWhere
      },
      include: [
        {
          model: db.User,
          as: 'user',
          attributes: ['id', 'first_name', 'last_name', 'email', 'user_type']
        },
        {
          model: db.SupportTicketAttachment,
          as: 'attachments',
          attributes: ['id', 'original_filename', 'stored_filename', 'file_size', 'mime_type']
        }
      ],
      order: [['created_at', 'ASC']]
    });

    // Add messages to ticket data
    const ticketData = ticket.toJSON();
    ticketData.messages = messages;

    res.status(200).json({
      success: true,
      data: ticketData
    });

  } catch (error) {
    console.error('Get ticket details error:', error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};

// Add reply to ticket
exports.addReply = async (req, res) => {
  try {
    const { id } = req.params;
    const { message, is_internal = false } = req.body;
    const user_id = req.user.id;
    const user_type = req.user.user_type;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required"
      });
    }

    // Check if ticket exists and user has access
    let where = { id };
    if (!['admin', 'super-admin'].includes(user_type)) {
      where.user_id = user_id;
    }

    const ticket = await db.SupportTicket.findOne({ where });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found"
      });
    }

    // Determine message type
    let message_type;
    if (['admin', 'super-admin'].includes(user_type)) {
      message_type = 'admin_reply';
    } else {
      message_type = 'user_message';
    }

    // Only admins can create internal messages
    const isInternal = ['admin', 'super-admin'].includes(user_type) ? is_internal : false;

    // Create the message
    const ticketMessage = await db.SupportTicketMessage.create({
      ticket_id: id,
      user_id,
      message,
      message_type,
      is_internal: isInternal
    });

    // Handle file attachments if any
    if (req.files && req.files.length > 0) {
      const attachments = req.files.map(file => ({
        ticket_id: id,
        message_id: ticketMessage.id,
        user_id,
        original_filename: file.originalname,
        stored_filename: file.filename,
        file_path: file.path,
        file_size: file.size,
        mime_type: file.mimetype
      }));

      await db.SupportTicketAttachment.bulkCreate(attachments);
    }

    // Update ticket status if it's closed and user is replying
    if (ticket.status === 'Closed' && message_type === 'user_message') {
      await db.SupportTicket.update(
        { status: 'Open' },
        { where: { id } }
      );
    }

    // Update ticket timestamp
    await db.SupportTicket.update(
      { updated_at: new Date() },
      { where: { id } }
    );

    // Send reply notification
    try {
      // Get reply author details
      const replyBy = await db.User.findByPk(user_id, {
        attributes: ['id', 'first_name', 'last_name', 'user_type']
      });

      // Get ticket owner details
      const ticketOwner = await db.User.findByPk(ticket.user_id, {
        attributes: ['id', 'first_name', 'last_name', 'user_type']
      });

      await notificationService.handleSupportTicketReply(
        ticket,
        ticketMessage,
        replyBy,
        ticketOwner
      );
    } catch (notificationError) {
      console.error('Failed to send reply notification:', notificationError);
      // Don't fail the reply if notification fails
    }

    res.status(201).json({
      success: true,
      message: "Reply added successfully"
    });

  } catch (error) {
    console.error('Add reply error:', error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};

// Update ticket status (Admin only)
exports.updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, assigned_to } = req.body;

    const validStatuses = ['Open', 'In Progress', 'Resolved', 'Closed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be one of: " + validStatuses.join(', ')
      });
    }

    const ticket = await db.SupportTicket.findByPk(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found"
      });
    }

    const oldStatus = ticket.status;
    const updateData = {};
    if (status) {
      updateData.status = status;
      if (status === 'Resolved') {
        updateData.resolved_at = new Date();
      } else if (status === 'Closed') {
        updateData.closed_at = new Date();
      }
    }

    if (assigned_to !== undefined) {
      updateData.assigned_to = assigned_to;
    }

    await db.SupportTicket.update(updateData, { where: { id } });

    // Send status update notification if status changed
    if (status && status !== oldStatus) {
      try {
        // Get updated ticket data and user who made the update
        const updatedTicket = await db.SupportTicket.findByPk(id);
        const updatedBy = await db.User.findByPk(req.user.id, {
          attributes: ['id', 'first_name', 'last_name', 'user_type']
        });

        await notificationService.handleSupportTicketStatusUpdate(
          updatedTicket,
          oldStatus,
          status,
          updatedBy
        );
      } catch (notificationError) {
        console.error('Failed to send status update notification:', notificationError);
        // Don't fail the update if notification fails
      }

      // Send email notification to admin and support team
      try {
        // Get updated ticket data and user who made the update
        const updatedTicket = await db.SupportTicket.findByPk(id);
        const updatedBy = await db.User.findByPk(req.user.id, {
          attributes: ['id', 'first_name', 'last_name', 'user_type']
        });

        await sendSupportTicketStatusUpdateEmail({
          ticket: updatedTicket,
          oldStatus,
          newStatus: status,
          updatedBy
        });
      } catch (emailError) {
        console.error('Failed to send status update email:', emailError);
        // Don't fail the update if email fails
      }
    }

    res.status(200).json({
      success: true,
      message: "Ticket updated successfully"
    });

  } catch (error) {
    console.error('Update ticket status error:', error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};

// Download attachment
exports.downloadAttachment = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;
    const user_type = req.user.user_type;

    const attachment = await db.SupportTicketAttachment.findOne({
      where: { id },
      include: [
        {
          model: db.SupportTicket,
          as: 'ticket',
          where: ['admin', 'super-admin'].includes(user_type) ? {} : { user_id }
        }
      ]
    });

    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: "Attachment not found"
      });
    }

  // Check if it's a Cloudinary URL (new uploads) or local path (old uploads)
if (attachment.file_path.startsWith('http://') || attachment.file_path.startsWith('https://')) {
    // Redirect to Cloudinary URL directly
    return res.redirect(attachment.file_path);
} else {
    // Legacy local file handling
    const filePath = path.resolve(attachment.file_path);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: "File not found on server"
        });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${attachment.original_filename}"`);
    res.setHeader('Content-Type', attachment.mime_type);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
}

  } catch (error) {
    console.error('Download attachment error:', error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};

// Get support statistics (Admin only)
exports.getSupportStats = async (req, res) => {
  try {
    const user_id = req.user.id;
    const user_type = req.user.user_type;

    // Create base where condition for admin filtering
    let baseWhere = {};
    if (['admin', 'vendor'].includes(user_type)) {
      baseWhere.assigned_to = user_id;
    }
    // Super-admin gets all tickets (no additional filtering)

    // Get ticket counts by status
    const totalTickets = await db.SupportTicket.count({
      where: baseWhere
    });

    const openTickets = await db.SupportTicket.count({
      where: {
        ...baseWhere,
        status: 'Open'
      }
    });

    const inProgressTickets = await db.SupportTicket.count({
      where: {
        ...baseWhere,
        status: 'In Progress'
      }
    });

    const resolvedTickets = await db.SupportTicket.count({
      where: {
        ...baseWhere,
        status: 'Resolved'
      }
    });

    const closedTickets = await db.SupportTicket.count({
      where: {
        ...baseWhere,
        status: 'Closed'
      }
    });

    // Get category breakdown with admin filtering
    const categoryStats = await db.SupportTicket.findAll({
      where: baseWhere,
      attributes: [
        'category',
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']
      ],
      group: ['category']
    });

    // Get priority breakdown with admin filtering
    const priorityStats = await db.SupportTicket.findAll({
      where: baseWhere,
      attributes: [
        'priority',
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']
      ],
      group: ['priority']
    });

    res.status(200).json({
      success: true,
      data: {
        summary: {
          total: totalTickets,
          open: openTickets,
          in_progress: inProgressTickets,
          resolved: resolvedTickets,
          closed: closedTickets
        },
        category_breakdown: categoryStats,
        priority_breakdown: priorityStats,
        user_scope: ['admin', 'vendor'].includes(user_type) ? 'assigned_only' : 'all_tickets' // Indicates the scope of data
      }
    });

  } catch (error) {
    console.error('Get support stats error:', error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
}; 
