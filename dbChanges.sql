CREATE TABLE `user` (
  `id` char(36) NOT NULL,
  `unique_code` varchar(100) DEFAULT NULL,
  `first_name` varchar(200) DEFAULT NULL,
  `last_name` varchar(200) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `user_type` enum('super-admin','admin','vendor','user') NOT NULL,
  `address` varchar(255) DEFAULT NULL,
  `pincode` varchar(255) DEFAULT NULL,
  `emergency_number` varchar(255) DEFAULT NULL,
  `alternate_number` varchar(255) DEFAULT NULL,
  `country_id` char(36) DEFAULT NULL,
  `pan_card` varchar(200) DEFAULT NULL,
  `aadhar_card` varchar(200) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '0',
  `is_deleted` tinyint(1) DEFAULT '0',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`)
);

ALTER TABLE `user`
ADD COLUMN `dob` VARCHAR(20) DEFAULT NULL,
ADD COLUMN `gender` ENUM('Male', 'Female', 'Other') NOT NULL,
ADD COLUMN `passport_number` VARCHAR(20) DEFAULT NULL,
ADD COLUMN `passport_issue_date` VARCHAR(20) DEFAULT NULL,
ADD COLUMN `passport_expiry_date` VARCHAR(20) DEFAULT NULL,
ADD COLUMN `visa_type` VARCHAR(50) DEFAULT NULL,
ADD COLUMN `country_visit` VARCHAR(50) DEFAULT NULL,
ADD COLUMN `purpose` LONGTEXT DEFAULT NULL,
ADD COLUMN `intended_arr_date` VARCHAR(20) DEFAULT NULL,
ADD COLUMN `intended_depart_date` VARCHAR(20) DEFAULT NULL,
ADD COLUMN `places_to_visit` LONGTEXT DEFAULT NULL,
ADD COLUMN `is_visited` BOOLEAN DEFAULT FALSE;

CREATE TABLE `documents` (
    `id` CHAR(36) NOT NULL,
    `reference_id` CHAR(36) NOT NULL,
    `file_name` VARCHAR(500) DEFAULT NULL,
    `file_type` ENUM('passport', 'photo', 'itinery', 'hotel', 'bank', 'employment', 'business', 'tax', 'id_proof', 'additional') NOT NULL,
    `created_at` DATETIME NOT NULL,
    `updated_at` DATETIME NOT NULL,
    PRIMARY KEY (`id`)
);

CREATE TABLE `countries` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `iso2` VARCHAR(2) UNIQUE,
  `iso3` VARCHAR(3) UNIQUE,
  `phonecode` VARCHAR(8),
  `currency` VARCHAR(8),
  `capital` VARCHAR(64),
  `region` VARCHAR(64),
  `subregion` VARCHAR(64),
  `is_active` TINYINT(1) NOT NULL DEFAULT 0,
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE modules (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL UNIQUE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE permissions (
  `id` CHAR(36) NOT NULL,
  `module_id` CHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL UNIQUE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE user_modules (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `module_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`id`)
);

CREATE TABLE user_permissions (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `user_module_id` CHAR(36) NOT NULL,
  `permission_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`id`)
);

INSERT INTO modules (id, name, created_at, updated_at) VALUES
  (UUID(), 'Visa Management', NOW(), NOW()),
  (UUID(), 'Vendor Management', NOW(), NOW());

SET @visa_mod   = (SELECT id FROM modules WHERE name = 'Visa Management');
SET @vendor_mod = (SELECT id FROM modules WHERE name = 'Vendor Management');

INSERT INTO permissions (id, module_id, name, created_at, updated_at) VALUES
  (UUID(), @visa_mod,   'View Visa Applications',    NOW(), NOW()),
  (UUID(), @visa_mod,   'Approve/Reject Visas',      NOW(), NOW()),
  (UUID(), @visa_mod,   'Edit Visa Applications',    NOW(), NOW()),

  (UUID(), @vendor_mod, 'View Vendors',               NOW(), NOW()),
  (UUID(), @vendor_mod, 'Approve/Reject Vendors',     NOW(), NOW()),
  (UUID(), @vendor_mod, 'Create Third-Party Vendors', NOW(), NOW());

CREATE TABLE user_countries (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `country_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`id`)
);

ALTER TABLE `user`
ADD COLUMN `company_name` VARCHAR(500) DEFAULT NULL AFTER `id`,
ADD COLUMN `vendor_type` ENUM('regular', 'third-party') DEFAULT NULL AFTER `user_type`,
CHANGE COLUMN  `first_name` `first_name` varchar(200) DEFAULT NULL,
CHANGE COLUMN  `last_name` `last_name` varchar(200) DEFAULT NULL;
CHANGE COLUMN  `gender` `gender` ENUM('Male', 'Female', 'Other') DEFAULT NULL;

CREATE TABLE visas (
  `id` CHAR(36) NOT NULL,
  `application_id` CHAR(10) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `country_id` CHAR(36) NOT NULL,
  `short_description` TEXT,
  `detailed_description` TEXT,
  `visa_type` ENUM('tourist','business','student','transit','other') NOT NULL,
  `entry_type` ENUM('single','multiple') NOT NULL,
  `validity_days` SMALLINT NOT NULL,
  `stay_duration_details` VARCHAR(255),
  `base_price` DECIMAL(10,2) NOT NULL,
  `processing_time_standard` SMALLINT NOT NULL,
  `processing_price_standard` DECIMAL(10,2) NOT NULL,
  `processing_time_express` SMALLINT,
  `processing_price_express` DECIMAL(10,2),
  `processing_time_urgent` SMALLINT,
  `processing_price_urgent` DECIMAL(10,2),
  `discount_percent` TINYINT DEFAULT 0,
  `is_featured` TINYINT(1) DEFAULT 0,
  `is_active` TINYINT(1) DEFAULT 0,
  `is_deleted` TINYINT(1) DEFAULT 0,
  `display_order` INT DEFAULT 0,
  `image_path` VARCHAR(512),
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE visa_eligible_nationalities (
  `id` CHAR(36) NOT NULL,
  `visa_id` CHAR(36) NOT NULL,
  `country_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`id`)
);

CREATE TABLE visa_eligibility_criteria (
  `id` CHAR(36) NOT NULL,
  `visa_id` CHAR(36) NOT NULL,
  `criteria_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`id`)
);

CREATE TABLE eligibility_criterion (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `image_url` VARCHAR(255) DEFAULT NULL,
  `is_active` TINYINT(1) DEFAULT 0,
  `is_deleted` TINYINT(1) DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE visa_documents (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `is_active` TINYINT(1) DEFAULT 0,
  `is_deleted` TINYINT(1) DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE visa_document_links (
  `id` CHAR(36) NOT NULL,
  `visa_id` CHAR(36) NOT NULL,
  `document_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`id`)
);

INSERT INTO eligibility_criterion (id, name, is_active, is_deleted, created_at, updated_at) VALUES
  (UUID(), 'Passport valid more than six month', 1, 0, NOW(), NOW()),
  (UUID(), 'Proof of funds', 1, 0, NOW(), NOW()),
  (UUID(), 'No criminal record', 1, 0, NOW(), NOW()),
  (UUID(), 'Genuine travel purpose', 1, 0, NOW(), NOW()),
  (UUID(), 'Other', 1, 0, NOW(), NOW());

INSERT INTO visa_documents (id, name, is_active, is_deleted, created_at, updated_at) VALUES
  (UUID(), 'Passport Copy', 1, 0, NOW(), NOW()),
  (UUID(), 'Photo', 1, 0, NOW(), NOW()),
  (UUID(), 'Flight Itinerary', 1, 0, NOW(), NOW()),
  (UUID(), 'Hotel Booking', 1, 0, NOW(), NOW()),
  (UUID(), 'Bank Statement', 1, 0, NOW(), NOW()),
  (UUID(), 'Application Form', 1, 0, NOW(), NOW()),
  (UUID(), 'Other', 1, 0, NOW(), NOW());

CREATE TABLE visa_uploads (
  `id` CHAR(36) NOT NULL,
  `visa_id` CHAR(36) NOT NULL,
  `image_path` VARCHAR(512) NOT NULL,
  PRIMARY KEY (`id`)
);

CREATE TABLE visa_form_fields (
  `id` CHAR(36) NOT NULL,
  `country_id`  CHAR(36) NOT NULL,
  `first_name` TINYINT(1) DEFAULT 0,
  `middle_name` TINYINT(1) DEFAULT 0,
  `last_name` TINYINT(1) DEFAULT 0,
  `gender` TINYINT(1) DEFAULT 0,
  `date_of_birth` TINYINT(1) DEFAULT 0,
  `place_of_birth` TINYINT(1) DEFAULT 0,
  `nationality` TINYINT(1) DEFAULT 0,
  `marital_status` TINYINT(1) DEFAULT 0,
  `address` TINYINT(1) DEFAULT 0,
  `pincode` TINYINT(1) DEFAULT 0,
  `emergency_number` TINYINT(1) DEFAULT 0,
  `alternate_number` TINYINT(1) DEFAULT 0,
  `company_name` TINYINT(1) DEFAULT 0,
  `vendor_type` TINYINT(1) DEFAULT 0,
  `passport_number` TINYINT(1) DEFAULT 0,
  `passport_issue_date` TINYINT(1) DEFAULT 0,
  `passport_expiry_date` TINYINT(1) DEFAULT 0,
  `passport_issue_country` TINYINT(1) DEFAULT 0,
  `passport_expiry_country` TINYINT(1) DEFAULT 0,
  `passport_issue_place` TINYINT(1) DEFAULT 0,
  `passport_size_photo` TINYINT(1) DEFAULT 0,
  `passport_front_photo` TINYINT(1) DEFAULT 0,
  `passport_back_photo` TINYINT(1) DEFAULT 0,
  `visa_type` TINYINT(1) DEFAULT 0,
  `visa_category` TINYINT(1) DEFAULT 0,
  `purpose_of_visit` TINYINT(1) DEFAULT 0,
  `intended_travel_date` TINYINT(1) DEFAULT 0,
  `intended_return_date` TINYINT(1) DEFAULT 0,
  `number_of_entries` TINYINT(1) DEFAULT 0,
  `duration_of_stay` TINYINT(1) DEFAULT 0,
  `previously_visited` TINYINT(1) DEFAULT 0,
  `previously_visited_dates` TINYINT(1) DEFAULT 0,
  `current_occupation` TINYINT(1) DEFAULT 0,
  `employer_name` TINYINT(1) DEFAULT 0,
  `employer_address` TINYINT(1) DEFAULT 0,
  `monthly_income` TINYINT(1) DEFAULT 0,
  `previous_employment` TINYINT(1) DEFAULT 0,
  `previous_education` TINYINT(1) DEFAULT 0,
  `previous_employment_dates` TINYINT(1) DEFAULT 0,
  `previous_education_dates` TINYINT(1) DEFAULT 0,
  `previous_employment_details` TINYINT(1) DEFAULT 0,
  `previous_education_details` TINYINT(1) DEFAULT 0,
  `photograph_upload` TINYINT(1) DEFAULT 0,
  `invitation_letter` TINYINT(1) DEFAULT 0,
  `travel_itinerary` TINYINT(1) DEFAULT 0,
  `hotel_booking` TINYINT(1) DEFAULT 0,
  `flight_booking` TINYINT(1) DEFAULT 0,
  `proof_of_funds` TINYINT(1) DEFAULT 0,
  `employment_letter` TINYINT(1) DEFAULT 0,
  `medical_insurance_certificate` TINYINT(1) DEFAULT 0,
  `vaccination_certificate` TINYINT(1) DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 0,
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0,
  `created_by`  CHAR(36) DEFAULT NULL,
  `updated_by`  CHAR(36) DEFAULT NULL,
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE visa_applications (
  `id` CHAR(36) NOT NULL,
  `visa_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `number_of_travellers` INT NOT NULL,
  `departure_date` DATE NOT NULL,
  `return_date` DATE NOT NULL,
  `visa_type` ENUM('tourist','business','student','transit','other') NOT NULL,
  `entry_type` ENUM('single','multiple') NOT NULL,
  `payment_status` TINYINT(1) NOT NULL DEFAULT 0,
  `status` ENUM('pending', 'approved', 'rejected', 'cancelled', 'expired', 'processing', 'completed') NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE visa_application_travellers (
  `id` CHAR(36) NOT NULL,
  `country_id`  CHAR(36) NOT NULL,
  `visa_application_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`id`)
);

CREATE TABLE visa_application_fields (
  `id` CHAR(36) NOT NULL,
  `visa_application_id` CHAR(36) NOT NULL,
  `first_name`  VARCHAR(255) DEFAULT NULL,
  `middle_name` VARCHAR(255) DEFAULT NULL,
  `last_name` VARCHAR(255) DEFAULT NULL,
  `gender` ENUM('Male', 'Female', 'Other') DEFAULT NULL,
  `date_of_birth` DATE DEFAULT NULL,
  `place_of_birth` VARCHAR(255) DEFAULT NULL,
  `nationality` VARCHAR(255) DEFAULT NULL,
  `marital_status` ENUM('Single', 'Married', 'Divorced', 'Widowed') DEFAULT NULL,
  `address` VARCHAR(255) DEFAULT NULL,
  `pincode` VARCHAR(255) DEFAULT NULL,
  `emergency_number` INT DEFAULT NULL,
  `alternate_number` INT DEFAULT NULL,
  `company_name` VARCHAR(255) DEFAULT NULL,
  `vendor_type` ENUM('regular', 'third-party') DEFAULT NULL,
  `passport_number` VARCHAR(255) DEFAULT NULL,
  `passport_issue_date` DATE DEFAULT NULL,
  `passport_expiry_date` DATE DEFAULT NULL,
  `passport_issue_country` VARCHAR(255) DEFAULT NULL,
  `passport_expiry_country` VARCHAR(255) DEFAULT NULL,
  `passport_issue_place` VARCHAR(255) DEFAULT NULL,
  `passport_size_photo` VARCHAR(255) DEFAULT NULL,
  `passport_front_photo` VARCHAR(255) DEFAULT NULL,
  `passport_back_photo` VARCHAR(255) DEFAULT NULL,
  `visa_type` ENUM('tourist','business','student','transit','other') DEFAULT NULL,
  `visa_category` ENUM('tourist','business','student','transit','other') DEFAULT NULL,
  `purpose_of_visit` VARCHAR(255) DEFAULT NULL,
  `intended_travel_date` DATE DEFAULT NULL,
  `intended_return_date` DATE DEFAULT NULL,
  `number_of_entries` INT DEFAULT NULL,
  `duration_of_stay` INT DEFAULT NULL,
  `previously_visited` BOOLEAN DEFAULT NULL,
  `previously_visited_dates` VARCHAR(255) DEFAULT NULL,
  `current_occupation` VARCHAR(255) DEFAULT NULL,
  `employer_name` VARCHAR(255) DEFAULT NULL,
  `employer_address` VARCHAR(255) DEFAULT NULL,
  `monthly_income` DECIMAL(10,2) DEFAULT NULL,
  `previous_employment` VARCHAR(255) DEFAULT NULL,
  `previous_education` VARCHAR(255) DEFAULT NULL,
  `previous_employment_dates` DATE DEFAULT NULL,
  `previous_education_dates` DATE DEFAULT NULL,
  `previous_employment_details` VARCHAR(255) DEFAULT NULL,
  `previous_education_details` VARCHAR(255) DEFAULT NULL,
  `photograph_upload` VARCHAR(255) DEFAULT NULL,
  `invitation_letter` VARCHAR(255) DEFAULT NULL,
  `travel_itinerary` VARCHAR(255) DEFAULT NULL,
  `hotel_booking` VARCHAR(255) DEFAULT NULL,
  `flight_booking` VARCHAR(255) DEFAULT NULL,
  `proof_of_funds` VARCHAR(255) DEFAULT NULL,
  `employment_letter` VARCHAR(255) DEFAULT NULL,
  `medical_insurance_certificate` VARCHAR(255) DEFAULT NULL,
  `vaccination_certificate` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
);

CREATE TABLE visa_application_payments (
  `id` CHAR(36) NOT NULL,
  `visa_application_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `payment_method` ENUM('online', 'offline') NOT NULL,
  `txn_id` VARCHAR(255) DEFAULT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `payment_status` ENUM('pending', 'completed', 'failed') NOT NULL,
  `payment_date` DATETIME NOT NULL,
  `payment_reference` VARCHAR(255) DEFAULT NULL,
  `payment_gateway` VARCHAR(255) DEFAULT NULL,
  `payment_info` TEXT DEFAULT NULL,
  `payment_currency` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

ALTER TABLE `visa_applications`
ADD COLUMN `amount` DECIMAL(10,2) NOT NULL DEFAULT 0; 

ALTER TABLE `visas`
ADD COLUMN `b2b_price` DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN `b2b_processing_time` SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE `visa_applications`
ADD COLUMN `application_id` VARCHAR(10) NOT NULL DEFAULT '',
ADD COLUMN `reference_number` VARCHAR(100) DEFAULT NULL,
ADD COLUMN `uploaded_document` VARCHAR(255) DEFAULT NULL;

ALTER TABLE `user`
ADD COLUMN `aadhar_number` VARCHAR(20) DEFAULT NULL,
ADD COLUMN `gst_number` VARCHAR(20) DEFAULT NULL,
ADD COLUMN `gst_certificate_img` VARCHAR(255) DEFAULT NULL,
ADD COLUMN `cancel_cheque_img` VARCHAR(255) DEFAULT NULL,
ADD COLUMN `address_line_2` TEXT DEFAULT NULL,
ADD COLUMN `city` VARCHAR(100) DEFAULT NULL,
ADD COLUMN `state` VARCHAR(100) DEFAULT NULL,
ADD COLUMN `office_img` VARCHAR(255) DEFAULT NULL;

ALTER TABLE `visa_applications`
ADD COLUMN `assign_to` CHAR(36) DEFAULT NULL,
ADD COLUMN `assign_by` CHAR(36) DEFAULT NULL;

CREATE TABLE `calendar` (
  `id` CHAR(36) NOT NULL,
  `country_id` CHAR(36) NOT NULL,
  `from_date` DATE NOT NULL,
  `to_date` DATE NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

ALTER TABLE `visa_application_fields`
CHANGE COLUMN `emergency_number` `emergency_number` VARCHAR(20) DEFAULT NULL,
CHANGE COLUMN `alternate_number` `alternate_number` VARCHAR(20) DEFAULT NULL;

ALTER TABLE `visa_applications`
ADD COLUMN `remark` TEXT DEFAULT NULL,
ADD COLUMN `type` VARCHAR(100) DEFAULT NULL;

ALTER TABLE `visa_form_fields`
ADD COLUMN `pan_card_photo` TINYINT(1) DEFAULT 0,
ADD COLUMN `itr_1st_year_photo` TINYINT(1) DEFAULT 0,
ADD COLUMN `itr_2nd_year_photo` TINYINT(1) DEFAULT 0,
ADD COLUMN `itr_3rd_year_photo` TINYINT(1) DEFAULT 0;

ALTER TABLE `user` DROP INDEX `phone`;
ALTER TABLE `user` DROP INDEX `email`;

ALTER TABLE user 
ADD COLUMN google_id VARCHAR(255) NULL AFTER password,
ADD COLUMN google_email VARCHAR(255) NULL AFTER google_id,
ADD COLUMN google_profile_picture VARCHAR(500) NULL AFTER google_email,
ADD COLUMN auth_provider ENUM('local', 'google') NOT NULL DEFAULT 'local' AFTER google_profile_picture;

ALTER TABLE user 
MODIFY COLUMN password VARCHAR(255) NULL;

UPDATE user 
SET auth_provider = 'local' 
WHERE auth_provider IS NULL OR auth_provider = '';

-- Add index on google_id for better performance
CREATE INDEX idx_user_google_id ON user(google_id);

-- Add index on auth_provider for better performance
CREATE INDEX idx_user_auth_provider ON user(auth_provider);

ALTER TABLE user
CHANGE COLUMN `phone` `phone` VARCHAR(20) NULL;

ALTER TABLE visa_application_fields
ADD COLUMN `pan_card_photo` VARCHAR(255) DEFAULT NULL,
ADD COLUMN `itr_1st_year_photo` VARCHAR(255) DEFAULT NULL,
ADD COLUMN `itr_2nd_year_photo` VARCHAR(255) DEFAULT NULL,
ADD COLUMN `itr_3rd_year_photo` VARCHAR(255) DEFAULT NULL;

-- Notifications table for real-time notification system
CREATE TABLE `notifications` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `sender_id` CHAR(36) DEFAULT NULL,
  `type` ENUM(
    'visa_application_received',
    'visa_status_updated',
    'payment_completed',
    'payment_failed',
    'document_uploaded',
    'assignment_changed',
    'system_notification'
  ) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `data` JSON DEFAULT NULL,
  `redirect_url` VARCHAR(500) DEFAULT NULL,
  `is_read` BOOLEAN DEFAULT FALSE,
  `read_at` DATETIME DEFAULT NULL,
  `is_deleted` BOOLEAN DEFAULT FALSE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_read_deleted` (`user_id`, `is_read`, `is_deleted`),
  KEY `idx_type` (`type`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_notifications_sender` FOREIGN KEY (`sender_id`) REFERENCES `user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add comment for better documentation
ALTER TABLE `notifications` COMMENT = 'Real-time notification system for visa application updates, payment notifications, and system alerts';

ALTER TABLE `notifications`
ADD COLUMN `reference_id` CHAR(36) DEFAULT NULL;

CREATE TABLE `support_tickets` (
  `id` char(36) NOT NULL,
  `ticket_number` varchar(20) NOT NULL,
  `user_id` char(36) NOT NULL,
  `visa_application_id` char(36) DEFAULT NULL,
  `subject` varchar(500) NOT NULL,
  `description` text NOT NULL,
  `category` enum('Visa Issue','Payment Issue','Technical Issue','Other') NOT NULL,
  `priority` enum('Low','Medium','High','Critical') NOT NULL DEFAULT 'Medium',
  `status` enum('Open','In Progress','Resolved','Closed') NOT NULL DEFAULT 'Open',
  `assigned_to` char(36) DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ticket_number` (`ticket_number`),
  KEY `user_id` (`user_id`),
  KEY `visa_application_id` (`visa_application_id`),
  KEY `assigned_to` (`assigned_to`),
  KEY `status` (`status`),
  KEY `category` (`category`),
  KEY `priority` (`priority`),
  KEY `created_at` (`created_at`),
  CONSTRAINT `support_tickets_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `support_tickets_visa_application_id_fk` FOREIGN KEY (`visa_application_id`) REFERENCES `visa_applications` (`id`) ON DELETE SET NULL,
  CONSTRAINT `support_tickets_assigned_to_fk` FOREIGN KEY (`assigned_to`) REFERENCES `user` (`id`) ON DELETE SET NULL
);

-- 2. Create support_ticket_messages table
CREATE TABLE `support_ticket_messages` (
  `id` char(36) NOT NULL,
  `ticket_id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `message` text NOT NULL,
  `message_type` enum('user_message','admin_reply','system_message') NOT NULL,
  `is_internal` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Internal messages only visible to admin/staff',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ticket_id` (`ticket_id`),
  KEY `user_id` (`user_id`),
  KEY `message_type` (`message_type`),
  KEY `created_at` (`created_at`),
  CONSTRAINT `support_ticket_messages_ticket_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `support_ticket_messages_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
);

-- 3. Create support_ticket_attachments table
CREATE TABLE `support_ticket_attachments` (
  `id` char(36) NOT NULL,
  `ticket_id` char(36) NOT NULL,
  `message_id` char(36) DEFAULT NULL,
  `user_id` char(36) NOT NULL,
  `original_filename` varchar(255) NOT NULL,
  `stored_filename` varchar(255) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `file_size` int NOT NULL,
  `mime_type` varchar(100) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ticket_id` (`ticket_id`),
  KEY `message_id` (`message_id`),
  KEY `user_id` (`user_id`),
  KEY `created_at` (`created_at`),
  CONSTRAINT `support_ticket_attachments_ticket_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `support_ticket_attachments_message_id_fk` FOREIGN KEY (`message_id`) REFERENCES `support_ticket_messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `support_ticket_attachments_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
);

-- 4. Create indexes for better performance
CREATE INDEX `idx_support_tickets_status_created` ON `support_tickets` (`status`, `created_at`);
CREATE INDEX `idx_support_tickets_category_status` ON `support_tickets` (`category`, `status`);
CREATE INDEX `idx_support_tickets_user_status` ON `support_tickets` (`user_id`, `status`);
CREATE INDEX `idx_support_ticket_messages_ticket_created` ON `support_ticket_messages` (`ticket_id`, `created_at`);

ALTER TABLE `notifications` CHANGE COLUMN `type` `type` ENUM(
    'visa_application_received',
    'visa_status_updated',
    'payment_completed', 
    'payment_failed',
    'document_uploaded',
    'assignment_changed',
    'system_notification',
    'support_ticket_created',
    'support_ticket_status_updated',
    'support_ticket_reply'
) NOT NULL;

ALTER TABLE visa_applications 
MODIFY COLUMN status ENUM('pending_payment', 'pending', 'approved', 'rejected', 'cancelled', 'expired', 'processing', 'completed') DEFAULT 'pending_payment' NOT NULL;

ALTER TABLE `visas`
ADD COLUMN `b2b_processing_type` ENUM('hour', 'day') NOT NULL DEFAULT 'day';

ALTER TABLE `visa_applications`
ADD COLUMN `discount` DECIMAL(10,2) DEFAULT 0;

ALTER TABLE `visas`
ADD COLUMN `b2b_discount` DECIMAL(10,2) DEFAULT 0 AFTER `b2b_processing_time`;

ALTER TABLE `visa_form_fields`
ADD COLUMN `three_months_bank_statement` TINYINT(1) DEFAULT 0,
ADD COLUMN `six_months_bank_statement` TINYINT(1) DEFAULT 0,
ADD COLUMN `three_months_bank_signed_and_stamped_statement` TINYINT(1) DEFAULT 0,
ADD COLUMN `six_months_bank_signed_and_stamped_statement` TINYINT(1) DEFAULT 0;

ALTER TABLE `visa_application_fields`
ADD COLUMN `three_months_bank_statement` VARCHAR(255) DEFAULT NULL,
ADD COLUMN `six_months_bank_statement` VARCHAR(255) DEFAULT NULL,
ADD COLUMN `three_months_bank_signed_and_stamped_statement` VARCHAR(255) DEFAULT NULL,
ADD COLUMN `six_months_bank_signed_and_stamped_statement` VARCHAR(255) DEFAULT NULL;

ALTER TABLE visa_application_fields 
ADD COLUMN status ENUM('pending', 'approved', 'rejected', 'cancelled', 'expired', 'processing', 'completed') DEFAULT 'pending' NOT NULL;

CREATE INDEX idx_visa_application_fields_status ON visa_application_fields(status);

ALTER TABLE `visa_application_fields` 
ADD COLUMN `remark` TEXT DEFAULT NULL,
ADD COLUMN `reference_number` VARCHAR(100) DEFAULT NULL,
ADD COLUMN `uploaded_document` VARCHAR(255) DEFAULT NULL;

ALTER TABLE `visa_applications` 
ADD COLUMN `amendment_enabled` BOOLEAN DEFAULT FALSE NOT NULL AFTER `discount`,
CHANGE COLUMN `status` `status` ENUM('pending_payment', 'pending', 'approved', 'rejected', 'cancelled', 'expired', 'processing', 'completed', 'vendor_assigned', 'vendor_accepted', 'vendor_rejected') DEFAULT 'pending_payment' NOT NULL;

CREATE TABLE IF NOT EXISTS `coupons` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(50) NOT NULL UNIQUE,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `discount_type` ENUM('percentage', 'fixed_amount') NOT NULL DEFAULT 'percentage',
    `discount_value` DECIMAL(10,2) NOT NULL,
    `minimum_order_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `maximum_discount_amount` DECIMAL(10,2) NULL,
    `usage_limit` INT NULL,
    `used_count` INT NOT NULL DEFAULT 0,
    `per_user_limit` INT NULL DEFAULT 1,
    `valid_from` DATETIME NOT NULL,
    `valid_until` DATETIME NOT NULL,
    `user_types` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
    `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE,
    `created_by` VARCHAR(36) NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    PRIMARY KEY (`id`),
    UNIQUE KEY `unique_code` (`code`),
    KEY `idx_active_deleted` (`is_active`, `is_deleted`),
    KEY `idx_validity_dates` (`valid_from`, `valid_until`),
    KEY `idx_discount_type` (`discount_type`),
    KEY `idx_created_by` (`created_by`)
);

ALTER TABLE `visa_applications` 
ADD COLUMN `amendment_enabled_until` DATETIME NULL,
ADD COLUMN `amendment_duration_hours` INT NULL;

ALTER TABLE `visa_application_fields` 
ADD COLUMN `aadhar_card` VARCHAR(255) DEFAULT NULL;

ALTER TABLE `visa_form_fields` 
ADD COLUMN `aadhar_card` TINYINT(1) DEFAULT 0;

ALTER TABLE `visas` 
ADD COLUMN `b2c_price` DECIMAL(10,2) NOT NULL,
ADD COLUMN `b2c_processing_type` ENUM("hour", "day") NOT NULL,
ADD COLUMN `b2c_processing_time` SMALLINT NOT NULL,
ADD COLUMN `b2c_discount` DECIMAL(10,2) DEFAULT 0,
CHANGE COLUMN `base_price` `base_price` DECIMAL(10,2) DEFAULT 0,
CHANGE COLUMN `processing_time_standard` `processing_time_standard` DECIMAL(10,2) DEFAULT 0,
CHANGE COLUMN `processing_price_standard` `processing_price_standard` DECIMAL(10,2) DEFAULT 0,
CHANGE COLUMN `processing_time_express` `processing_time_express` DECIMAL(10,2) DEFAULT 0,
CHANGE COLUMN `processing_price_express` `processing_price_express` DECIMAL(10,2) DEFAULT 0,
CHANGE COLUMN `processing_time_urgent` `processing_time_urgent` DECIMAL(10,2) DEFAULT 0,
CHANGE COLUMN `processing_price_urgent` `processing_price_urgent` DECIMAL(10,2) DEFAULT 0;

ALTER TABLE `calendar` 
ADD COLUMN `name` VARCHAR(255) NOT NULL;

CREATE TABLE coupon_usages (
    `id` CHAR(36) NOT NULL,
    `coupon_id` CHAR(36) NOT NULL COMMENT 'Reference to the coupon used',
    `user_id` CHAR(36) NOT NULL COMMENT 'User who used the coupon',
    `visa_application_id` CHAR(36) NOT NULL COMMENT 'Visa application where coupon was used',
    `discount_amount` DECIMAL(10,2) NOT NULL COMMENT 'Actual discount amount applied',
    `original_amount` DECIMAL(10,2) NOT NULL COMMENT 'Original amount before discount',
    `final_amount` DECIMAL(10,2) NOT NULL COMMENT 'Final amount after discount',
    `user_type` ENUM('user', 'vendor') NOT NULL COMMENT 'Type of user who used the coupon',
    `used_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the coupon was used',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
);

ALTER TABLE `visa_applications` 
ADD COLUMN `coupon_code` VARCHAR(50) NULL COMMENT 'Applied coupon code';

ALTER TABLE `visa_applications` 
ADD COLUMN `coupon_id` CHAR(36) NULL COMMENT 'Reference to applied coupon',
ADD INDEX idx_visa_applications_coupon_id (coupon_id);

ALTER TABLE `visa_applications` 
ADD COLUMN `amendment_duration_minutes` INT DEFAULT 0 AFTER `amendment_duration_hours`;

UPDATE `visa_applications` 
SET `amendment_duration_minutes` = 0 WHERE `amendment_duration_minutes` IS NULL;

ALTER TABLE `visa_form_fields` 
ADD COLUMN `passport_external_cover` TINYINT(1) DEFAULT 0 AFTER `aadhar_card`;

ALTER TABLE `visa_application_fields` 
ADD COLUMN `passport_external_cover` VARCHAR(255) NULL COMMENT 'Path to uploaded passport external cover document';

ALTER TABLE `user` 
ADD COLUMN `profile` VARCHAR(200) NULL AFTER `auth_provider`;

ALTER TABLE `countries` 
ADD COLUMN `allow_minor_to_apply` TINYINT(1) DEFAULT 0;

-- Make B2B and B2C pricing fields nullable to allow visas targeted for specific user types
ALTER TABLE `visas` 
MODIFY COLUMN `b2b_price` DECIMAL(10, 2) NULL,
MODIFY COLUMN `b2b_processing_type` ENUM('hour', 'day') NULL,
MODIFY COLUMN `b2b_processing_time` SMALLINT NULL,
MODIFY COLUMN `b2b_discount` DECIMAL(10, 2) NULL DEFAULT 0,
MODIFY COLUMN `b2c_price` DECIMAL(10, 2) NULL,
MODIFY COLUMN `b2c_processing_type` ENUM('hour', 'day') NULL,
MODIFY COLUMN `b2c_processing_time` SMALLINT NULL,
MODIFY COLUMN `b2c_discount` DECIMAL(10, 2) NULL DEFAULT 0;