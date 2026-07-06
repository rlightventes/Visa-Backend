const { Op, fn, col } = require("sequelize");
const bcrypt = require("bcrypt");
const db = require("../models");
const fs = require("fs");
const path = require("path");
const moment = require("moment");
const { sendUserAccountEmail } = require("../services/email.service");
const passportService = require("../services/passport.service");

exports.createUser = async (req, res) => {
  try {
    const data = req.body;
    const createdBy = req?.user?.id;

    if (!data.email) {
      return res.status(400).json({
        success: false,
        message: "Email Required!",
      });
    }

    // Check if user already exists with same email or phone (only among non-deleted users)
    const existing = await db.User.findOne({
      where: {
        [Op.or]: [{ email: data.email.trim() }, { phone: data.phone.trim() }],
        is_deleted: 0
      },
    });

    if (existing) {
      const conflictField =
        existing.email === data.email.trim() ? "Email" : "Phone";
      return res
        .status(409)
        .json({
          success: false,
          message: `${conflictField} is already in use`,
        });
    }

    const addData = {
      first_name: data.first_name,
      last_name: data.last_name,
      dob: data.dob,
      gender: data.gender.trim(),
      country: data.country_id,
      email: data.email?.trim(),
      phone: data.phone,
      user_type: "user",
      created_by: createdBy,
      password: await bcrypt.hash(data.phone, 10),
      is_active: 1,
    };


    await db.User.create(addData);

    try {
      let dt = {
        username: `${addData.first_name} ${addData.last_name}`,
        email: addData.email,
        mobile: addData.phone,
        password: addData.phone,
        user_type: addData.user_type
      }
      await sendUserAccountEmail(dt, addData.phone);
    } catch (error) {
      console.log(error);
    }

    return res
      .status(201)
      .json({ success: true, message: "Record created successfully!!!" });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, message: "Server Error", error: error.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const id = req.params.id || req.user.id;
    const updateData = req.body;

    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }

    const existingUser = await db.User.findByPk(id);
    if (!existingUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Check if email or phone is being changed and if they're already in use by other non-deleted users
    if (updateData.email && updateData.email !== existingUser.email) {
      const existingUserWithEmail = await db.User.findOne({
        where: {
          email: updateData.email.trim(),
          id: { [Op.ne]: id }, // Exclude current user
          is_deleted: 0
        }
      });

      if (existingUserWithEmail) {
        return res.status(400).json({
          success: false,
          message: 'Email is already in use by another user'
        });
      }
    }

    if (updateData.phone && updateData.phone !== existingUser.phone) {
      const existingUserWithPhone = await db.User.findOne({
        where: {
          phone: updateData.phone.trim(),
          id: { [Op.ne]: id }, // Exclude current user
          is_deleted: 0
        }
      });

      if (existingUserWithPhone) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is already in use by another user'
        });
      }
    }

    await db.User.update(updateData, { where: { id } });

    res
      .status(200)
      .json({ success: true, message: "User updated successfully" });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, message: "Server Error", error: error.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const id = req.params.id || req.user.id;
    const user = await db.User.findOne({
      where: {
        id: id,
      },
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const formatteduser = {
      ...user.dataValues,
      password: "",
    };

    res.status(200).json({ success: true, data: formatteduser });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, message: "Server Error", error: error.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    let { page, limit, searchQuery, userType, status } = req.query;
    const createdByIdFromToken = req?.user?.id;
    const userMode = req?.user?.user_type;

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    const offset = (page - 1) * limit;


    let where = {
      user_type: userType,
    };

    // if (userMode === "admin") {
    //   where.created_by = createdByIdFromToken;
    // }

    if (status) {
      where.is_active = status;
    }

    if (searchQuery) {
      where = {
        ...where,
        [Op.or]: [
          { first_name: { [Op.like]: `%${searchQuery}%` } },
          { last_name: { [Op.like]: `%${searchQuery}%` } },
          { phone: { [Op.like]: `%${searchQuery}%` } },
          { email: { [Op.like]: `%${searchQuery}%` } },
        ],
      };
    }

    const totalUsers = await db.User.count({ where });

    const rows = await db.User.findAll({
      where,
      attributes: [
        "id",
        "unique_code",
        "first_name",
        "last_name",
        "phone",
        "email",
        "is_active",
        "is_deleted",
        "created_by",
        [
          fn(
            "DATE_FORMAT",
            fn("CONVERT_TZ", col("User.created_at"), "+00:00", "+05:30"),
            "%Y-%m-%d %h:%i %p"
          ),
          "created_at",
        ],
      ],
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      currentPage: page,
      totalPages: Math.ceil(totalUsers / limit),
      totalRecords: totalUsers,
      data: rows,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, message: "Server Error", error: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const existingUser = await db.User.findByPk(id);

    if (!existingUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    await db.User.update({ is_deleted: 1 }, { where: { id } });
    res
      .status(200)
      .json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, message: "Server Error", error: error.message });
  }
};

exports.toggleUserStatus = async (req, res) => {
  try {
    const id = req.body.id || req.user.id;
    const { is_active } = req.body;

    const existingVendor = await db.User.findByPk(id);
    if (!existingVendor) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    await db.User.update({ is_active }, { where: { id } });

    res
      .status(200)
      .json({ success: true, message: "User status updated", data: {} });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ success: false, message: "Server Error", error: error.message });
  }
};

// Create visa application
exports.createVisaApplication = async (req, res) => {
  try {
    const userId = req.user.id;
    const { visa_id, travelDates, personalDetails, payment } = req.body;

    const visa = await db.Visa.findOne({
      where: {
        id: visa_id,
        is_active: 1,
        is_deleted: 0
      }
    });

    if (!visa) {
      return res.status(404).json({ success: false, message: 'Visa not found!' });
    }

    const visaApplication = await db.VisaApplication.create({
      visa_id,
      user_id: userId,
      departure_date: travelDates.departure_date,
      return_date: travelDates.return_date,
      visa_type: visa.visa_type,
      entry_type: visa.entry_type,
      number_of_travellers: travelDates.number_of_travellers,
      status: 'pending'
    });

    if (visaApplication) {
      const visaApplicationFields = await db.VisaApplicationField.create({
        visa_application_id: visaApplication.id,
        first_name: personalDetails.first_name,
        middle_name: personalDetails.middle_name,
        last_name: personalDetails.last_name,
        gender: personalDetails.gender,
        date_of_birth: personalDetails.date_of_birth,
        place_of_birth: personalDetails.place_of_birth,
        marital_status: personalDetails.marital_status,
        address: personalDetails.address,
        pincode: personalDetails.pincode,
        emergency_number: personalDetails.emergency_number,
        alternate_number: personalDetails.alternate_number,
        company_name: personalDetails.company_name,
        vendor_type: personalDetails.vendor_type,
        passport_number: personalDetails.passport_number,
        passport_issue_date: personalDetails.passport_issue_date,
        passport_expiry_date: personalDetails.passport_expiry_date,
        passport_issue_country: personalDetails.passport_issue_country,
        passport_expiry_country: personalDetails.passport_expiry_country,
        passport_issue_place: personalDetails.passport_issue_place,
        passport_size_photo: personalDetails.passport_size_photo,
        passport_front_photo: personalDetails.passport_front_photo,
        passport_back_photo: personalDetails.passport_back_photo,
        visa_type: personalDetails.visa_type,
        visa_category: personalDetails.visa_category,
        purpose_of_visit: personalDetails.purpose_of_visit,
        intended_travel_date: personalDetails.intended_travel_date,
        intended_return_date: personalDetails.intended_return_date,
        number_of_entries: personalDetails.number_of_entries,
        duration_of_stay: personalDetails.duration_of_stay,
        previously_visited: personalDetails.previously_visited,
        previously_visited_dates: personalDetails.previously_visited_dates,
        current_occupation: personalDetails.current_occupation,
        employer_name: personalDetails.employer_name,
        employer_address: personalDetails.employer_address,
        monthly_income: personalDetails.monthly_income,
        previous_employment: personalDetails.previous_employment,
        previous_education: personalDetails.previous_education,
        previous_employment_dates: personalDetails.previous_employment_dates,
        previous_education_dates: personalDetails.previous_education_dates,
        previous_employment_details: personalDetails.previous_employment_details,
        previous_education_details: personalDetails.previous_education_details,
        photograph_upload: personalDetails.photograph_upload,
        invitation_letter: personalDetails.invitation_letter,
        travel_itinerary: personalDetails.travel_itinerary,
        hotel_booking: personalDetails.hotel_booking,
        flight_booking: personalDetails.flight_booking,
        proof_of_funds: personalDetails.proof_of_funds,
        employment_letter: personalDetails.employment_letter,
        medical_insurance_certificate: personalDetails.medical_insurance_certificate,
        vaccination_certificate: personalDetails.vaccination_certificate,
      });

      if (visaApplicationFields) {
        return res.status(200).json({ success: true, message: 'Visa application created successfully.', data: visaApplication });
      } else {
        return res.status(400).json({ success: false, message: 'Failed to create visa application.' });
      }
    }
    return res.status(400).json({ success: false, message: 'Failed to create visa application.' });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Get user's visa applications
exports.getUserVisaApplications = async (req, res) => {
  try {
    const user_id = req.user.id;
    let { page, limit } = req.query;

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    const offset = (page - 1) * limit;

    const applications = await db.VisaApplication.findAll({
      where: { user_id },
      limit,
      offset,
      order: [['created_at', 'DESC']],
      include: [
        {
          model: db.Visa,
          as: 'visa',
          required: true,
          include: [
            {
              model: db.Country,
              as: 'country',
              attributes: ['id', 'name']
            }
          ]
        },
        {
          model: db.VisaApplicationField,
          as: 'visa_application_fields',
        },
        {
          model: db.User,
          as: 'user',
          attributes: ['id', 'first_name', 'last_name', 'email', 'phone']
        },
        {
          model: db.VisaApplicationPayment,
          as: 'visa_application_payments',
          // where: {
          //   payment_status: 'completed'
          // }
        }
      ],
      order: [['created_at', 'DESC']]
    });

    let respDataArr = [];

    for (const application of applications) {
      // Prepare document array similar to vendor API
      let documentToDownload = [];

      if (application.uploaded_document?.trim()) {
        const baseUrl = process.env.BASE_URL;
        const documentPath = application.uploaded_document;
        documentToDownload.push(`${baseUrl}${documentPath}`);
      }

      application.visa_application_fields?.forEach(doc => {
        if (doc.uploaded_document?.trim()) {
          const baseUrl = process.env.BASE_URL;
          const documentPath = doc.uploaded_document;
          const fullUrl = `${baseUrl}${documentPath}`;

          if (!documentToDownload.includes(fullUrl)) {
            documentToDownload.push(fullUrl);
          }
        }
      });

      respDataArr.push({
        id: application.id,
        user_id: application.user.id,
        applicant_name: `${application.user?.first_name} ${application.user?.last_name}`,
        application_id: application.visa?.application_id,
        submission_date: moment(application.created_at).format('YYYY-MM-DD'),
        visa_type: application.visa_type ? application.visa_type.charAt(0).toUpperCase() + application.visa_type.slice(1) : '',
        status: ['vendor_assigned', 'vendor_accepted', 'vendor_rejected'].includes(application.status) ? 'pending' : application.status,
        amount: application.amount,
        country_name: application.visa?.country?.name,
        currency_code: 'INR',
        reference_number: application.reference_number,
        // Amendment functionality
        amendment_enabled: application.amendment_enabled,
        amendment_enabled_until: application.amendment_enabled_until,
        amendment_expires_in_hours: application.amendment_enabled_until ?
          Math.max(0, Math.ceil((new Date(application.amendment_enabled_until) - new Date()) / (1000 * 60 * 60))) : null,
        uploaded_document: documentToDownload,
        isDraft: application.status === 'pending_payment',
        payment_status: application.payment_status,
      });
    }

    const totalApplications = await db.VisaApplication.count({ where: { user_id } });
    const totalPages = Math.ceil(totalApplications / limit);

    return res.status(200).json({
      success: true,
      message: 'Visa applications retrieved successfully',
      data: respDataArr,
      totalPages,
      totalApplications,
      currentPage: page,
      limit
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// Get single visa application details
exports.getVisaApplicationDetails = async (req, res) => {
  // Helper function to get status message
  const getStatusMessage = (status) => {
    const statusMessages = {
      'pending': 'Application under review',
      'processing': 'Documents being verified',
      'approved': 'Visa approved - ready for collection',
      'rejected': 'Application has been rejected',
      'cancelled': 'Application cancelled',
      'expired': 'Application has expired',
      'completed': 'Process completed'
    };
    return statusMessages[status] || 'Status unknown';
  };

  try {
    const { id } = req.params;
    const user_id = req.user.id;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Application ID is required!'
      });
    }

    const application = await db.VisaApplication.findOne({
      where: { id, user_id },
      include: [
        {
          model: db.Visa,
          as: 'visa',
          attributes: ['id', 'name', 'visa_type', 'entry_type', 'validity_days'],
          include: [
            {
              model: db.Country,
              as: 'country',
              attributes: ['id', 'name', 'iso2', 'currency']
            }
          ]
        },
        {
          model: db.VisaApplicationPayment,
          as: 'visa_application_payments'
        },
        {
          model: db.VisaApplicationField,
          as: 'visa_application_fields'
        },
        {
          model: db.Coupon,
          as: 'coupon',
          attributes: ['id', 'code', 'name', 'description', 'discount_type', 'discount_value', 'maximum_discount_amount'],
          required: false
        }
      ]
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Visa application not found'
      });
    }

    const travellers = application.visa_application_fields || [];
    const payment = application.visa_application_payments?.[0];

    // Determine application status and progress
    let progressSteps = {
      errorsFixed: true,
      applicationComplete: true,
      applicationPaid: application?.payment_status ? true : false,
      submittedToImmigration: application?.payment_status ? true : false,
      visaApproved: application.status === 'approved'
    };

    // Calculate expected visa date
    const expectedDate = new Date(application.created_at);
    expectedDate.setDate(expectedDate.getDate() + 15);

    // Format traveller details
    const formattedTravellers = travellers.map((traveller, index) => ({
      id: traveller.id,
      travellerNumber: index + 1,
      status: ["vendor_assigned", "vendor_accepted", "vendor_rejected"].includes(traveller.status) ? 'pending' : traveller.status,
      referenceNumber: traveller.reference_number,
      uploadedDocument: traveller.uploaded_document ? `${process.env.BASE_URL}${traveller.uploaded_document}` : null,
      remark: traveller.remark,
      statusInfo: {
        status: traveller.status || 'pending',
        statusMessage: getStatusMessage(traveller.status || 'pending'),
        lastUpdated: traveller.updatedAt || traveller.createdAt
      },
      personalInfo: {
        firstName: traveller.first_name,
        middleName: traveller.middle_name,
        lastName: traveller.last_name,
        fullName: `${traveller.first_name} ${traveller.middle_name || ''} ${traveller.last_name}`.trim(),
        email: traveller.email,
        phone: traveller.phone,
        gender: traveller.gender,
        dateOfBirth: traveller.date_of_birth ? new Date(traveller.date_of_birth).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }) : null,
        placeOfBirth: traveller.place_of_birth,
        nationality: traveller.nationality || 'India',
        maritalStatus: traveller.marital_status
      },
      contactInfo: {
        address: traveller.address,
        pincode: traveller.pincode,
        emergencyNumber: traveller.emergency_number,
        alternateNumber: traveller.alternate_number
      },
      passportInfo: {
        passportNumber: traveller.passport_number,
        issueDate: traveller.passport_issue_date ? new Date(traveller.passport_issue_date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }) : null,
        expiryDate: traveller.passport_expiry_date ? new Date(traveller.passport_expiry_date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }) : null,
        issuePlace: traveller.passport_issue_place,
        issueCountry: traveller.passport_issue_country,
        expiryCountry: traveller.passport_expiry_country
      },
      documents: {
        passportFrontPhoto: traveller.passport_front_photo ? `${process.env.BASE_URL}${traveller.passport_front_photo}` : null,
        passportBackPhoto: traveller.passport_back_photo ? `${process.env.BASE_URL}${traveller.passport_back_photo}` : null,
        passportSizePhoto: traveller.passport_size_photo ? `${process.env.BASE_URL}${traveller.passport_size_photo}` : null,
        photographUpload: traveller.photograph_upload ? `${process.env.BASE_URL}${traveller.photograph_upload}` : null,
        invitationLetter: traveller.invitation_letter ? `${process.env.BASE_URL}${traveller.invitation_letter}` : null,
        travelItinerary: traveller.travel_itinerary ? `${process.env.BASE_URL}${traveller.travel_itinerary}` : null,
        hotelBooking: traveller.hotel_booking ? `${process.env.BASE_URL}${traveller.hotel_booking}` : null,
        flightBooking: traveller.flight_booking ? `${process.env.BASE_URL}${traveller.flight_booking}` : null,
        proofOfFunds: traveller.proof_of_funds ? `${process.env.BASE_URL}${traveller.proof_of_funds}` : null,
        employmentLetter: traveller.employment_letter ? `${process.env.BASE_URL}${traveller.employment_letter}` : null,
        medicalInsurance: traveller.medical_insurance_certificate ? `${process.env.BASE_URL}${traveller.medical_insurance_certificate}` : null,
        vaccinationCertificate: traveller.vaccination_certificate ? `${process.env.BASE_URL}${traveller.vaccination_certificate}` : null,
        panCardPhoto: traveller.pan_card_photo ? `${process.env.BASE_URL}${traveller.pan_card_photo}` : null,
        itr1stYearPhoto: traveller.itr_1st_year_photo ? `${process.env.BASE_URL}${traveller.itr_1st_year_photo}` : null,
        itr2ndYearPhoto: traveller.itr_2nd_year_photo ? `${process.env.BASE_URL}${traveller.itr_2nd_year_photo}` : null,
        itr3rdYearPhoto: traveller.itr_3rd_year_photo ? `${process.env.BASE_URL}${traveller.itr_3rd_year_photo}` : null,
        threeMonthsBankStatement: traveller.three_months_bank_statement ? `${process.env.BASE_URL}${traveller.three_months_bank_statement}` : null,
        sixMonthsBankStatement: traveller.six_months_bank_statement ? `${process.env.BASE_URL}${traveller.six_months_bank_statement}` : null,
        threeMonthsBankSignedAndStampedStatement: traveller.three_months_bank_signed_and_stamped_statement ? `${process.env.BASE_URL}${traveller.three_months_bank_signed_and_stamped_statement}` : null,
        sixMonthsBankSignedAndStampedStatement: traveller.six_months_bank_signed_and_stamped_statement ? `${process.env.BASE_URL}${traveller.six_months_bank_signed_and_stamped_statement}` : null,
        aadharCard: traveller.aadhar_card ? `${process.env.BASE_URL}${traveller.aadhar_card}` : null,
        passportExternalCover: traveller.passport_external_cover ? `${process.env.BASE_URL}${traveller.passport_external_cover}` : null,
      },
      travelInfo: {
        visaType: traveller.visa_type,
        visaCategory: traveller.visa_category,
        purposeOfVisit: traveller.purpose_of_visit,
        intendedTravelDate: traveller.intended_travel_date ? new Date(traveller.intended_travel_date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }) : null,
        intendedReturnDate: traveller.intended_return_date ? new Date(traveller.intended_return_date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }) : null,
        numberOfEntries: traveller.number_of_entries,
        durationOfStay: traveller.duration_of_stay,
        previouslyVisited: traveller.previously_visited,
        previouslyVisitedDates: traveller.previously_visited_dates
      },
      employmentInfo: {
        currentOccupation: traveller.current_occupation,
        employerName: traveller.employer_name,
        employerAddress: traveller.employer_address,
        monthlyIncome: traveller.monthly_income,
        previousEmployment: traveller.previous_employment,
        previousEducation: traveller.previous_education,
        previousEmploymentDates: traveller.previous_employment_dates,
        previousEducationDates: traveller.previous_education_dates,
        previousEmploymentDetails: traveller.previous_employment_details,
        previousEducationDetails: traveller.previous_education_details
      }
    }));

    // Prepare uploaded documents array similar to vendor API
    let uploadedDocuments = [];

    if (application.uploaded_document?.trim()) {
      const baseUrl = process.env.BASE_URL;
      const documentPath = application.uploaded_document;
      uploadedDocuments.push(`${baseUrl}${documentPath}`);
    }

    application.visa_application_fields?.forEach(field => {
      if (field.uploaded_document?.trim()) {
        const baseUrl = process.env.BASE_URL;
        const documentPath = field.uploaded_document;
        const fullUrl = `${baseUrl}${documentPath}`;

        if (!uploadedDocuments.includes(fullUrl)) {
          uploadedDocuments.push(fullUrl);
        }
      }
    });

    const detailedResponse = {
      id: application.id,
      application_id: application.application_id,

      // Amendment functionality
      amendment_enabled: application.amendment_enabled,
      amendment_enabled_until: application.amendment_enabled_until,
      amendment_expires_in_hours: application.amendment_enabled_until ?
        Math.max(0, Math.ceil((new Date(application.amendment_enabled_until) - new Date()) / (1000 * 60 * 60))) : null,
      uploaded_document: uploadedDocuments,

      // Application Type
      applicationType: application.number_of_travellers > 1 ? 'Group' : 'Individual',

      // Visa Information
      visaInfo: {
        visaType: `${application.visa?.country?.name} ${application.visa_type}`,
        country: application.visa?.country?.name,
        countryCode: application.visa?.country?.iso2,
        entryType: application.entry_type,
        numberOfTravellers: application.number_of_travellers,
        travelDates: `${new Date(application.departure_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${new Date(application.return_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        departureDate: application.departure_date,
        returnDate: application.return_date
      },

      // Application Status and Progress
      status: application.status,
      paymentStatus: payment?.payment_status || 'pending',
      progressSteps: progressSteps,
      parametersChecked: `${Object.values(progressSteps).filter(Boolean).length}/${Object.keys(progressSteps).length}`,

      // Expected Visa Approval
      expectedVisaApproval: {
        date: expectedDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }),
        status: 'submitted now!'
      },

      // Application Details
      applicationDetails: {
        createdAt: application.created_at,
        createdDate: new Date(application.created_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        }),
        createdTime: new Date(application.created_at).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }),
        internalId: application.application_id,
        groupName: formattedTravellers[0]?.personalInfo?.fullName || 'N/A',
        reliance: 'Standard Plan included with Visa for each traveler'
      },

      // Price Details
      priceDetails: {
        traveller1: payment?.amount || application.amount,
        total: payment?.amount || application.amount,
        couponDiscount: application.discount || 0,
        finalAmount: payment?.amount || application.amount,
        currency: payment?.payment_currency || application.visa?.country?.currency || 'INR',
        currentWalletBalance: 0 // This would come from user's wallet
      },

      // Payment Information
      paymentInfo: {
        amount: payment?.amount || application.amount,
        currency: payment?.payment_currency || application.visa?.country?.currency || 'INR',
        paymentMethod: payment?.payment_method || 'online',
        paymentStatus: payment?.payment_status || 'pending',
        paymentDate: payment?.payment_date,
        transactionId: payment?.payment_reference,
        paymentGateway: payment?.payment_gateway
      },

      // Coupon Information
      couponInfo: application.coupon ? {
        applied: true,
        couponCode: application.coupon_code,
        couponName: application.coupon.name,
        couponDescription: application.coupon.description,
        discountType: application.coupon.discount_type,
        discountValue: application.coupon.discount_type === 'percentage' 
          ? `${application.coupon.discount_value}%` 
          : `₹${application.coupon.discount_value}`,
        discountAmount: application.discount || 0,
        maximumDiscountAmount: application.coupon.maximum_discount_amount || null
      } : {
        applied: false,
        couponCode: null,
        discountAmount: 0
      },

      // Travellers Details
      travellers: formattedTravellers,

      // Know Before You Pay section
      knowBeforeYouPay: {
        processingTime: '10-15 working days',
        visaValidity: application.visa?.validity_days ? `${application.visa.validity_days} days` : 'As per embassy decision',
        entryType: application.entry_type || 'Multiple',
        stayDuration: 'As per visa approval',
        requirements: [
          'Valid passport with minimum 6 months validity',
          'Recent passport size photograph',
          'Bank statements for last 3-6 months',
          'Flight itinerary and hotel booking',
          'Travel insurance (if required)'
        ]
      }
    };

    return res.status(200).json({
      success: true,
      message: 'Visa application details retrieved successfully',
      data: detailedResponse
    });
  } catch (error) {
    console.error('Get visa application details error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// Get simplified visa applications list for support ticket selection
exports.getVisaApplicationsForSupport = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { search } = req.query;

    let whereCondition = { user_id };

    // Add search functionality if search term provided
    if (search) {
      whereCondition[Op.or] = [
        { application_id: { [Op.like]: `%${search}%` } },
        { reference_number: { [Op.like]: `%${search}%` } },
        { '$visa.name$': { [Op.like]: `%${search}%` } },
        { '$visa.country.name$': { [Op.like]: `%${search}%` } }
      ];
    }

    const applications = await db.VisaApplication.findAll({
      where: whereCondition,
      include: [
        {
          model: db.Visa,
          as: 'visa',
          attributes: ['name', 'visa_type'],
          include: [
            {
              model: db.Country,
              as: 'country',
              attributes: ['name']
            }
          ]
        }
      ],
      attributes: ['id', 'application_id', 'visa_type', 'status', 'created_at', 'reference_number'],
      order: [['created_at', 'DESC']],
      limit: 50 // Limit to 50 most recent applications
    });

    const formattedApplications = applications.map(app => ({
      id: app.id,
      application_id: app.application_id,
      reference_number: app.reference_number,
      visa_type: app.visa_type,
      country: app.visa?.country?.name,
      visa_name: app.visa?.name,
      status: app.status,
      created_date: app.created_at,
      display_text: `${app.application_id} - ${app.visa?.country?.name} (${app.visa_type}) - ${app.status}`
    }));

    return res.status(200).json({
      success: true,
      message: 'Visa applications for support retrieved successfully',
      data: formattedApplications
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

exports.getUserProfile = async (req, res) => {
  try {
    const user_id = req.user.id;
    const user = await db.User.findOne({
      where: { id: user_id, is_deleted: false },
      attributes: [
        'id', 'first_name', 'last_name', 'email', 'phone',
        'dob', 'gender', 'country_id', 'profile', 'google_profile_picture'
      ],
      include: [
        {
          model: db.Country,
          as: 'country',
          attributes: ['id', 'name', 'iso2']
        }
      ]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Format the response with full profile image URLs
    const formattedUser = {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      phone: user.phone,
      dob: user.dob,
      gender: user.gender,
      country_id: user.country_id,
      country: user.country,
      profile_image: user.profile ? `${process.env.BASE_URL}${user.profile}` : null,
      google_profile_picture: user.google_profile_picture || null
    };

    return res.status(200).json({
      success: true,
      message: 'Profile retrieved successfully',
      data: formattedUser
    });
  } catch (error) {
    console.error('getUserProfile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
}

exports.updateUserProfile = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const user_id = req.user.id;
    const { first_name, last_name, email, phone, dob, gender, country_id } = req.body;
    const profileFile = req.files?.profile?.[0];

    // Validate required fields
    if (!first_name || !last_name) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'First name and last name are required'
      });
    }

    const user = await db.User.findOne({
      where: { id: user_id, is_deleted: false },
      attributes: ['id', 'first_name', 'last_name', 'email', 'phone', 'profile'],
      transaction
    });

    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if email is being changed and if it's already in use by other non-deleted users
    if (email && email.trim() !== user.email) {
      const existingUserWithEmail = await db.User.findOne({
        where: {
          email: email.trim().toLowerCase(),
          id: { [Op.ne]: user_id }, // Exclude current user
          is_deleted: false
        },
        transaction
      });

      if (existingUserWithEmail) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Email is already in use by another user'
        });
      }
    }

    // Check if phone is being changed and if it's already in use by other non-deleted users
    if (phone && phone.trim() !== user.phone) {
      const existingUserWithPhone = await db.User.findOne({
        where: {
          phone: phone.trim(),
          id: { [Op.ne]: user_id }, // Exclude current user
          is_deleted: false
        },
        transaction
      });

      if (existingUserWithPhone) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Phone number is already in use by another user'
        });
      }
    }

    // Prepare update data
    const updateData = {
      first_name: first_name?.trim(),
      last_name: last_name?.trim(),
      email: email?.trim()?.toLowerCase(),
      phone: phone?.trim(),
      dob,
      gender,
      country_id
    };

    // Handle profile image upload
    if (profileFile) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(profileFile.mimetype)) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Invalid file type. Only JPEG, JPG, PNG, and WebP images are allowed'
        });
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (profileFile.size > maxSize) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'File size too large. Maximum allowed size is 5MB'
        });
      }

      updateData.profile = profileFile.path;
    }

    // Update user profile
    await db.User.update(updateData, {
      where: { id: user_id },
      transaction
    });

    // Get updated user data with country information
    const updatedUser = await db.User.findOne({
      where: { id: user_id },
      attributes: [
        'id', 'first_name', 'last_name', 'email', 'phone',
        'dob', 'gender', 'country_id', 'profile'
      ],
      include: [
        {
          model: db.Country,
          as: 'country',
          attributes: ['id', 'name', 'iso2']
        }
      ],
      transaction
    });

    await transaction.commit();

    // Format response with full profile image URL
    const responseData = {
      id: updatedUser.id,
      first_name: updatedUser.first_name,
      last_name: updatedUser.last_name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      dob: updatedUser.dob,
      gender: updatedUser.gender,
      country_id: updatedUser.country_id,
      country: updatedUser.country,
      profile_image: updatedUser.profile ? `${process.env.BASE_URL}${updatedUser.profile}` : null
    };

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: responseData
    });
  } catch (error) {
    await transaction.rollback();
    console.error('updateUserProfile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
}

// Passport scanning functionality
exports.scanPassport = async (req, res) => {
  try {
    // Check if image file is uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a passport image'
      });
    }

    const imagePath = req.file.path;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      // NOTE: Files are uploaded directly to Cloudinary (no local temp file),
      // so req.file.path is a remote URL, not a filesystem path. There is
      // nothing to clean up locally here.
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Please upload a valid image file (JPEG, JPG, PNG, GIF)'
      });
    }

    // Validate file size (10MB limit)
    if (req.file.size > 10 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Please upload an image smaller than 10MB'
      });
    }

    // Scan passport using Google Cloud Vision API
    const result = await passportService.scanPassport(imagePath);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to scan passport',
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Passport scanned successfully',
      data: {
        extractedData: result.data,
        confidence: 'high', // You can implement confidence scoring if needed
        extractedText: result.extractedText
      }
    });

  } catch (error) {
    console.error('Error in passport scanning:', error);

    return res.status(500).json({
      success: false,
      message: 'Internal server error while scanning passport',
      error: error.message
    });
  }
};

// Enhanced passport scanning with field validation
exports.scanPassportWithValidation = async (req, res) => {
  try {
    // Check if image file is uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a passport image'
      });
    }

    const imagePath = req.file.path;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      // NOTE: Files are uploaded directly to Cloudinary (no local temp file),
      // so req.file.path is a remote URL, not a filesystem path. There is
      // nothing to clean up locally here.
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Please upload a valid image file (JPEG, JPG, PNG)'
      });
    }

    //also add check for image size should not more than 5mb
    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Please upload an image smaller than 5MB'
      });
    }

    // Scan passport using Gemini AI
    const result = await passportService.extractPassportWithGemini(imagePath);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to scan passport',
        error: result.error
      });
    }

    // Validate extracted data
    const validation = {
      warnings: [],
      errors: [],
      suggestions: []
    };

    const data = result.data;

    // Check for required fields
    if (!data.passportNumber) {
      validation.errors.push('Passport number not found or unclear in the image');
    }

    if (!data.dateOfExpiry) {
      validation.warnings.push('Expiry date not found or unclear');
    } else {
      // Check if passport is expired
      const expiryDate = new Date(data.dateOfExpiry);
      const currentDate = new Date();
      if (expiryDate < currentDate) {
        validation.errors.push('Passport appears to be expired');
      } else if ((expiryDate - currentDate) / (1000 * 60 * 60 * 24) < 180) {
        validation.warnings.push('Passport expires within 6 months');
      }
    }

    if (!data.firstName && !data.lastName) {
      validation.warnings.push('Names not clearly detected. Please verify manually');
    }

    if (!data.nationality) {
      validation.warnings.push('Nationality not detected clearly');
    }

    if (!data.countryCode) {
      validation.warnings.push('Country code not detected clearly');
    }

    if (!data.sex) {
      validation.warnings.push('Gender not detected clearly');
    }

    // Provide suggestions for better scanning
    if (validation.errors.length > 0 || validation.warnings.length > 0) {
      validation.suggestions.push('Ensure the passport image is clear and well-lit');
      validation.suggestions.push('Make sure all text is visible and not cropped');
      validation.suggestions.push('Use a high-resolution image for better results');
    }

    return res.status(200).json({
      success: true,
      message: 'Passport scanned successfully',
      data: {
        extractedData: result.data,
        validation: validation,
        extractedText: result.extractedText,
        completeness: calculateDataCompleteness(result.data)
      }
    });

  } catch (error) {
    console.error('Error in passport scanning with validation:', error);

    return res.status(500).json({
      success: false,
      message: 'Internal server error while scanning passport',
      error: error.message
    });
  }
};

// Helper function to calculate data completeness
function calculateDataCompleteness(data) {
  const requiredFields = ['passportNumber', 'firstName', 'lastName', 'dateOfBirth', 'dateOfExpiry', 'nationality', 'sex', 'countryCode'];
  const extractedFields = requiredFields.filter(field => data[field] && data[field].trim() !== '');
  const completeness = Math.round((extractedFields.length / requiredFields.length) * 100);

  return {
    percentage: completeness,
    extractedFields: extractedFields.length,
    totalFields: requiredFields.length,
    missingFields: requiredFields.filter(field => !data[field] || data[field].trim() === '')
  };
}

// Contact us functionality for support inquiries
exports.contactUs = async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name is required"
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address"
      });
    }

    if (!phone || !phone.trim()) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required"
      });
    }

    // Import the email service at function scope to avoid circular dependencies
    const { sendContactSupportEmail } = require("../services/email.service");

    // Send email notification
    const emailSent = await sendContactSupportEmail({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim()
    });

    if (!emailSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to send support request. Please try again later."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Your message has been sent successfully. Our team will contact you soon."
    });
  } catch (error) {
    console.error("Contact us error:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    // Validate required fields
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required"
      });
    }

    // Validate new password length
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long"
      });
    }

    // Get user from database
    const user = await db.User.findOne({
      where: { id: userId, is_deleted: 0 }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect"
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password in database
    await db.User.update(
      { password: hashedNewPassword },
      { where: { id: userId } }
    );

    return res.status(200).json({
      success: true,
      message: "Password updated successfully"
    });

  } catch (error) {
    console.error("Update password error:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};
