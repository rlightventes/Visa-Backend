const cloudinary = require('cloudinary').v2;
const { getVisaApplicationCode } = require("../commonFunctions/commonFunction");
const db = require("../models");
const { Op, fn, col, literal } = require('sequelize');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadToCloudinary = async (filePath) => {
    const result = await cloudinary.uploader.upload(filePath, {
        folder: 'visa-images'
    });
    return result.secure_url;
};

exports.createVisa = async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
        let {
            name, country_id, short_description, detailed_description,
            visa_type, entry_type, validity_days, stay_duration_details,
            base_price, processing_time_standard, processing_price_standard,
            processing_time_express, processing_price_express,
            processing_time_urgent, processing_price_urgent,
            discount_percent, is_featured, is_active, display_order,
            image_path, b2b_price, b2b_processing_time, b2b_processing_type, b2b_discount,
            b2c_price, b2c_processing_time, b2c_processing_type, b2c_discount,
            eligible_nationalities,
            eligibility_criteria,
            required_documents
        } = req.body;

        const createdBy = req?.user?.id;

        const processedData = {
            b2b_price: b2b_price || null,
            b2b_processing_time: b2b_processing_time || null,
            b2b_processing_type: b2b_processing_type || null,
            b2b_discount: b2b_discount || null,
            b2c_price: b2c_price || null,
            b2c_processing_time: b2c_processing_time || null,
            b2c_processing_type: b2c_processing_type || null,
            b2c_discount: b2c_discount || null,
        };

        const visaImages = [];

        if (req.files) {
            for (const key of Object.keys(req.files)) {
                if (key.startsWith('images[') && key.endsWith(']')) {
                    const file = req.files[key][0];
                    if (file && file.path) {
                        const url = await uploadToCloudinary(file.path);
                        visaImages.push(url);
                    }
                }
            }
        }

        const visa = await db.Visa.create({
            application_id: await getVisaApplicationCode(),
            name, country_id, short_description, detailed_description,
            visa_type, entry_type, validity_days, stay_duration_details,
            discount_percent,
            b2b_price: processedData.b2b_price,
            b2b_processing_time: processedData.b2b_processing_time,
            b2b_processing_type: processedData.b2b_processing_type,
            b2b_discount: processedData.b2b_discount,
            b2c_price: processedData.b2c_price,
            b2c_processing_time: processedData.b2c_processing_time,
            b2c_processing_type: processedData.b2c_processing_type,
            b2c_discount: processedData.b2c_discount,
            is_featured, is_active, display_order,
            created_by: createdBy,
        }, { transaction: t });

        if (visaImages.length > 0) {
            await db.VisaUploads.bulkCreate(
                visaImages.map(image => ({ visa_id: visa.id, image_path: image })),
                { transaction: t }
            );
        }

        if (eligible_nationalities.length) {
            await db.VisaEligibleNationality.bulkCreate(
                eligible_nationalities.map(countryId => ({ visa_id: visa.id, country_id: countryId })),
                { transaction: t }
            );
        }

        if (eligibility_criteria.length) {
            await db.VisaEligibilityCriterion.bulkCreate(
                eligibility_criteria.map(criteriaId => ({ visa_id: visa.id, criteria_id: criteriaId })),
                { transaction: t }
            );
        }

        if (required_documents.length) {
            await db.VisaDocumentLinks.bulkCreate(
                required_documents.map(documentId => ({ visa_id: visa.id, document_id: documentId })),
                { transaction: t }
            );
        }

        await t.commit();
        return res.status(201).json({ success: true, message: 'Visa added successfully', data: {} });

    } catch (error) {
        await t.rollback();
        console.error('createVisa error:', error);
        return res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.updateVisa = async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
        const visaId = req.params.id;
        const {
            name, country_id, short_description, detailed_description,
            visa_type, entry_type, validity_days, stay_duration_details,
            discount_percent, is_featured, is_active, display_order,
            b2b_price, b2b_processing_time, b2b_processing_type, b2b_discount,
            b2c_price, b2c_processing_time, b2c_processing_type, b2c_discount,
            eligible_nationalities = [],
            eligibility_criteria = [],
            required_documents = [],
            existingImages = [],
        } = req.body;

        const visa = await db.Visa.findOne({ where: { id: visaId, is_deleted: 0 } }, { transaction: t });

        if (!visa) {
            await t.rollback();
            return res.status(404).json({ success: false, message: 'Visa not found' });
        }

        const processedUpdateData = {
            b2b_price: b2b_price || null,
            b2b_processing_time: b2b_processing_time || null,
            b2b_processing_type: b2b_processing_type || null,
            b2b_discount: b2b_discount || null,
            b2c_price: b2c_price || null,
            b2c_processing_time: b2c_processing_time || null,
            b2c_processing_type: b2c_processing_type || null,
            b2c_discount: b2c_discount || null,
        };

        const visaImages = [];

        if (req.files) {
            for (const key of Object.keys(req.files)) {
                if (key.startsWith('images[') && key.endsWith(']')) {
                    const file = req.files[key][0];
                    if (file && file.path) {
                        const url = await uploadToCloudinary(file.path);
                        visaImages.push(url);
                    }
                }
            }
        }

        await visa.update({
            name, country_id, short_description, detailed_description,
            visa_type, entry_type, validity_days, stay_duration_details,
            discount_percent, is_featured, is_active, display_order,
            b2b_price: processedUpdateData.b2b_price,
            b2b_processing_time: processedUpdateData.b2b_processing_time,
            b2b_processing_type: processedUpdateData.b2b_processing_type,
            b2b_discount: processedUpdateData.b2b_discount,
            b2c_price: processedUpdateData.b2c_price,
            b2c_processing_time: processedUpdateData.b2c_processing_time,
            b2c_processing_type: processedUpdateData.b2c_processing_type,
            b2c_discount: processedUpdateData.b2c_discount
        }, { transaction: t });

        if (existingImages.length > 0) {
            await db.VisaUploads.destroy({
                where: { visa_id: visaId, id: { [Op.notIn]: existingImages } },
                transaction: t
            });
        }

        if (visaImages.length > 0) {
            await db.VisaUploads.destroy({
                where: { visa_id: visaId, id: { [Op.notIn]: existingImages } },
                transaction: t
            });
            await db.VisaUploads.bulkCreate(
                visaImages.map(image => ({ visa_id: visaId, image_path: image })),
                { transaction: t }
            );
        }

        await db.VisaEligibleNationality.destroy({ where: { visa_id: visaId }, transaction: t });
        if (eligible_nationalities.length) {
            await db.VisaEligibleNationality.bulkCreate(
                eligible_nationalities.map(countryId => ({ visa_id: visaId, country_id: countryId })),
                { transaction: t }
            );
        }

        await db.VisaEligibilityCriterion.destroy({ where: { visa_id: visaId }, transaction: t });
        if (eligibility_criteria.length) {
            await db.VisaEligibilityCriterion.bulkCreate(
                eligibility_criteria.map(criteriaId => ({ visa_id: visaId, criteria_id: criteriaId })),
                { transaction: t }
            );
        }

        await db.VisaDocumentLinks.destroy({ where: { visa_id: visaId }, transaction: t });
        if (required_documents.length) {
            await db.VisaDocumentLinks.bulkCreate(
                required_documents.map(documentId => ({ visa_id: visaId, document_id: documentId })),
                { transaction: t }
            );
        }

        await t.commit();
        return res.status(200).json({ success: true, message: 'Visa updated successfully', data: {} });

    } catch (error) {
        await t.rollback();
        console.error('updateVisa error:', error);
        return res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.getVisaById = async (req, res) => {
    try {
        const id = req.params.id;
        const visa = await db.Visa.findOne({
            where: { id: id, is_deleted: 0 },
            include: [
                { model: db.Country, as: 'country', required: false, attributes: ['id', 'name'] },
                { model: db.VisaEligibleNationality, as: 'nationalities', required: false, attributes: ['id', 'country_id'] },
                { model: db.VisaEligibilityCriterion, as: 'eligiblities', required: false, attributes: ['id', 'criteria_id'] },
                { model: db.VisaUploads, as: 'uploads', required: false, attributes: ['id', 'image_path'] },
                { model: db.VisaDocumentLinks, as: 'documents', required: false, attributes: ['id', 'document_id'] }
            ]
        });

        if (!visa) return res.status(404).json({ success: false, message: "Visa not found" });
        res.status(200).json({ success: true, data: visa });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// ✅ FIXED: Added uploads relationship to include image URLs
exports.getVisas = async (req, res) => {
    try {
        let { page, limit, searchQuery, countryId, visaType, fromDate, toDate } = req.query;

        page = parseInt(page) || 1;
        limit = parseInt(limit) || 10;
        const offset = (page - 1) * limit;

        let where = { is_deleted: 0 };

        if (searchQuery) {
            where = {
                [Op.or]: [
                    { name: { [Op.like]: `%${searchQuery}%` } },
                    { short_description: { [Op.like]: `%${searchQuery}%` } },
                    { visa_type: { [Op.like]: `%${searchQuery}%` } },
                    { entry_type: { [Op.like]: `%${searchQuery}%` } },
                ]
            };
        }

        if (countryId) where.country_id = countryId;
        if (visaType) where.visa_type = visaType;
        if (fromDate && toDate) {
            where.created_at = { [Op.gte]: fromDate, [Op.lte]: toDate };
        }

        const totalVisas = await db.Visa.count({ where });

        // ✅ FIXED: Added uploads include
        const rows = await db.Visa.findAll({
            where,
            include: [
                { model: db.Country, as: 'country', required: false, attributes: ['name'] },
                { model: db.VisaUploads, as: 'uploads', required: false, attributes: ['id', 'image_path'] }
            ],
            limit, offset,
            order: [
                [literal('`Visa`.`display_order` IS NULL, `Visa`.`display_order` ASC')],
                [col('Visa.created_at'), 'DESC']
            ]
        });

        res.status(200).json({
            success: true,
            currentPage: page,
            totalPages: Math.ceil(totalVisas / limit),
            totalRecords: totalVisas,
            data: rows
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.deleteVisa = async (req, res) => {
    try {
        const { id } = req.params;
        const visa = await db.Visa.findByPk(id);
        if (!visa) return res.status(404).json({ success: false, message: "Visa not found" });
        await db.Visa.update({ is_deleted: 1 }, { where: { id } });
        res.status(200).json({ success: true, message: "Visa deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.getVisaCriterias = async (req, res) => {
    try {
        const data = await db.EligibilityCriterion.findAll({
            where: { is_active: 1, is_deleted: 0 },
            attributes: ['id', 'name'],
            order: [['created_at', 'DESC']]
        });
        res.status(200).json({ success: true, data: data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.getVisaDocuments = async (req, res) => {
    try {
        const data = await db.VisaDocuments.findAll({
            where: { is_active: 1, is_deleted: 0 },
            attributes: ['id', 'name'],
            order: [['created_at', 'DESC']]
        });
        res.status(200).json({ success: true, data: data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.toggleVisaStatus = async (req, res) => {
    try {
        const { id } = req.body;
        const visa = await db.Visa.findByPk(id);
        if (!visa) return res.status(404).json({ success: false, message: "Visa not found" });
        await visa.update({ is_active: visa.is_active ? 0 : 1 });
        return res.status(200).json({ success: true, message: "Visa status updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};
