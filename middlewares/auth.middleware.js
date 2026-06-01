const jwt = require('jsonwebtoken');
const db = require('../models');
const { Op } = require('sequelize');

module.exports = {
    verifyToken: async (req, res, next) => {
        try {
            const token = req.headers.authorization?.split(' ')[1];

            if (!token) {
                return res.status(401).json({ success: false, message: 'Unauthorized! No token provided.' });
            }

            // Decode Token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded; // Attach decoded data

            // Fetch User Data from DB
            const userData = await db.User.findOne({
                where: {
                    id: req.user.id,
                    is_active: 1,
                    is_deleted: 0,
                    // user_type: { [Op.notIn]: ['admin', 'super-admin'] } // Exclude Admin Users
                },
                attributes: ['id', 'user_type', 'vendor_type'] // Fetch only necessary fields
            });

            if (!userData) {
                return res.status(401).json({ success: false, message: 'Unauthorized! Invalid user.' });
            }

            // Attach user details to req.user
            req.user.user_id = userData.id;
            req.user.user_type = userData.user_type;
            req.user.vendor_type = userData.vendor_type;

            next(); // Proceed to next middleware/controller

        } catch (error) {
            console.error('Token verification error:', error);
            return res.status(401).json({ success: false, message: 'Unauthorized! Invalid token.' });
        }
    },
    verifySuperAdminToken: (req, res, next) => {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).send({ message: 'Unauthorized!' });
        }

        jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
            if (err) {
                return res.status(401).send({ message: 'Unauthorized!' });
            }
            req.user = decoded;

            const userData = await db.User.findOne({
                where: {
                    id: req.user.id,
                    user_type: 'super-admin',
                    is_active: 1,
                    is_deleted: 0,
                }
            });

            if (!userData) {
                return res.status(401).send({ message: 'Unauthorized!' });
            }

            next();
        });
    },
    verifyAdminToken: async (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;    
            if (!authHeader) {
                return res.status(401).send({ message: 'Token missing' });
            }
    
            const token = authHeader.split(' ')[1];    
            if (!token) {
                return res.status(401).send({ message: 'Token not found' });
            }
    
            jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'Unauthorized! Invalid token' });
                }
    
                req.user = decoded;
    
                const userData = await db.User.findOne({
                  where: {
                    id: req.user.id,
                    user_type: {
                      [Op.in]: ["admin", "super-admin", "vendor"], 
                    },
                    is_active: 1,
                    is_deleted: 0,
                  },
                });
    
                if (!userData) {
                    return res.status(401).send({ message: 'Unauthorized! User not valid' });
                }
    
                next();
            });
    
        } catch (error) {
            return res.status(500).send({ message: 'Internal Server Error' });
        }
    },
    
    verifyVendorToken: (req, res, next) => {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).send({ message: 'Unauthorized!' });
        }

        jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
            if (err) {
                return res.status(401).send({ message: 'Unauthorized!' });
            }
            req.user = decoded;

            const userData = await db.User.findOne({
                where: {
                    id: req.user.id,
                    user_type: 'vendor',
                    is_active: 1,
                    is_deleted: 0,
                }
            });

            if (!userData) {
                return res.status(401).send({ message: 'Unauthorized!' });
            }

            next();
        });
    }
};