const express = require('express');
const router = express.Router();
const supportController = require('../controller/support.controller');
const { verifyToken, verifyAdminToken } = require('../middlewares/auth.middleware');
const upload = require('../middlewares/upload.middleware');

// Support ticket routes for users
router.post('/create-ticket', verifyToken, upload.array('attachments', 5), supportController.createTicket);
router.get('/my-tickets', verifyToken, supportController.getUserTickets);
router.get('/ticket/:id', verifyToken, supportController.getTicketDetails);
router.post('/ticket/:id/reply', verifyToken, upload.array('attachments', 3), supportController.addReply);

// Support ticket routes for admins
router.get('/all-tickets', verifyAdminToken, supportController.getAllTickets);
router.put('/ticket/:id/status', verifyAdminToken, supportController.updateTicketStatus);
router.get('/stats', verifyAdminToken, supportController.getSupportStats);

// File download route (accessible by both users and admins)
router.get('/attachment/:id/download', verifyToken, supportController.downloadAttachment);

module.exports = router; 