const express = require('express');
const router = express.Router();
const vendorController = require('../controller/vendor.controller.js');
const { verifyToken } = require('../middlewares/auth.middleware');
const upload = require('../middlewares/upload.middleware.js');

// Prepare array of field objects for upload.fields()
const uploadFields = [
    { name: 'photo', maxCount: 1 },
    { name: 'passport_front', maxCount: 1 },
    { name: 'passport_back', maxCount: 1 },
    { name: 'aadhar_card', maxCount: 1 },
    { name: 'gst_certificate_img', maxCount: 1 },
    { name: 'cancel_cheque_img', maxCount: 1 },
    { name: 'office_img', maxCount: 1 },
];

// Add visa application specific upload fields for multiple travellers
// Support up to 10 travellers with all possible document types
for (let i = 0; i < 10; i++) {
    const travellerFields = [
        'passport_photo',
        'passport_size_photo',
        'passport_front_photo', 
        'passport_back_photo',
        'photograph_upload',
        'invitation_letter',
        'travel_itinerary',
        'hotel_booking',
        'flight_booking',
        'proof_of_funds',
        'employment_letter',
        'medical_insurance_certificate',
        'vaccination_certificate',
        'pan_card_photo',
        'itr_1st_year_photo',
        'itr_2nd_year_photo',
        'itr_3rd_year_photo',
        'three_months_bank_statement',
        'six_months_bank_statement',
        'three_months_bank_signed_and_stamped_statement',
        'six_months_bank_signed_and_stamped_statement',
        'aadhar_card',
        'passport_external_cover'
    ];
    
    travellerFields.forEach(field => {
        uploadFields.push({ name: `travellers[${i}][${field}]`, maxCount: 1 });
    });
}

const imageUpload = upload.fields(uploadFields);

router.get('/get-visas', vendorController.getVisas);
router.get('/get-featured-visas', vendorController.getFeaturedVisas);
router.get('/get-visa-details/:id', vendorController.getVisaDetails);
router.get('/get-visa-search-suggestions', vendorController.getVisaSearchSuggestions);

router.get('/get-dynamic-visa-form/:visaId', vendorController.getDynamicVisaForm);

// Add api to accept visa application - Updated route path and middleware
router.post('/submit-visa-application', verifyToken, imageUpload, vendorController.createVisaApplication);

// Keep the old route for backward compatibility
// router.post('/submit-visa-application', verifyToken, imageUpload, vendorController.createVisaApplication);

router.post('/get-visa-pricing', verifyToken, vendorController.getVisaPricing);

router.post('/submit-vendor-visa-application', verifyToken, imageUpload, vendorController.submitVendorVisaApplication);

// Draft Management Routes
router.post('/save-visa-application-draft', verifyToken, imageUpload, vendorController.saveVisaApplicationDraft);
router.put('/update-visa-application-draft/:draftId', verifyToken, imageUpload, vendorController.updateVisaApplicationDraft);
router.get('/get-visa-application-draft/:draftId', verifyToken, vendorController.getVisaApplicationDraft);
router.post('/complete-visa-application-payment/:applicationId', verifyToken, vendorController.completeVisaApplicationPayment);

// Amendment Management Routes
router.get('/get-visa-application-for-amendment/:applicationId', verifyToken, vendorController.getVisaApplicationForAmendment);
router.put('/update-visa-application-amendment/:applicationId', verifyToken, imageUpload, vendorController.updateVisaApplicationAmendment);

// Vendor visa application management routes
router.get('/get-vendor-visa-applications', verifyToken, vendorController.getVendorVisaApplication);
router.get('/get-vendor-visa-application-details/:id', verifyToken, vendorController.getVendorVisaApplicationDetails);
router.get('/get-vendor-visa-application-payments', verifyToken, vendorController.getVendorVisaApplicationPayments);

// Vendor profile routes
router.get('/get-vendor-profile', verifyToken, vendorController.getVendorProfile);
router.put('/update-vendor-profile', verifyToken, imageUpload, vendorController.updateVendorProfile);

// Payment related routes
router.post('/verify-payment', verifyToken, vendorController.verifyPayment);
router.post('/payment-failure', verifyToken, vendorController.paymentFailure);
router.get('/payment-status/:order_id', verifyToken, vendorController.getPaymentStatus);
router.post('/retry-payment', verifyToken, vendorController.retryPayment);

// Calendar related routes
router.get('/get-custom-calendar', verifyToken, vendorController.getCustomCalendar);

module.exports = router;