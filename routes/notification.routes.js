const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth.middleware');
const notificationController = require('../controller/notification.controller');

// All notification routes require authentication
router.use(verifyToken);

// Get user notifications
router.get('/', notificationController.getUserNotifications);

// Get unread notifications count
router.get('/unread-count', notificationController.getUnreadCount);

// Mark notification as read
router.put('/:notificationId/read', notificationController.markAsRead);

// Mark all notifications as read
router.put('/mark-all-read', notificationController.markAllAsRead);

// Delete notification
router.delete('/:notificationId', notificationController.deleteNotification);

module.exports = router; 