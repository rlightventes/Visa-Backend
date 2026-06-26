const db = require("../models");
const crypto = require('crypto');

exports.getVisaApplicationCode = async (type = 'visa') => {
    const prefix = type === 'visa' ? 'VIS-' : 'VAP-';
    const DIGITS = 6;
    const MAX_ATTEMPTS = 20;

    function generateCode() {
        const max = 10 ** DIGITS;
        const rnd = crypto.randomInt(0, max);
        const padded = String(rnd).padStart(DIGITS, '0');
        return prefix + padded;
    }

    const model = type === 'visa' ? db.Visa : db.VisaApplication;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const code = generateCode();
        const existing = await model.findOne({ where: { application_id: code } });
        if (!existing) {
            return code;
        }
    }

    // Fallback: use timestamp + random to guarantee uniqueness
    const fallbackCode = prefix + Date.now().toString().slice(-6);
    return fallbackCode;
};

exports.checkProfileCompleted = async (id, type) => {
    const userData = await db.User.findOne({
        where: {
            id,
            is_deleted: 0,
            is_active: 1,
        }
    });
    if (!userData) {
        return false;
    }
    let requiredFields = [
        'full_name',
        'phone',
        'email',
        'address',
        'pincode',
        'education',
        'language',
        'nationality',
    ];
    if (type === 'vendor') {
        requiredFields = [...requiredFields, 'zone_id', 'account_number', 'bank_name', 'ifsc_code', 'cast', 'emergency_number', 'regional'];
    }
    const missing = requiredFields.find(field => {
        const val = userData[field];
        return val == null || (typeof val === 'string' && val.trim() === '');
    });
    return !missing;
};

exports.generateHashPassword = async () => {
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const special = '!@#$&_?';
    const allChars = lower + upper + numbers + special;
    let password = '';
    const length = 10;
    password += lower.charAt(Math.floor(Math.random() * lower.length));
    password += upper.charAt(Math.floor(Math.random() * upper.length));
    password += numbers.charAt(Math.floor(Math.random() * numbers.length));
    password += special.charAt(Math.floor(Math.random() * special.length));
    for (let i = 4; i < length; i++) {
        password += allChars.charAt(crypto.randomInt(0, allChars.length));
    }
    return password;
};
