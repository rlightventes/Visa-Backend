const express = require('express');
const router = express.Router();
const vendorController = require('../controller/vendor.controller.js');
const upload = require('../middlewares/upload.middleware.js');
const userController = require('../controller/user.controller.js');
const adminController = require('../controller/admin.controller.js');
const visaController = require('../controller/visa.controller.js');
const multer = require("multer");
const formDataParser = multer();
const { verifyAdminToken } = require("../middlewares/auth.middleware");


// Prepare array of field objects for upload.fields()
const uploadFields = [
    { name: 'panCard', maxCount: 1 },
    { name: 'aadharCard', maxCount: 1 },
    { name: 'cancelCheque', maxCount: 1 },
    { name: 'PassportCopy', maxCount: 1 },
    { name: 'passportPhoto', maxCount: 1 },
    { name: 'TravelItinerory', maxCount: 1 },
    { name: 'HotelBooking', maxCount: 1 },
    { name: 'BankStatement', maxCount: 1 },
    { name: 'EmploymentLetter', maxCount: 1 },
    { name: 'AdditionalDocs', maxCount: 1 },
    { name: 'img', maxCount: 1 },
    { name: 'visa_document', maxCount: 1 },
];

// Add fields for images[0] through images[4]
for (let i = 0; i < 5; i++) {
    uploadFields.push({ name: `images[${i}]`, maxCount: 1 });
}

const imageUpload = upload.fields(uploadFields);

/** all routing middleware  */
// router.use(verifyAdminToken);

// Dashboard Route
router.get('/dashboard', verifyAdminToken, adminController.getAdminDashboard);

// User Routes
router.post('/add-user',verifyAdminToken, imageUpload, userController.createUser);
router.put('/update-user/:id',verifyAdminToken, imageUpload, userController.updateUser);
router.get('/get-user/:id', userController.getUserById);
router.get('/get-users',verifyAdminToken, userController.getUsers);
router.delete('/delete-user/:id', userController.deleteUser);
router.put('/update-user-status', userController.toggleUserStatus);

// Vendor Routes
router.post('/add-vendor',verifyAdminToken, imageUpload, vendorController.createVendor);
router.put('/update-vendor/:id', imageUpload, vendorController.updateVendor);
router.get('/get-vendor/:id', imageUpload, vendorController.getVendorById);
router.get("/get-vendors", verifyAdminToken, vendorController.getVendors);
router.delete('/delete-vendor/:id', vendorController.deleteVendor);
router.put('/update-vendor-status', vendorController.toggleVendorStatus);
router.get('/vendor-dropdown', vendorController.getDropdown);

// Admin routes
router.post('/add-admin',verifyAdminToken, imageUpload, adminController.createAdmin);
router.put('/update-admin/:id', imageUpload, adminController.updateAdmin);
router.get('/get-admin/:id', imageUpload, adminController.getAdminById);
router.get("/get-admins", verifyAdminToken, adminController.getAdmins);
router.delete('/delete-vendor/:id', adminController.deleteAdmin);
router.get('/get-countries', adminController.getCountries);
router.get('/get-modules', adminController.getModulesPermissions);

// Visa Management
router.post('/add-visa',verifyAdminToken, imageUpload, visaController.createVisa);
router.put('/update-visa/:id', imageUpload, visaController.updateVisa);
router.get('/get-visa/:id', visaController.getVisaById);
router.get("/get-visas", verifyAdminToken, visaController.getVisas);
router.delete('/delete-visa/:id', visaController.deleteVisa);
router.put('/update-visa-status', visaController.toggleVisaStatus);

router.get('/get-visa-criterias', visaController.getVisaCriterias);
router.get('/get-visa-documents', visaController.getVisaDocuments);

// Country Management
router.post('/add-country', adminController.createCountry);
router.put('/update-country/:id', adminController.updateCountry);
router.get('/get-country/:id', adminController.getCountryDetails);
router.get('/get-country-list', adminController.getCountryList);
router.delete('/delete-country/:id', adminController.deleteCountry);
router.put('/update-country-status', adminController.toggleCountryStatus);

// Eligibility Criteria Management
router.post('/add-eligibility-criteria', imageUpload, adminController.createEligibilityCriteria);
router.put('/update-eligibility-criteria/:id', imageUpload, adminController.updateEligibilityCriteria);
router.get('/get-eligibility-criteria/:id', adminController.getEligibilityCriteriaById);
router.get('/get-eligibility-criteria-list', adminController.getEligibilityCriteriaList);
router.delete('/delete-eligibility-criteria/:id', adminController.deleteEligibilityCriteria);
router.put('/update-eligibility-criteria-status', adminController.toggleEligibilityCriteriaStatus);

// Visa Dynamic form api's
router.post('/add-visa-dynamic-form', adminController.addVisaDynamicForm);
router.put('/update-visa-dynamic-form/:id', adminController.updateVisaDynamicForm);
router.get('/get-visa-dynamic-form/:id', adminController.getVisaDynamicFormById);
router.get('/get-visa-dynamic-form-list', adminController.getVisaDynamicFormList);
router.delete('/delete-visa-dynamic-form/:id', adminController.deleteVisaDynamicForm);
router.put('/update-visa-dynamic-form-status', adminController.toggleVisaDynamicFormStatus);

// Visa Application Management
router.get('/visa-applications', verifyAdminToken, adminController.getAllVisaApplications);
router.get('/visa-applications/:id', verifyAdminToken, adminController.getVisaApplicationDetails);
router.put('/visa-applications/:id', verifyAdminToken, imageUpload, adminController.updateVisaApplication);
router.put('/visa-applications/:id/amendment', verifyAdminToken, adminController.updateVisaApplicationAmendment);
router.put('/travellers/:fieldId/status', verifyAdminToken, imageUpload, adminController.updateTravellerStatus);
router.get('/get-payments', verifyAdminToken, adminController.getPayments);
router.put('/assign-visa-application/:id', verifyAdminToken, adminController.assignVisaApplication);
router.put('/unassign-visa-application/:id', verifyAdminToken, adminController.unassignVisaApplication);
router.put('/update-visa-application-status/:id', verifyAdminToken, adminController.updateVisaApplicationStatus);

router.get('/get-third-party-vendors', verifyAdminToken, adminController.getThirdPartyVendors);

// Calendar Management
router.post('/add-calendar', verifyAdminToken, formDataParser.none(), adminController.addCalendar);
router.put('/update-calendar/:id', verifyAdminToken, formDataParser.none(), adminController.updateCalendar);
router.get('/get-calendar/:id', verifyAdminToken, formDataParser.none(), adminController.getCalendarById);
router.get('/get-calendar-list', verifyAdminToken, formDataParser.none(), adminController.getCalendarList);
router.delete('/delete-calendar/:id', verifyAdminToken, adminController.deleteCalendar);

// Direct Login
router.get('/direct-login/:id', verifyAdminToken, adminController.directLogin);

// Coupon Management
router.post('/coupons', verifyAdminToken, formDataParser.none(), adminController.createCoupon);
router.put('/coupons/:id', verifyAdminToken, formDataParser.none(), adminController.updateCoupon);
router.get('/coupons/:id', verifyAdminToken, adminController.getCouponById);
router.get('/coupons', verifyAdminToken, adminController.getCouponsList);
router.delete('/coupons/:id', verifyAdminToken, adminController.deleteCoupon);
router.put('/coupons/toggle-status', verifyAdminToken, formDataParser.none(), adminController.toggleCouponStatus);
router.post('/coupons/validate', verifyAdminToken, formDataParser.none(), adminController.validateCoupon);

module.exports = router;