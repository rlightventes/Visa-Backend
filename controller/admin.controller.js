const resolveImageUrl = (imagePath) => {
    if (!imagePath) return '';
    const cleanPath = imagePath.trim();
    if (!cleanPath) return '';
    if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
        if (cleanPath.includes('res.cloudinary.com') && cleanPath.endsWith('.pdf')) {
            return cleanPath.replace('/image/upload/', '/raw/upload/');
        }
        return cleanPath;
    }
    if (cleanPath.startsWith('/opt/') || cleanPath.startsWith('/var/') || cleanPath.startsWith('/home/') || cleanPath.startsWith('/root/')) {
        return '';
    }
    const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '');
    const filePath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
    return `${baseUrl}${filePath}`;
};

// FIX (v4): fl_attachment triggers Cloudinary's on-the-fly transformation
// restrictions (blocked when "Strict Transformations" is enabled), since
// every upload has a unique filename and each fl_attachment:<filename>
// counts as a brand-new, never-whitelisted transformation. This affected
// raw PDFs first, and the same problem hits image uploads (jpg/png) like
// flight_booking photos too.
//
// Our own proxy route in app.js already sets Content-Disposition on the
// response to force a proper download filename, so we no longer need
// Cloudinary to do any URL-based transformation at all. Just return the
// resolved URL as-is for every resource type.
const withDownloadFilename = (url) => {
    return url;
};


const db = require("../models");
const { Op, fn, col, literal, where } = require('sequelize');
const bcrypt = require("bcrypt");
const { sendUserAccountEmail, sendVisaStatusUpdateEmail, sendVisaAssignmentEmail, sendAmendmentNotificationEmail, sendVisaApplicationStatusUpdateEmail } = require("../services/email.service");
const jwt = require("jsonwebtoken");
const { getVisaApplicationCode } = require("../commonFunctions/commonFunction");
const moment = require('moment');
const notificationService = require("../services/notification.service");
const { sendTravellerStatusUpdateEmail } = require('../services/email.service');

exports.createAdmin = async (req, res) => {
    try {
        const data = req.body;
        const userTypeId = req?.user?.id;

        if (!data.email) {
            return res
                .status(400)
                .json({ success: false, message: "Email Required!!!" });
        }

        // Check if user already exists with same email or phone (only among non-deleted users)
        const checkExistingUser = await db.User.findOne({
            where: {
                [Op.or]: [
                    { email: data.email?.trim() },
                    { phone: data.phone?.trim() }
                ],
                is_deleted: 0
            }
        });

        if (checkExistingUser) {
            if (checkExistingUser.email === data.email?.trim()) {
                return res.status(400).json({ success: false, message: "Admin with this email already exists !!!" });
            }
            if (checkExistingUser.phone === data.phone?.trim()) {
                return res.status(400).json({ success: false, message: "Admin with this phone number already exists !!!" });
            }
        }

        const addData = {
            first_name: data.first_name,
            last_name: data.last_name,
            email: data.email,
            phone: data.phone,
            user_type: "admin",
            created_by: userTypeId,
            password: await bcrypt.hash(data.password, 10),
            is_active: 1,
            country_id: data.country_id,
        };

        const newUser = await db.User.create(addData);
        /** send email to registered */
        const emailSuccess = await sendUserAccountEmail(
            {
                email: data.email,
                username: `${data.first_name} ${data.last_name}`,
                mobile: data.phone || "NA",
                user_type: "admin",
            },
            data?.password || null
        );

        if (!emailSuccess) {
            return res.status(500).json({
                success: false,
                message: "Failed to send account email. Please try again later.",
            });
        }

        if (data.permission?.length) {
            // [
            //     {
            //         moduleId: '',
            //         permissionIds: ['', '']
            //     }
            // ]

            for (const ele of data.permission) {
                const moduleData = await db.UserModule.create({
                    module_id: ele.moduleId,
                    user_id: newUser.id,
                });
                if (moduleData && ele.permissionIds?.length) {
                    for (const pr of ele.permissionIds) {
                        await db.UserPermission.create({
                            user_id: newUser.id,
                            user_module_id: ele.moduleId,
                            permission_id: pr,
                        });
                    }
                }
            }
        }

        if (data.userCountries?.length) {
            for (const uc of data.userCountries) {
                await db.UserCountries.create({
                    user_id: newUser.id,
                    country_id: uc,
                });
            }
        }

        return res
            .status(201)
            .json({ success: true, message: "Admin added successfully!!!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.updateAdmin = async (req, res) => {
    try {
        const id = req.params.id || req.user.id;
        const updateData = req.body;

        if (!id) {
            return res.status(400).json({ success: false, message: "Admin ID is required" });
        }

        const existingAdmin = await db.User.findByPk(id);
        if (!existingAdmin) {
            return res.status(404).json({ success: false, message: "Admin not found" });
        }

        // Check if email or phone is being changed and if they're already in use by other non-deleted users
        if (updateData.email && updateData.email !== existingAdmin.email) {
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

        if (updateData.phone && updateData.phone !== existingAdmin.phone) {
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

        if (updateData.password) {
            updateData.password = await bcrypt.hash(updateData.password, 10);
        }

        await db.User.update(updateData, { where: { id } });

        if (updateData.userCountries?.length) {
            await db.UserCountries.destroy({
                where: {
                    user_id: existingAdmin.id
                }
            });
            for (const uc of updateData.userCountries) {
                await db.UserCountries.create({
                    user_id: existingAdmin.id,
                    country_id: uc
                })
            }
        }

        const updatedVendor = await db.User.findByPk(id);
        res.status(200).json({ success: true, message: "Admin updated successfully", data: updatedVendor });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.getAdminById = async (req, res) => {
    try {
        const id = req.params.id || req.user.id;
        const admin = await db.User.findOne({
            where: {
                id: id,
                is_deleted: 0
            },
            attributes: [
                'id',
                'first_name',
                'last_name',
                'email',
                'phone',
                'country_id',
            ]
        });

        if (!admin) {
            return res.status(404).json({ success: false, message: "Admin not found" });
        }

        res.status(200).json({ success: true, data: admin });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.getCountries = async (req, res) => {
    try {
        const countries = await db.Country.findAll({
            where: { is_active: true, is_deleted: false },
            attributes: ['id', 'name'],
            order: [[`name`, `ASC`]]
        });

        res.status(200).json({
            success: true,
            message: "Success",
            data: countries
        });
    } catch (error) {
        console.error("getCountries error:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.getModulesPermissions = async (req, res) => {
    try {
        const modules = await db.Module.findAll({
            attributes: ['id', 'name'],
            include: [
                {
                    model: db.Permission,
                    as: 'permissions',
                    required: false,
                    attributes: ['id', 'name']
                }
            ],
            order: [[`created_at`, `DESC`]]
        });

        res.status(200).json({
            success: true,
            message: "Success",
            data: modules
        });
    } catch (error) {
        console.error("getModulesPermissions error:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.getAdmins = async (req, res) => {
    try {
        let { page, limit, searchQuery, status } = req.query;
        const userId = req?.user?.id;


        page = parseInt(page) || 1;
        limit = parseInt(limit) || 10;
        const offset = (page - 1) * limit;

        let where = {
            is_deleted: 0,
            user_type: 'admin',
            id: {
                [Op.ne]: userId
            }
        };

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

        if (status) {
            where.is_active = status;
        }

        const totalUsers = await db.User.count({ where });

        const rows = await db.User.findAll({
            where,
            attributes: [
                'id',
                'unique_code',
                'first_name',
                'last_name',
                'phone',
                'email',
                'is_active',
                [
                    fn(
                        'DATE_FORMAT',
                        fn(
                            'CONVERT_TZ',
                            col('User.created_at'),
                            '+00:00',
                            '+05:30'
                        ),
                        '%Y-%m-%d %h:%i %p'
                    ),
                    'created_at'
                ],
            ],
            include: [
                {
                    model: db.Country,
                    as: 'country',
                    required: false,
                    attributes: ['name']
                }
            ],
            limit,
            offset,
            order: [['createdAt', 'DESC']]
        });

        res.status(200).json({
            success: true,
            currentPage: page,
            totalPages: Math.ceil(totalUsers / limit),
            totalRecords: totalUsers,
            data: rows
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.deleteAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const existingAdmin = await db.User.findByPk(id);

        if (!existingAdmin) {
            return res.status(404).json({ success: false, message: "Admin not found" });
        }

        await db.User.update({ is_deleted: 1 }, { where: { id } });
        await db.UserCountries.destroy({
            where: {
                user_id: existingAdmin.id,
            }
        });
        await db.UserModule.destroy({
            where: {
                user_id: existingAdmin.id,
            }
        });
        await db.UserPermission.destroy({
            where: {
                user_id: existingAdmin.id,
            }
        });
        res.status(200).json({ success: true, message: "Admin deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.createCountry = async (req, res) => {
    try {
        const {
            name = '',
            iso2 = '',
            iso3 = '',
            phonecode = '',
            currency = '',
            capital = '',
            region = '',
            subregion = '',
            allow_minor_to_apply = false,
        } = req.body;

        const countryName = name.trim();

        if (!countryName) {
            return res.status(400).json({ success: false, message: "Country name is required." });
        }

        const existingCountry = await db.Country.findOne({
            where: where(
                fn('LOWER', col('name')),
                countryName.toLowerCase()
            )
        });

        if (existingCountry) {
            return res.status(400).json({ success: false, message: "Country already exists." });
        }

        // Create new country
        const newCountry = await db.Country.create({
            name: countryName,
            iso2: iso2.trim(),
            iso3: iso3.trim(),
            phonecode: phonecode.trim(),
            currency: currency.trim(),
            capital: capital.trim(),
            region: region.trim(),
            subregion: subregion.trim(),
            allow_minor_to_apply: allow_minor_to_apply
        });

        return res.status(201).json({
            success: true,
            message: "Country added successfully!",
            data: newCountry
        });

    } catch (error) {
        console.error('Error adding country:', error);
        return res.status(500).json({
            success: false,
            message: "Internal server error.",
            error: error.message
        });
    }
};

exports.updateCountry = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            iso2,
            iso3,
            phonecode,
            currency,
            capital,
            region,
            subregion,
            allow_minor_to_apply
        } = req.body;

        const country = await db.Country.findByPk(id);
        if (!country) {
            return res.status(404).json({ success: false, message: "Country not found." });
        }

        // Check for duplicate name (case-insensitive, excluding current record)
        if (name) {
            const duplicate = await db.Country.findOne({
                where: {
                    name: where(
                        fn('LOWER', col('name')),
                        name.toLowerCase()
                    ),
                    id: { [Op.ne]: id }
                }
            });

            if (duplicate) {
                return res.status(400).json({ success: false, message: "Another country with the same name already exists." });
            }
        }

        await country.update({
            name: name?.trim() || country.name,
            iso2: iso2?.trim() || country.iso2,
            iso3: iso3?.trim() || country.iso3,
            phonecode: phonecode?.trim() || country.phonecode,
            currency: currency?.trim() || country.currency,
            capital: capital?.trim() || country.capital,
            region: region?.trim() || country.region,
            subregion: subregion?.trim() || country.subregion,
            allow_minor_to_apply: allow_minor_to_apply !== undefined ? allow_minor_to_apply : country.allow_minor_to_apply
        });

        return res.json({ success: true, message: "Country updated successfully.", data: country });

    } catch (error) {
        console.error('Error updating country:', error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.getCountryDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const country = await db.Country.findByPk(id);
        if (!country) {
            return res.status(404).json({ success: false, message: "Country not found." });
        }

        return res.json({ success: true, data: country });

    } catch (error) {
        console.error('Error fetching country details:', error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.toggleCountryStatus = async (req, res) => {
    try {
        const { id, is_active } = req.body;

        const country = await db.Country.findByPk(id);
        if (!country) {
            return res.status(404).json({ success: false, message: "Country not found." });
        }

        await country.update({ is_active: is_active });

        return res.json({
            success: true,
            message: `Country has been ${is_active ? 'activated' : 'deactivated'} successfully.`,
            data: { id: country.id, is_active: is_active }
        });

    } catch (error) {
        console.error('Error toggling status:', error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.getCountryList = async (req, res) => {
    try {
        let { page, limit, searchQuery } = req.query;

        page = parseInt(page) || 1;
        limit = parseInt(limit) || 10;
        const offset = (page - 1) * limit;

        let where = { is_deleted: 0 }

        if (searchQuery) {
            where = {
                ...where,
                [Op.or]: [
                    { name: { [Op.like]: `%${searchQuery}%` } },
                    { iso2: { [Op.like]: `%${searchQuery}%` } },
                    { iso3: { [Op.like]: `%${searchQuery}%` } },
                    { currency: { [Op.like]: `%${searchQuery}%` } },
                    { phonecode: { [Op.like]: `%${searchQuery}%` } },
                ]
            }
        }

        const totalCountry = await db.Country.count({ where });

        const rows = await db.Country.findAll({
            where,
            attributes: [
                'id',
                'name',
                'iso2',
                'iso3',
                'phonecode',
                'currency',
                'capital',
                'subregion',
                'is_active',
                [
                    fn(
                        'DATE_FORMAT',
                        fn(
                            'CONVERT_TZ',
                            col('created_at'),
                            '+00:00',
                            '+05:30'
                        ),
                        '%Y-%m-%d %h:%i %p'
                    ),
                    'created_at'
                ],
            ],
            limit,
            offset,
            order: [['created_at', 'DESC']]
        });

        res.status(200).json({
            success: true,
            currentPage: page,
            totalPages: Math.ceil(totalCountry / limit),
            totalRecords: totalCountry,
            data: rows
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.deleteCountry = async (req, res) => {
    try {
        const { id } = req.params;
        const existingCountry = await db.Country.findByPk(id);

        if (!existingCountry) {
            return res.status(404).json({ success: false, message: "Country not found" });
        }

        await db.Country.update({ is_deleted: 1 }, { where: { id } });
        res.status(200).json({ success: true, message: "Country deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.createEligibilityCriteria = async (req, res) => {
    try {
        const { name, is_active } = req.body;

        const existingCriteria = await db.EligibilityCriterion.findOne({
            where: { name: name }
        });

        if (existingCriteria) {
            return res.status(400).json({ success: false, message: "Criteria already exists" });
        }

        let imageUrl = null;

        if (req.files?.img?.length) {
            imageUrl = req.files.img[0].path;
        }

        const newCriteria = await db.EligibilityCriterion.create({
            name: name,
            image_url: imageUrl,
            is_active: is_active
        });

        return res.status(201).json({ success: true, message: "Criteria added successfully", data: newCriteria });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.updateEligibilityCriteria = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, is_active } = req.body;

        const existingCriteria = await db.EligibilityCriterion.findByPk(id);
        if (!existingCriteria) {
            return res.status(404).json({ success: false, message: "Criteria not found" });
        }

        let imageUrl = existingCriteria.image_url;

        if (req.files?.img?.length) {
            imageUrl = req.files.img[0].path;
        }

        await existingCriteria.update({ name, image_url: imageUrl, is_active });

        return res.json({ success: true, message: "Criteria updated successfully", data: existingCriteria });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.getEligibilityCriteriaById = async (req, res) => {
    try {
        const { id } = req.params;
        const criteria = await db.EligibilityCriterion.findByPk(id, {
            attributes: ['id', 'name', 'image_url', 'is_active']
        });
        if (!criteria) {
            return res.status(404).json({ success: false, message: "Criteria not found" });
        }

        return res.json({ success: true, data: criteria });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.getEligibilityCriteriaList = async (req, res) => {
    try {
        let { page, limit, searchQuery } = req.query;

        page = parseInt(page) || 1;
        limit = parseInt(limit) || 10;
        const offset = (page - 1) * limit;

        let where = { is_deleted: 0 }

        if (searchQuery) {
            where = { ...where, name: { [Op.like]: `%${searchQuery}%` } };
        }

        const totalCriteria = await db.EligibilityCriterion.count({ where });

        const criteria = await db.EligibilityCriterion.findAll({
            attributes: ['id', 'name', 'image_url', 'is_active'],
            where,
            limit,
            offset,
            order: [['created_at', 'DESC']]
        });

        return res.json({
            success: true,
            currentPage: page,
            totalPages: Math.ceil(totalCriteria / limit),
            totalRecords: totalCriteria,
            data: criteria
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.deleteEligibilityCriteria = async (req, res) => {
    try {
        const { id } = req.params;
        const existingCriteria = await db.EligibilityCriterion.findByPk(id);
        if (!existingCriteria) {
            return res.status(404).json({ success: false, message: "Criteria not found" });
        }

        await existingCriteria.update({ is_deleted: 1 });

        return res.json({ success: true, message: "Criteria deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.toggleEligibilityCriteriaStatus = async (req, res) => {
    try {
        const { id, is_active } = req.body;

        const criteria = await db.EligibilityCriterion.findByPk(id);
        if (!criteria) {
            return res.status(404).json({ success: false, message: "Criteria not found" });
        }

        await db.EligibilityCriterion.update({ is_active }, { where: { id } });

        return res.json({ success: true, message: "Criteria status updated successfully", data: { id: criteria.id, is_active: is_active } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.addVisaDynamicForm = async (req, res) => {
    try {
        const { country_id } = req.body;

        const existingForm = await db.VisaFormField.findOne({
            where: { country_id }
        });

        if (existingForm) {
            return res.status(400).json({ success: false, message: "Form already exists" });
        }

        const newForm = await db.VisaFormField.create({ ...req.body, country_id });

        return res.status(201).json({ success: true, message: "Form added successfully", data: newForm });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.updateVisaDynamicForm = async (req, res) => {
    try {
        const { id } = req.params;

        const existingForm = await db.VisaFormField.findByPk(id);
        if (!existingForm) {
            return res.status(404).json({ success: false, message: "Form not found" });
        }

        await existingForm.update({ ...req.body });

        return res.json({ success: true, message: "Form updated successfully", data: existingForm });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.getVisaDynamicFormById = async (req, res) => {
    try {
        const { id } = req.params;
        const form = await db.VisaFormField.findOne({
            where: {
                id: id,
                is_deleted: 0
            },
            include: [
                {
                    model: db.Country,
                    as: 'country',
                    attributes: ['name']
                }
            ]
        });
        if (!form) {
            return res.status(404).json({ success: false, message: "Form not found" });
        }

        return res.json({ success: true, data: form });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.getVisaDynamicFormList = async (req, res) => {
    try {
        let { page, limit, searchQuery } = req.query;

        page = parseInt(page) || 1;
        limit = parseInt(limit) || 10;
        const offset = (page - 1) * limit;

        let where = { is_deleted: 0 };

        if (searchQuery) {
            where = { ...where, country_id: { [Op.like]: `%${searchQuery}%` } };
        }

        const totalForm = await db.VisaFormField.count({ where });

        const form = await db.VisaFormField.findAll({
            where,
            include: [
                {
                    model: db.Country,
                    as: 'country',
                    attributes: []
                }
            ],
            attributes: ['id', 'country_id', 'is_active', [col('country.name'), 'countryName']],
            limit,
            offset,
            order: [['created_at', 'DESC']]
        });

        return res.json({
            success: true,
            currentPage: page,
            totalPages: Math.ceil(totalForm / limit),
            totalRecords: totalForm,
            data: form
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.deleteVisaDynamicForm = async (req, res) => {
    try {
        const { id } = req.params;
        const existingForm = await db.VisaFormField.findByPk(id);
        if (!existingForm) {
            return res.status(404).json({ success: false, message: "Form not found" });
        }

        await existingForm.update({ is_deleted: 1 });

        return res.json({ success: true, message: "Form deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.toggleVisaDynamicFormStatus = async (req, res) => {
    try {
        const { id, is_active } = req.body;

        const form = await db.VisaFormField.findByPk(id);
        if (!form) {
            return res.status(404).json({ success: false, message: "Form not found" });
        }

        await db.VisaFormField.update({ is_active }, { where: { id } });

        return res.json({ success: true, message: "Form status updated successfully", data: { id: form.id, is_active: is_active } });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// Get all visa applications
exports.getAllVisaApplications = async (req, res) => {
    try {
        const user = req.user;

        const { status, search, page = 1, limit = 10, countryId, visaType, fromDate, toDate } = req.query;
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 10;
        const offset = (pageNum - 1) * limitNum;

        // Prepare filter conditions
        let whereConditions = {
            status: {
                [Op.not]: 'pending_payment'
            }
        };

        const includeVisa = {
            model: db.Visa,
            as: 'visa',
            attributes: ['id', 'name', 'visa_type', 'entry_type', 'validity_days', 'created_by', 'country_id'],
            include: [
                {
                    model: db.Country,
                    as: 'country',
                    required: true,
                    attributes: ['id', 'name']
                }
            ]
        };

        // if (user.user_type === 'admin') {
        //     includeVisa.where = {
        //         created_by: user.id
        //     };
        // }

        if (user.user_type === 'vendor') {
            whereConditions.assign_to = user.id;
        }

        if (status) {
            whereConditions.status = status;
        }

        // Add country filter if provided
        if (countryId) {
            includeVisa.where = {
                ...includeVisa.where,
                country_id: countryId
            };
        }

        if (visaType) {
            includeVisa.where = {
                ...includeVisa.where,
                visa_type: visaType
            };
        }

        if (fromDate && toDate) {
            whereConditions.departure_date = {
                [Op.gte]: fromDate
            };

            whereConditions.return_date = {
                [Op.lte]: toDate
            };
        }

        // Add search functionality
        if (search) {
            whereConditions[Op.or] = [
                { application_id: { [Op.like]: `%${search}%` } },
                { reference_number: { [Op.like]: `%${search}%` } },
                // { status: { [Op.like]: `%${search}%` } },
                { '$user.first_name$': { [Op.like]: `%${search}%` } },
                { '$user.last_name$': { [Op.like]: `%${search}%` } },
                { '$user.email$': { [Op.like]: `%${search}%` } },
                { '$user.phone$': { [Op.like]: `%${search}%` } },
                { '$visa.name$': { [Op.like]: `%${search}%` } },
                { '$visa.visa_type$': { [Op.like]: `%${search}%` } },
                { '$visa.country.name$': { [Op.like]: `%${search}%` } }
            ];
        }

        // Get accurate count first (without the one-to-many payment include that causes issues)
        const count = await db.VisaApplication.count({
            where: whereConditions,
            include: [
                {
                    model: db.User,
                    as: 'user',
                    required: true,
                    attributes: [],
                    where: {
                        is_deleted: 0
                    }
                },
                {
                    model: db.User,
                    as: 'assign_to_user',
                    required: false,
                    attributes: [],
                    where: {
                        is_deleted: 0
                    }
                },
                includeVisa,
                {
                    model: db.VisaApplicationPayment,
                    as: 'visa_application_payments',
                    attributes: [],
                    required: false,
                },
            ],
            distinct: true
        });

        // Find applications with pagination
        const applications = await db.VisaApplication.findAll({
            where: whereConditions,
            include: [
                {
                    model: db.User,
                    as: 'user',
                    required: true,
                    attributes: ['id', 'first_name', 'last_name', 'email', 'phone', 'company_name'],
                    where: {
                        is_deleted: 0
                    }
                },
                {
                    model: db.User,
                    as: 'assign_to_user',
                    required: false,
                    attributes: ['id', 'email', 'phone', 'company_name'],
                    where: {
                        is_deleted: 0
                    }
                },
                includeVisa,
                {
                    model: db.VisaApplicationPayment,
                    as: 'visa_application_payments',
                    attributes: ['id', 'amount', 'payment_status'],
                    required: false,
                },
            ],
            order: [['created_at', 'DESC']],
            limit: limitNum,
            offset: offset
        });

        applications.forEach((application) => {
            if (!application.user.first_name) {
                application.user.first_name = application.user.company_name;
            }
        });

        // Calculate pagination info
        const totalPages = Math.ceil(count / limitNum);

        return res.status(200).json({
            success: true,
            message: 'Visa applications retrieved successfully',
            data: applications,
            currentPage: pageNum,
            totalPages: totalPages,
            totalRecords: count,
            limit: limitNum
        });
    } catch (error) {
        console.error('getAllVisaApplications error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Get single visa application details
exports.getVisaApplicationDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const application = await db.VisaApplication.findOne({
            where: { id },
            include: [
                {
                    model: db.User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'email', 'phone']
                },
                {
                    model: db.Visa,
                    as: 'visa',
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
                    model: db.VisaApplicationPayment,
                    as: 'visa_application_payments',
                    where: {
                        payment_status: 'completed'
                    },
                    required: false
                },
                {
                    model: db.Coupon,
                    as: 'coupon',
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

        // FIX (v2): The previous version applied fl_attachment (forced
        // download) to EVERY document field, including passport/ID photos
        // that need to display inline as <img> — that broke photo previews.
        // Now only genuine downloadable documents (bookings, statements,
        // certificates) get the forced-filename treatment; photos just get
        // a clean resolved URL so they keep displaying inline as before.
        const inlinePhotoFieldNames = [
            'passport_size_photo', 'passport_front_photo', 'passport_back_photo',
            'pan_card_photo', 'itr_1st_year_photo', 'itr_2nd_year_photo', 'itr_3rd_year_photo',
            'aadhar_card', 'passport_external_cover'
        ];
        const downloadableDocFieldNames = [
            'vaccination_certificate', 'medical_insurance_certificate', 'employment_letter',
            'proof_of_funds', 'flight_booking', 'travel_insurance', 'travel_itinerary',
            'hotel_booking', 'invitation_letter', 'three_months_bank_statement',
            'six_months_bank_statement', 'three_months_bank_signed_and_stamped_statement',
            'six_months_bank_signed_and_stamped_statement', 'uploaded_document'
        ];

        const applicationData = application.toJSON();

        if (applicationData.uploaded_document) {
            applicationData.uploaded_document = withDownloadFilename(resolveImageUrl(applicationData.uploaded_document));
        }

        if (Array.isArray(applicationData.visa_application_fields)) {
            applicationData.visa_application_fields = applicationData.visa_application_fields.map(field => {
                const updatedField = { ...field };
                inlinePhotoFieldNames.forEach(fieldName => {
                    if (updatedField[fieldName]) {
                        updatedField[fieldName] = resolveImageUrl(updatedField[fieldName]);
                    }
                });
                downloadableDocFieldNames.forEach(fieldName => {
                    if (updatedField[fieldName]) {
                        updatedField[fieldName] = withDownloadFilename(resolveImageUrl(updatedField[fieldName]));
                    }
                });
                return updatedField;
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Visa application details retrieved successfully',
            data: applicationData
        });
    } catch (error) {
        console.error('getVisaApplicationDetails error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Update visa application status
exports.updateVisaApplication = async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
        const { id } = req.params;
        const { status, reference_number, remark } = req.body;

        // Validate status
        const validStatuses = ['pending', 'approved', 'rejected', 'cancelled', 'expired', 'processing', 'completed'];
        if (!validStatuses.includes(status)) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: 'Invalid status value'
            });
        }

        // Find the application
        const application = await db.VisaApplication.findOne({
            where: { id }
        });

        if (!application) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: 'Visa application not found'
            });
        }

        if (req.files) {
            const files = req.files;
            const uploadedDocument = files.visa_document?.[0]?.path || null;
            await application.update({ uploaded_document: uploadedDocument }, { transaction: t });
        }

        // Update status
        await application.update({
            status,
            reference_number,
            remark
        }, { transaction: t });

        // Get application details with user and visa for email
        const applicationWithDetails = await db.VisaApplication.findOne({
            where: { id },
            include: [
                {
                    model: db.User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'email', 'phone']
                },
                {
                    model: db.Visa,
                    as: 'visa',
                    include: [
                        {
                            model: db.Country,
                            as: 'country',
                            attributes: ['name']
                        }
                    ]
                }
            ],
            transaction: t
        });

        await t.commit();

        // Send notification for visa status update
        try {
            if (applicationWithDetails) {
                const oldStatus = application.status; // Get the old status before update
                const updatedBy = req.user; // Get the admin who made the update

                await notificationService.handleVisaStatusUpdate(
                    applicationWithDetails,
                    oldStatus,
                    status,
                    updatedBy
                );
            }
        } catch (notificationError) {
            console.error('Failed to send visa status update notification:', notificationError);
            // Don't fail the response if notification fails
        }

        // Send status update email (only for approved/rejected status)
        if ((status === 'approved' || status === 'rejected' || status === 'cancelled') && applicationWithDetails) {
            try {
                // Get the uploaded document path from the updated application
                const uploadedDocumentPath = applicationWithDetails.uploaded_document;
                const assignedBy = await db.User.findByPk(applicationWithDetails.assigned_by);

                const emailData = {
                    user: {
                        first_name: applicationWithDetails.user.first_name,
                        last_name: applicationWithDetails.user.last_name,
                        email: applicationWithDetails.user.email
                    },
                    visa: {
                        name: applicationWithDetails.visa?.name || 'Visa Application',
                    },
                    application: {
                        application_id: applicationWithDetails.application_id,
                        number_of_travellers: applicationWithDetails.number_of_travellers,
                        departure_date: applicationWithDetails.departure_date,
                        return_date: applicationWithDetails.return_date,
                        remark: remark
                    },
                    status: status,
                    reference_number: reference_number,
                    uploaded_document: uploadedDocumentPath,
                    vendor_type: req.user.vendor_type,
                    assigned_by: assignedBy
                };

                await sendVisaStatusUpdateEmail(emailData);
            } catch (emailError) {
                console.error('Failed to send visa status update email:', emailError);
                // Don't fail the update response if email fails
            }
        }

        return res.status(200).json({
            success: true,
            message: `Visa application status updated to ${status} successfully`
        });
    } catch (error) {
        await t.rollback();
        console.error('updateVisaApplicationStatus error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

exports.getPayments = async (req, res) => {
    try {
        const user = req.user;
        let { page, limit, searchQuery } = req.query;

        page = parseInt(page) || 1;
        limit = parseInt(limit) || 10;
        const offset = (page - 1) * limit;

        let where = {};

        let visaInclude = {
            model: db.Visa,
            as: 'visa',
            required: true,
            attributes: ['id', 'name', 'visa_type', 'entry_type', 'validity_days']
        }

        if (user.user_type === 'admin') {
            visaInclude.where = {
                created_by: user.id
            };
        }

        if (searchQuery) {
            where = {
                ...where, [Op.or]: [
                    { '$visa_application.application_id$': { [Op.like]: `%${searchQuery}%` } },
                    { '$visa_application.reference_number$': { [Op.like]: `%${searchQuery}%` } },
                    { amount: { [Op.like]: `%${searchQuery}%` } },
                    { payment_status: { [Op.like]: `%${searchQuery}%` } },
                    { '$user.first_name$': { [Op.like]: `%${searchQuery}%` } },
                    { '$user.last_name$': { [Op.like]: `%${searchQuery}%` } },
                    { '$user.email$': { [Op.like]: `%${searchQuery}%` } },
                    { '$user.phone$': { [Op.like]: `%${searchQuery}%` } },
                    { '$visa_application.visa.name$': { [Op.like]: `%${searchQuery}%` } },
                    { '$visa_application.visa.visa_type$': { [Op.like]: `%${searchQuery}%` } },
                    { '$visa_application.visa.entry_type$': { [Op.like]: `%${searchQuery}%` } },
                ]
            };
        }

        const { count, rows: payments } = await db.VisaApplicationPayment.findAndCountAll({
            where,
            include: [
                {
                    model: db.VisaApplication,
                    as: 'visa_application',
                    required: true,
                    attributes: ['id', 'application_id', 'reference_number'],
                    include: [
                        visaInclude
                    ]
                },
                {
                    model: db.User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'email', 'phone']
                },
            ],
            order: [['created_at', 'DESC']],
            limit,
            offset
        });

        return res.status(200).json({
            success: true,
            message: 'Payments retrieved successfully',
            data: payments,
            currentPage: page,
            totalPages: Math.ceil(count / limit),
            totalRecords: count
        });
    } catch (error) {
        console.error('getPayments error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// Admin Dashboard API
exports.getAdminDashboard = async (req, res) => {
    try {
        const user = req.user;

        // Get current date and calculate previous month dates
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();

        // Calculate previous month
        let previousMonth = currentMonth - 1;
        let previousYear = currentYear;
        if (previousMonth === 0) {
            previousMonth = 12;
            previousYear = currentYear - 1;
        }

        // Current month date range
        const currentMonthStart = new Date(currentYear, currentMonth - 1, 1);
        const currentMonthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59);

        // Previous month date range
        const previousMonthStart = new Date(previousYear, previousMonth - 1, 1);
        const previousMonthEnd = new Date(previousYear, previousMonth, 0, 23, 59, 59);

        // Helper function to calculate percentage change
        const calculatePercentageChange = (current, previous) => {
            if (previous === 0) return current > 0 ? 100 : 0;
            return Number(((current - previous) / previous * 100).toFixed(1));
        };

        // Helper function to build role-based where conditions for payments
        const buildRoleBasedWhere = (baseWhere = {}, includeTimeRange = false, isCurrentMonth = true) => {
            let whereCondition = { ...baseWhere };

            if (includeTimeRange) {
                whereCondition.created_at = {
                    [Op.between]: isCurrentMonth ? [currentMonthStart, currentMonthEnd] : [previousMonthStart, previousMonthEnd]
                };
            }

            // Role-based filtering for payments
            if (user.user_type === 'vendor') {
                if (user.vendor_type === 'regular') {
                    // Regular vendors see only their own created visas
                    whereCondition['$visa_application.visa.created_by$'] = user.id;
                } else if (user.vendor_type === 'third-party') {
                    // Third-party vendors see only applications assigned to them
                    whereCondition['$visa_application.assign_to$'] = user.id;
                }
            } else if (user.user_type === 'admin') {
                // Admins see only visas created by them or assigned to them
                whereCondition[Op.or] = [
                    { '$visa_application.visa.created_by$': user.id },
                    { '$visa_application.assign_to$': user.id }
                ];
            }
            // Super-admin sees everything (no additional filtering)

            return whereCondition;
        };

        // Helper function to build visa application where conditions
        const buildVisaApplicationWhere = (baseWhere = {}, includeTimeRange = false, isCurrentMonth = true) => {
            let whereCondition = { ...baseWhere };

            if (includeTimeRange) {
                whereCondition.created_at = {
                    [Op.between]: isCurrentMonth ? [currentMonthStart, currentMonthEnd] : [previousMonthStart, previousMonthEnd]
                };
            }

            // Role-based filtering for visa applications
            if (user.user_type === 'vendor') {
                if (user.vendor_type === 'regular') {
                    whereCondition['$visa.created_by$'] = user.id;
                } else if (user.vendor_type === 'third-party') {
                    whereCondition.assign_to = user.id;
                }
            } else if (user.user_type === 'admin') {
                whereCondition[Op.or] = [
                    { '$visa.created_by$': user.id },
                    { assign_to: user.id }
                ];
            }

            return whereCondition;
        };

        // 1. Total Payment Received with role-based filtering
        const currentPaymentWhere = buildRoleBasedWhere({
            payment_status: 'completed'
        }, true, true);

        const previousPaymentWhere = buildRoleBasedWhere({
            payment_status: 'completed'
        }, true, false);

        const overallPaymentWhere = buildRoleBasedWhere({
            payment_status: 'completed'
        });

        const [currentPayments, previousPayments, overallPayment] = await Promise.all([
            db.VisaApplicationPayment.findOne({
                where: currentPaymentWhere,
                attributes: [[fn('SUM', col('VisaApplicationPayment.amount')), 'total']],
                include: [
                    {
                        model: db.VisaApplication,
                        as: 'visa_application',
                        attributes: [],
                        include: [
                            {
                                model: db.Visa,
                                as: 'visa',
                                attributes: []
                            }
                        ]
                    }
                ],
                raw: true
            }),
            db.VisaApplicationPayment.findOne({
                where: previousPaymentWhere,
                attributes: [[fn('SUM', col('VisaApplicationPayment.amount')), 'total']],
                include: [
                    {
                        model: db.VisaApplication,
                        as: 'visa_application',
                        attributes: [],
                        include: [
                            {
                                model: db.Visa,
                                as: 'visa',
                                attributes: []
                            }
                        ]
                    }
                ],
                raw: true
            }),
            db.VisaApplicationPayment.findOne({
                where: overallPaymentWhere,
                attributes: [[fn('SUM', col('VisaApplicationPayment.amount')), 'total']],
                include: [
                    {
                        model: db.VisaApplication,
                        as: 'visa_application',
                        attributes: [],
                        include: [
                            {
                                model: db.Visa,
                                as: 'visa',
                                attributes: []
                            }
                        ]
                    }
                ],
                raw: true
            })
        ]);

        const totalPaymentReceived = parseFloat(currentPayments?.total || 0);
        const previousTotalPayment = parseFloat(previousPayments?.total || 0);
        const overallTotalPayment = parseFloat(overallPayment?.total || 0);
        const paymentPercentageChange = calculatePercentageChange(totalPaymentReceived, previousTotalPayment);

        // 2. User Counts (Admin/Vendor/Regular Users) - Role-based visibility
        let userCountPromises = [];

        if (user.user_type === 'super-admin') {
            // Super-admin sees all user counts
            userCountPromises = [
                // Current month admins
                db.User.count({
                    where: {
                        user_type: 'admin',
                        is_deleted: 0,
                        created_at: {
                            [Op.between]: [currentMonthStart, currentMonthEnd]
                        }
                    }
                }),
                // Previous month admins
                db.User.count({
                    where: {
                        user_type: 'admin',
                        is_deleted: 0,
                        created_at: {
                            [Op.between]: [previousMonthStart, previousMonthEnd]
                        }
                    }
                }),
                // Total admins
                db.User.count({
                    where: { user_type: 'admin', is_deleted: 0 }
                }),
                // Current month vendors
                db.User.count({
                    where: {
                        user_type: 'vendor',
                        is_deleted: 0,
                        created_at: {
                            [Op.between]: [currentMonthStart, currentMonthEnd]
                        }
                    }
                }),
                // Previous month vendors
                db.User.count({
                    where: {
                        user_type: 'vendor',
                        is_deleted: 0,
                        created_at: {
                            [Op.between]: [previousMonthStart, previousMonthEnd]
                        }
                    }
                }),
                // Total vendors
                db.User.count({
                    where: { user_type: 'vendor', is_deleted: 0 }
                }),
                // Current month users
                db.User.count({
                    where: {
                        user_type: 'user',
                        is_deleted: 0,
                        created_at: {
                            [Op.between]: [currentMonthStart, currentMonthEnd]
                        }
                    }
                }),
                // Previous month users
                db.User.count({
                    where: {
                        user_type: 'user',
                        is_deleted: 0,
                        created_at: {
                            [Op.between]: [previousMonthStart, previousMonthEnd]
                        }
                    }
                }),
                // Total users
                db.User.count({
                    where: { user_type: 'user', is_deleted: 0 }
                })
            ];
        } else if (user.user_type === 'admin') {
            // Admins see vendors they created and users who applied for their visas
            userCountPromises = [
                // Current month vendors created by this admin
                db.User.count({
                    where: {
                        user_type: 'vendor',
                        created_by: user.id,
                        is_deleted: 0,
                        created_at: {
                            [Op.between]: [currentMonthStart, currentMonthEnd]
                        }
                    }
                }),
                // Previous month vendors
                db.User.count({
                    where: {
                        user_type: 'vendor',
                        created_by: user.id,
                        is_deleted: 0,
                        created_at: {
                            [Op.between]: [previousMonthStart, previousMonthEnd]
                        }
                    }
                }),
                // Total vendors created by this admin
                db.User.count({
                    where: {
                        user_type: 'vendor',
                        created_by: user.id,
                        is_deleted: 0
                    }
                }),
                // Current month unique users who applied for this admin's visas
                db.VisaApplication.count({
                    distinct: true,
                    col: 'user_id',
                    where: {
                        created_at: {
                            [Op.between]: [currentMonthStart, currentMonthEnd]
                        },
                        [Op.or]: [
                            { '$visa.created_by$': user.id },
                            { assign_to: user.id }
                        ]
                    },
                    include: [
                        {
                            model: db.Visa,
                            as: 'visa',
                            attributes: []
                        }
                    ]
                }),
                // Previous month users
                db.VisaApplication.count({
                    distinct: true,
                    col: 'user_id',
                    where: {
                        created_at: {
                            [Op.between]: [previousMonthStart, previousMonthEnd]
                        },
                        [Op.or]: [
                            { '$visa.created_by$': user.id },
                            { assign_to: user.id }
                        ]
                    },
                    include: [
                        {
                            model: db.Visa,
                            as: 'visa',
                            attributes: []
                        }
                    ]
                }),
                // Total unique users
                db.VisaApplication.count({
                    distinct: true,
                    col: 'user_id',
                    where: {
                        [Op.or]: [
                            { '$visa.created_by$': user.id },
                            { assign_to: user.id }
                        ]
                    },
                    include: [
                        {
                            model: db.Visa,
                            as: 'visa',
                            attributes: []
                        }
                    ]
                })
            ];
        } else {
            // Vendors only see limited user metrics
            userCountPromises = [
                // Current month users who applied for this vendor's visas
                db.VisaApplication.count({
                    distinct: true,
                    col: 'user_id',
                    where: {
                        created_at: {
                            [Op.between]: [currentMonthStart, currentMonthEnd]
                        },
                        ...(user.vendor_type === 'regular'
                            ? { '$visa.created_by$': user.id }
                            : { assign_to: user.id }
                        )
                    },
                    include: [
                        {
                            model: db.Visa,
                            as: 'visa',
                            attributes: []
                        }
                    ]
                }),
                // Previous month users
                db.VisaApplication.count({
                    distinct: true,
                    col: 'user_id',
                    where: {
                        created_at: {
                            [Op.between]: [previousMonthStart, previousMonthEnd]
                        },
                        ...(user.vendor_type === 'regular'
                            ? { '$visa.created_by$': user.id }
                            : { assign_to: user.id }
                        )
                    },
                    include: [
                        {
                            model: db.Visa,
                            as: 'visa',
                            attributes: []
                        }
                    ]
                }),
                // Total users
                db.VisaApplication.count({
                    distinct: true,
                    col: 'user_id',
                    where: {
                        ...(user.vendor_type === 'regular'
                            ? { '$visa.created_by$': user.id }
                            : { assign_to: user.id }
                        )
                    },
                    include: [
                        {
                            model: db.Visa,
                            as: 'visa',
                            attributes: []
                        }
                    ]
                })
            ];
        }

        const userCounts = await Promise.all(userCountPromises);

        // Parse user count results based on user type
        let currentAdmins = 0, previousAdmins = 0, totalAdmins = 0;
        let currentVendors = 0, previousVendors = 0, totalVendors = 0;
        let currentUsers = 0, previousUsers = 0, totalUsers = 0;

        if (user.user_type === 'super-admin') {
            [currentAdmins, previousAdmins, totalAdmins,
                currentVendors, previousVendors, totalVendors,
                currentUsers, previousUsers, totalUsers] = userCounts;
        } else if (user.user_type === 'admin') {
            [currentVendors, previousVendors, totalVendors,
                currentUsers, previousUsers, totalUsers] = userCounts;
        } else {
            [currentUsers, previousUsers, totalUsers] = userCounts;
        }

        const adminPercentageChange = calculatePercentageChange(currentAdmins, previousAdmins);
        const vendorPercentageChange = calculatePercentageChange(currentVendors, previousVendors);
        const userPercentageChange = calculatePercentageChange(currentUsers, previousUsers);

        // 3. Visa Application Metrics with role-based filtering
        const currentVisaApplicationWhere = buildVisaApplicationWhere({}, true, true);
        const previousVisaApplicationWhere = buildVisaApplicationWhere({}, true, false);
        const totalVisaApplicationWhere = buildVisaApplicationWhere({});

        const [currentVisaRequests, previousVisaRequests, totalVisaRequests] = await Promise.all([
            db.VisaApplication.count({
                where: currentVisaApplicationWhere,
                include: user.user_type === 'vendor' || user.user_type === 'admin' ? [{
                    model: db.Visa,
                    as: 'visa',
                    attributes: []
                }] : []
            }),
            db.VisaApplication.count({
                where: previousVisaApplicationWhere,
                include: user.user_type === 'vendor' || user.user_type === 'admin' ? [{
                    model: db.Visa,
                    as: 'visa',
                    attributes: []
                }] : []
            }),
            db.VisaApplication.count({
                where: totalVisaApplicationWhere,
                include: user.user_type === 'vendor' || user.user_type === 'admin' ? [{
                    model: db.Visa,
                    as: 'visa',
                    attributes: []
                }] : []
            })
        ]);

        const visaRequestPercentageChange = calculatePercentageChange(currentVisaRequests, previousVisaRequests);

        // 4. Status-based Visa Application Metrics
        const statusMetrics = ['pending', 'approved', 'rejected', 'processing', 'completed'];
        const statusResults = {};

        for (const status of statusMetrics) {
            const currentStatusWhere = buildVisaApplicationWhere({ status }, true, true);
            const previousStatusWhere = buildVisaApplicationWhere({ status }, true, false);
            const totalStatusWhere = buildVisaApplicationWhere({ status });

            const [currentCount, previousCount, totalCount] = await Promise.all([
                db.VisaApplication.count({
                    where: currentStatusWhere,
                    include: user.user_type === 'vendor' || user.user_type === 'admin' ? [{
                        model: db.Visa,
                        as: 'visa',
                        attributes: []
                    }] : []
                }),
                db.VisaApplication.count({
                    where: previousStatusWhere,
                    include: user.user_type === 'vendor' || user.user_type === 'admin' ? [{
                        model: db.Visa,
                        as: 'visa',
                        attributes: []
                    }] : []
                }),
                db.VisaApplication.count({
                    where: totalStatusWhere,
                    include: user.user_type === 'vendor' || user.user_type === 'admin' ? [{
                        model: db.Visa,
                        as: 'visa',
                        attributes: []
                    }] : []
                })
            ]);

            const percentageChange = calculatePercentageChange(currentCount, previousCount);

            statusResults[status] = {
                count: totalCount,
                percentageChange: percentageChange,
                trend: percentageChange >= 0 ? 'increase' : 'decrease',
                changeText: `${Math.abs(percentageChange)}% ${percentageChange >= 0 ? 'increase' : 'decrease'} from last month`,
                currentMonth: currentCount,
                previousMonth: previousCount
            };
        }

        // 5. Additional metrics for different user types
        let additionalMetrics = {};

        if (user.user_type === 'super-admin' || user.user_type === 'admin') {
            // Get visa counts by type for admins
            const visaTypeWhere = user.user_type === 'admin'
                ? { created_by: user.id, is_deleted: 0 }
                : { is_deleted: 0 };

            const visasByType = await db.Visa.findAll({
                where: visaTypeWhere,
                attributes: [
                    'visa_type',
                    [fn('COUNT', col('Visa.id')), 'count']
                ],
                group: ['visa_type'],
                raw: true
            });

            additionalMetrics.visasByType = visasByType.reduce((acc, visa) => {
                acc[visa.visa_type] = parseInt(visa.count);
                return acc;
            }, {});

            // Get top performing countries
            const topCountries = await db.VisaApplication.findAll({
                where: buildVisaApplicationWhere({
                    created_at: {
                        [Op.between]: [currentMonthStart, currentMonthEnd]
                    }
                }),
                include: [
                    {
                        model: db.Visa,
                        as: 'visa',
                        attributes: [],
                        include: [
                            {
                                model: db.Country,
                                as: 'country',
                                attributes: []
                            }
                        ]
                    }
                ],
                attributes: [
                    [col('visa.country.name'), 'country_name'],
                    [fn('COUNT', col('VisaApplication.id')), 'application_count']
                ],
                group: ['visa.country_id', 'visa.country.name'],
                order: [[fn('COUNT', col('VisaApplication.id')), 'DESC']],
                limit: 5,
                raw: true
            });

            additionalMetrics.topCountries = topCountries.map(item => ({
                country: item.country_name || 'Unknown',
                applications: parseInt(item.application_count)
            }));
        }

        // Prepare comprehensive dashboard response
        const dashboardData = {
            totalPaymentReceived: {
                amount: overallTotalPayment,
                formattedAmount: `₹${overallTotalPayment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
                percentageChange: paymentPercentageChange,
                trend: paymentPercentageChange >= 0 ? 'increase' : 'decrease',
                changeText: `${Math.abs(paymentPercentageChange)}% ${paymentPercentageChange >= 0 ? 'increase' : 'decrease'} from last month`,
                currentMonth: totalPaymentReceived,
                previousMonth: previousTotalPayment
            },
            userMetrics: {
                ...(user.user_type === 'super-admin' && {
                    totalAdmin: {
                        count: totalAdmins,
                        percentageChange: adminPercentageChange,
                        trend: adminPercentageChange >= 0 ? 'increase' : 'decrease',
                        changeText: `${Math.abs(adminPercentageChange)}% ${adminPercentageChange >= 0 ? 'increase' : 'decrease'} from last month`,
                        currentMonth: currentAdmins,
                        previousMonth: previousAdmins
                    }
                }),
                ...(user.user_type !== 'vendor' || user.vendor_type === 'regular') && {
                    totalVendors: {
                        count: totalVendors,
                        percentageChange: vendorPercentageChange,
                        trend: vendorPercentageChange >= 0 ? 'increase' : 'decrease',
                        changeText: `${Math.abs(vendorPercentageChange)}% ${vendorPercentageChange >= 0 ? 'increase' : 'decrease'} from last month`,
                        currentMonth: currentVendors,
                        previousMonth: previousVendors
                    }
                },
                totalUsers: {
                    count: totalUsers,
                    percentageChange: userPercentageChange,
                    trend: userPercentageChange >= 0 ? 'increase' : 'decrease',
                    changeText: `${Math.abs(userPercentageChange)}% ${userPercentageChange >= 0 ? 'increase' : 'decrease'} from last month`,
                    currentMonth: currentUsers,
                    previousMonth: previousUsers
                }
            },
            visaApplicationMetrics: {
                totalVisaRequests: {
                    count: totalVisaRequests,
                    percentageChange: visaRequestPercentageChange,
                    trend: visaRequestPercentageChange >= 0 ? 'increase' : 'decrease',
                    changeText: `${Math.abs(visaRequestPercentageChange)}% ${visaRequestPercentageChange >= 0 ? 'increase' : 'decrease'} from last month`,
                    currentMonth: currentVisaRequests,
                    previousMonth: previousVisaRequests
                },
                statusBreakdown: statusResults
            },
            additionalMetrics,
            userContext: {
                userId: user.id,
                userType: user.user_type,
                vendorType: user.vendor_type,
                accessLevel: user.user_type === 'super-admin' ? 'full' :
                    user.user_type === 'admin' ? 'admin' :
                        user.vendor_type === 'regular' ? 'vendor-regular' : 'vendor-third-party'
            },
            summary: {
                currentMonth: currentMonth,
                currentYear: currentYear,
                previousMonth: previousMonth,
                previousYear: previousYear,
                dataGeneratedAt: new Date().toISOString()
            }
        };

        return res.status(200).json({
            success: true,
            message: 'Dashboard data retrieved successfully',
            data: dashboardData
        });

    } catch (error) {
        console.error('getAdminDashboard error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

exports.assignVisaApplication = async (req, res) => {
    try {
        const id = req.params.id;
        const { assigned_to } = req.body;

        // Find the visa application with all necessary relations
        const visaApplication = await db.VisaApplication.findOne({
            where: { id: id },
            include: [
                {
                    model: db.User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'email', 'phone']
                },
                {
                    model: db.Visa,
                    as: 'visa',
                    attributes: ['id', 'name', 'visa_type', 'entry_type', 'validity_days'],
                    include: [
                        {
                            model: db.Country,
                            as: 'country',
                            attributes: ['id', 'name']
                        }
                    ]
                }
            ]
        });

        if (!visaApplication) {
            return res.status(404).json({
                success: false,
                message: 'Visa application not found'
            });
        }

        // Find the vendor being assigned
        const vendor = await db.User.findOne({
            where: {
                id: assigned_to,
                user_type: 'vendor',
                is_active: 1,
                is_deleted: 0
            },
            attributes: ['id', 'first_name', 'last_name', 'email', 'vendor_type']
        });

        if (!vendor) {
            return res.status(404).json({
                success: false,
                message: 'Vendor not found or inactive'
            });
        }

        // Update the visa application assignment
        await db.VisaApplication.update({ 
            assign_to: assigned_to, 
            assign_by: req.user.id, 
            status: 'vendor_assigned' 
        }, { where: { id: id } });

        // Send assignment email to vendor
        try {
            const emailData = {
                vendor: {
                    first_name: vendor.first_name,
                    last_name: vendor.last_name,
                    email: vendor.email
                },
                user: {
                    first_name: visaApplication.user.first_name,
                    last_name: visaApplication.user.last_name,
                    email: visaApplication.user.email,
                    phone: visaApplication.user.phone
                },
                visa: {
                    name: visaApplication.visa.name,
                    visa_type: visaApplication.visa.visa_type,
                    entry_type: visaApplication.visa.entry_type
                },
                application: {
                    application_id: visaApplication.application_id,
                    number_of_travellers: visaApplication.number_of_travellers,
                    departure_date: visaApplication.departure_date,
                    return_date: visaApplication.return_date
                }
            };

            try {
                await notificationService.assignVisaApplication(visaApplication, visaApplication.visa, vendor);

            } catch (notificationError) {
                console.error('Failed to send payment/status notifications:', notificationError);
            }

            const emailSuccess = await sendVisaAssignmentEmail(emailData);

            if (!emailSuccess) {
                console.warn('Assignment email could not be sent, but assignment was successful');
            }
        } catch (emailError) {
            console.error('Failed to send assignment email:', emailError);
            // Don't fail the assignment if email fails
        }

        return res.status(200).json({
            success: true,
            message: 'Visa application assigned successfully'
        });
    } catch (error) {
        console.error('assignVisaApplication error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

exports.unassignVisaApplication = async (req, res) => {
    try {
        const id = req.params.id;

        // Find the visa application with all necessary relations
        const visaApplication = await db.VisaApplication.findOne({
            where: { id: id },
        });

        if (!visaApplication) {
            return res.status(404).json({
                success: false,
                message: 'Visa application not found'
            });
        }

        // Check if application is currently assigned
        if (!visaApplication.assign_to) {
            return res.status(400).json({
                success: false,
                message: 'Visa application is not currently assigned to any vendor'
            });
        }

        // Update the visa application to unassign
        await db.VisaApplication.update({ 
            assign_to: null, 
            assign_by: null, 
            status: 'pending' 
        }, { where: { id: id } });

        return res.status(200).json({
            success: true,
            message: 'Visa application unassigned successfully'
        });
    } catch (error) {
        console.error('unassignVisaApplication error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

exports.getThirdPartyVendors = async (req, res) => {
    try {
        const user = req.user;

        const whereConditions = {};

        // if (user.user_type === 'admin') {
        //     whereConditions.created_by = user.id;
        // }

        const thirdPartyVendors = await db.User.findAll({
            where: {
                user_type: 'vendor',
                vendor_type: 'third-party',
                is_active: 1,
                is_deleted: 0,
                ...whereConditions
            },
            attributes: ['id', 'company_name', 'first_name', 'last_name', 'email', 'phone']
        });
        return res.status(200).json({
            success: true,
            message: 'Third party vendors fetched successfully',
            data: thirdPartyVendors
        });
    } catch (error) {
        console.error('getThirdPartyVendors error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
}

exports.addCalendar = async (req, res) => {
    try {
        const { country_id, from_date, to_date, name } = req.body;

        const existingHolidays = await db.Calendar.findAll({
            where: {
                country_id: country_id,
                [Op.and]: [
                    { from_date: { [Op.lte]: to_date } },
                    { to_date: { [Op.gte]: from_date } }
                ]
            }
        });

        if (existingHolidays.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Holiday dates overlap with existing holiday "${existingHolidays[0].name}" for this country`,
                conflictingHoliday: {
                    name: existingHolidays[0].name,
                    from_date: existingHolidays[0].from_date,
                    to_date: existingHolidays[0].to_date
                }
            });
        }

        const calendar = await db.Calendar.create({
            country_id,
            from_date,
            to_date,
            name
        });
        return res.status(200).json({
            success: true,
            message: 'Calendar added successfully',
            data: calendar
        });
    } catch (error) {
        console.error('addCalendar error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
}

exports.updateCalendar = async (req, res) => {
    try {
        const id = req.params.id;
        const { country_id, from_date, to_date, name } = req.body;

        const existingHolidays = await db.Calendar.findAll({
            where: {
                country_id: country_id,
                id: { [Op.ne]: id },
                [Op.and]: [
                    { from_date: { [Op.lte]: to_date } },
                    { to_date: { [Op.gte]: from_date } }
                ]
            }
        });

        if (existingHolidays.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Holiday dates overlap with existing holiday "${existingHolidays[0].name}" for this country`,
                conflictingHoliday: {
                    name: existingHolidays[0].name,
                    from_date: existingHolidays[0].from_date,
                    to_date: existingHolidays[0].to_date
                }
            });
        }

        const calendar = await db.Calendar.update({
            country_id,
            from_date,
            to_date,
            name
        }, { where: { id: id } });
        return res.status(200).json({
            success: true,
            message: 'Calendar updated successfully',
            data: calendar
        });
    } catch (error) {
        console.error('updateCalendar error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
}

exports.getCalendarById = async (req, res) => {
    try {
        const id = req.params.id;
        const calendar = await db.Calendar.findOne({ where: { id: id } });
        return res.status(200).json({
            success: true,
            message: 'Calendar fetched successfully',
            data: calendar
        });
    } catch (error) {
        console.error('getCalendarById error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
}

exports.getCalendarList = async (req, res) => {
    try {
        let { page, limit, search, country_id, from_date, to_date } = req.query;

        page = parseInt(page) || 1;
        limit = parseInt(limit) || 10;
        const offset = (page - 1) * limit;

        let where = {};

        // Search filter - search in holiday name
        if (search) {
            where.name = { [Op.like]: `%${search}%` };
        }

        // Country filter
        if (country_id) {
            where.country_id = country_id;
        }

        // Date range filter
        if (from_date && to_date) {
            where[Op.or] = [
                // Holiday starts within the date range
                {
                    from_date: {
                        [Op.gte]: from_date,
                        [Op.lte]: to_date
                    }
                },
                // Holiday ends within the date range
                {
                    to_date: {
                        [Op.gte]: from_date,
                        [Op.lte]: to_date
                    }
                },
                // Holiday spans the entire date range
                {
                    from_date: { [Op.lte]: from_date },
                    to_date: { [Op.gte]: to_date }
                }
            ];
        } else if (from_date) {
            // Only from_date provided - holidays that end on or after from_date
            where.to_date = { [Op.gte]: from_date };
        } else if (to_date) {
            // Only to_date provided - holidays that start on or before to_date
            where.from_date = { [Op.lte]: to_date };
        }

        const totalCalendar = await db.Calendar.count({ where });

        const calendar = await db.Calendar.findAll({
            where,
            include: [
                {
                    model: db.Country,
                    as: 'country',
                    required: false,
                    attributes: ['name']
                }
            ],
            limit,
            offset,
            order: [
                ['from_date', 'DESC'],
                ['created_at', 'DESC']
            ]
        });

        return res.status(200).json({
            success: true,
            message: 'Calendar list fetched successfully',
            currentPage: page,
            totalPages: Math.ceil(totalCalendar / limit),
            totalRecords: totalCalendar,
            data: calendar
        });
    } catch (error) {
        console.error('getCalendarList error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
}

exports.deleteCalendar = async (req, res) => {
    try {
        const id = req.params.id;
        await db.Calendar.destroy({ where: { id: id } });
        return res.status(200).json({
            success: true,
            message: 'Calendar deleted successfully'
        });
    } catch (error) {
        console.error('deleteCalendar error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
}

exports.directLogin = async (req, res) => {
    try {
        const id = req.params.id;
        const user = await db.User.findOne({ where: { id: id } });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        const token = jwt.sign({ id: user.id, email: user.email, user_type: user.user_type, vendor_type: user.vendor_type, name: user.first_name + ' ' + user.last_name }, process.env.JWT_SECRET, { expiresIn: '1h' });

        let dt = {
            login_url: `${process.env.USER_FRONTEND_URL}/dashboard?token=${token}`,
            token,
        }

        console.log(user.dataValues);


        if (user.user_type === 'admin') {
            dt.login_url = `${process.env.ADMIN_FRONTEND_URL}?token=${token}`;
        } else if (user.user_type === 'vendor') {
            if (user.vendor_type === 'regular') {
                dt.login_url = `${process.env.VENDOR_FRONTEND_URL}/dashboard?token=${token}`;
            } else if (user.vendor_type === 'third-party') {
                dt.login_url = `${process.env.THIRD_PARTY_FRONTEND_URL}?token=${token}`;
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            data: dt
        });
    } catch (error) {
        console.error('directLogin error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Update individual traveller status
exports.updateTravellerStatus = async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
        const { fieldId } = req.params;
        const { status, remark, reference_number } = req.body;

        // Validate status
        const validStatuses = ['pending', 'approved', 'rejected', 'cancelled', 'expired', 'processing', 'completed'];
        if (!validStatuses.includes(status)) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: 'Invalid status value. Valid statuses are: ' + validStatuses.join(', ')
            });
        }

        // Find the traveller record
        const travellerField = await db.VisaApplicationField.findOne({
            where: { id: fieldId },
            include: [
                {
                    model: db.VisaApplication,
                    as: 'visa_application',
                    include: [
                        {
                            model: db.User,
                            as: 'user',
                            attributes: ['id', 'first_name', 'last_name', 'email', 'phone']
                        },
                        {
                            model: db.Visa,
                            as: 'visa',
                            include: [
                                {
                                    model: db.Country,
                                    as: 'country',
                                    attributes: ['name']
                                }
                            ]
                        }
                    ]
                }
            ]
        });

        if (!travellerField) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: 'Traveller record not found'
            });
        }

        let uploadedDocument = travellerField.uploaded_document;
        if (req.files) {
            const files = req.files;
            uploadedDocument = files.visa_document?.[0]?.path || null;
        }

        const previousStatus = travellerField.status;

        // Update traveller status
        await travellerField.update({
            status,
            remark: remark || null,
            reference_number: reference_number || null,
            uploaded_document: uploadedDocument
        }, { transaction: t });

        // Send notification for traveller status update
        try {
            if (previousStatus !== status) {
                const updatedBy = req.user;
                const travellerName = `${travellerField.first_name} ${travellerField.last_name}`.trim();

                // Notify user about traveller status change
                const statusMessages = {
                    'pending': 'is now pending review',
                    'approved': 'has been approved! 🎉',
                    'rejected': 'has been rejected',
                    'cancelled': 'has been cancelled',
                    'expired': 'has expired',
                    'processing': 'is now being processed',
                    'completed': 'has been completed! ✅'
                };

                const statusMessage = statusMessages[status] || `status has been updated to ${status}`;

                const recipients = [];
                // Always notify super-admin
                const superAdmins = await db.User.findAll({
                    where: {
                        user_type: 'super-admin',
                        is_active: 1,
                        is_deleted: 0
                    },
                    attributes: ['id']
                });

                recipients.push(...superAdmins.map(admin => admin.id));

                if (updatedBy.vendor_type !== 'third-party') {
                    recipients.push(travellerField.visa_application.user_id);
                }

                await notificationService.createAndSendNotification({
                    type: notificationService.notificationTypes.VISA_STATUS_UPDATED,
                    title: 'Traveller Status Updated',
                    message: `${travellerName} ${statusMessage}`,
                    recipients: recipients,
                    senderId: updatedBy.id,
                    reference_id: travellerField.visa_application_id,
                    data: {
                        travellerId: fieldId,
                        travellerName: travellerName,
                        applicationId: travellerField.visa_application_id,
                        previousStatus: previousStatus,
                        newStatus: status,
                        remark: remark,
                        reference_number: reference_number,
                        uploaded_document: uploadedDocument
                    },
                    redirectUrl: `/applications/${travellerField.visa_application_id}`
                });

                // Send email notification for all status changes (not just final ones)
                try {
                    const emailData = {
                        user: {
                            first_name: travellerField.visa_application.user.first_name,
                            last_name: travellerField.visa_application.user.last_name,
                            email: travellerField.visa_application.user.email
                        },
                        traveller: {
                            first_name: travellerField.first_name,
                            last_name: travellerField.last_name,
                            passport_number: travellerField.passport_number
                        },
                        visa: {
                            name: travellerField.visa_application.visa?.name || 'Visa Application',
                            country: travellerField.visa_application.visa?.country?.name || 'Unknown'
                        },
                        application: {
                            application_id: travellerField.visa_application.application_id,
                            departure_date: travellerField.visa_application.departure_date,
                            return_date: travellerField.visa_application.return_date,
                            remark: remark,
                            reference_number: reference_number,
                            uploaded_document: uploadedDocument
                        },
                        status: status
                    };

                    await sendTravellerStatusUpdateEmail(emailData);
                } catch (emailError) {
                    console.error('Failed to send traveller status update email:', emailError);
                    // Don't fail the transaction if email fails
                }
            }
        } catch (notificationError) {
            console.error('Failed to send traveller status update notification:', notificationError);
            // Don't fail the transaction if notification fails
        }

        // Commit transaction after all operations are successful
        await t.commit();

        return res.status(200).json({
            success: true,
            message: `Traveller status updated to ${status} successfully`,
            data: {
                travellerId: fieldId,
                previousStatus: previousStatus,
                newStatus: status,
                travellerName: `${travellerField.first_name} ${travellerField.last_name}`.trim(),
                reference_number: reference_number,
                remark: remark,
                updatedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        await t.rollback();
        console.error('updateTravellerStatus error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Update visa application amendment flag with time-based expiry
exports.updateVisaApplicationAmendment = async (req, res) => {
    try {
        const { id } = req.params;
        const reqUser = req.user;
        const { amendment_enabled, duration_hours, duration_minutes } = req.body;

        // Validate amendment_enabled is boolean
        if (typeof amendment_enabled !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'amendment_enabled must be a boolean value'
            });
        }

        // Find and update the application
        const application = await db.VisaApplication.findByPk(id);

        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Visa application not found'
            });
        }

        let updateData = {
            amendment_enabled: amendment_enabled,
            updated_at: new Date()
        };

        // If enabling amendment and duration is provided, calculate expiry time
        if (amendment_enabled && (duration_hours > 0 || duration_minutes > 0)) {
            const enabledUntil = new Date();

            // Add hours if provided
            if (duration_hours && duration_hours > 0) {
                enabledUntil.setHours(enabledUntil.getHours() + duration_hours);
            }

            // Add minutes if provided
            if (duration_minutes && duration_minutes > 0) {
                enabledUntil.setMinutes(enabledUntil.getMinutes() + duration_minutes);
            }

            updateData.amendment_enabled_until = enabledUntil;
            updateData.amendment_duration_hours = duration_hours || 0;
            updateData.amendment_duration_minutes = duration_minutes || 0;

            // Send amendment notification email to user
            try {
                // Get user and visa details for email
                const user = await db.User.findByPk(application.user_id);
                const visa = await db.Visa.findByPk(application.visa_id);
                const assignedBy = await db.User.findByPk(application.assigned_by);

                if (user && visa) {
                    const emailData = {
                        user: user,
                        visa: visa,
                        application: application,
                        amendment_enabled: amendment_enabled,
                        duration_hours: duration_hours || 0,
                        duration_minutes: duration_minutes || 0,
                        amendment_enabled_until: updateData.amendment_enabled_until,
                        vendor_type: reqUser.vendor_type,
                        assigned_by: assignedBy
                    };

                    await sendAmendmentNotificationEmail(emailData);
                }
            } catch (emailError) {
                console.error('Failed to send amendment notification email:', emailError);
                // Don't fail the main operation if email fails
            }

        } else if (!amendment_enabled) {
            // If disabling, clear the expiry fields
            updateData.amendment_enabled_until = null;
            updateData.amendment_duration_hours = 0;
            updateData.amendment_duration_minutes = 0;
        }

        await application.update(updateData);

        // Create duration message
        let durationMessage = '';
        if (amendment_enabled && (duration_hours > 0 || duration_minutes > 0)) {
            const parts = [];
            if (duration_hours > 0) {
                parts.push(`${duration_hours} hour${duration_hours !== 1 ? 's' : ''}`);
            }
            if (duration_minutes > 0) {
                parts.push(`${duration_minutes} minute${duration_minutes !== 1 ? 's' : ''}`);
            }
            durationMessage = ` for ${parts.join(' and ')}`;
        }

        const responseMessage = amendment_enabled
            ? `Amendment enabled${durationMessage} successfully`
            : 'Amendment disabled successfully';

        return res.status(200).json({
            success: true,
            message: responseMessage,
            data: {
                id: application.id,
                application_id: application.application_id,
                amendment_enabled: application.amendment_enabled,
                amendment_enabled_until: application.amendment_enabled_until,
                amendment_duration_hours: application.amendment_duration_hours,
                amendment_duration_minutes: application.amendment_duration_minutes
            }
        });
    } catch (error) {
        console.error('updateVisaApplicationAmendment error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
}

exports.updateVisaApplicationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        // Get current application with all related data for email
        const application = await db.VisaApplication.findOne({
            where: { id },
            include: [
                {
                    model: db.User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'email', 'user_type', 'company_name']
                },
                {
                    model: db.User,
                    as: 'assign_to_user',
                    attributes: ['id', 'first_name', 'last_name', 'email'],
                    required: false
                },
                {
                    model: db.User,
                    as: 'assign_by_user',
                    attributes: ['id', 'first_name', 'last_name', 'email'],
                    required: false
                },
                {
                    model: db.Visa,
                    as: 'visa',
                    attributes: ['id', 'name', 'country_id'],
                    include: [
                        {
                            model: db.Country,
                            as: 'country',
                            attributes: ['id', 'name']
                        }
                    ]
                }
            ]
        });

        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Visa application not found'
            });
        }

        // Store old status for email notification
        const oldStatus = application.status;

        let conditions = {
            status: status,
            updated_at: new Date()
        };

        if (status === 'vendor_rejected') {
            conditions.assign_to = null;
            conditions.assign_by = null;
        }

        await application.update(conditions);

        // Get admin user who made the update
        const updatedBy = await db.User.findByPk(req.user.id, {
            attributes: ['id', 'first_name', 'last_name', 'user_type']
        });

        // Send email notification if status actually changed
        if (oldStatus !== status) {
            try {
                await sendVisaApplicationStatusUpdateEmail({
                    application,
                    visa: application.visa,
                    user: application.user,
                    oldStatus,
                    newStatus: status,
                    updatedBy,
                    assignedAdmin: application.assign_to_user,
                    assignedBy: application.assign_by_user
                });
            } catch (emailError) {
                console.error('Failed to send visa application status update email:', emailError);
                // Don't fail the status update if email fails
            }
        }

        return res.status(200).json({
            success: true,
            message: `Status updated successfully`,
            data: {
                id: application.id,
                application_id: application.application_id,
                status: application.status
            }
        });
    } catch (error) {
        console.error('updateVisaApplicationStatus error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
}

// ===========================================
// COUPON MANAGEMENT CRUD OPERATIONS
// ===========================================

exports.createCoupon = async (req, res) => {
    try {
        const {
            code,
            name,
            description,
            discount_type,
            discount_value,
            minimum_order_amount,
            maximum_discount_amount,
            usage_limit,
            per_user_limit,
            valid_from,
            valid_until,
            user_types
        } = req.body;

        const userTypeId = req?.user?.id;

        // Validate required fields
        if (!code || !name || !discount_type || !discount_value || !valid_from || !valid_until) {
            return res.status(400).json({
                success: false,
                message: "Required fields: code, name, discount_type, discount_value, valid_from, valid_until"
            });
        }

        // Check if coupon code already exists
        const existingCoupon = await db.Coupon.findOne({
            where: {
                code: code.toUpperCase().trim(),
                is_deleted: false
            }
        });

        if (existingCoupon) {
            return res.status(400).json({
                success: false,
                message: "Coupon with this code already exists"
            });
        }

        // Validate dates
        const fromDate = new Date(valid_from);
        const untilDate = new Date(valid_until);

        if (fromDate >= untilDate) {
            return res.status(400).json({
                success: false,
                message: "Valid from date must be before valid until date"
            });
        }

        // Validate discount value
        if (discount_type === 'percentage' && (discount_value <= 0 || discount_value > 100)) {
            return res.status(400).json({
                success: false,
                message: "Percentage discount must be between 1 and 100"
            });
        }

        if (discount_type === 'fixed_amount' && discount_value <= 0) {
            return res.status(400).json({
                success: false,
                message: "Fixed amount discount must be greater than 0"
            });
        }

        const couponData = {
            code: code.toUpperCase().trim(),
            name: name.trim(),
            description: description?.trim() || null,
            discount_type,
            discount_value: parseFloat(discount_value),
            minimum_order_amount: minimum_order_amount ? parseFloat(minimum_order_amount) : 0,
            maximum_discount_amount: maximum_discount_amount ? parseFloat(maximum_discount_amount) : null,
            usage_limit: usage_limit ? parseInt(usage_limit) : null,
            per_user_limit: per_user_limit ? parseInt(per_user_limit) : 1,
            valid_from: fromDate,
            valid_until: untilDate,
            user_types: user_types || ['user', 'vendor'],
            created_by: userTypeId
        };

        const newCoupon = await db.Coupon.create(couponData);

        return res.status(201).json({
            success: true,
            message: "Coupon created successfully",
            data: newCoupon
        });

    } catch (error) {
        console.error('createCoupon error:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

exports.updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            description,
            discount_type,
            discount_value,
            minimum_order_amount,
            maximum_discount_amount,
            usage_limit,
            per_user_limit,
            valid_from,
            valid_until,
            user_types,
            is_active
        } = req.body;

        const existingCoupon = await db.Coupon.findOne({
            where: {
                id: id,
                is_deleted: false
            }
        });

        if (!existingCoupon) {
            return res.status(404).json({
                success: false,
                message: "Coupon not found"
            });
        }

        // Validate dates if provided
        if (valid_from && valid_until) {
            const fromDate = new Date(valid_from);
            const untilDate = new Date(valid_until);

            if (fromDate >= untilDate) {
                return res.status(400).json({
                    success: false,
                    message: "Valid from date must be before valid until date"
                });
            }
        }

        // Validate discount value if provided
        if (discount_type && discount_value) {
            if (discount_type === 'percentage' && (discount_value <= 0 || discount_value > 100)) {
                return res.status(400).json({
                    success: false,
                    message: "Percentage discount must be between 1 and 100"
                });
            }

            if (discount_type === 'fixed_amount' && discount_value <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Fixed amount discount must be greater than 0"
                });
            }
        }

        const updateData = {};

        if (name !== undefined) updateData.name = name.trim();
        if (description !== undefined) updateData.description = description?.trim() || null;
        if (discount_type !== undefined) updateData.discount_type = discount_type;
        if (discount_value !== undefined) updateData.discount_value = parseFloat(discount_value);
        if (minimum_order_amount !== undefined) updateData.minimum_order_amount = parseFloat(minimum_order_amount);
        if (maximum_discount_amount !== undefined) updateData.maximum_discount_amount = maximum_discount_amount ? parseFloat(maximum_discount_amount) : null;
        if (usage_limit !== undefined) updateData.usage_limit = usage_limit ? parseInt(usage_limit) : null;
        if (per_user_limit !== undefined) updateData.per_user_limit = per_user_limit ? parseInt(per_user_limit) : 1;
        if (valid_from !== undefined) updateData.valid_from = new Date(valid_from);
        if (valid_until !== undefined) updateData.valid_until = new Date(valid_until);
        if (user_types !== undefined) updateData.user_types = user_types;
        if (is_active !== undefined) updateData.is_active = is_active;

        updateData.updated_at = new Date();

        await existingCoupon.update(updateData);

        return res.status(200).json({
            success: true,
            message: "Coupon updated successfully",
            data: existingCoupon
        });

    } catch (error) {
        console.error('updateCoupon error:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

exports.getCouponById = async (req, res) => {
    try {
        const { id } = req.params;

        const coupon = await db.Coupon.findOne({
            where: {
                id: id,
                is_deleted: false
            },
            include: [
                {
                    model: db.User,
                    as: 'creator',
                    attributes: ['id', 'first_name', 'last_name', 'email'],
                    required: false
                }
            ]
        });

        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: "Coupon not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: coupon
        });

    } catch (error) {
        console.error('getCouponById error:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

exports.getCouponsList = async (req, res) => {
    try {
        let { page, limit, searchQuery, status, discount_type } = req.query;

        page = parseInt(page) || 1;
        limit = parseInt(limit) || 10;
        const offset = (page - 1) * limit;

        let where = { is_deleted: false };

        if (searchQuery) {
            where[Op.or] = [
                { code: { [Op.like]: `%${searchQuery}%` } },
                { name: { [Op.like]: `%${searchQuery}%` } },
                { description: { [Op.like]: `%${searchQuery}%` } }
            ];
        }

        if (status !== undefined) {
            where.is_active = status === 'true';
        }

        if (discount_type) {
            where.discount_type = discount_type;
        }

        const totalCoupons = await db.Coupon.count({ where });

        const coupons = await db.Coupon.findAll({
            where,
            attributes: [
                'id',
                'code',
                'name',
                'description',
                'discount_type',
                'discount_value',
                'minimum_order_amount',
                'maximum_discount_amount',
                'usage_limit',
                'used_count',
                'per_user_limit',
                'valid_from',
                'valid_until',
                'is_active',
                [
                    fn(
                        'DATE_FORMAT',
                        fn(
                            'CONVERT_TZ',
                            col('Coupon.created_at'),
                            '+00:00',
                            '+05:30'
                        ),
                        '%Y-%m-%d %h:%i %p'
                    ),
                    'created_at'
                ]
            ],
            include: [
                {
                    model: db.User,
                    as: 'creator',
                    attributes: ['first_name', 'last_name', 'email'],
                    required: false
                }
            ],
            limit,
            offset,
            order: [['created_at', 'DESC']]
        });

        // Add computed fields
        const couponsWithStatus = coupons.map(coupon => {
            const couponData = coupon.toJSON();
            const now = new Date();

            let statusText = 'Active';
            if (!couponData.is_active) {
                statusText = 'Inactive';
            } else if (now < new Date(couponData.valid_from)) {
                statusText = 'Not Started';
            } else if (now > new Date(couponData.valid_until)) {
                statusText = 'Expired';
            } else if (couponData.usage_limit && couponData.used_count >= couponData.usage_limit) {
                statusText = 'Usage Limit Reached';
            }

            return {
                ...couponData,
                status_text: statusText,
                usage_percentage: couponData.usage_limit ? Math.round((couponData.used_count / couponData.usage_limit) * 100) : null
            };
        });

        return res.status(200).json({
            success: true,
            currentPage: page,
            totalPages: Math.ceil(totalCoupons / limit),
            totalRecords: totalCoupons,
            data: couponsWithStatus
        });

    } catch (error) {
        console.error('getCouponsList error:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

exports.deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;

        const existingCoupon = await db.Coupon.findOne({
            where: {
                id: id,
                is_deleted: false
            }
        });

        if (!existingCoupon) {
            return res.status(404).json({
                success: false,
                message: "Coupon not found"
            });
        }

        await existingCoupon.update({
            is_deleted: true,
            updated_at: new Date()
        });

        return res.status(200).json({
            success: true,
            message: "Coupon deleted successfully"
        });

    } catch (error) {
        console.error('deleteCoupon error:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

exports.toggleCouponStatus = async (req, res) => {
    try {
        const { id, is_active } = req.body;

        const coupon = await db.Coupon.findOne({
            where: {
                id: id,
                is_deleted: false
            }
        });

        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: "Coupon not found"
            });
        }

        await coupon.update({
            is_active: is_active,
            updated_at: new Date()
        });

        return res.status(200).json({
            success: true,
            message: `Coupon ${is_active ? 'activated' : 'deactivated'} successfully`,
            data: { id: coupon.id, is_active: is_active }
        });

    } catch (error) {
        console.error('toggleCouponStatus error:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Validate coupon for user
exports.validateCoupon = async (req, res) => {
    try {
        const { code, order_amount, user_id } = req.body;

        if (!code || !order_amount) {
            return res.status(400).json({
                success: false,
                message: "Coupon code and order amount are required"
            });
        }

        const coupon = await db.Coupon.findOne({
            where: {
                code: code.toUpperCase().trim(),
                is_deleted: false
            }
        });

        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: "Invalid coupon code"
            });
        }

        // Check if coupon is valid
        if (!coupon.isValid()) {
            const now = new Date();
            let errorMessage = "Coupon is not valid";

            if (!coupon.is_active) {
                errorMessage = "Coupon is inactive";
            } else if (now < coupon.valid_from) {
                errorMessage = "Coupon is not yet active";
            } else if (now > coupon.valid_until) {
                errorMessage = "Coupon has expired";
            } else if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
                errorMessage = "Coupon usage limit exceeded";
            }

            return res.status(400).json({
                success: false,
                message: errorMessage
            });
        }

        // Check minimum order amount
        if (order_amount < (coupon.minimum_order_amount || 0)) {
            return res.status(400).json({
                success: false,
                message: `Minimum order amount for this coupon is ₹${coupon.minimum_order_amount}`
            });
        }


        // Calculate discount
        const discount = coupon.calculateDiscount(parseFloat(order_amount));

        return res.status(200).json({
            success: true,
            message: "Coupon is valid",
            data: {
                coupon_id: coupon.id,
                code: coupon.code,
                name: coupon.name,
                discount_type: coupon.discount_type,
                discount_value: coupon.discount_value,
                discount_amount: discount,
                final_amount: parseFloat(order_amount) - discount
            }
        });

    } catch (error) {
        console.error('validateCoupon error:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};
