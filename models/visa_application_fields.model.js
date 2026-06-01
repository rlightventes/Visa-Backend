module.exports = (sequelize, DataTypes) => {
  const VisaApplicationField = sequelize.define('VisaApplicationField', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    visa_application_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'cancelled', 'expired', 'processing', 'completed'),
      defaultValue: 'pending',
      allowNull: false
    },
    reference_number: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    uploaded_document: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    remark: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    first_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    middle_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    last_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    gender: {
      type: DataTypes.ENUM('Male', 'Female', 'Other'),
      allowNull: true
    },
    date_of_birth: {
      type: DataTypes.DATE,
      allowNull: true
    },
    place_of_birth: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    nationality: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    marital_status: {
      type: DataTypes.ENUM('Single', 'Married', 'Divorced', 'Widowed'),
      allowNull: true
    },
    address: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    pincode: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    emergency_number: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    alternate_number: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    company_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    vendor_type: {
      type: DataTypes.ENUM('regular', 'third-party'),
      allowNull: true
    },
    passport_number: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    passport_issue_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    passport_expiry_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    passport_issue_country: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    passport_expiry_country: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    passport_issue_place: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    passport_size_photo: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    passport_front_photo: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    passport_back_photo: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    visa_type: {
      type: DataTypes.ENUM('tourist', 'business', 'student', 'transit', 'other'),
      allowNull: true
    },
    visa_category: {
      type: DataTypes.ENUM('tourist', 'business', 'student', 'transit', 'other'),
      allowNull: true
    },
    purpose_of_visit: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    intended_travel_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    intended_return_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    number_of_entries: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    duration_of_stay: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    previously_visited: {
      type: DataTypes.BOOLEAN,
      allowNull: true
    },
    previously_visited_dates: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    current_occupation: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    employer_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    employer_address: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    monthly_income: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    previous_employment: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    previous_education: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    previous_employment_dates: {
      type: DataTypes.DATE,
      allowNull: true
    },
    previous_education_dates: {
      type: DataTypes.DATE,
      allowNull: true
    },
    previous_employment_details: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    previous_education_details: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    photograph_upload: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    invitation_letter: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    travel_itinerary: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    hotel_booking: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    flight_booking: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    proof_of_funds: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    employment_letter: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    medical_insurance_certificate: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    vaccination_certificate: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    pan_card_photo: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    itr_1st_year_photo: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    itr_2nd_year_photo: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    itr_3rd_year_photo: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    three_months_bank_statement: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    six_months_bank_statement: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    three_months_bank_signed_and_stamped_statement: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    six_months_bank_signed_and_stamped_statement: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    aadhar_card: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    passport_external_cover: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  }, {
    tableName: 'visa_application_fields',
    timestamps: false
  });

  VisaApplicationField.associate = function (models) {
    VisaApplicationField.belongsTo(models.VisaApplication, {
      foreignKey: 'visa_application_id',
      as: 'visa_application'
    });
  };

  return VisaApplicationField;
}; 