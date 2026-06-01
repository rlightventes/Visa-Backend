const { SendMailClient } = require("zeptomail");

const url = process.env.ZEPTOMAIL_URL;
const token = process.env.ZEPTOMAIL_TOKEN;

let client = new SendMailClient({ url, token });

const sendUserAccountEmail = async (user, password) => {
    const mailOptions = {
        from: {
            address: process.env.SMTP_FROM,
            name: "Stellar Evisa"
        },
        to: [
            {
                email_address: {
                    address: user.email,
                    name: user.username
                }
            }
        ],
        subject: "Your Account Details - Stellar Evisa",
        htmlbody: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Stellar Evisa</h1>
                    <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 16px;">Your Journey to Success Starts Here</p>
                </div>

                    <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffaa5a;">
                        <p style="margin: 5px 0;"><strong style="color: #ff3d8a;">Username:</strong> ${user.username}</p>
                        <p style="margin: 5px 0;"><strong style="color: #ff3d8a;">Email:</strong> ${user.email}</p>
                        <p style="margin: 5px 0;"><strong style="color: #ff3d8a;">Phone:</strong> ${user.mobile}</p>
                        <p style="margin: 5px 0;"><strong style="color: #ff3d8a;">Password:</strong> ${password}</p>
                        ${user.user_type === "admin" ? `
                            <p style="margin: 5px 0;"><strong style="color: #ff3d8a;">Dashboard Link:</strong> <a href="https://admin.stellarevisa.com/" style="color: #ff3d8a; text-decoration: none;">https://admin.stellarevisa.com/</a> </p>
                        ` : user.user_type === "vendor" ? `
                            <p style="margin: 5px 0;"><strong style="color: #ff3d8a;">Dashboard Link:</strong> <a href="https://business.stellarevisa.com/" style="color: #ff3d8a; text-decoration: none;">https://business.stellarevisa.com/</a> </p>
                        ` : `
                            <p style="margin: 5px 0;"><strong style="color: #ff3d8a;">Dashboard Link:</strong> <a href="https://stellarevisa.com/" style="color: #ff3d8a; text-decoration: none;">https://stellarevisa.com/</a> </p>
                        `}
                    </div>
                
                <div style="padding: 30px 20px;">
                    <h2 style="color: #ff3d8a; margin: 0 0 20px 0;">Welcome to Stellar Evisa</h2>
                    <p style="color: #333; font-size: 16px; line-height: 1.5;">Dear ${user.username},</p>
                    <p style="color: #333; font-size: 16px; line-height: 1.5;">
                        Your account has been successfully created by the admin. Below are your login details:
                    </p>
                    
                    <p style="color: #333; font-size: 16px; line-height: 1.5;">You can log in using your email and password on the admin portal.</p>
                    <p style="color: #333; font-size: 16px; line-height: 1.5;">Please keep this information secure and do not share it with anyone.</p>
                </div>
                
                <div style="background-color: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px; text-align: center;">
                    <p style="margin: 0; color: #ff3d8a; font-weight: bold;">Need Help?</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">Contact our support team at support@stellarevisa.com</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">Call us: +91 8655347848 | +91 8655347847 | +91 8655347849</p>
                    <p style="margin: 15px 0 0 0; color: #ff3d8a; font-weight: bold;">Best regards,</p>
                    <p style="margin: 15px 0 0 0; color: #ff3d8a; font-weight: bold;">Stellar Evisa</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">Your Partner in Success</p>
                </div>
            </div>
        `,
    };

    try {
        const data = await client.sendMail(mailOptions);
        console.log("User email sent:", data);
        return true;
    } catch (error) {
        console.error("User email sending failed:", error);
        return false;
    }
}

const sendForgotPasswordEmail = async (user, resetLinkOrOTP) => {
    const isLink = resetLinkOrOTP.startsWith('http');

    // Fallback to 'Stellar User' if name is not available
    const userName = (user.first_name && user.last_name) ? `${user.first_name} ${user.last_name}` : 'Stellar User';

    const mailOptions = {
        from: {
            address: process.env.SMTP_FROM,
            name: "Stellar Evisa"
        },
        to: [
            {
                email_address: {
                    address: user.email,
                    name: userName
                }
            }
        ],
        subject: 'Password Reset - Stellar Evisa',
        htmlbody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Stellar Evisa</h1>
            <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 16px;">Secure Password Reset</p>
          </div>
  
          <div style="padding: 30px 20px;">
            <h2 style="color: #ff3d8a; margin: 0 0 20px 0;">Hello ${userName},</h2>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">
              We received a request to reset your password. ${isLink
                ? 'Click the button below to reset your password.'
                : 'Use the OTP below to reset your password.'
            }
            </p>
  
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffaa5a; text-align: center;">
              ${isLink
                ? `<a href="${resetLinkOrOTP}" style="display: inline-block; padding: 12px 25px; background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); color: #fff; text-decoration: none; border-radius: 5px;">Reset Password</a>`
                : `<p style="font-size: 24px; font-weight: bold; color: #ff3d8a;">${resetLinkOrOTP}</p>`
            }
            </div>
  
            <p style="color: #333; font-size: 14px; line-height: 1.5;">
              If you did not request this, please ignore this email. This ${isLink ? 'link' : 'code'
            } will expire in 1 hour for your security.
            </p>
          </div>
  
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px; text-align: center;">
            <p style="margin: 0; color: #ff3d8a; font-weight: bold;">Need Help?</p>
            <p style="margin: 5px 0; color: #666; font-size: 14px;">Contact our support team at support@stellarevisa.com</p>
            <p style="margin: 5px 0; color: #666; font-size: 14px;">Call us: +91 8655347848 | +91 8655347847 | +91 8655347849</p>
            <p style="margin: 15px 0 0 0; color: #ff3d8a; font-weight: bold;">Stellar Evisa</p>
            <p style="margin: 5px 0; color: #666; font-size: 14px;">Your Partner in Success</p>
          </div>
        </div>
      `,
    };

    try {
        const result = await client.sendMail(mailOptions);
        console.log('✅ Forgot password email sent:', result);
        return true;
    } catch (error) {
        console.log(JSON.stringify(error));

        console.error('❌ Failed to send forgot password email:', error);
        return false;
    }
};

const sendPaymentConfirmationEmail = async (paymentData) => {
    const {
        user,
        visa,
        application,
        payment,
        travellers
    } = paymentData;

    // Fallback to 'Stellar User' if name is not available
    const userName = (user.first_name && user.last_name) ? `${user.first_name} ${user.last_name}` : 'Stellar User';

    // Determine display name for B2B vs B2C applications
    const displayName = (user.user_type === 'vendor' && user.company_name) ? user.company_name : userName;

    // Format date for display
    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    // Format currency
    const formatCurrency = (amount, currency = 'INR') => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2
        }).format(amount);
    };

    const mailOptions = {
        from: {
            address: process.env.SMTP_FROM,
            name: "Stellar Evisa"
        },
        to: [
            {
                email_address: {
                    address: user.email,
                    name: userName
                }
            }
        ],
        subject: `Payment Confirmation - ${visa.name} Visa Application`,
        htmlbody: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Stellar Evisa</h1>
                    <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 16px;">Payment Confirmation</p>
                </div>
                
                <div style="padding: 30px 20px;">
                    <div style="text-align: center; margin: 30px 0;">
                        ${user.user_type === "admin" ? `
                            <a href="https://admin.stellarevisa.com/visa-applications" style="display: inline-block; padding: 12px 25px; background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">Track Application Status</a>
                        ` : user.user_type === "vendor" ? `
                            <a href="https://business.stellarevisa.com/dashboard" style="display: inline-block; padding: 12px 25px; background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">Track Application Status</a>
                        ` : `
                            <a href="https://stellarevisa.com/visa-applications" style="display: inline-block; padding: 12px 25px; background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">Track Application Status</a>
                        `}
                    </div>

                    <h2 style="color: #ff3d8a; margin: 0 0 20px 0;">Dear ${displayName},</h2>
                    <p style="color: #333; font-size: 16px; line-height: 1.5;">
                        Great news! Your payment has been successfully processed for your ${visa.name} visa application.
                    </p>
                    
                    <!-- Application Details -->
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ff3d8a;">
                        <h3 style="color: #ff3d8a; margin: 0 0 15px 0; font-size: 18px;">Application Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">Application ID:</td>
                                <td style="padding: 8px 0; color: #333;">${application.application_id}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Visa Type:</td>
                                <td style="padding: 8px 0; color: #333;">${visa.name}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Number of Travellers:</td>
                                <td style="padding: 8px 0; color: #333;">${application.number_of_travellers}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Travel Dates:</td>
                                <td style="padding: 8px 0; color: #333;">${formatDate(application.departure_date)} - ${formatDate(application.return_date)}</td>
                            </tr>
                        </table>
                    </div>

                    <!-- Payment Details -->
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #4caf50;">
                        <h3 style="color: #4caf50; margin: 0 0 15px 0; font-size: 18px;">Payment Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">Payment ID:</td>
                                <td style="padding: 8px 0; color: #333;">${payment.payment_id}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Amount Paid:</td>
                                <td style="padding: 8px 0; color: #333; font-size: 18px; font-weight: bold;">${formatCurrency(payment.amount)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Payment Date:</td>
                                <td style="padding: 8px 0; color: #333;">${formatDate(new Date())}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Payment Method:</td>
                                <td style="padding: 8px 0; color: #333;">Online Payment</td>
                            </tr>
                        </table>
                    </div>

                    <!-- Traveller Details -->
                    ${travellers && travellers.length > 0 ? `
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ff8566;">
                        <h3 style="color: #ff8566; margin: 0 0 15px 0; font-size: 18px;">Traveller Details</h3>
                        ${travellers.map((traveller, index) => `
                            <div style="margin-bottom: 15px; padding-bottom: 15px; ${index < travellers.length - 1 ? 'border-bottom: 1px solid #e0e0e0;' : ''}">
                                <p style="margin: 5px 0; color: #333;"><strong>Traveller ${index + 1}:</strong> ${traveller.name}</p>
                                <p style="margin: 5px 0; color: #666; font-size: 14px;">Passport: ${traveller.passport_number}</p>
                            </div>
                        `).join('')}
                    </div>
                    ` : ''}

                    <!-- Next Steps -->
                    <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #2196f3;">
                        <h3 style="color: #2196f3; margin: 0 0 15px 0; font-size: 18px;">What's Next?</h3>
                        <ul style="color: #333; padding-left: 20px; line-height: 1.6;">
                            <li>Your application is now being processed by our visa specialists</li>
                            <li>We will review all submitted documents and information</li>
                            <li>You will receive updates via email as your application progresses</li>
                            <li>Processing typically takes 5-15 business days depending on the visa type</li>
                            <li>You can track your application status in your dashboard</li>
                        </ul>
                    </div>

                    <p style="color: #333; font-size: 16px; line-height: 1.5;">
                        Thank you for choosing Stellar Evisa for your travel needs. We're committed to making your visa application process smooth and hassle-free.
                    </p>
                </div>
                
                <div style="background-color: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px; text-align: center;">
                    <p style="margin: 0; color: #ff3d8a; font-weight: bold;">Need Help?</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">Contact our support team at support@stellarevisa.com</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">Call us: +91 8655347848 | +91 8655347847 | +91 8655347849</p>
                    <p style="margin: 15px 0 0 0; color: #ff3d8a; font-weight: bold;">Stellar Evisa</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">Your Partner in Success</p>
                </div>
            </div>
        `,
    };

    try {
        const result = await client.sendMail(mailOptions);
        console.log('✅ Payment confirmation email sent:', result);
        return true;
    } catch (error) {
        console.error('❌ Failed to send payment confirmation email:', error);
        return false;
    }
};

const sendVisaStatusUpdateEmail = async (statusData) => {
    const {
        user,
        visa,
        application,
        status,
        reference_number,
        uploaded_document,
        remark,
        vendor_type,
        assigned_by
    } = statusData;

    // Fallback to 'Stellar User' if name is not available
    const userName = (user.first_name && user.last_name) ? `${user.first_name} ${user.last_name}` : 'Stellar User';

    // Determine display name for B2B vs B2C applications
    const displayName = (user.user_type === 'vendor' && user.company_name) ? user.company_name : userName;

    const isApproved = status === 'approved';
    const isRejected = status === 'rejected';

    let statusColor = '#ff3d8a';
    let statusIcon = '📋';
    let statusText = 'Updated';

    if (isApproved) {
        statusColor = '#4caf50';
        statusIcon = '✅';
        statusText = 'Approved';
    } else if (isRejected) {
        statusColor = '#f44336';
        statusIcon = '❌';
        statusText = 'Rejected';
    } else if (status === 'cancelled') {
        statusColor = '#f44336';
        statusIcon = '❌';
        statusText = 'Cancelled';
    }

    // Format date for display
    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const recipients = [
        {
            email_address: {
                address: "admin@stellarevisa.com",
                name: "Stellar Evisa Admin"
            }
        },
        {
            email_address: {
                address: "support@stellarevisa.com",
                name: "Stellar Evisa Support"
            }
        },
        {
            email_address: {
                address: user.email,
                name: userName
            }
        }
    ];

    if (vendor_type === 'third-party' && assigned_by) {
        recipients.push({
            email_address: {
                address: assigned_by.email,
                name: assigned_by.first_name + ' ' + assigned_by.last_name
            }
        });
    }

    const mailOptions = {
        from: {
            address: process.env.SMTP_FROM,
            name: "Stellar Evisa"
        },
        to: recipients,
        subject: `Visa Application ${statusText} - ${visa.name}`,
        htmlbody: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="background-color: ${statusColor}; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Stellar Evisa</h1>
                    <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 16px;">Visa Application Status Update</p>
                </div>
                
                <div style="padding: 30px 20px;">
                    <div style="text-align: center; margin: 30px 0;">
                        ${user.user_type === "admin" ? `
                            <a href="https://admin.stellarevisa.com/visa-applications" style="display: inline-block; padding: 12px 25px; background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">View Application</a>
                        ` : user.user_type === "vendor" ? `
                            <a href="https://business.stellarevisa.com/dashboard" style="display: inline-block; padding: 12px 25px; background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">View Application</a>
                        ` : `
                            <a href="https://stellarevisa.com/visa-applications" style="display: inline-block; padding: 12px 25px; background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">View Application</a>
                        `}
                    </div>

                    <h2 style="color: #ff3d8a; margin: 0 0 20px 0;">Dear ${displayName},</h2>
                    
                    ${isApproved ? `
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">
                            <strong>Congratulations!</strong> Your ${visa.name} visa application has been <span style="color: #4caf50; font-weight: bold;">approved</span>. 
                            You can now proceed with your travel plans.
                        </p>
                    ` : isRejected ? `
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">
                            We regret to inform you that your ${visa.name} visa application has been <span style="color: #f44336; font-weight: bold;">rejected</span>. 
                            Please contact our support team for more information about the reasons and possible next steps.
                        </p>
                    ` : `
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">
                            Your ${visa.name} visa application status has been updated. Please check your dashboard for the latest information.
                        </p>
                    `}
                    
                    <!-- Application Details -->
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid ${statusColor};">
                        <h3 style="color: ${statusColor}; margin: 0 0 15px 0; font-size: 18px;">Application Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">Application ID:</td>
                                <td style="padding: 8px 0; color: #333;">${application.application_id}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Visa Type:</td>
                                <td style="padding: 8px 0; color: #333;">${visa.name}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Status:</td>
                                <td style="padding: 8px 0; color: ${statusColor}; font-weight: bold; text-transform: capitalize;">${status}</td>
                            </tr>
                            ${reference_number ? `
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Reference Number:</td>
                                <td style="padding: 8px 0; color: #333; font-weight: bold; background-color: #e8f5e8; padding: 8px 12px; border-radius: 4px;">${reference_number}</td>
                            </tr>
                            ` : ''}
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Number of Travellers:</td>
                                <td style="padding: 8px 0; color: #333;">${application.number_of_travellers}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Travel Dates:</td>
                                <td style="padding: 8px 0; color: #333;">${formatDate(application.departure_date)} - ${formatDate(application.return_date)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Status Updated:</td>
                                <td style="padding: 8px 0; color: #333;">${formatDate(new Date())}</td>
                            </tr>
                        </table>
                    </div>

                    ${uploaded_document ? `
                        <!-- Attached Documents -->
                        <div style="background-color: #f0f8ff; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #2196f3;">
                            <h3 style="color: #2196f3; margin: 0 0 15px 0; font-size: 18px;">📎 Attached Documents</h3>
                            <div style="background-color: #ffffff; padding: 15px; border-radius: 6px; border: 1px solid #e0e0e0;">
                                <div style="display: flex; align-items: center; margin-bottom: 10px;">
                                    <span style="font-size: 20px; margin-right: 10px;">📄</span>
                                    <div>
                                        <p style="margin: 0; color: #333; font-weight: bold;">Visa Document</p>
                                        <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Approved visa document or additional information</p>
                                    </div>
                                </div>
                                <div style="text-align: center; margin-top: 15px;">
                                    <a href="${process.env.BASE_URL}${uploaded_document}" 
                                       style="display: inline-block; padding: 10px 20px; background-color: #2196f3; color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;"
                                       target="_blank">
                                        📥 Download Document
                                    </a>
                                </div>
                            </div>
                            <p style="margin: 15px 0 0 0; color: #666; font-size: 14px; text-align: center;">
                                <em>Please save this document for your travel records</em>
                            </p>
                        </div>
                    ` : ''}

                    ${isApproved ? `
                        <!-- Next Steps for Approved -->
                        <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #4caf50;">
                            <h3 style="color: #4caf50; margin: 0 0 15px 0; font-size: 18px;">What's Next?</h3>
                            <ul style="color: #333; padding-left: 20px; line-height: 1.6;">
                                ${uploaded_document ? '<li><strong>Download the attached visa document from above</strong></li>' : ''}
                                ${reference_number ? `<li><strong>Note down your reference number: ${reference_number}</strong></li>` : ''}
                                ${remark ? `<li>Remark: ${remark}</li>` : ''}
                                <li>Print a copy of your visa approval for travel</li>
                                <li>Ensure your passport is valid for at least 6 months from travel date</li>
                                <li>Check entry requirements for your destination country</li>
                                <li>Keep your visa documents and reference number safe during travel</li>
                                <li>Present your visa document and reference number at immigration</li>
                            </ul>
                        </div>
                    ` : isRejected ? `
                        <!-- Next Steps for Rejected -->
                        <div style="background-color: #ffebee; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #f44336;">
                            <h3 style="color: #f44336; margin: 0 0 15px 0; font-size: 18px;">Next Steps</h3>
                            <ul style="color: #333; padding-left: 20px; line-height: 1.6;">
                                ${uploaded_document ? '<li><strong>Review the attached document for rejection reasons</strong></li>' : ''}
                                ${reference_number ? `<li><strong>Quote reference number ${reference_number} when contacting support</strong></li>` : ''}
                                ${remark ? `<li>Remark: ${remark}</li>` : ''}
                                <li>Contact our support team to understand the rejection reasons</li>
                                <li>Review the feedback provided by the visa office</li>
                                <li>Consider reapplying with corrected documentation</li>
                                <li>Our visa specialists can help you with a new application</li>
                            </ul>
                        </div>
                    ` : status === 'cancelled' ? `
                        <!-- Next Steps for Cancelled -->
                        <div style="background-color: #ffebee; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #f44336;">
                            <h3 style="color: #f44336; margin: 0 0 15px 0; font-size: 18px;">Next Steps</h3>
                            <ul style="color: #333; padding-left: 20px; line-height: 1.6;">
                                ${uploaded_document ? '<li><strong>Review the attached document for cancellation reasons</strong></li>' : ''}
                                ${reference_number ? `<li><strong>Quote reference number ${reference_number} when contacting support</strong></li>` : ''}
                                ${remark ? `<li>Remark: ${remark}</li>` : ''}
                                <li>Contact our support team to understand the cancellation reasons</li>
                                <li>Review the remark provided by the visa office</li>
                            </ul>
                        </div>
                    ` : `
                        <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #2196f3;">
                            <h3 style="color: #2196f3; margin: 0 0 15px 0; font-size: 18px;">What's Next?</h3>
                            <ul style="color: #333; padding-left: 20px; line-height: 1.6;">
                                ${uploaded_document ? '<li><strong>Review the attached document for additional information</strong></li>' : ''}
                                ${reference_number ? `<li><strong>Your reference number is: ${reference_number}</strong></li>` : ''}
                                ${remark ? `<li>Remark: ${remark}</li>` : ''}
                                <li>Check your dashboard for detailed status information</li>
                                <li>You will receive further updates as your application progresses</li>
                                <li>Contact our support team if you have any questions</li>
                            </ul>
                        </div>
                    `}

                    ${reference_number ? `
                        <!-- Important Reference Number Notice -->
                        <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ffc107; text-align: center;">
                            <h4 style="color: #856404; margin: 0 0 10px 0;">⚠️ Important</h4>
                            <p style="color: #856404; margin: 0; font-weight: bold;">
                                Please keep your reference number <span style="background-color: #856404; color: white; padding: 4px 8px; border-radius: 4px;">${reference_number}</span> safe for future reference and travel purposes.
                            </p>
                        </div>
                    ` : ''}

                    <p style="color: #333; font-size: 16px; line-height: 1.5;">
                        If you have any questions or need assistance, please don't hesitate to contact our support team${reference_number ? ` and mention your reference number: <strong>${reference_number}</strong>` : ''}.
                    </p>
                </div>
                
                <div style="background-color: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px; text-align: center;">
                    <p style="margin: 0; color: #ff3d8a; font-weight: bold;">Need Help?</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">Contact our support team at support@stellarevisa.com</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">Call us: +91 8655347848 | +91 8655347847 | +91 8655347849</p>
                    ${reference_number ? `<p style="margin: 5px 0; color: #666; font-size: 14px;">Reference Number: <strong>${reference_number}</strong></p>` : ''}
                    <p style="margin: 15px 0 0 0; color: #ff3d8a; font-weight: bold;">Stellar Evisa</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">Your Partner in Success</p>
                </div>
            </div>
        `,
    };

    try {
        const result = await client.sendMail(mailOptions);
        console.log('✅ Visa status update email sent:', result);
        return true;
    } catch (error) {
        console.error('❌ Failed to send visa status update email:', JSON.stringify(error));
        return false;
    }
};

const sendVisaAssignmentEmail = async (assignmentData) => {
    const {
        vendor,
        user,
        visa,
        application
    } = assignmentData;

    // Fallback to 'Stellar User' if vendor name is not available
    const vendorName = (vendor.first_name && vendor.last_name) ? `${vendor.first_name} ${vendor.last_name}` : 'Stellar User';

    // Format date for display
    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const mailOptions = {
        from: {
            address: process.env.SMTP_FROM,
            name: "Stellar Evisa"
        },
        to: [
            {
                email_address: {
                    address: vendor.email,
                    name: vendorName
                }
            }
        ],
        subject: `New Visa Application Assignment - *** ${visa.name} ***`,
        htmlbody: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Stellar Evisa</h1>
                    <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 16px;">New Application Assignment</p>
                </div>
                
                <div style="padding: 30px 20px;">
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.THIRD_PARTY_FRONTEND_URL}/visa-applications" style="display: inline-block; padding: 12px 25px; background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">Access Dashboard</a>
                    </div>

                    <h2 style="color: #ff3d8a; margin: 0 0 20px 0;">Dear ${vendorName},</h2>
                    <p style="color: #333; font-size: 16px; line-height: 1.5;">
                        A new visa application has been assigned to you for processing. Please review the details below and take necessary action.
                    </p>
                    
                    <!-- Application Details -->
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ff3d8a;">
                        <h3 style="color: #ff3d8a; margin: 0 0 15px 0; font-size: 18px;">Application Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">Application ID:</td>
                                <td style="padding: 8px 0; color: #333;">${application.application_id}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Visa Type:</td>
                                <td style="padding: 8px 0; color: #333;">${visa.name}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Visa Category:</td>
                                <td style="padding: 8px 0; color: #333; text-transform: capitalize;">${visa.visa_type}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Entry Type:</td>
                                <td style="padding: 8px 0; color: #333; text-transform: capitalize;">${visa.entry_type}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Number of Travellers:</td>
                                <td style="padding: 8px 0; color: #333;">${application.number_of_travellers}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Travel Dates:</td>
                                <td style="padding: 8px 0; color: #333;">${formatDate(application.departure_date)} - ${formatDate(application.return_date)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Assigned Date:</td>
                                <td style="padding: 8px 0; color: #333;">${formatDate(new Date())}</td>
                            </tr>
                        </table>
                        
                    </div>
                    <!-- Next Steps -->
                    <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #4caf50;">
                        <h3 style="color: #4caf50; margin: 0 0 15px 0; font-size: 18px;">Your Action Required</h3>
                        <ul style="color: #333; padding-left: 20px; line-height: 1.6;">
                            <li><strong>Log in to your dashboard to view complete application details</strong></li>
                            <li>Review all submitted documents and information</li>
                            <li>Contact the customer if additional information is needed</li>
                            <li>Process the application according to visa requirements</li>
                            <li>Update the application status as you progress</li>
                            <li>Upload approved documents when processing is complete</li>
                        </ul>
                    </div>

                    <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ffc107; text-align: center;">
                        <h4 style="color: #856404; margin: 0 0 10px 0;">⚠️ Important</h4>
                        <p style="color: #856404; margin: 0; font-weight: bold;">
                            Please process this application promptly. The customer is waiting for their visa approval.
                        </p>
                    </div>

                    <p style="color: #333; font-size: 16px; line-height: 1.5;">
                        Thank you for your prompt attention to this matter. If you have any questions about this assignment, please contact our support team.
                    </p>
                </div>
                
                <div style="background-color: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px; text-align: center;">
                    <p style="margin: 0; color: #ff3d8a; font-weight: bold;">Need Help?</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">Contact our support team at support@stellarevisa.com</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">Call us: +91 8655347848 | +91 8655347847 | +91 8655347849</p>
                    <p style="margin: 15px 0 0 0; color: #ff3d8a; font-weight: bold;">Stellar Evisa</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">Your Partner in Success</p>
                </div>
            </div>
        `,
    };

    try {
        const result = await client.sendMail(mailOptions);
        console.log('✅ Visa assignment email sent:', result);
        return true;
    } catch (error) {
        console.error('❌ Failed to send visa assignment email:', error);
        return false;
    }
};

const sendContactSupportEmail = async (contactData) => {
    const { name, email, phone } = contactData;

    const mailOptions = {
        from: {
            address: process.env.SMTP_FROM,
            name: "Stellar Evisa"
        },
        to: [
            {
                email_address: {
                    address: "admin@stellarevisa.com",
                    name: "Stellar Evisa Admin"
                }
            },
            {
                email_address: {
                    address: "support@stellarevisa.com",
                    name: "Stellar Evisa Support"
                }
            }
        ],
        subject: "New Support Request - Contact Form Submission",
        htmlbody: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Stellar Evisa</h1>
                    <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 16px;">New Support Request</p>
                </div>
                
                <div style="padding: 30px 20px;">
                    <h2 style="color: #ff3d8a; margin: 0 0 20px 0;">Contact Form Submission</h2>
                    <p style="color: #333; font-size: 16px; line-height: 1.5;">
                        Someone has submitted a request through the contact form. Here are the details:
                    </p>
                    
                    <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ff3d8a;">
                        <p style="margin: 5px 0;"><strong style="color: #ff3d8a;">Name:</strong> ${name}</p>
                        <p style="margin: 5px 0;"><strong style="color: #ff3d8a;">Email:</strong> ${email}</p>
                        <p style="margin: 5px 0;"><strong style="color: #ff3d8a;">Phone:</strong> ${phone}</p>
                    </div>
                    
                    <p style="color: #333; font-size: 16px; line-height: 1.5;">
                        Please respond to this inquiry as soon as possible.
                    </p>
                </div>
                
                <div style="background-color: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px; text-align: center;">
                    <p style="margin: 0; color: #ff3d8a; font-weight: bold;">This is an automated message</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">Sent from the Stellar Evisa contact form</p>
                    <p style="margin: 15px 0 0 0; color: #ff3d8a; font-weight: bold;">Stellar Evisa</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">Your Partner in Success</p>
                </div>
            </div>
        `,
    };

    try {
        const result = await client.sendMail(mailOptions);
        console.log('✅ Contact support email sent:', result);
        return true;
    } catch (error) {
        console.error('❌ Failed to send contact support email:', error);
        return false;
    }
};

const sendAdminApplicationNotificationEmail = async (applicationData) => {
    const {
        user,
        visa,
        application,
        payment,
        travellers
    } = applicationData;

    // Fallback to 'Stellar User' if name is not available
    const userName = (user.first_name && user.last_name) ? `${user.first_name} ${user.last_name}` : 'Stellar User';

    // Determine display name for B2B vs B2C applications
    const displayName = (user.user_type === 'vendor' && user.company_name) ? user.company_name : userName;

    // Format date for display
    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    // Format currency
    const formatCurrency = (amount, currency = 'INR') => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2
        }).format(amount);
    };

    // Email recipients based on vendor application or not
    const recipients = [];

    // Always include admin
    recipients.push({
        email_address: {
            address: "admin@stellarevisa.com",
            name: "Stellar Evisa Admin"
        }
    });

    recipients.push({
        email_address: {
            address: "support@stellarevisa.com",
            name: "Stellar Evisa Support"
        }
    });

    // For vendor applications, also notify support
    // if (user.user_type === 'vendor') {
    //     recipients.push({
    //         email_address: {
    //             address: "support@stellarevisa.com",
    //             name: "Stellar Evisa Support"
    //         }
    //     });
    // }

    const mailOptions = {
        from: {
            address: process.env.SMTP_FROM,
            name: "Stellar Evisa"
        },
        to: recipients,
        subject: `New Visa Application Received - ${visa.name} - ${application.application_id}`,
        htmlbody: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Stellar Evisa</h1>
                    <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 16px;">New Visa Application Received</p>
                </div>
                
                <div style="padding: 30px 20px;">
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://admin.stellarevisa.com/visa-application-details/${application.application_id}" style="display: inline-block; padding: 12px 25px; background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold; margin-right: 15px;">View Application</a>
                        <a href="https://admin.stellarevisa.com/visa-applications" style="display: inline-block; padding: 12px 25px; background-color: #ff8566; color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">View All Applications</a>
                    </div>

                    <h2 style="color: #ff3d8a; margin: 0 0 20px 0;">Dear Admin,</h2>
                    <p style="color: #333; font-size: 16px; line-height: 1.5;">
                        A new ${visa.name} visa application has been received and payment has been successfully processed.
                    </p>
                    
                    <!-- Customer Details -->
                    <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #4caf50;">
                        <h3 style="color: #4caf50; margin: 0 0 15px 0; font-size: 18px;">Customer Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">${user.user_type === 'vendor' ? 'Company Name:' : 'Customer Name:'}</td>
                                <td style="padding: 8px 0; color: #333;">${displayName}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Email:</td>
                                <td style="padding: 8px 0; color: #333;">${user.email}</td>
                            </tr>
                        </table>
                    </div>
                    
                    <!-- Application Details -->
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ff3d8a;">
                        <h3 style="color: #ff3d8a; margin: 0 0 15px 0; font-size: 18px;">Application Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">Application ID:</td>
                                <td style="padding: 8px 0; color: #333; font-weight: bold; font-size: 16px;">${application.application_id}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Visa Type:</td>
                                <td style="padding: 8px 0; color: #333;">${visa.name}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Number of Travellers:</td>
                                <td style="padding: 8px 0; color: #333;">${application.number_of_travellers}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Travel Dates:</td>
                                <td style="padding: 8px 0; color: #333;">${formatDate(application.departure_date)} - ${formatDate(application.return_date)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Application Date:</td>
                                <td style="padding: 8px 0; color: #333;">${formatDate(new Date())}</td>
                            </tr>
                        </table>
                    </div>

                    <!-- Payment Details -->
                    <div style="background-color: #f0f8ff; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #2196f3;">
                        <h3 style="color: #2196f3; margin: 0 0 15px 0; font-size: 18px;">Payment Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">Payment ID:</td>
                                <td style="padding: 8px 0; color: #333;">${payment.payment_id}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Amount Received:</td>
                                <td style="padding: 8px 0; color: #333; font-size: 18px; font-weight: bold; color: #4caf50;">${formatCurrency(payment.amount)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Payment Status:</td>
                                <td style="padding: 8px 0; color: #4caf50; font-weight: bold;">✓ Completed</td>
                            </tr>
                        </table>
                    </div>

                    <!-- Traveller Details -->
                    ${travellers && travellers.length > 0 ? `
                    <div style="background-color: #fff8e1; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ff8566;">
                        <h3 style="color: #ff8566; margin: 0 0 15px 0; font-size: 18px;">Traveller Details</h3>
                        ${travellers.map((traveller, index) => `
                            <div style="margin-bottom: 15px; padding-bottom: 15px; ${index < travellers.length - 1 ? 'border-bottom: 1px solid #e0e0e0;' : ''}">
                                <p style="margin: 5px 0; color: #333;"><strong>Traveller ${index + 1}:</strong> ${traveller.name}</p>
                                <p style="margin: 5px 0; color: #666; font-size: 14px;">Passport: ${traveller.passport_number}</p>
                            </div>
                        `).join('')}
                    </div>
                    ` : ''}

                    <!-- Action Required -->
                    <div style="background-color: #ffebee; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #f44336;">
                        <h3 style="color: #f44336; margin: 0 0 15px 0; font-size: 18px;">Action Required</h3>
                        <ul style="color: #333; padding-left: 20px; line-height: 1.6;">
                            <li>Review the submitted application and documents</li>
                            <li>Assign the application to a visa specialist for processing</li>
                            <li>Verify all traveller information and requirements</li>
                            <li>Update application status as processing progresses</li>
                            <li>Communicate with the customer if additional documents are needed</li>
                        </ul>
                    </div>
                </div>
                
                <div style="background-color: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px; text-align: center;">
                    <p style="margin: 0; color: #ff3d8a; font-weight: bold;">Stellar Evisa</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">This is an automated notification from the Stellar Evisa system</p>
                </div>
            </div>
        `,
    };

    try {
        const result = await client.sendMail(mailOptions);
        console.log('✅ Admin application notification email sent:', result);
        return true;
    } catch (error) {
        console.error('❌ Failed to send admin application notification email:', error);
        return false;
    }
};

// Send traveller status update email
const sendTravellerStatusUpdateEmail = async (emailData) => {
    try {
        const {
            user,
            traveller,
            visa,
            application,
            status
        } = emailData;

        // Fallback to 'Stellar User' if name is not available
        const userName = (user.first_name && user.last_name) ? `${user.first_name} ${user.last_name}` : 'Stellar User';

        // Determine display name for B2B vs B2C applications
        const displayName = (user.user_type === 'vendor' && user.company_name) ? user.company_name : userName;

        // Fallback for traveller name
        const travellerName = (traveller.first_name && traveller.last_name) ? `${traveller.first_name} ${traveller.last_name}` : 'Traveller';

        const formatDate = (dateString) => {
            return new Date(dateString).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        };

        const getStatusColor = (status) => {
            const colors = {
                'approved': '#4CAF50',
                'rejected': '#f44336',
                'cancelled': '#9e9e9e',
                'processing': '#2196F3',
                'pending': '#ff8566',
                'completed': '#8bc34a',
                'expired': '#795548'
            };
            return colors[status] || '#9e9e9e';
        };

        const getStatusMessage = (status) => {
            const messages = {
                'approved': 'Great news! Your traveller\'s visa has been approved.',
                'rejected': 'We regret to inform you that your traveller\'s visa application has been rejected.',
                'cancelled': 'Your traveller\'s visa application has been cancelled.',
                'processing': 'Your traveller\'s visa application is being processed.',
                'pending': 'Your traveller\'s visa application is pending review.',
                'completed': 'Your traveller\'s visa process has been completed.',
                'expired': 'Your traveller\'s visa application has expired.'
            };
            return messages[status] || 'Your traveller\'s visa status has been updated.';
        };

        const mailOptions = {
            from: {
                address: process.env.SMTP_FROM,
                name: "Stellar Evisa"
            },
            to: [
                {
                    email_address: {
                        address: user.email,
                        name: userName
                    }
                },
                {
                    email_address: {
                        address: "support@stellarevisa.com",
                        name: "Stellar Evisa Support"
                    }
                },
                {
                    email_address: {
                        address: "admin@stellarevisa.com",
                        name: "Stellar Evisa Admin"
                    }
                }
            ],
            subject: `Traveller Status Update - ${visa.name} - ${travellerName}`,
            htmlbody: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <div style="background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Stellar Evisa</h1>
                        <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 16px;">Traveller Status Update</p>
                    </div>
                    
                    <div style="padding: 30px 20px;">
                        <h2 style="color: #ff3d8a; margin: 0 0 20px 0;">Dear ${displayName},</h2>
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">
                            ${getStatusMessage(status)}
                        </p>
                        
                        <!-- Action Buttons -->
                        <div style="text-align: center; margin: 30px 0;">
                            ${user.user_type === "admin" ? `
                                <a href="https://admin.stellarevisa.com/visa-application-details/${application.application_id}" style="display: inline-block; padding: 12px 25px; background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); color: #fff; text-decoration: none; border-radius: 5px; margin-right: 10px;">View Application</a>
                                <a href="https://admin.stellarevisa.com/visa-applications" style="display: inline-block; padding: 12px 25px; background-color: #28a745; color: #fff; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
                            ` : user.user_type === "vendor" ? `
                                <a href="https://business.stellarevisa.com/application/${application.application_id}" style="display: inline-block; padding: 12px 25px; background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); color: #fff; text-decoration: none; border-radius: 5px; margin-right: 10px;">View Application</a>
                                <a href="https://business.stellarevisa.com/dashboard" style="display: inline-block; padding: 12px 25px; background-color: #28a745; color: #fff; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
                            ` : `
                                <a href="https://stellarevisa.com/visa-applications/${application.application_id}" style="display: inline-block; padding: 12px 25px; background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); color: #fff; text-decoration: none; border-radius: 5px; margin-right: 10px;">View Application</a>
                                <a href="https://stellarevisa.com/visa-applications" style="display: inline-block; padding: 12px 25px; background-color: #28a745; color: #fff; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
                            `}
                        </div>
                        
                        <!-- Traveller Details -->
                        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
                            <h3 style="color: #28a745; margin: 0 0 15px 0; font-size: 18px;">📋 Traveller Details</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">Name:</td>
                                    <td style="padding: 8px 0; color: #333;">${travellerName}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #666; font-weight: bold;">Passport Number:</td>
                                    <td style="padding: 8px 0; color: #333;">${traveller.passport_number || 'Not provided'}</td>
                                </tr>
                            </table>
                        </div>
                        
                        <!-- Application Details -->
                        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #007bff;">
                            <h3 style="color: #007bff; margin: 0 0 15px 0; font-size: 18px;">📄 Application Details</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">Application ID:</td>
                                    <td style="padding: 8px 0; color: #333;">${application.application_id}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #666; font-weight: bold;">Visa Type:</td>
                                    <td style="padding: 8px 0; color: #333;">${visa.name}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #666; font-weight: bold;">Country:</td>
                                    <td style="padding: 8px 0; color: #333;">${visa.country}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #666; font-weight: bold;">Travel Dates:</td>
                                    <td style="padding: 8px 0; color: #333;">${formatDate(application.departure_date)} - ${formatDate(application.return_date)}</td>
                                </tr>
                                ${application.reference_number ? `
                                <tr>
                                    <td style="padding: 8px 0; color: #666; font-weight: bold;">Reference Number:</td>
                                    <td style="padding: 8px 0; color: #333; font-weight: bold; color: #ff3d8a;">${application.reference_number}</td>
                                </tr>
                                ` : ''}
                                ${application.uploaded_document ? `
                                <tr>
                                    <td style="padding: 8px 0; color: #666; font-weight: bold;">Document:</td>
                                    <td style="padding: 8px 0; color: #333;">
                                        <a href="${process.env.BASE_URL}${application.uploaded_document}" 
                                           style="color: #ff3d8a; text-decoration: none; font-weight: bold;"
                                           target="_blank">📄 View Uploaded Document</a>
                                    </td>
                                </tr>
                                ` : ''}
                                ${application.remark ? `
                                <tr>
                                    <td style="padding: 8px 0; color: #666; font-weight: bold;">Remark:</td>
                                    <td style="padding: 8px 0; color: #333;">${application.remark}</td>
                                </tr>
                                ` : ''}
                            </table>
                        </div>
                    
                        
                        <div style="background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #2196F3;">
                            <p style="margin: 0; color: #1565C0; font-size: 14px;">
                                <strong>💡 Next Steps:</strong><br>
                                ${status === 'approved' ? 'Your traveller\'s visa has been approved! Please check your dashboard for collection details.' :
                    status === 'rejected' ? 'Please contact our support team for more information about the rejection.' :
                        status === 'processing' ? 'We are currently processing your traveller\'s application. You will be notified of any updates.' :
                            'Please log in to your dashboard for more details about this status update.'}
                            </p>
                        </div>
                        
                        <p style="color: #666; font-size: 14px; line-height: 1.5; margin-top: 30px;">
                            If you have any questions about this status update, please don't hesitate to contact our support team.
                        </p>
                        
                        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                            <p style="color: #666; font-size: 12px; margin: 0;">© 2024 Stellar Evisa. All rights reserved.</p>
                            <p style="color: #666; font-size: 12px; margin: 5px 0 0 0;">This is an automated email. Please do not reply to this message.</p>
                        </div>
                    </div>
                </div>
            `
        };

        const response = await client.sendMail(mailOptions);
        console.log('✅ Traveller status update email sent successfully:', response);
        return true;
    } catch (error) {
        console.error('❌ Failed to send traveller status update email:', error);
        return false;
    }
};

const sendAmendmentNotificationEmail = async (amendmentData) => {
    const {
        user,
        visa,
        application,
        amendment_enabled,
        duration_hours,
        duration_minutes,
        amendment_enabled_until,
        vendor_type,
        assigned_by
    } = amendmentData;

    // Fallback to 'Stellar User' if name is not available
    const userName = (user.first_name && user.last_name) ? `${user.first_name} ${user.last_name}` : 'Stellar User';

    // Determine display name for B2B vs B2C applications
    const displayName = (user.user_type === 'vendor' && user.company_name) ? user.company_name : userName;

    // Format date for display
    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    // Format date and time for display
    const formatDateTime = (date) => {
        return new Date(date).toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    // Format duration message
    const formatDuration = () => {
        if (!isEnabled || (!duration_hours && !duration_minutes)) return '';

        const parts = [];
        if (duration_hours > 0) {
            parts.push(`${duration_hours} hour${duration_hours !== 1 ? 's' : ''}`);
        }
        if (duration_minutes > 0) {
            parts.push(`${duration_minutes} minute${duration_minutes !== 1 ? 's' : ''}`);
        }
        return parts.join(' and ');
    };

    const isEnabled = amendment_enabled;
    const statusColor = isEnabled ? '#4caf50' : '#ff8566';
    const statusIcon = isEnabled ? '✏️' : '🔒';
    const statusText = isEnabled ? 'Amendment Enabled' : 'Amendment Disabled';
    const actionText = isEnabled ? 'enabled' : 'disabled';
    const durationText = formatDuration();

    let recipients = [
        {
            email_address: {
                address: user.email,
                name: userName
            }
        }
    ]

    if (vendor_type === 'third-party') {
        recipients = [
            {
                email_address: {
                    address: 'admin@stellarevisa.com',
                    name: 'Admin'
                }
            },
            {
                email_address: {
                    address: 'support@stellarevisa.com',
                    name: 'Support'
                }
            }
        ]

        if (assigned_by) {
            recipients.push({
                email_address: {
                    address: assigned_by.email,
                    name: assigned_by.first_name + ' ' + assigned_by.last_name
                }
            })
        }
    }

    const mailOptions = {
        from: {
            address: process.env.SMTP_FROM,
            name: "Stellar Evisa"
        },
        to: recipients,
        subject: `Amendment ${isEnabled ? 'Enabled' : 'Disabled'} - ${visa.name} Visa Application`,
        htmlbody: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Stellar Evisa</h1>
                    <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 16px;">Amendment Status Update</p>
                </div>
                
                <div style="padding: 30px 20px;">
                    <div style="text-align: center; margin: 30px 0;">
                        ${user.user_type === "admin" ? `
                            <a href="https://admin.stellarevisa.com" style="display: inline-block; padding: 12px 25px; background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">${isEnabled ? 'Make Changes' : 'View Application'}</a>
                        ` : user.user_type === "vendor" ? `
                            <a href="https://business.stellarevisa.com/dashboard" style="display: inline-block; padding: 12px 25px; background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">${isEnabled ? 'Make Changes' : 'View Application'}</a>
                        ` : `
                            <a href="https://stellarevisa.com/visa-applications" style="display: inline-block; padding: 12px 25px; background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">${isEnabled ? 'Make Changes' : 'View Application'}</a>
                        `}
                    </div>

                    <h2 style="color: #ff3d8a; margin: 0 0 20px 0;">Dear ${displayName},</h2>
                    
                    ${isEnabled ? `
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">
                            Great news! Amendment has been <span style="color: #4caf50; font-weight: bold;">enabled</span> for your ${visa.name} visa application. 
                            You can now make changes to your application details${durationText ? ` for the next <strong>${durationText}</strong>` : ''}.
                        </p>
                    ` : `
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">
                            Amendment has been <span style="color: #ff8566; font-weight: bold;">disabled</span> for your ${visa.name} visa application. 
                            You can no longer make changes to your application details.
                        </p>
                    `}
                    
                    <!-- Application Details -->
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid ${statusColor};">
                        <h3 style="color: ${statusColor}; margin: 0 0 15px 0; font-size: 18px;">Application Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">Application ID:</td>
                                <td style="padding: 8px 0; color: #333;">${application.application_id}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Visa Type:</td>
                                <td style="padding: 8px 0; color: #333;">${visa.name}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Amendment Status:</td>
                                <td style="padding: 8px 0; color: ${statusColor}; font-weight: bold; text-transform: capitalize;">${actionText}</td>
                            </tr>
                            ${isEnabled && durationText ? `
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Duration:</td>
                                <td style="padding: 8px 0; color: #333;">${durationText}</td>
                            </tr>
                            ` : ''}
                            ${isEnabled && amendment_enabled_until ? `
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Amendment Expires:</td>
                                <td style="padding: 8px 0; color: #f44336; font-weight: bold;">${formatDateTime(amendment_enabled_until)}</td>
                            </tr>
                            ` : ''}
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Number of Travellers:</td>
                                <td style="padding: 8px 0; color: #333;">${application.number_of_travellers}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Travel Dates:</td>
                                <td style="padding: 8px 0; color: #333;">${formatDate(application.departure_date)} - ${formatDate(application.return_date)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Status Updated:</td>
                                <td style="padding: 8px 0; color: #333;">${formatDateTime(new Date())}</td>
                            </tr>
                        </table>
                    </div>

                    ${isEnabled ? `
                        <!-- Next Steps for Enabled -->
                        <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #4caf50;">
                            <h3 style="color: #4caf50; margin: 0 0 15px 0; font-size: 18px;">What You Can Do Now</h3>
                            <ul style="color: #333; padding-left: 20px; line-height: 1.6;">
                                <li><strong>Log in to your dashboard to make changes</strong></li>
                                <li>Update traveller information and documents</li>
                                <li>Modify travel dates if needed</li>
                                <li>Upload additional or corrected documents</li>
                                ${durationText ? `<li><strong>Complete your changes within ${durationText}</strong></li>` : ''}
                                <li>Save your changes before the amendment period expires</li>
                            </ul>
                        </div>
                        
                        ${amendment_enabled_until ? `
                        <!-- Important Expiry Notice -->
                        <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ffc107; text-align: center;">
                            <h4 style="color: #856404; margin: 0 0 10px 0;">⏰ Important Reminder</h4>
                            <p style="color: #856404; margin: 0; font-weight: bold;">
                                Amendment access will expire on <span style="background-color: #856404; color: white; padding: 4px 8px; border-radius: 4px;">${formatDateTime(amendment_enabled_until)}</span>
                            </p>
                            <p style="color: #856404; margin: 10px 0 0 0; font-size: 14px;">
                                Please complete all your changes before this time.
                            </p>
                        </div>
                        ` : ''}
                    ` : `
                        <!-- Next Steps for Disabled -->
                        <div style="background-color: #fff8e1; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ff8566;">
                            <h3 style="color: #ff8566; margin: 0 0 15px 0; font-size: 18px;">What This Means</h3>
                            <ul style="color: #333; padding-left: 20px; line-height: 1.6;">
                                <li>Your application details are now locked</li>
                                <li>No further changes can be made to traveller information</li>
                                <li>Document uploads are no longer possible</li>
                                <li>Your application will proceed with the current information</li>
                                <li>Contact our support team if you need assistance</li>
                            </ul>
                        </div>
                    `}

                    <p style="color: #333; font-size: 16px; line-height: 1.5;">
                        ${isEnabled ?
                'Take advantage of this amendment opportunity to ensure all your information is accurate and complete.' :
                'If you have any questions about your application, please don\'t hesitate to contact our support team.'
            }
                    </p>
                </div>
                
                <div style="background-color: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px; text-align: center;">
                    <p style="margin: 0; color: #ff3d8a; font-weight: bold;">Need Help?</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">Contact our support team at support@stellarevisa.com</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">Call us: +91 8655347848 | +91 8655347847 | +91 8655347849</p>
                    <p style="margin: 15px 0 0 0; color: #ff3d8a; font-weight: bold;">Stellar Evisa</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">Your Partner in Success</p>
                </div>
            </div>
        `,
    };

    try {
        const result = await client.sendMail(mailOptions);
        console.log('✅ Amendment notification email sent:', result);
        return true;
    } catch (error) {
        console.error('❌ Failed to send amendment notification email:', error);
        return false;
    }
};

const sendVendorAmendmentNotificationEmail = async (amendmentData) => {
    const {
        user,
        visa,
        application,
        vendor,
        changes
    } = amendmentData;

    // Fallback to 'Stellar User' if vendor name is not available
    const vendorName = (vendor.first_name && vendor.last_name) ? `${vendor.first_name} ${vendor.last_name}` : 'Stellar User';

    // Determine display name for B2B applications
    const displayName = (vendor.company_name) ? vendor.company_name : vendorName;

    // Format date for display
    const formatDate = (date) => {
        if (!date) return 'Not specified';
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const formatDateTime = (date) => {
        if (!date) return 'Not specified';
        return new Date(date).toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    const mailOptions = {
        from: {
            address: process.env.SMTP_FROM,
            name: "Stellar Evisa"
        },
        to: [
            {
                email_address: {
                    address: "admin@stellarevisa.com",
                    name: "Stellar Evisa Admin"
                }
            },
            {
                email_address: {
                    address: "support@stellarevisa.com",
                    name: "Stellar Evisa Support"
                }
            }
        ],
        subject: `Vendor Amendment Update - ${visa.name} - ${application.application_id}`,
        htmlbody: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Stellar Evisa</h1>
                    <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 16px;">Vendor Amendment Notification</p>
                </div>
                
                <div style="padding: 30px 20px;">
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://admin.stellarevisa.com/visa-application-details/${application.application_id}" style="display: inline-block; padding: 12px 25px; background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold; margin-right: 15px;">View Application</a>
                        <a href="https://admin.stellarevisa.com/visa-applications" style="display: inline-block; padding: 12px 25px; background-color: #ff8566; color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">View All Applications</a>
                    </div>

                    <h2 style="color: #ff3d8a; margin: 0 0 20px 0;">Dear Admin & Support Team,</h2>
                    <p style="color: #333; font-size: 16px; line-height: 1.5;">
                        A vendor has made amendments to their visa application. Please review the changes and take necessary action.
                    </p>
                    
                    <!-- Vendor Details -->
                    <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #4caf50;">
                        <h3 style="color: #4caf50; margin: 0 0 15px 0; font-size: 18px;">Vendor Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">Company Name:</td>
                                <td style="padding: 8px 0; color: #333;">${displayName}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Vendor Email:</td>
                                <td style="padding: 8px 0; color: #333;">${vendor.email}</td>
                            </tr>
                            ${vendor.mobile ? `
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Phone:</td>
                                <td style="padding: 8px 0; color: #333;">${vendor.mobile}</td>
                            </tr>
                            ` : ''}
                        </table>
                    </div>
                    
                    <!-- Application Details -->
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ff3d8a;">
                        <h3 style="color: #ff3d8a; margin: 0 0 15px 0; font-size: 18px;">Application Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">Application ID:</td>
                                <td style="padding: 8px 0; color: #333; font-weight: bold; font-size: 16px;">${application.application_id}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Visa Type:</td>
                                <td style="padding: 8px 0; color: #333;">${visa.name}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Country:</td>
                                <td style="padding: 8px 0; color: #333;">${visa.country}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Number of Travellers:</td>
                                <td style="padding: 8px 0; color: #333;">${application.number_of_travellers}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Travel Dates:</td>
                                <td style="padding: 8px 0; color: #333;">${formatDate(application.departure_date)} - ${formatDate(application.return_date)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Amendment Date:</td>
                                <td style="padding: 8px 0; color: #333;">${formatDateTime(new Date())}</td>
                            </tr>
                        </table>
                    </div>

                    <!-- Customer Details -->
                    ${user ? `
                    <div style="background-color: #f0f8ff; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #2196f3;">
                        <h3 style="color: #2196f3; margin: 0 0 15px 0; font-size: 18px;">Customer Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">Customer Name:</td>
                                <td style="padding: 8px 0; color: #333;">${user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : 'Not provided'}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Email:</td>
                                <td style="padding: 8px 0; color: #333;">${user.email}</td>
                            </tr>
                        </table>
                    </div>
                    ` : ''}

                    <!-- Amendment Summary -->
                    <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ffc107;">
                        <h3 style="color: #856404; margin: 0 0 15px 0; font-size: 18px;">Amendment Summary</h3>
                        <p style="color: #856404; margin: 0; font-size: 14px;">
                            The vendor has submitted amendments to their visa application. Amendment functionality has been automatically disabled for this application after the update.
                        </p>
                        ${changes ? `
                        <div style="margin-top: 15px; padding: 15px; background-color: #ffffff; border-radius: 4px; border: 1px solid #e0e0e0;">
                            <h4 style="color: #856404; margin: 0 0 10px 0; font-size: 16px;">Changes Made:</h4>
                            <p style="color: #333; font-size: 14px; margin: 0;">${changes}</p>
                        </div>
                        ` : ''}
                    </div>

                    <!-- Action Required -->
                    <div style="background-color: #ffebee; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #f44336;">
                        <h3 style="color: #f44336; margin: 0 0 15px 0; font-size: 18px;">Action Required</h3>
                        <ul style="color: #333; padding-left: 20px; line-height: 1.6;">
                            <li>Review the amended application details in the admin panel</li>
                            <li>Verify all updated traveller information and documents</li>
                            <li>Check if any additional documentation is required</li>
                            <li>Update application status as needed</li>
                            <li>Contact the vendor if clarification is needed</li>
                        </ul>
                    </div>
                </div>
                
                <div style="background-color: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px; text-align: center;">
                    <p style="margin: 0; color: #ff3d8a; font-weight: bold;">Stellar Evisa</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">This is an automated notification from the Stellar Evisa system</p>
                </div>
            </div>
        `,
    };

    try {
        const result = await client.sendMail(mailOptions);
        console.log('✅ Vendor amendment notification email sent:', result);
        return true;
    } catch (error) {
        console.error('❌ Failed to send vendor amendment notification email:', error);
        return false;
    }
};

// Send support ticket creation notification email to admin and support team
const sendSupportTicketCreatedEmail = async (ticketData) => {
    const {
        ticket,
        user,
        visaApplication
    } = ticketData;

    // Fallback to 'Stellar User' if name is not available
    const userName = (user.first_name && user.last_name) ? `${user.first_name} ${user.last_name}` : 'Stellar User';

    // Determine display name for B2B vs B2C applications
    const displayName = (user.user_type === 'vendor' && user.company_name) ? user.company_name : userName;

    // Format date for display
    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Get priority color
    const getPriorityColor = (priority) => {
        const colors = {
            'High': '#f44336',
            'Medium': '#ff8566',
            'Low': '#4caf50'
        };
        return colors[priority] || '#ff8566';
    };

    // Get category icon
    const getCategoryIcon = (category) => {
        const icons = {
            'Visa Issue': '📋',
            'Payment Issue': '💳',
            'Technical Issue': '🔧',
            'Other': '❓'
        };
        return icons[category] || '🎫';
    };

    // Email recipients
    const recipients = [
        {
            email_address: {
                address: "admin@stellarevisa.com",
                name: "Stellar Evisa Admin"
            }
        },
        {
            email_address: {
                address: "support@stellarevisa.com",
                name: "Stellar Evisa Support"
            }
        }
    ];

    const mailOptions = {
        from: {
            address: process.env.SMTP_FROM,
            name: "Stellar Evisa"
        },
        to: recipients,
        subject: `🎫 New Support Ticket: ${ticket.subject} - ${ticket.ticket_number}`,
        htmlbody: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Stellar Evisa</h1>
                    <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 16px;">Support Ticket Notification</p>
                </div>
                
                <div style="padding: 30px 20px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <div style="display: inline-block; background-color: #ff8566; color: white; padding: 10px 20px; border-radius: 25px; font-size: 16px; font-weight: bold;">
                            🎫 New Support Ticket Created
                        </div>
                    </div>

                    <h2 style="color: #ff3d8a; margin: 0 0 20px 0;">Dear Support Team,</h2>
                    <p style="color: #333; font-size: 16px; line-height: 1.5;">
                        A new support ticket has been created and requires your attention.
                    </p>
                    
                    <!-- Ticket Details -->
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ff3d8a;">
                        <h3 style="color: #ff3d8a; margin: 0 0 15px 0; font-size: 18px;">Ticket Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">Ticket Number:</td>
                                <td style="padding: 8px 0; color: #333; font-weight: bold; font-size: 16px;">${ticket.ticket_number}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Subject:</td>
                                <td style="padding: 8px 0; color: #333;">${ticket.subject}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Category:</td>
                                <td style="padding: 8px 0; color: #333;">${getCategoryIcon(ticket.category)} ${ticket.category}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Priority:</td>
                                <td style="padding: 8px 0; color: ${getPriorityColor(ticket.priority)}; font-weight: bold;">${ticket.priority}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Status:</td>
                                <td style="padding: 8px 0; color: #4caf50; font-weight: bold;">Open</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Created:</td>
                                <td style="padding: 8px 0; color: #333;">${formatDate(ticket.created_at)}</td>
                            </tr>
                        </table>
                    </div>

                    <!-- Customer Details -->
                    <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #4caf50;">
                        <h3 style="color: #4caf50; margin: 0 0 15px 0; font-size: 18px;">Customer Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">${user.user_type === 'vendor' ? 'Company Name:' : 'Customer Name:'}</td>
                                <td style="padding: 8px 0; color: #333;">${displayName}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Email:</td>
                                <td style="padding: 8px 0; color: #333;">${user.email}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">User Type:</td>
                                <td style="padding: 8px 0; color: #333;">${user.user_type === 'vendor' ? 'Business Partner' : 'Direct Customer'}</td>
                            </tr>
                        </table>
                    </div>

                    <!-- Ticket Description -->
                    <div style="background-color: #fff8e1; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ff8566;">
                        <h3 style="color: #ff8566; margin: 0 0 15px 0; font-size: 18px;">Issue Description</h3>
                        <div style="background-color: #ffffff; padding: 15px; border-radius: 5px; border: 1px solid #e0e0e0;">
                            <p style="color: #333; margin: 0; line-height: 1.6; white-space: pre-wrap;">${ticket.description}</p>
                        </div>
                    </div>

                    ${visaApplication ? `
                    <!-- Related Visa Application -->
                    <div style="background-color: #f0f8ff; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #2196f3;">
                        <h3 style="color: #2196f3; margin: 0 0 15px 0; font-size: 18px;">Related Visa Application</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">Application ID:</td>
                                <td style="padding: 8px 0; color: #333; font-weight: bold;">${visaApplication.application_id}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Visa Type:</td>
                                <td style="padding: 8px 0; color: #333;">${visaApplication.visa_type || 'N/A'}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Status:</td>
                                <td style="padding: 8px 0; color: #333;">${visaApplication.status}</td>
                            </tr>
                        </table>
                    </div>
                    ` : ''}

                    <!-- Action Required -->
                    <div style="background-color: #ffebee; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #f44336;">
                        <h3 style="color: #f44336; margin: 0 0 15px 0; font-size: 18px;">Action Required</h3>
                        <ul style="color: #333; padding-left: 20px; line-height: 1.6;">
                            <li>Review the support ticket details and customer inquiry</li>
                            <li>Assign the ticket to appropriate support staff member</li>
                            <li>Respond to the customer within the SLA timeframe</li>
                            <li>Update ticket status as progress is made</li>
                            <li>Escalate to senior staff if needed</li>
                        </ul>
                    </div>
                </div>
                
                <div style="background-color: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px; text-align: center;">
                    <p style="margin: 0; color: #ff3d8a; font-weight: bold;">Stellar Evisa Support System</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">This is an automated notification from the Stellar Evisa support system</p>
                    <p style="margin: 15px 0 0 0; color: #ff3d8a; font-weight: bold;">Stellar Evisa</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">Customer Support Team</p>
                </div>
            </div>
        `,
    };

    try {
        const result = await client.sendMail(mailOptions);
        console.log('✅ Support ticket creation notification email sent:', result);
        return true;
    } catch (error) {
        console.error('❌ Failed to send support ticket creation notification email:', error);
        return false;
    }
};

// Send support ticket status update notification email to admin and support team
const sendSupportTicketStatusUpdateEmail = async (ticketData) => {
    const {
        ticket,
        oldStatus,
        newStatus,
        updatedBy
    } = ticketData;

    // Get user details for the ticket owner
    const user = await require('../models').User.findByPk(ticket.user_id, {
        attributes: ['id', 'first_name', 'last_name', 'email', 'user_type', 'company_name']
    });

    if (!user) {
        console.error('User not found for ticket status update email');
        return false;
    }

    // Fallback to 'Stellar User' if name is not available
    const userName = (user.first_name && user.last_name) ? `${user.first_name} ${user.last_name}` : 'Stellar User';

    // Determine display name for B2B vs B2C applications
    const displayName = (user.user_type === 'vendor' && user.company_name) ? user.company_name : userName;

    // Determine who updated the status
    const updatedByName = (updatedBy.first_name && updatedBy.last_name) ? `${updatedBy.first_name} ${updatedBy.last_name}` : 'System';

    // Format date for display
    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Get status color and message
    const getStatusColor = (status) => {
        const colors = {
            'Open': '#ff8566',
            'In Progress': '#2196f3',
            'Resolved': '#4caf50',
            'Closed': '#9e9e9e'
        };
        return colors[status] || '#9e9e9e';
    };

    const getStatusMessage = (status) => {
        const messages = {
            'Open': 'The ticket is now open and awaiting response',
            'In Progress': 'The ticket is being actively worked on',
            'Resolved': 'The ticket has been resolved',
            'Closed': 'The ticket has been closed'
        };
        return messages[status] || 'Status has been updated';
    };

    const getStatusIcon = (status) => {
        const icons = {
            'Open': '🔓',
            'In Progress': '⚙️',
            'Resolved': '✅',
            'Closed': '🔒'
        };
        return icons[status] || '📝';
    };

    // Email recipients
    const recipients = [
        {
            email_address: {
                address: "admin@stellarevisa.com",
                name: "Stellar Evisa Admin"
            }
        },
        {
            email_address: {
                address: "support@stellarevisa.com",
                name: "Stellar Evisa Support"
            }
        }
    ];

    const mailOptions = {
        from: {
            address: process.env.SMTP_FROM,
            name: "Stellar Evisa"
        },
        to: recipients,
        subject: `🔄 Ticket Status Updated: ${ticket.subject} - ${ticket.ticket_number}`,
        htmlbody: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Stellar Evisa</h1>
                    <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 16px;">Support Ticket Status Update</p>
                </div>
                
                <div style="padding: 30px 20px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <div style="display: inline-block; background-color: ${getStatusColor(newStatus)}; color: white; padding: 10px 20px; border-radius: 25px; font-size: 16px; font-weight: bold;">
                            🔄 Status Updated: ${getStatusIcon(newStatus)} ${newStatus}
                        </div>
                    </div>

                    <h2 style="color: #ff3d8a; margin: 0 0 20px 0;">Dear Support Team,</h2>
                    <p style="color: #333; font-size: 16px; line-height: 1.5;">
                        The status of support ticket <strong>${ticket.ticket_number}</strong> has been updated.
                    </p>
                    
                    <!-- Status Change -->
                    <div style="background-color: #f0f8ff; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #2196f3;">
                        <h3 style="color: #2196f3; margin: 0 0 15px 0; font-size: 18px;">Status Change</h3>
                        <div style="text-align: center; margin: 20px 0;">
                            <div style="display: inline-block; margin: 0 20px;">
                                <div style="background-color: ${getStatusColor(oldStatus)}; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; margin-bottom: 5px;">
                                    ${oldStatus}
                                </div>
                                <p style="margin: 0; color: #666; font-size: 12px;">Previous</p>
                            </div>
                            <div style="display: inline-block; color: #2196f3; font-size: 24px; margin: 0 20px;">
                                →
                            </div>
                            <div style="display: inline-block; margin: 0 20px;">
                                <div style="background-color: ${getStatusColor(newStatus)}; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; margin-bottom: 5px;">
                                    ${newStatus}
                                </div>
                                <p style="margin: 0; color: #666; font-size: 12px;">Current</p>
                            </div>
                        </div>
                        <p style="text-align: center; color: #666; font-style: italic; margin: 15px 0 0 0;">
                            ${getStatusMessage(newStatus)}
                        </p>
                    </div>

                    <!-- Ticket Details -->
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ff3d8a;">
                        <h3 style="color: #ff3d8a; margin: 0 0 15px 0; font-size: 18px;">Ticket Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">Ticket Number:</td>
                                <td style="padding: 8px 0; color: #333; font-weight: bold; font-size: 16px;">${ticket.ticket_number}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Subject:</td>
                                <td style="padding: 8px 0; color: #333;">${ticket.subject}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Category:</td>
                                <td style="padding: 8px 0; color: #333;">${ticket.category}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Priority:</td>
                                <td style="padding: 8px 0; color: #333;">${ticket.priority}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Updated By:</td>
                                <td style="padding: 8px 0; color: #333;">${updatedByName} (${updatedBy.user_type})</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Updated At:</td>
                                <td style="padding: 8px 0; color: #333;">${formatDate(new Date())}</td>
                            </tr>
                        </table>
                    </div>

                    <!-- Customer Details -->
                    <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #4caf50;">
                        <h3 style="color: #4caf50; margin: 0 0 15px 0; font-size: 18px;">Customer Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">${user.user_type === 'vendor' ? 'Company Name:' : 'Customer Name:'}</td>
                                <td style="padding: 8px 0; color: #333;">${displayName}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Email:</td>
                                <td style="padding: 8px 0; color: #333;">${user.email}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">User Type:</td>
                                <td style="padding: 8px 0; color: #333;">${user.user_type === 'vendor' ? 'Business Partner' : 'Direct Customer'}</td>
                            </tr>
                        </table>
                    </div>

                </div>
                
                <div style="background-color: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px; text-align: center;">
                    <p style="margin: 0; color: #ff3d8a; font-weight: bold;">Stellar Evisa Support System</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">This is an automated notification from the Stellar Evisa support system</p>
                    <p style="margin: 15px 0 0 0; color: #ff3d8a; font-weight: bold;">Stellar Evisa</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">Customer Support Team</p>
                </div>
            </div>
        `,
    };

    try {
        const result = await client.sendMail(mailOptions);
        console.log('✅ Support ticket status update notification email sent:', result);
        return true;
    } catch (error) {
        console.error('❌ Failed to send support ticket status update notification email:', error);
        return false;
    }
};

const sendVisaApplicationStatusUpdateEmail = async (statusUpdateData) => {
    const {
        application,
        visa,
        user,
        oldStatus,
        newStatus,
        updatedBy,
        assignedAdmin = null,
        assignedBy = null
    } = statusUpdateData;

    // Fallback to 'Stellar User' if name is not available
    const userName = (user.first_name && user.last_name) ? `${user.first_name} ${user.last_name}` : 'Stellar User';

    // Determine display name for B2B vs B2C applications
    const displayName = (user.user_type === 'vendor' && user.company_name) ? user.company_name : userName;

    // Format date for display
    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Status color and icon mapping
    const getStatusInfo = (status) => {
        const statusMap = {
            'pending': { color: '#ff8566', icon: '⏳', label: 'Pending Review' },
            'processing': { color: '#2196f3', icon: '🔄', label: 'Processing' },
            'approved': { color: '#4caf50', icon: '✅', label: 'Approved' },
            'rejected': { color: '#f44336', icon: '❌', label: 'Rejected' },
            'cancelled': { color: '#9e9e9e', icon: '🚫', label: 'Cancelled' },
            'completed': { color: '#4caf50', icon: '🎉', label: 'Completed' },
            'expired': { color: '#ff5722', icon: '⏰', label: 'Expired' },
            'vendor_rejected': { color: '#e91e63', icon: '⚠️', label: 'Vendor Rejected' },
            'amendment_requested': { color: '#9c27b0', icon: '📝', label: 'Amendment Requested' }
        };
        return statusMap[status] || { color: '#666', icon: '📋', label: status };
    };

    const oldStatusInfo = getStatusInfo(oldStatus);
    const newStatusInfo = getStatusInfo(newStatus);

    // Email recipients
    const recipients = [
        {
            email_address: {
                address: "admin@stellarevisa.com",
                name: "Stellar Evisa Admin"
            }
        },
        {
            email_address: {
                address: "support@stellarevisa.com",
                name: "Stellar Evisa Support"
            }
        }
    ];

    // Add assigned admin if available
    if (assignedAdmin && assignedAdmin.email) {
        recipients.push({
            email_address: {
                address: assignedAdmin.email,
                name: `${assignedAdmin.first_name} ${assignedAdmin.last_name}` || "Admin User"
            }
        });
    }

    const mailOptions = {
        from: {
            address: process.env.SMTP_FROM,
            name: "Stellar Evisa"
        },
        to: recipients,
        subject: `📋 Application Status Update: ${visa.name} - ${application.application_id}`,
        htmlbody: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Stellar Evisa</h1>
                    <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 16px;">Application Status Update</p>
                </div>
                
                <div style="padding: 30px 20px;">
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://admin.stellarevisa.com/visa-applications/${application.id}" style="display: inline-block; padding: 12px 25px; background: linear-gradient(135deg, #ffaa5a 0%, #ff3d8a 100%); color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold; margin-right: 15px;">View Application</a>
                        <a href="https://admin.stellarevisa.com/visa-applications" style="display: inline-block; padding: 12px 25px; background-color: #ff8566; color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">All Applications</a>
                    </div>

                    <h2 style="color: #ff3d8a; margin: 0 0 20px 0;">Dear Team,</h2>
                    <p style="color: #333; font-size: 16px; line-height: 1.5;">
                        The status of visa application <strong>${application.application_id}</strong> has been updated.
                    </p>
                    
                    <!-- Status Change Details -->
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ff3d8a;">
                        <h3 style="color: #ff3d8a; margin: 0 0 15px 0; font-size: 18px;">Status Change Details</h3>
                        <div style="text-align: center; margin: 20px 0;">
                            <div style="display: inline-block; margin: 0 10px;">
                                <div style="background-color: ${oldStatusInfo.color}; color: white; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: bold;">
                                    ${oldStatusInfo.icon} ${oldStatusInfo.label}
                                </div>
                            </div>
                            <div style="display: inline-block; margin: 0 10px; color: #666; font-size: 20px;">→</div>
                            <div style="display: inline-block; margin: 0 10px;">
                                <div style="background-color: ${newStatusInfo.color}; color: white; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: bold;">
                                    ${newStatusInfo.icon} ${newStatusInfo.label}
                                </div>
                            </div>
                        </div>
                        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">Updated By:</td>
                                <td style="padding: 8px 0; color: #333;">${updatedBy.first_name} ${updatedBy.last_name} (${updatedBy.user_type})</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Updated At:</td>
                                <td style="padding: 8px 0; color: #333;">${formatDate(new Date())}</td>
                            </tr>
                            ${assignedAdmin ? `
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Assigned To:</td>
                                <td style="padding: 8px 0; color: #333;">${assignedAdmin.first_name} ${assignedAdmin.last_name}</td>
                            </tr>
                            ` : ''}
                            ${assignedBy ? `
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Assigned By:</td>
                                <td style="padding: 8px 0; color: #333;">${assignedBy.first_name} ${assignedBy.last_name}</td>
                            </tr>
                            ` : ''}
                        </table>
                    </div>

                    <!-- Application Details -->
                    <div style="background-color: #f0f8ff; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #2196f3;">
                        <h3 style="color: #2196f3; margin: 0 0 15px 0; font-size: 18px;">Application Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">Application ID:</td>
                                <td style="padding: 8px 0; color: #333; font-weight: bold; font-size: 16px;">${application.application_id}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Visa Type:</td>
                                <td style="padding: 8px 0; color: #333;">${visa.name}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Country:</td>
                                <td style="padding: 8px 0; color: #333;">${visa.country?.name || 'N/A'}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Travellers:</td>
                                <td style="padding: 8px 0; color: #333;">${application.number_of_travellers} person(s)</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Departure Date:</td>
                                <td style="padding: 8px 0; color: #333;">${formatDate(application.departure_date)}</td>
                            </tr>
                        </table>
                    </div>

                    <!-- Customer Details -->
                    <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #4caf50;">
                        <h3 style="color: #4caf50; margin: 0 0 15px 0; font-size: 18px;">Customer Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">${user.user_type === 'vendor' ? 'Company Name:' : 'Customer Name:'}</td>
                                <td style="padding: 8px 0; color: #333;">${displayName}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">Email:</td>
                                <td style="padding: 8px 0; color: #333;">${user.email}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: bold;">User Type:</td>
                                <td style="padding: 8px 0; color: #333;">${user.user_type === 'vendor' ? 'Business Partner' : 'Direct Customer'}</td>
                            </tr>
                        </table>
                    </div>

                    <!-- Action Required -->
                    <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ff8566;">
                        <h3 style="color: #ff8566; margin: 0 0 15px 0; font-size: 18px;">Next Steps</h3>
                        <ul style="color: #333; margin: 0; padding-left: 20px;">
                            ${newStatus === 'processing' ? '<li>Review documents and process the application</li>' : ''}
                            ${newStatus === 'approved' ? '<li>Prepare visa documents for delivery</li><li>Notify customer about visa approval</li>' : ''}
                            ${newStatus === 'rejected' ? '<li>Send rejection notification to customer with reason</li>' : ''}
                            ${newStatus === 'completed' ? '<li>Archive application and update records</li>' : ''}
                            <li>Monitor application progress and update status as needed</li>
                            <li>Respond to any customer queries promptly</li>
                        </ul>
                    </div>
                </div>
                
                <div style="background-color: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px; text-align: center;">
                    <p style="color: #666; margin: 0; font-size: 14px;">
                        This is an automated notification from Stellar Evisa.<br>
                        Please do not reply to this email.
                    </p>
                </div>
            </div>
        `
    };

    try {
        const result = await client.sendMail(mailOptions);
        console.log('✅ Visa application status update notification email sent:', result);
        return true;
    } catch (error) {
        console.error('❌ Failed to send visa application status update notification email:', error);
        return false;
    }
};

module.exports = {
    sendUserAccountEmail,
    sendForgotPasswordEmail,
    sendPaymentConfirmationEmail,
    sendVisaStatusUpdateEmail,
    sendVisaAssignmentEmail,
    sendContactSupportEmail,
    sendAdminApplicationNotificationEmail,
    sendTravellerStatusUpdateEmail,
    sendAmendmentNotificationEmail,
    sendVendorAmendmentNotificationEmail,
    sendSupportTicketCreatedEmail,
    sendSupportTicketStatusUpdateEmail,
    sendVisaApplicationStatusUpdateEmail
};