module.exports = (sequelize, DataTypes) => {
    const VisaFormField = sequelize.define('VisaFormField', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        country_id: {
            type: DataTypes.CHAR(36),
            allowNull: false,
        },
        first_name: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        middle_name: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        last_name: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        gender: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        place_of_birth: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        nationality: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        marital_status: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        date_of_birth: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        pincode: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        passport_number: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        passport_issue_date: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        passport_expiry_country: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        passport_issue_place: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        intended_travel_date: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        intended_return_date: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        number_of_entries: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        previous_employment: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        previous_education: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        pan_card_photo: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        itr_1st_year_photo: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        itr_2nd_year_photo: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        itr_3rd_year_photo: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        invitation_letter: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        travel_itinerary: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        hotel_booking: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        flight_booking: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        proof_of_funds: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        employment_letter: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        medical_insurance_certificate: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        vaccination_certificate: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        address: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        emergency_number: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        alternate_number: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        company_name: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        vendor_type: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        passport_expiry_date: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        passport_issue_country: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        passport_size_photo: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        passport_front_photo: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        passport_back_photo: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        visa_type: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        purpose_of_visit: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        visa_category: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        duration_of_stay: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        previously_visited: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        previously_visited_dates: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        current_occupation: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        employer_name: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        employer_address: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        monthly_income: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        previous_employment_dates: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        previous_education_dates: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        previous_employment_details: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        previous_education_details: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        three_months_bank_statement: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        six_months_bank_statement: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        three_months_bank_signed_and_stamped_statement: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        six_months_bank_signed_and_stamped_statement: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        aadhar_card: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        passport_external_cover: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        created_by: {
            type: DataTypes.CHAR(36),
            allowNull: true
        },
        updated_by: {
            type: DataTypes.CHAR(36),
            allowNull: true
        },
        is_active: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        is_deleted: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        tableName: 'visa_form_fields',
        timestamps: false,
    });

    VisaFormField.associate = models => {
        VisaFormField.belongsTo(models.Country, { foreignKey: 'country_id', as: 'country' });
        // VisaFormField.hasMany(models.VisaEligibleNationality, { foreignKey: 'visa_id', as: 'nationalities' });
    };

    return VisaFormField;
};
