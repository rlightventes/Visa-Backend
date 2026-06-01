const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { Sequelize, Op } = require("sequelize");
const db = require("../models");
const { checkProfileCompleted } = require("../commonFunctions/commonFunction");
const { sendForgotPasswordEmail, sendUserAccountEmail } = require("../services/email.service");
const { verifyGoogleToken } = require("../services/google-auth.service");

const register = async (req, res) => {
    try {
        const { first_name, last_name, phone, email, password, user_type, company_name, country_id } = req.body;

        // Validate input
        if (!email || !password || !phone || !user_type) {
            return res.status(400).json({ success: false, message: "All fields are required." });
        }

        // Check if user already exists with same email or phone (only among non-deleted users)
        const existingUser = await db.User.findOne({
            where: {
                [Op.or]: [
                    { email: email?.trim() },
                    { phone: phone?.trim() }
                ],
                is_deleted: 0
            }
        });

        if (existingUser) {
            if (existingUser.email === email?.trim()) {
                return res.status(400).json({ success: false, message: "Email already exists." });
            }
            if (existingUser.phone === phone?.trim()) {
                return res.status(400).json({ success: false, message: "Phone number already exists." });
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        let dt = {
            first_name: first_name || "",
            last_name: last_name || "",
            phone,
            email,
            password: hashedPassword,
            user_type: user_type,
            auth_provider: 'local',
            is_active: true,
        }

        if (user_type === 'vendor') {
            dt.company_name = company_name;
            dt.vendor_type = 'regular';
            dt.country_id = country_id;
        }

        // Create user
        const newUser = await db.User.create(dt);

        try {
            await sendUserAccountEmail(
                {
                    email: email,
                    username: company_name || `${first_name} ${last_name}`,
                    mobile: phone || "NA",
                    user_type: user_type,
                },
                password
            );
        } catch (error) {
            console.log(error);
            console.log("Error in sending email to user");
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: newUser.id, email: newUser.email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.status(201).json({
            success: true,
            message: "User registered successfully",
            user: {
                id: newUser.id,
                full_name: newUser.full_name,
                email: newUser.email,
                phone: newUser.phone,
            },
            token,
        });

    } catch (error) {
        console.error("Error in register:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}

const login = async (req, res) => {
    try {
        const { email, password, user_type } = req.body;

        if (!email || !password || !user_type) {
            return res.status(200).json({ success: false, message: "Email and password are required." });
        }

        const user = await db.User.findOne({ where: { email, user_type, is_deleted: 0, is_active: 1 } });

        if (!user) {
            return res.status(200).json({ success: false, message: "Invalid email" });
        }

        // Check if user is a Google OAuth user trying to login with password
        if (user.auth_provider === 'google') {
            return res.status(200).json({
                success: false,
                message: "This account was created with Google. Please use Google Sign-In."
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(200).json({ success: false, message: "Invalid email or password." });
        }

        if (!user.is_active) {
            return res.status(200).json({ success: false, message: "Please contact admin for user activation" });
        }

        if (user.is_deleted) {
            return res.status(200).json({ success: false, message: "User is no longer available" });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, user_type: user.user_type, vendor_type: user.vendor_type },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        // let profileCompleted = false;
        // if (['vendor', 'delivery'].includes(user.user_type)) {
        //     profileCompleted = await checkProfileCompleted(user.id, user.user_type);
        // }

        res.status(200).json({
            success: true,
            message: "Login successful",
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                user_type: user.user_type,
            },
            token,
        });

    } catch (error) {
        console.error("Error in login:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}

const profile = async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await db.User.findByPk(userId, {
            attributes: ["id", "username", "email"],
        });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.status(200).json({
            success: true,
            user,
        });

    } catch (error) {
        console.error("Error fetching profile:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}

const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(404).json({ success: false, message: "Email is required" });
        }

        const user = await db.User.findOne({ where: { email, is_deleted: 0, is_active: 1 } });

        if (!user) {
            return res.status(400).json({ success: false, message: "User not found" });
        }

        const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "1h" });

        let resetPasswordLink = `${process.env.USER_FRONTEND_URL}/reset-password?token=${token}`;

        if (user.user_type === "vendor") {
            resetPasswordLink = `${process.env.VENDOR_FRONTEND_URL}/reset-password?token=${token}`;
        }
        if (user.user_type === "admin") {
            resetPasswordLink = `${process.env.ADMIN_FRONTEND_URL}/reset-password?token=${token}`;
        }

        await sendForgotPasswordEmail(user, resetPasswordLink);

        res.status(200).json({ success: true, message: "Password reset email sent" });

    } catch (error) {
        console.error("Error in forgot password:", error);
        if (error.name === "SequelizeValidationError") {
            return res.status(400).json({ success: false, message: error.errors[0].message });
        }
        res.status(500).json({ success: false, message: "Internal server error" });
    }

}

const resetPassword = async (req, res) => {
    try {
        const { password, token } = req.body;

        if (!password || !token) {
            return res.status(400).json({ success: false, message: "Password and token are required" });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(400).json({ success: false, message: "Invalid or expired token" });
        }

        const user = await db.User.findOne({ where: { email: decoded.email, is_deleted: 0, is_active: 1 } });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Check if user is a Google OAuth user
        if (user.auth_provider === 'google') {
            return res.status(400).json({
                success: false,
                message: "Password reset not available for Google authenticated users. Please use Google Sign-In."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await user.update({ password: hashedPassword });

        res.status(200).json({ success: true, message: "Password reset successfully" });

    } catch (error) {
        console.error("Error resetting password:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}

const validateToken = async (req, res) => {
    try {
        const token = req.body.token;
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        res.status(200).json({ success: true, message: "Token is valid", data: decoded });
    } catch (error) {
        console.error("Error validating token:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}

// Google OAuth Login/Signup
const googleLogin = async (req, res) => {
    try {
        const { id_token, user_type } = req.body;

        if (!id_token || !user_type) {
            return res.status(400).json({
                success: false,
                message: "Google ID token and user type are required."
            });
        }

        // Verify Google token and get user info
        const googleUserInfo = await verifyGoogleToken(id_token);

        if (!googleUserInfo.email_verified) {
            return res.status(400).json({
                success: false,
                message: "Email not verified with Google."
            });
        }

        // Check if user already exists
        let user = await db.User.findOne({
            where: {
                [Op.or]: [
                    { email: googleUserInfo.email },
                    { google_id: googleUserInfo.google_id }
                ],
                is_deleted: 0
            }
        });

        if (user) {

            if (user.user_type !== user_type) {
                return res.status(200).json({
                    success: false,
                    message: "This email is already registered with a different user type"
                });
            }

            // User exists - login
            if (!user.is_active) {
                return res.status(200).json({
                    success: false,
                    message: "Please contact admin for user activation"
                });
            }

            // Update user info if needed
            await user.update({
                google_id: googleUserInfo.google_id,
                google_email: googleUserInfo.email,
                google_profile_picture: googleUserInfo.google_profile_picture,
                auth_provider: 'google'
            });

            const token = jwt.sign(
                {
                    id: user.id,
                    email: user.email,
                    user_type: user.user_type,
                    vendor_type: user.vendor_type
                },
                process.env.JWT_SECRET,
                { expiresIn: "7d" }
            );

            return res.status(200).json({
                success: true,
                message: "Google login successful",
                user: {
                    id: user.id,
                    email: user.email,
                    full_name: `${user.first_name} ${user.last_name}`,
                    user_type: user.user_type,
                    profile_picture: user.google_profile_picture
                },
                token,
            });

        } else {
            // User doesn't exist - create new user
            const newUser = await db.User.create({
                first_name: googleUserInfo.first_name,
                last_name: googleUserInfo.last_name,
                email: googleUserInfo.email,
                google_id: googleUserInfo.google_id,
                google_email: googleUserInfo.email,
                google_profile_picture: googleUserInfo.google_profile_picture,
                auth_provider: 'google',
                user_type: user_type,
                ...(user_type === 'vendor' && { vendor_type: 'regular' }),
                is_active: true,
                phone: '', // Will need to be filled later
                password: null // No password for Google auth users
            });

            // Send welcome email
            try {
                await sendUserAccountEmail(
                    {
                        email: googleUserInfo.email,
                        username: `${googleUserInfo.first_name} ${googleUserInfo.last_name}`,
                        mobile: "NA",
                        user_type: user_type,
                    },
                    "Google Account" // No password for Google auth
                );
            } catch (error) {
                console.log("Error in sending welcome email to Google user:", error);
            }

            const token = jwt.sign(
                {
                    id: newUser.id,
                    email: newUser.email,
                    user_type: newUser.user_type,
                    vendor_type: newUser.vendor_type
                },
                process.env.JWT_SECRET,
                { expiresIn: "7d" }
            );

            return res.status(201).json({
                success: true,
                message: "Google signup successful",
                user: {
                    id: newUser.id,
                    email: newUser.email,
                    full_name: `${newUser.first_name} ${newUser.last_name}`,
                    user_type: newUser.user_type,
                    profile_picture: newUser.google_profile_picture
                },
                token,
                isNewUser: true
            });
        }

    } catch (error) {
        console.error("Error in Google login:", error);
        if (error.message === 'Invalid Google token') {
            return res.status(400).json({ success: false, message: "Invalid Google token" });
        }
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}

module.exports = {
    register,
    login,
    profile,
    forgotPassword,
    resetPassword,
    validateToken,
    googleLogin
};
