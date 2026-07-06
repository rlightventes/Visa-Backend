const axios = require('axios');
const crypto = require('crypto');

class ZohoPaymentsService {
    constructor() {
        // FIX: .trim() guards against accidental leading/trailing whitespace
        // or newlines that can get pasted into Render's environment variable
        // fields. Such invisible characters make a client_id/secret/refresh
        // token silently "different" from the real Zoho value, which Zoho
        // reports back as generic errors like invalid_account_id — even
        // though the value looks correct when displayed.
        this.baseUrl = (process.env.ZOHO_API_BASE_URL || 'https://www.zohoapis.in').trim();
        this.clientId = (process.env.ZOHO_CLIENT_ID || '').trim();
        this.clientSecret = (process.env.ZOHO_CLIENT_SECRET || '').trim();
        this.refreshToken = (process.env.ZOHO_REFRESH_TOKEN || '').trim();
        this.organizationId = (process.env.ZOHO_ORGANIZATION_ID || '').trim();
        // Payments account (required for /paymentsessions endpoint)
        this.paymentsAccountId = (process.env.ZOHO_PAYMENTS_ACCOUNT_ID || '').trim();
        this.accessToken = null;
        this.tokenExpiry = null;

        // Diagnostic log (safe: only lengths, never the actual secret values).
        // Compare these lengths against what you see when you select-all and
        // copy each value fresh from Zoho — a mismatch usually means Render
        // has stored extra whitespace/newline characters around the value.
        console.log('[ZohoPaymentsService] Credential lengths at startup:', {
            clientId_length: this.clientId.length,
            clientSecret_length: this.clientSecret.length,
            refreshToken_length: this.refreshToken.length,
            paymentsAccountId_length: this.paymentsAccountId.length,
            paymentsAccountId_value: this.paymentsAccountId // account_id isn't secret, safe to log fully
        });
    }

    /**
     * Get access token using refresh token
     */
    async getAccessToken() {
        try {
            // Check if current token is still valid
            if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
                return this.accessToken;
            }

            const response = await axios.post('https://accounts.zoho.in/oauth/v2/token', null, {
                params: {
                    refresh_token: this.refreshToken,
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    grant_type: 'refresh_token'
                }
            });

            if (response.data.access_token) {
                this.accessToken = response.data.access_token;
                // Set expiry time (assuming 1 hour by default, minus 5 minutes for safety)
                this.tokenExpiry = new Date(Date.now() + (response.data.expires_in || 3600) * 1000 - 300000);
                return this.accessToken;
            }

            throw new Error('Failed to get access token from Zoho');
        } catch (error) {
            console.error('Error getting Zoho access token:', error.response?.data || error.message);
            throw new Error('Failed to authenticate with Zoho');
        }
    }

    /**
 * Create a payment order (preparation for payment processing)
 * This mimics Razorpay's order creation but prepares data for Zoho recording
 */
    async createPaymentOrder(orderData) {
        try {
            const {
                amount,
                currency = 'INR',
                receipt,
                notes = {},
                customerId,
                invoiceId
            } = orderData;

            // Generate a unique order ID
            const orderId = `zoho_order_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

            // In a real implementation, you might want to create an invoice in Zoho first
            // For now, we'll simulate order creation
            const orderResponse = {
                id: orderId,
                amount: amount, // Convert to smallest currency unit
                currency: currency,
                receipt: receipt,
                status: 'created',
                created_at: new Date().toISOString(),
                notes: notes
            };

            return orderResponse;
        } catch (error) {
            console.error('Error creating Zoho payment order:', error);
            throw new Error('Failed to create payment order');
        }
    }

    /**
     * Create a hosted payment session in Zoho Payments
     * Returns the session object containing at least an `id` which is used as `payments_session_id` on the frontend.
     */
    async createPaymentSession(sessionData) {
        try {
            const accessToken = await this.getAccessToken();

            const {
                amount,
                currency = 'INR',
                reference_id,
                name,
                email,
                phone,
                notes = {}
            } = sessionData;

            // Build payload as per Zoho Payments Payment Session API
            const payload = {
                amount: parseFloat(amount),
                currency,
                description: notes?.description || `Payment for ${reference_id}`,
                invoice_number: notes?.invoice_number || reference_id,
                meta_data: Object.entries(notes || {}).map(([key, value]) => ({ key, value }))
            };

            const endpointBase = 'https://payments.zoho.in/api/v1/paymentsessions';
            const url = `${endpointBase}?account_id=${this.paymentsAccountId}`;

            let response;
            try {
                response = await axios.post(
                    url,
                    payload,
                    {
                        headers: {
                            'Authorization': `Zoho-oauthtoken ${accessToken}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                if (response.data && response.data.payments_session && response.data.payments_session.payments_session_id) {
                    return {
                        id: response.data.payments_session.payments_session_id,
                        raw: response.data
                    };
                }

                // Zoho responded but without the expected session id shape — treat as a real failure.
                console.error('Zoho payment session response missing payments_session_id:', response.data);
                throw new Error('Zoho did not return a valid payment session.');
            } catch (apiError) {
                // FIX: Previously this error was only logged, and a fake/pseudo
                // session id was silently returned and handed to the frontend
                // checkout widget. That fake id can never succeed at Zoho's
                // end, so the customer would always see a generic "Payment
                // Failed - temporary glitch" message with no indication that
                // the real problem was on our side (e.g. invalid_account_id,
                // expired credentials, etc). We now surface the real error
                // instead of masking it with a fallback.
                const zohoError = apiError.response?.data || { message: apiError.message };
                console.error('Error creating Zoho payment session via API:', zohoError);
                const err = new Error(zohoError.message || 'Failed to create payment session with Zoho.');
                err.zohoError = zohoError;
                throw err;
            }
        } catch (error) {
            console.error('Error in createPaymentSession:', error.message);
            throw error;
        }
    }

    /**
     * Record a successful payment in Zoho Invoice
     */
    async recordPayment(paymentData) {
        try {
            const accessToken = await this.getAccessToken();

            const {
                customerId,
                amount,
                date,
                paymentMode = 'online',
                referenceNumber,
                description,
                invoices = []
            } = paymentData;

            const paymentPayload = {
                customer_id: customerId,
                payment_mode: paymentMode,
                amount: amount,
                date: date || new Date().toISOString().split('T')[0],
                reference_number: referenceNumber,
                description: description,
                invoices: invoices.map(inv => ({
                    invoice_id: inv.invoice_id,
                    amount_applied: inv.amount_applied
                }))
            };

            const response = await axios.post(
                `${this.baseUrl}/invoice/v3/customerpayments`,
                paymentPayload,
                {
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${accessToken}`,
                        'X-com-zoho-invoice-organizationid': this.organizationId,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('Error recording payment in Zoho:', error.response?.data || error.message);
            throw new Error('Failed to record payment in Zoho');
        }
    }

    /**
     * Verify payment signature (for webhook/callback verification)
     */
    async verifyPaymentSignature(data) {
        try {
            const { orderId, paymentId, signature } = data;

            // For Zoho, we'll generate our own signature for verification
            const expectedSignature = crypto
                .createHmac('sha256', this.clientSecret)
                .update(`${orderId}|${paymentId}`)
                .digest('hex');

            return expectedSignature === signature;
        } catch (error) {
            console.error('Error verifying payment signature:', error);
            return false;
        }
    }

    /**
     * Get payment status from Zoho Invoice
     */
    async getPaymentStatus(paymentId) {
        try {
            const accessToken = await this.getAccessToken();

            const response = await axios.get(
                `${this.baseUrl}/invoice/v3/customerpayments/${paymentId}`,
                {
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${accessToken}`,
                        'X-com-zoho-invoice-organizationid': this.organizationId
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('Error getting payment status from Zoho:', error.response?.data || error.message);
            throw new Error('Failed to get payment status');
        }
    }

    /**
     * Get payment status from Zoho Payments API
     * @param {string} paymentId - The payment ID to check
     * @returns {Promise<Object>} - Payment details
     */
    async getZohoPaymentStatus(paymentId) {
        try {
            const accessToken = await this.getAccessToken();

            const response = await axios.get(
                `https://payments.zoho.in/api/v1/payments/${paymentId}?account_id=${this.paymentsAccountId}`,
                {
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('Error getting Zoho payment status:', error.response?.data || error.message);
            throw new Error('Failed to get Zoho payment status');
        }
    }

    /**
     * Create or get customer in Zoho
     */
    async createOrGetCustomer(customerData) {
        try {
            const accessToken = await this.getAccessToken();

            const {
                name,
                email,
                phone,
                companyName
            } = customerData;

            // First, try to find existing customer by email
            const searchResponse = await axios.get(
                `${this.baseUrl}/invoice/v3/contacts`,
                {
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${accessToken}`,
                        'X-com-zoho-invoice-organizationid': this.organizationId
                    },
                    params: {
                        email: email
                    }
                }
            );

            if (searchResponse.data.contacts && searchResponse.data.contacts.length > 0) {
                return searchResponse.data.contacts[0];
            }

            // Create new customer if not found
            const customerPayload = {
                contact_name: name,
                company_name: companyName || name,
                email: email,
                phone: phone,
                contact_type: 'customer'
            };

            const createResponse = await axios.post(
                `${this.baseUrl}/invoice/v3/contacts`,
                customerPayload,
                {
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${accessToken}`,
                        'X-com-zoho-invoice-organizationid': this.organizationId,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return createResponse.data.contact;
        } catch (error) {
            console.error('Error creating/getting customer in Zoho:', error.response?.data || error.message);
            throw new Error('Failed to create/get customer in Zoho');
        }
    }

    /**
     * Generate a secure payment signature for frontend verification
     */
    generatePaymentSignature(orderId, amount) {
        const timestamp = Date.now();
        const data = `${orderId}|${amount}|${timestamp}`;
        const signature = crypto
            .createHmac('sha256', this.clientSecret)
            .update(data)
            .digest('hex');

        return {
            signature,
            timestamp
        };
    }
}

module.exports = new ZohoPaymentsService();
