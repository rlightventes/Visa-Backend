const notificationService = require('../services/notification.service');

/**
 * Get user notifications
 */
exports.getUserNotifications = async (req, res) => {
    try {
        const user = req.user;
        const { page = 1, limit = 20, unreadOnly = false } = req.query;

        const result = await notificationService.getUserNotifications(user, {
            page: parseInt(page),
            limit: parseInt(limit),
            unreadOnly: unreadOnly === 'true'
        });

        return res.status(200).json({
            success: true,
            message: 'Notifications retrieved successfully',
            ...result
        });
    } catch (error) {
        console.error('Get user notifications error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

/**
 * Get unread notifications count
 */
exports.getUnreadCount = async (req, res) => {
    try {
        const userId = req.user.id;
        const count = await notificationService.getUnreadCount(userId);

        return res.status(200).json({
            success: true,
            message: 'Unread count retrieved successfully',
            data: { count }
        });
    } catch (error) {
        console.error('Get unread count error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

/**
 * Mark notification as read
 */
exports.markAsRead = async (req, res) => {
    try {
        const userId = req.user.id;
        const { notificationId } = req.params;

        if (!notificationId) {
            return res.status(400).json({
                success: false,
                message: 'Notification ID is required'
            });
        }

        await notificationService.markAsRead(notificationId, userId);

        return res.status(200).json({
            success: true,
            message: 'Notification marked as read successfully'
        });
    } catch (error) {
        console.error('Mark notification as read error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

/**
 * Mark all notifications as read
 */
exports.markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const db = require('../models');
        await db.Notification.update({
            is_read: true,
            read_at: new Date()
        }, {
            where: {
                user_id: userId,
                is_read: false
            }
        });

        return res.status(200).json({
            success: true,
            message: 'All notifications marked as read successfully'
        });
    } catch (error) {
        console.error('Mark all notifications as read error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

/**
 * Delete notification
 */
exports.deleteNotification = async (req, res) => {
    try {
        const userId = req.user.id;
        const { notificationId } = req.params;

        if (!notificationId) {
            return res.status(400).json({
                success: false,
                message: 'Notification ID is required'
            });
        }

        const db = require('../models');
        const updated = await db.Notification.update({
            is_deleted: true
        }, {
            where: {
                id: notificationId,
                user_id: userId
            }
        });

        if (updated[0] === 0) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Notification deleted successfully'
        });
    } catch (error) {
        console.error('Delete notification error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
}; 