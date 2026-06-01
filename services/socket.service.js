const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const db = require('../models');

class SocketService {
    constructor() {
        this.io = null;
        this.connectedUsers = new Map(); // userId -> socketId
        this.userRooms = new Map(); // userId -> room names
    }

    initialize(server) {
        this.io = new Server(server, {
            cors: {
                origin: '*',
                methods: ["GET", "POST"],
                credentials: true
            }
        });

        this.setupEventHandlers();
        console.log('Socket.IO service initialized');
        return this.io;
    }

    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`New socket connection: ${socket.id}`);

            // Handle authentication
            socket.on('authenticate', async (data) => {
                try {
                    const { token } = data;
                    if (!token) {
                        socket.emit('auth_error', { message: 'Token required' });
                        return;
                    }

                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    const user = await db.User.findOne({
                        where: {
                            id: decoded.id,
                            is_active: 1,
                            is_deleted: 0
                        },
                        attributes: ['id', 'user_type', 'vendor_type', 'first_name', 'last_name', 'created_by']
                    });

                    if (!user) {
                        socket.emit('auth_error', { message: 'Invalid user' });
                        return;
                    }

                    // Store user connection
                    socket.userId = user.id;
                    socket.userType = user.user_type;
                    socket.vendorType = user.vendor_type;
                    socket.createdBy = user.created_by;
                    
                    this.connectedUsers.set(user.id, socket.id);

                    // Join appropriate rooms based on user type
                    this.joinUserRooms(socket, user);

                    socket.emit('authenticated', {
                        message: 'Successfully authenticated',
                        user: {
                            id: user.id,
                            user_type: user.user_type,
                            vendor_type: user.vendor_type,
                            name: `${user.first_name} ${user.last_name}`
                        }
                    });

                    console.log(`User ${user.id} (${user.user_type}) authenticated and joined rooms`);
                } catch (error) {
                    console.error('Authentication error:', error);
                    socket.emit('auth_error', { message: 'Authentication failed' });
                }
            });

            // Handle notification mark as read
            socket.on('mark_notification_read', async (data) => {
                try {
                    const { notificationId } = data;
                    if (!socket.userId || !notificationId) return;

                    await db.Notification.update({
                        is_read: true,
                        read_at: new Date()
                    }, {
                        where: {
                            id: notificationId,
                            user_id: socket.userId
                        }
                    });

                    socket.emit('notification_read_success', { notificationId });
                } catch (error) {
                    console.error('Mark notification read error:', error);
                    socket.emit('notification_read_error', { message: 'Failed to mark notification as read' });
                }
            });

            // Handle get notifications
            socket.on('get_notifications', async (data) => {
                try {
                    if (!socket.userId) return;

                    const { page = 1, limit = 20 } = data;
                    const offset = (page - 1) * limit;

                    const notifications = await db.Notification.findAll({
                        where: {
                            user_id: socket.userId,
                            is_deleted: false
                        },
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

                    socket.emit('notifications_list', {
                        notifications,
                        pagination: {
                            page: parseInt(page),
                            limit: parseInt(limit),
                            total: notifications.length
                        }
                    });
                } catch (error) {
                    console.error('Get notifications error:', error);
                    socket.emit('notifications_error', { message: 'Failed to fetch notifications' });
                }
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                if (socket.userId) {
                    this.connectedUsers.delete(socket.userId);
                    this.userRooms.delete(socket.userId);
                    console.log(`User ${socket.userId} disconnected`);
                }
            });
        });
    }

    joinUserRooms(socket, user) {
        const rooms = [];

        // All users join their personal room
        const personalRoom = `user_${user.id}`;
        socket.join(personalRoom);
        rooms.push(personalRoom);

        // Join rooms based on user type
        switch (user.user_type) {
            case 'super-admin':
                socket.join('super_admins');
                socket.join('all_admins');
                rooms.push('super_admins', 'all_admins');
                break;

            case 'admin':
                socket.join('admins');
                socket.join('all_admins');
                socket.join(`admin_${user.id}`);
                rooms.push('admins', 'all_admins', `admin_${user.id}`);
                break;

            case 'vendor':
                socket.join('vendors');
                if (user.vendor_type === 'regular') {
                    socket.join('regular_vendors');
                    rooms.push('vendors', 'regular_vendors');
                } else if (user.vendor_type === 'third-party') {
                    socket.join('third_party_vendors');
                    rooms.push('vendors', 'third_party_vendors');
                }
                // Join room for vendors created by specific admin
                if (user.created_by) {
                    socket.join(`admin_${user.created_by}_vendors`);
                    rooms.push(`admin_${user.created_by}_vendors`);
                }
                break;

            case 'user':
                socket.join('users');
                rooms.push('users');
                break;
        }

        this.userRooms.set(user.id, rooms);
    }

    // Send notification to specific user
    async sendToUser(userId, notification) {
        const socketId = this.connectedUsers.get(userId);
        if (socketId) {
            this.io.to(socketId).emit('new_notification', notification);
            return true;
        }
        return false;
    }

    // Send notification to specific room
    async sendToRoom(room, notification) {
        this.io.to(room).emit('new_notification', notification);
    }

    // Send notification to multiple rooms
    async sendToRooms(rooms, notification) {
        rooms.forEach(room => {
            this.io.to(room).emit('new_notification', notification);
        });
    }

    // Get connected users count
    getConnectedUsersCount() {
        return this.connectedUsers.size;
    }

    // Get user rooms
    getUserRooms(userId) {
        return this.userRooms.get(userId) || [];
    }

    // Check if user is online
    isUserOnline(userId) {
        return this.connectedUsers.has(userId);
    }
}

// Create singleton instance
const socketService = new SocketService();

module.exports = socketService; 