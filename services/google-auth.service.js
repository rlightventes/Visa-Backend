const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Verify Google ID token and extract user information
 * @param {string} token - Google ID token from frontend
 * @returns {Object} - User information from Google
 */
const verifyGoogleToken = async (token) => {
    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        
        const payload = ticket.getPayload();
        
        return {
            google_id: payload.sub,
            email: payload.email,
            first_name: payload.given_name,
            last_name: payload.family_name,
            google_profile_picture: payload.picture,
            email_verified: payload.email_verified
        };
    } catch (error) {
        console.error('Error verifying Google token:', error);
        throw new Error('Invalid Google token');
    }
};

module.exports = {
    verifyGoogleToken
}; 