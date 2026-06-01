const { Op } = require('sequelize');
const db = require('../models');
const socketService = require('./socket.service');

class NotificationService {
    constructor() {
        this.notificationTypes = {
            VISA_APPLICATION_RECEIVED: 'visa_application_received',
            VISA_STATUS_UPDATED: 'visa_status_updated',
            PAYMENT_COMPLETED: 'payment_completed',
            PAYMENT_FAILED: 'payment_failed',
            DOCUMENT_UPLOADED: 'document_uploaded',
            ASSIGNMENT_CHANGED: 'assignment_changed',
            SYSTEM_NOTIFICATION: 'system_notification',
            SUPPORT_TICKET_CREATED: 'support_ticket_created',
            SUPPORT_TICKET_STATUS_UPDATED: 'support_ticket_status_updated',
            SUPPORT_TICKET_REPLY: 'support_ticket_reply'
        };
    }

    /**
     * Create and send notification
     * @param {Object} notificationData - Notification data
     * @param {string} notificationData.type - Type of notification
     * @param {string} notificationData.title - Notification title
     * @param {string} notificationData.message - Notification message
     * @param {Array} notificationData.recipients - Array of user IDs to send to
     * @param {string} notificationData.senderId - ID of user sending the notification (optional)
     * @param {Object} notificationData.data - Additional data (optional)
     * @param {string} notificationData.redirectUrl - URL to redirect when clicked (optional)
     */
    async createAndSendNotification(notificationData) {
        try {
            const {
                type,
                title,
                message,
                recipients,
                senderId = null,
                data = {},
                redirectUrl = null
            } = notificationData;

            if (!recipients || recipients.length === 0) {
                console.log('No recipients specified for notification');
                return;
            }

            // Create notifications for each recipient
            const notifications = [];
            for (const userId of recipients) {
                const notification = await db.Notification.create({
                    user_id: userId,
                    sender_id: senderId,
                    type,
                    title,
                    message,
                    data,
                    redirect_url: redirectUrl,
                    is_read: false,
                    created_at: new Date(),
                    reference_id: data.reference_id || null
                });

                notifications.push(notification);

                // Send real-time notification via Socket.IO
                const socketNotification = {
                    id: notification.id,
                    type,
                    title,
                    message,
                    data,
                    redirect_url: redirectUrl,
                    created_at: notification.created_at,
                    is_read: false
                };

                await socketService.sendToUser(userId, socketNotification);
            }

            console.log(`Created and sent ${notifications.length} notifications for type: ${type}`);
            return notifications;
        } catch (error) {
            console.error('Error creating notification:', error);
            throw error;
        }
    }

    /**
     * Handle visa application received notification
     * @param {Object} visaApplication - Visa application data
     * @param {Object} visa - Visa data
     * @param {Object} user - User who submitted the application
     */
    async handleVisaApplicationReceived(visaApplication, visa, user) {
        try {
            const recipients = [];

            // Always notify super-admin
            const superAdmins = await db.User.findAll({
                where: {
                    user_type: 'super-admin',
                    is_active: 1,
                    is_deleted: 0
                },
                attributes: ['id']
            });
            recipients.push(...superAdmins.map(admin => admin.id));

            // Notify admin who created the visa (if different from super-admin)
            if (visa.created_by) {
                const visaCreator = await db.User.findOne({
                    where: {
                        id: visa.created_by,
                        user_type: 'admin',
                        is_active: 1,
                        is_deleted: 0
                    },
                    attributes: ['id']
                });

                if (visaCreator && !recipients.includes(visaCreator.id)) {
                    recipients.push(visaCreator.id);
                }
            }

            const title = '🎫 New Visa Application Received';
            const message = `New ${visa.visa_type} visa application ${visaApplication.application_id} submitted by ${user.first_name} ${user.last_name} for ${visa.name}.`;

            const redirectUrl = this.generateRedirectUrl('admin', 'visa-application', visaApplication.id);

            await this.createAndSendNotification({
                type: this.notificationTypes.VISA_APPLICATION_RECEIVED,
                title,
                message,
                recipients,
                senderId: user.id,
                data: {
                    visa_application_id: visaApplication.id,
                    application_id: visaApplication.application_id,
                    visa_id: visa.id,
                    visa_name: visa.name,
                    user_id: user.id,
                    user_name: `${user.first_name} ${user.last_name}`,
                    amount: visaApplication.amount,
                    reference_id: visaApplication.id
                },
                redirectUrl
            });
        } catch (error) {
            console.error('Error handling visa application received notification:', error);
        }
    }

    /**
     * Handle visa status update notification
     * @param {Object} visaApplication - Updated visa application data
     * @param {string} oldStatus - Previous status
     * @param {string} newStatus - New status
     * @param {Object} updatedBy - User who updated the status
     */
    async handleVisaStatusUpdate(visaApplication, oldStatus, newStatus, updatedBy) {
        try {
            const recipients = [];
            // Always notify super-admin
            const superAdmins = await db.User.findAll({
                where: {
                    user_type: 'super-admin',
                    is_active: 1,
                    is_deleted: 0
                },
                attributes: ['id']
            });

            recipients.push(...superAdmins.map(admin => admin.id));

            if (updatedBy.vendor_type !== 'third-party') {
                recipients.push(visaApplication.user_id);
            }

            // If application was submitted by a vendor, notify the vendor too
            const applicationUser = await db.User.findOne({
                where: {
                    id: visaApplication.user_id,
                    is_active: 1,
                    is_deleted: 0
                },
                attributes: ['id', 'user_type', 'first_name', 'last_name']
            });

            if (applicationUser && applicationUser.user_type === 'vendor') {
                // Already included above
            }

            const statusEmojis = {
                'pending': '⏳',
                'processing': '🔄',
                'approved': '✅',
                'rejected': '❌',
                'cancelled': '🚫',
                'expired': '⏰',
                'completed': '🎉'
            };

            const title = `${statusEmojis[newStatus] || '📋'} Visa Application ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`;
            const message = `Your visa application ${visaApplication.application_id} status has been updated from ${oldStatus} to ${newStatus}.`;

            const redirectUrl = applicationUser.user_type === 'vendor'
                ? this.generateRedirectUrl('vendor', 'visa-application', visaApplication.id)
                : this.generateRedirectUrl('user', 'visa-application', visaApplication.id);

            await this.createAndSendNotification({
                type: this.notificationTypes.VISA_STATUS_UPDATED,
                title,
                message,
                recipients,
                senderId: updatedBy.id,
                data: {
                    visa_application_id: visaApplication.id,
                    application_id: visaApplication.application_id,
                    old_status: oldStatus,
                    new_status: newStatus,
                    updated_by: `${updatedBy.first_name} ${updatedBy.last_name}`,
                    reference_number: visaApplication.reference_number,
                    reference_id: visaApplication.id
                },
                redirectUrl
            });
        } catch (error) {
            console.error('Error handling visa status update notification:', error);
        }
    }

    /**
     * Handle payment completion notification
     * @param {Object} payment - Payment data
     * @param {Object} visaApplication - Visa application data
     */
    async handlePaymentCompleted(payment, visaApplication) {
        try {
            const recipients = [payment.user_id];

            // Always notify super-admin
            const superAdmins = await db.User.findAll({
                where: {
                    user_type: 'super-admin',
                    is_active: 1,
                    is_deleted: 0
                },
                attributes: ['id']
            });

            recipients.push(...superAdmins.map(admin => admin.id));

            const title = '💳 Payment Successful';
            const message = `Payment of ₹${payment.amount} for visa application ${visaApplication.application_id} has been processed successfully.`;

            const applicationUser = await db.User.findOne({
                where: { id: payment.user_id },
                attributes: ['user_type']
            });

            const redirectUrl = applicationUser.user_type === 'vendor'
                ? this.generateRedirectUrl('vendor', 'visa-application', visaApplication.id)
                : this.generateRedirectUrl('user', 'visa-application', visaApplication.id);

            await this.createAndSendNotification({
                type: this.notificationTypes.PAYMENT_COMPLETED,
                title,
                message,
                recipients,
                data: {
                    payment_id: payment.id,
                    visa_application_id: visaApplication.id,
                    application_id: visaApplication.application_id,
                    amount: payment.amount,
                    transaction_id: payment.txn_id,
                    reference_id: payment.id
                },
                redirectUrl
            });
        } catch (error) {
            console.error('Error handling payment completed notification:', error);
        }
    }

    /**
     * Handle payment failure notification
     * @param {Object} payment - Payment data
     * @param {Object} visaApplication - Visa application data
     */
    async handlePaymentFailed(payment, visaApplication) {
        try {
            const recipients = [payment.user_id];

            const title = '❌ Payment Failed';
            const message = `Payment of ₹${payment.amount} for visa application ${visaApplication.application_id} has failed. Please try again.`;

            const applicationUser = await db.User.findOne({
                where: { id: payment.user_id },
                attributes: ['user_type']
            });

            const redirectUrl = applicationUser.user_type === 'vendor'
                ? this.generateRedirectUrl('vendor', 'payment-retry', payment.id)
                : this.generateRedirectUrl('user', 'payment-retry', payment.id);

            await this.createAndSendNotification({
                type: this.notificationTypes.PAYMENT_FAILED,
                title,
                message,
                recipients,
                data: {
                    payment_id: payment.id,
                    visa_application_id: visaApplication.id,
                    application_id: visaApplication.application_id,
                    amount: payment.amount,
                    reference_id: payment.id
                },
                redirectUrl
            });
        } catch (error) {
            console.error('Error handling payment failed notification:', error);
        }
    }

    /**
     * Generate redirect URL based on user type and action
     * @param {string} userType - Type of user (admin, vendor, user)
     * @param {string} action - Action type (visa-application, payment-retry, etc.)
     * @param {string} id - Resource ID
     */
    generateRedirectUrl(userType, action, id) {
        const baseUrls = {
            'admin': process.env.ADMIN_FRONTEND_URL,
            'vendor': process.env.VENDOR_FRONTEND_URL,
            'user': process.env.USER_FRONTEND_URL,
            'third-party': process.env.THIRD_PARTY_FRONTEND_URL
        };

        const baseUrl = baseUrls[userType] || baseUrls['user'];

        switch (action) {
            case 'visa-application':
                return `${baseUrl}/visa-applications/${id}`;
            case 'payment-retry':
                return `${baseUrl}/payments/retry/${id}`;
            case 'support-ticket':
                return userType === 'user' 
                    ? `${baseUrl}/support/tickets/${id}` 
                    : `${baseUrl}/support/manage/${id}`;
            case 'dashboard':
                return `${baseUrl}/dashboard`;
            default:
                return `${baseUrl}/notifications`;
        }
    }

    /**
     * Mark notification as read
     * @param {string} notificationId - Notification ID
     * @param {string} userId - User ID
     */
    async markAsRead(notificationId, userId) {
        try {
            await db.Notification.update({
                is_read: true,
                read_at: new Date()
            }, {
                where: {
                    id: notificationId,
                    user_id: userId
                }
            });
        } catch (error) {
            console.error('Error marking notification as read:', error);
            throw error;
        }
    }

    /**
     * Get notifications for user
     * @param {string} userId - User ID
     * @param {Object} options - Query options (page, limit, unreadOnly)
     */
    async getUserNotifications(userId, options = {}) {
        try {
            const { page = 1, limit = 20, unreadOnly = false } = options;
            const offset = (page - 1) * limit;

            let where = {
                is_deleted: false,
                user_id: userId.id
            };

            if (unreadOnly) {
                where.is_read = false;
            }

            if (userId.vendor_type === 'third-party') {
                where = {
                    ...where,
                    type: {
                        [Op.notIn]: ['support_ticket_created', 'support_ticket_status_updated', 'support_ticket_reply']
                    }
                }
            }

            const notifications = await db.Notification.findAndCountAll({
                where,
                include: [
                    {
                        model: db.User,
                        as: 'sender',
                        attributes: ['id', 'first_name', 'last_name', 'user_type'],
                        required: false
                    }
                ],
                order: [['created_at', 'DESC']],
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            return {
                notifications: notifications.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: notifications.count,
                    totalPages: Math.ceil(notifications.count / limit)
                }
            };
        } catch (error) {
            console.error('Error getting user notifications:', error);
            throw error;
        }
    }

    /**
     * Get unread notifications count
     * @param {string} userId - User ID
     */
    async getUnreadCount(userId) {
        try {
            return await db.Notification.count({
                where: {
                    user_id: userId,
                    is_read: false,
                    is_deleted: false
                }
            });
        } catch (error) {
            console.error('Error getting unread count:', error);
            return 0;
        }
    }

    async assignVisaApplication(visaApplication, visa, user) {
        try {
            const recipients = [user.id];

            const title = '🎫 New Visa Assigned';
            const message = `New ${visa.visa_type} visa application ${visaApplication.application_id} assigned to ${user.first_name} ${user.last_name} for ${visa.name}.`;

            await this.createAndSendNotification({
                type: this.notificationTypes.ASSIGNMENT_CHANGED,
                title,
                message,
                recipients,
                senderId: user.id,
                data: {
                    visa_application_id: visaApplication.id,
                    application_id: visaApplication.application_id,
                    visa_id: visa.id,
                    visa_name: visa.name,
                    user_id: user.id,
                    user_name: `${user.first_name} ${user.last_name}`,
                    amount: visaApplication.amount,
                    reference_id: visaApplication.id
                },
                redirectUrl: ''
            });
        } catch (error) {
            console.error('Error handling visa application received notification:', error);
        }
    }

    /**
     * Handle support ticket creation notification
     * @param {Object} ticket - Support ticket data
     * @param {Object} user - User who created the ticket
     * @param {Object} visaApplication - Related visa application (optional)
     */
    async handleSupportTicketCreated(ticket, user, visaApplication = null) {
        try {
            const recipients = [];

            // Always notify super-admin
            const superAdmins = await db.User.findAll({
                where: {
                    user_type: 'super-admin',
                    is_active: 1,
                    is_deleted: 0
                },
                attributes: ['id']
            });
            recipients.push(...superAdmins.map(admin => admin.id));

            // If ticket is related to a visa application, notify relevant admin/vendor
            if (visaApplication) {
                // Get the visa details to find the creator
                const visa = await db.Visa.findOne({
                    where: { id: visaApplication.visa_id },
                    attributes: ['id', 'created_by', 'name', 'country_id'],
                    include: [
                        {
                            model: db.Country,
                            as: 'country',
                            attributes: ['name']
                        }
                    ]
                });

                if (visa && visa.created_by) {
                    const visaCreator = await db.User.findOne({
                        where: {
                            id: visa.created_by,
                            user_type: ['admin', 'vendor'],
                            is_active: 1,
                            is_deleted: 0
                        },
                        attributes: ['id', 'user_type']
                    });

                    if (visaCreator && !recipients.includes(visaCreator.id)) {
                        recipients.push(visaCreator.id);
                    }
                }

                // If visa application is assigned to someone, notify them too
                if (visaApplication.assign_to) {
                    const assignedUser = await db.User.findOne({
                        where: {
                            id: visaApplication.assign_to,
                            is_active: 1,
                            is_deleted: 0
                        },
                        attributes: ['id']
                    });

                    if (assignedUser && !recipients.includes(assignedUser.id)) {
                        recipients.push(assignedUser.id);
                    }
                }
            }

            const categoryEmojis = {
                'Visa Issue': '🛂',
                'Payment Issue': '💳',
                'Technical Issue': '🔧',
                'Other': '❓'
            };

            const title = `${categoryEmojis[ticket.category]} New Support Ticket`;
            let message = `Support ticket #${ticket.ticket_number} created by ${user.first_name} ${user.last_name}`;
            
            if (visaApplication) {
                message += ` for visa application ${visaApplication.application_id}`;
            }
            
            message += `.\nCategory: ${ticket.category}\nSubject: ${ticket.subject}`;

            const redirectUrl = this.generateRedirectUrl('admin', 'support-ticket', ticket.id);

            await this.createAndSendNotification({
                type: this.notificationTypes.SUPPORT_TICKET_CREATED,
                title,
                message,
                recipients,
                senderId: user.id,
                data: {
                    ticket_id: ticket.id,
                    ticket_number: ticket.ticket_number,
                    category: ticket.category,
                    priority: ticket.priority,
                    visa_application_id: visaApplication?.id || null,
                    application_id: visaApplication?.application_id || null,
                    user_id: user.id,
                    user_name: `${user.first_name} ${user.last_name}`,
                    reference_id: ticket.id
                },
                redirectUrl
            });
        } catch (error) {
            console.error('Error handling support ticket created notification:', error);
        }
    }

    /**
     * Handle support ticket status update notification
     * @param {Object} ticket - Support ticket data
     * @param {string} oldStatus - Previous status
     * @param {string} newStatus - New status
     * @param {Object} updatedBy - User who updated the status
     */
    async handleSupportTicketStatusUpdate(ticket, oldStatus, newStatus, updatedBy) {
        try {
            // Notify the user who created the ticket
            const recipients = [ticket.user_id];

            const statusEmojis = {
                'Open': '🟢',
                'In Progress': '🔄',
                'Resolved': '✅',
                'Closed': '🔒'
            };

            const title = `${statusEmojis[newStatus]} Support Ticket Status Updated`;
            const message = `Your support ticket #${ticket.ticket_number} status changed from "${oldStatus}" to "${newStatus}"`;

            const redirectUrl = this.generateRedirectUrl('user', 'support-ticket', ticket.id);

            await this.createAndSendNotification({
                type: this.notificationTypes.SUPPORT_TICKET_STATUS_UPDATED,
                title,
                message,
                recipients,
                senderId: updatedBy.id,
                data: {
                    ticket_id: ticket.id,
                    ticket_number: ticket.ticket_number,
                    old_status: oldStatus,
                    new_status: newStatus,
                    category: ticket.category,
                    priority: ticket.priority,
                    updated_by: `${updatedBy.first_name} ${updatedBy.last_name}`,
                    reference_id: ticket.id
                },
                redirectUrl
            });
        } catch (error) {
            console.error('Error handling support ticket status update notification:', error);
        }
    }

    /**
     * Handle support ticket reply notification
     * @param {Object} ticket - Support ticket data
     * @param {Object} message - Reply message data
     * @param {Object} replyBy - User who replied
     * @param {Object} ticketOwner - User who owns the ticket
     */
    async handleSupportTicketReply(ticket, message, replyBy, ticketOwner) {
        try {
            // Determine who to notify based on who replied
            const recipients = [];
            
            if (['user', 'vendor'].includes(replyBy.user_type)) {
                // If user replied, notify admins and assigned person
                const superAdmins = await db.User.findAll({
                    where: {
                        user_type: 'super-admin',
                        is_active: 1,
                        is_deleted: 0
                    },
                    attributes: ['id']
                });
                recipients.push(...superAdmins.map(admin => admin.id));

                // Notify assigned user if any
                if (ticket.assigned_to && ticket.assigned_to !== replyBy.id) {
                    recipients.push(ticket.assigned_to);
                }
            } else {
                // If admin/staff replied, notify the ticket owner
                if (ticketOwner.id !== replyBy.id) {
                    recipients.push(ticketOwner.id);
                }
            }

            if (recipients.length === 0) return;

            const title = `💬 New Reply on Support Ticket`;
            const senderName = `${replyBy.first_name} ${replyBy.last_name}`;
            const messagePreview = message.message.length > 100 
                ? message.message.substring(0, 100) + '...' 
                : message.message;
            
            const notificationMessage = `${senderName} replied to ticket #${ticket.ticket_number}:\n"${messagePreview}"`;

            const redirectUrl = ['user', 'vendor'].includes(replyBy.user_type) 
                ? this.generateRedirectUrl('admin', 'support-ticket', ticket.id)
                : this.generateRedirectUrl('user', 'support-ticket', ticket.id);

            await this.createAndSendNotification({
                type: this.notificationTypes.SUPPORT_TICKET_REPLY,
                title,
                message: notificationMessage,
                recipients,
                senderId: replyBy.id,
                data: {
                    ticket_id: ticket.id,
                    ticket_number: ticket.ticket_number,
                    message_id: message.id,
                    reply_by: senderName,
                    reply_by_type: replyBy.user_type,
                    category: ticket.category,
                    priority: ticket.priority,
                    reference_id: ticket.id
                },
                redirectUrl
            });
        } catch (error) {
            console.error('Error handling support ticket reply notification:', error);
        }
    }
}

// Create singleton instance
const notificationService = new NotificationService();

module.exports = notificationService; 