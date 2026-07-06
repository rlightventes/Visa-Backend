const resolveImageUrl = (imagePath) => {
    if (!imagePath) return '';
    const cleanPath = imagePath.trim();
    if (!cleanPath) return '';
    if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
        // FIX: Removed the blind '/image/upload/' -> '/raw/upload/' replace for
        // PDFs. That replace assumed every PDF was stored on Cloudinary as
        // resource_type 'raw', but PDFs uploaded before the upload.middleware.js
        // fix (or with a misreported mimetype) are actually stored as 'image'.
        // Rewriting their URL to /raw/upload/ pointed at a resource that
        // doesn't exist there, causing "Failed to fetch resource" errors.
        // Now that upload.middleware.js reliably tags PDFs with resource_type
        // 'raw' at upload time, the stored URL is already correct — just
        // return it as-is.
        return cleanPath;
    }
    if (cleanPath.startsWith('/opt/') || cleanPath.startsWith('/var/') || cleanPath.startsWith('/home/') || cleanPath.startsWith('/root/')) {
        return '';
    }
    const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '');
    const filePath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
    return `${baseUrl}${filePath}`;
};

// FIX: Downloaded documents (esp. PDFs) were arriving with no filename
// extension at all, because the public_id stored on Cloudinary never
// included one and the URL was served as-is. The file itself was always a
// valid PDF — the OS/browser just didn't know what app to open it with.
// Cloudinary's `fl_attachment:<filename>` transformation lets us force a
// proper filename (with extension) at download time without needing to
// re-upload anything or touch the frontend download button code.
const withDownloadFilename = (url) => {
    if (!url || typeof url !== 'string') return url;
    if (!url.includes('res.cloudinary.com')) return url;

    const uploadMarker = '/upload/';
    const idx = url.indexOf(uploadMarker);
    if (idx === -1) return url;

    const afterUpload = url.substring(idx + uploadMarker.length);
    const segments = afterUpload.split('/');
    let lastSegment = segments[segments.length - 1] || '';
    const hasExtension = /\.[a-zA-Z0-9]{2,5}$/.test(lastSegment);
    const filename = hasExtension ? lastSegment : `${lastSegment}.pdf`;

    return `${url.substring(0, idx + uploadMarker.length)}fl_attachment:${encodeURIComponent(filename)}/${afterUpload}`;
};

//maine add kiya//
const db = require("../models");
const bcrypt = require("bcrypt");
const path = require('path');
const { Op, fn, col, literal } = require('sequelize');
const { getVisaApplicationCode } = require("../commonFunctions/commonFunction");
const { sendPaymentConfirmationEmail, sendUserAccountEmail, sendAdminApplicationNotificationEmail, sendVendorAmendmentNotificationEmail } = require("../services/email.service");
const moment = require("moment");
const notificationService = require("../services/notification.service");
const zohoPaymentsService = require("../services/zoho-payments.service");
const couponService = require('../services/coupon.service');

// Helper function to calculate delivery date with processing type handling
const calculateDeliveryDate = async (visa, isB2C = false, departureDate = null) => {
    const currentDate = moment();

    // Get processing time and type based on B2C or B2B
    const processingTime = isB2C ? visa.b2c_processing_time : visa.b2b_processing_time;
    const processingType = isB2C ? visa.b2c_processing_type : visa.b2b_processing_type;

    let finalDeliveryDate;
    let processingTimeExtended = 0;

    // Add business days calculation helper
    const addBusinessDays = (startDate, days) => {
        let result = startDate.clone();
        let daysToAdd = days;

        while (daysToAdd > 0) {
            result.add(1, 'day');
            // Skip weekends (Saturday = 6, Sunday = 0)
            if (result.day() !== 0 && result.day() !== 6) {
                daysToAdd--;
            }
        }
        return result;
    };

    // Get business days between two dates
    const getBusinessDaysBetween = (startDate, endDate) => {
        let current = startDate.clone();
        let businessDays = 0;

        while (current.isSameOrBefore(endDate, 'day')) {
            if (current.day() !== 0 && current.day() !== 6) {
                businessDays++;
            }
            current.add(1, 'day');
        }
        return businessDays;
    };

    // Handle holiday extensions for day-based processing
    if (processingType === 'day') {
        try {
            const holidays = await db.Calendar.findAll({
                where: {
                    country_id: visa.country_id,
                    from_date: {
                        [db.Sequelize.Op.lte]: moment().add(processingTime + 30, 'days').format('YYYY-MM-DD')
                    },
                    to_date: {
                        [db.Sequelize.Op.gte]: moment().format('YYYY-MM-DD')
                    }
                }
            });

            if (holidays && holidays.length > 0) {
                holidays.forEach(holiday => {
                    const holidayStart = moment(holiday.from_date);
                    const holidayEnd = moment(holiday.to_date);
                    const processingEnd = addBusinessDays(currentDate, processingTime);

                    const overlapStart = moment.max(currentDate, holidayStart);
                    const overlapEnd = moment.min(processingEnd, holidayEnd);

                    if (overlapStart.isSameOrBefore(overlapEnd)) {
                        const overlapBusinessDays = getBusinessDaysBetween(overlapStart, overlapEnd);
                        processingTimeExtended += overlapBusinessDays;
                    }
                });
            }
        } catch (calendarError) {
            console.error('Error fetching calendar data for delivery validation:', calendarError);
        }
    }

    // Calculate final delivery date based on processing type
    if (processingType === 'hour') {
        finalDeliveryDate = moment().add(processingTime, 'hours');
    } else {
        finalDeliveryDate = addBusinessDays(currentDate, processingTime + processingTimeExtended);
    }

    // Add 30-minute buffer for safety
    const deliveryWithBuffer = finalDeliveryDate.clone().add(30, 'minutes');

    return {
        deliveryDate: finalDeliveryDate,
        deliveryWithBuffer: deliveryWithBuffer,
        processingType: processingType,
        processingTime: processingTime
    };
};

// Helper function to convert B2B processing time to days based on processing type
const convertB2BProcessingTimeToDays = (b2bProcessingTime, b2bProcessingType) => {
    if (!b2bProcessingTime || !b2bProcessingType) {
        return 0;
    }

    if (b2bProcessingType === 'hour') {
        // Convert hours to days (24 hours = 1 day)
        return Math.ceil(b2bProcessingTime / 24);
    } else if (b2bProcessingType === 'day') {
        // Already in days
        return b2bProcessingTime;
    }

    // Default to treating as days if type is unknown
    return b2bProcessingTime;
};

// Helper function to add business days (excluding weekends) to a date
const addBusinessDays = (startDate, businessDays) => {
    const result = moment(startDate);
    let remainingDays = businessDays;

    while (remainingDays > 0) {
        result.add(1, 'day');

        // Skip weekends (Saturday = 6, Sunday = 0)
        if (result.day() !== 0 && result.day() !== 6) {
            remainingDays--;
        }
    }

    return result;
};

// Helper function to validate if visa application can be processed considering departure date
const validateVisaProcessingTime = (visa, from = 'vendor', departureDate = null) => {
    // For day-based processing, always allow (doesn't depend on current time)
    if (visa.b2b_processing_type !== 'hour') {
        return {
            canProcess: true,
            message: `Application will be processed within ${visa.b2b_processing_time || visa.processing_time_standard} business days.`,
            deliveryInfo: {
                isNextDay: false,
                reason: 'day_based_processing'
            }
        };
    }

    // For hour-based processing, use the same logic as get-visas API
    const isUserApplication = from === 'user';
    const actualProcessingHours = Number(isUserApplication ? visa.b2c_processing_time : visa.b2b_processing_time) || 4;

    // Calculate delivery time using the new EVISA function
    const processingType = isUserApplication ? visa.b2c_processing_type : visa.b2b_processing_type;
    const businessHoursInfo = calculateEVISADeliveryTime(actualProcessingHours, processingType || 'day');
    const finalDeliveryDate = businessHoursInfo.deliveryTime;

    // If departure date is provided, check if visa will arrive in time
    if (departureDate) {
        const userDepartureDate = moment(departureDate);
        if (userDepartureDate.isValid()) {
            // Use the same comparison logic as get-visas API
            const departureEndOfDay = userDepartureDate.clone().endOf('day');

            if (finalDeliveryDate.isAfter(departureEndOfDay)) {
                // Visa will arrive after departure date (next day or later)
                return {
                    canProcess: false,
                    message: `Booking not allowed. Visa processing would complete after your departure date. Your visa would be delivered on ${finalDeliveryDate.format('Do MMM, YYYY [at] h:mm A')} but your departure is ${userDepartureDate.format('Do MMM, YYYY')}. Please choose an earlier departure date or select a faster processing option.`,
                    deliveryInfo: {
                        isNextDay: true,
                        reason: 'exceeds_departure_date',
                        estimatedDelivery: finalDeliveryDate.format('Do MMM, YYYY [at] h:mm A'),
                        departureDate: userDepartureDate.format('Do MMM, YYYY')
                    }
                };
            }
        }
    }

    // If we reach here, processing is valid
    const deliveryBy = `${finalDeliveryDate.format('Do MMM, YYYY')} at ${finalDeliveryDate.format('h:mm A')}`;

    if (businessHoursInfo.isNextDay) {
        return {
            canProcess: true,
            message: `Application will be processed next business day. Estimated visa delivery by ${deliveryBy}.`,
            deliveryInfo: {
                isNextDay: true,
                reason: 'next_business_day',
                estimatedDelivery: deliveryBy
            }
        };
    } else {
        return {
            canProcess: true,
            message: `Application can be processed today. Estimated visa delivery by ${deliveryBy}.`,
            deliveryInfo: {
                isNextDay: false,
                reason: 'same_day_processing',
                estimatedDelivery: deliveryBy
            }
        };
    }
};

/**
 * EVISA Processing Time System based on official processing time table
 * 
 * This system implements precise delivery calculations based on EVISA's official rules:
 * 
 * WORKING DAY PROCESSING:
 * - 4-7 Days: Receive before 6:00 PM → Result after next 4-7 days
 * - 3 Days: Receive before 5:00 PM → Result after next 3 days  
 * - 2 Days: Receive before 5:00 PM → Result after next 2 days
 * - 1 Day: Receive before 5:00 PM → Result after next 1 day
 * 
 * HOUR PROCESSING (Same day delivery):
 * - 8 Hours: Receive before 9:00 AM → Result at 5:00 PM
 * - 4 Hours: Receive before 2:00 PM → Result at 6:00 PM  
 * - 2 Hours: Receive before 3:00 PM → Result at 5:00 PM
 * - 1 Hour: Receive before 4:00 PM → Result at 5:00 PM
 * 
 * FEATURES:
 * - Accurate cutoff time validation
 * - Weekend handling (processing starts next business day)
 * - Holiday calendar integration for day-based processing
 * - Precise delivery time calculations
 * - Sorting by earliest delivery time
 */
const calculateEVISADeliveryTime = (processingTime, processingType) => {
    const now = moment();
    const currentHour = now.hour();
    const currentMinute = now.minute();
    
    // Processing time rules based on EVISA Processing Time Table
    const processingRules = {
        // Working Day Processing
        day: {
            '4-7': { cutoffHour: 18, cutoffMinute: 0, addDays: 4 }, // 6:00 PM cutoff, result after next 4-7 days (we use 4 as minimum)
            '7': { cutoffHour: 18, cutoffMinute: 0, addDays: 7 },    // 6:00 PM cutoff, result after next 7 days
            '6': { cutoffHour: 18, cutoffMinute: 0, addDays: 6 },    // 6:00 PM cutoff, result after next 6 days
            '5': { cutoffHour: 18, cutoffMinute: 0, addDays: 5 },    // 6:00 PM cutoff, result after next 5 days
            '4': { cutoffHour: 18, cutoffMinute: 0, addDays: 4 },    // 6:00 PM cutoff, result after next 4 days
            '3': { cutoffHour: 17, cutoffMinute: 0, addDays: 3 },    // 5:00 PM cutoff, result after next 3 days
            '2': { cutoffHour: 17, cutoffMinute: 0, addDays: 2 },    // 5:00 PM cutoff, result after next 2 days
            '1': { cutoffHour: 17, cutoffMinute: 0, addDays: 1 }     // 5:00 PM cutoff, result after next 1 day
        },
        // Hour Processing (same day delivery)
        hour: {
            '8': { cutoffHour: 9, cutoffMinute: 0, deliveryHour: 17, deliveryMinute: 0 },  // Before 9:00 AM, result at 5:00 PM
            '4': { cutoffHour: 14, cutoffMinute: 0, deliveryHour: 18, deliveryMinute: 0 }, // Before 2:00 PM, result at 6:00 PM
            '2': { cutoffHour: 15, cutoffMinute: 0, deliveryHour: 17, deliveryMinute: 0 }, // Before 3:00 PM, result at 5:00 PM
            '1': { cutoffHour: 16, cutoffMinute: 0, deliveryHour: 17, deliveryMinute: 0 }  // Before 4:00 PM, result at 5:00 PM
        }
    };
    
    const processingTimeStr = processingTime.toString();
    let deliveryTime;
    let isNextDay = false;
    let canProcessToday = false;
    let processingDetails = {};
    
    // Handle weekend applications - always move to next business day
    const isWeekend = now.day() === 0 || now.day() === 6;
    
    if (processingType === 'hour' && processingRules.hour[processingTimeStr]) {
        const rule = processingRules.hour[processingTimeStr];
        processingDetails = {
            type: 'hour',
            originalProcessingTime: processingTime,
            cutoffTime: `${rule.cutoffHour}:${rule.cutoffMinute.toString().padStart(2, '0')}`,
            deliveryTime: `${rule.deliveryHour}:${rule.deliveryMinute.toString().padStart(2, '0')}`
        };
        
        if (isWeekend) {
            // Weekend - process on next business day
            deliveryTime = getNextBusinessDay(now)
                .hour(rule.deliveryHour)
                .minute(rule.deliveryMinute)
                .second(0);
            isNextDay = true;
            canProcessToday = false;
        } else {
            // Check if current time is before cutoff
            const cutoffTime = now.clone().hour(rule.cutoffHour).minute(rule.cutoffMinute).second(0);
            
            if (now.isSameOrBefore(cutoffTime)) {
                // Can process today - deliver today at specified time
                deliveryTime = now.clone()
                    .hour(rule.deliveryHour)
                    .minute(rule.deliveryMinute)
                    .second(0);
                canProcessToday = true;
                isNextDay = false;
            } else {
                // Past cutoff - process next business day
                deliveryTime = getNextBusinessDay(now)
                    .hour(rule.deliveryHour)
                    .minute(rule.deliveryMinute)
                    .second(0);
                isNextDay = true;
                canProcessToday = false;
            }
        }
    } else if (processingType === 'day' && processingRules.day[processingTimeStr]) {
        const rule = processingRules.day[processingTimeStr];
        processingDetails = {
            type: 'day',
            originalProcessingTime: processingTime,
            cutoffTime: `${rule.cutoffHour}:${rule.cutoffMinute.toString().padStart(2, '0')}`,
            businessDaysToAdd: rule.addDays
        };
        
        if (isWeekend) {
            // Weekend - start counting from next business day
            const nextBusinessDay = getNextBusinessDay(now);
            deliveryTime = addBusinessDays(nextBusinessDay, rule.addDays);
            isNextDay = true;
            canProcessToday = false;
        } else {
            // Check if current time is before cutoff
            const cutoffTime = now.clone().hour(rule.cutoffHour).minute(rule.cutoffMinute).second(0);
            
            if (now.isSameOrBefore(cutoffTime)) {
                // Can process today - count business days from today
                deliveryTime = addBusinessDays(now, rule.addDays);
                canProcessToday = true;
                isNextDay = !deliveryTime.isSame(now, 'day');
            } else {
                // Past cutoff - count from next business day
                const nextBusinessDay = getNextBusinessDay(now);
                deliveryTime = addBusinessDays(nextBusinessDay, rule.addDays);
                isNextDay = true;
                canProcessToday = false;
            }
        }
        
        // Set delivery time to end of business day (5:00 PM) for day-based processing
        deliveryTime.hour(17).minute(0).second(0);
    } else {
        // Fallback for unknown processing times - use old logic with 1 day default
        const fallbackDays = parseInt(processingTime) || 1;
        processingDetails = {
            type: 'fallback',
            originalProcessingTime: processingTime,
            businessDaysToAdd: fallbackDays
        };
        
        if (isWeekend) {
            const nextBusinessDay = getNextBusinessDay(now);
            deliveryTime = addBusinessDays(nextBusinessDay, fallbackDays);
        } else {
            deliveryTime = addBusinessDays(now, fallbackDays);
        }
        
        deliveryTime.hour(17).minute(0).second(0);
        isNextDay = !deliveryTime.isSame(now, 'day');
        canProcessToday = deliveryTime.isSame(now, 'day');
    }
    
    return {
        deliveryTime,
        isNextDay,
        canProcessToday,
        processingDetails,
        currentTime: now.format('YYYY-MM-DD HH:mm:ss'),
        isWeekend
    };
};

// Helper function to get next business day (excluding weekends)
const getNextBusinessDay = (fromDate) => {
    let nextDay = fromDate.clone().add(1, 'day');

    while (nextDay.day() === 0 || nextDay.day() === 6) { // Skip Sunday (0) and Saturday (6)
        nextDay.add(1, 'day');
    }

    return nextDay;
};

// Helper function to calculate business days between two dates (excluding weekends)
const getBusinessDaysBetween = (startDate, endDate) => {
    const start = moment(startDate);
    const end = moment(endDate);
    let businessDays = 0;

    const current = moment(start);

    while (current.isSameOrBefore(end, 'day')) {
        // Count only weekdays (Monday=1 to Friday=5)
        if (current.day() >= 1 && current.day() <= 5) {
            businessDays++;
        }
        current.add(1, 'day');
    }

    return businessDays;
};

exports.getCustomCalendar = async (req, res) => {
    try {
        let { month, year, country_id } = req.query;

        // Default to current month/year if not provided
        const currentDate = moment();
        month = parseInt(month) || currentDate.month() + 1; // moment months are 0-indexed
        year = parseInt(year) || currentDate.year();

        // Validate month and year
        if (month < 1 || month > 12) {
            return res.status(400).json({
                success: false,
                message: "Invalid month. Please provide month between 1-12"
            });
        }

        if (year < 2020 || year > 2030) {
            return res.status(400).json({
                success: false,
                message: "Invalid year. Please provide year between 2020-2030"
            });
        }

        // Create start and end of month
        const startOfMonth = moment().year(year).month(month - 1).startOf('month');
        const endOfMonth = moment().year(year).month(month - 1).endOf('month');

        // Get calendar start (include previous month days to fill first week)
        const calendarStart = moment(startOfMonth).startOf('week');

        // Get calendar end (include next month days to fill last week)
        const calendarEnd = moment(endOfMonth).endOf('week');

        // Fetch holidays for the country if country_id is provided
        let holidays = [];
        if (country_id) {
            holidays = await db.Calendar.findAll({
                where: {
                    country_id: country_id,
                    [Op.or]: [
                        {
                            // Holiday starts within the calendar view period
                            from_date: {
                                [Op.between]: [calendarStart.format('YYYY-MM-DD'), calendarEnd.format('YYYY-MM-DD')]
                            }
                        },
                        {
                            // Holiday ends within the calendar view period
                            to_date: {
                                [Op.between]: [calendarStart.format('YYYY-MM-DD'), calendarEnd.format('YYYY-MM-DD')]
                            }
                        },
                        {
                            // Holiday spans the entire calendar view period
                            [Op.and]: [
                                { from_date: { [Op.lte]: calendarStart.format('YYYY-MM-DD') } },
                                { to_date: { [Op.gte]: calendarEnd.format('YYYY-MM-DD') } }
                            ]
                        }
                    ]
                },
                include: [
                    {
                        model: db.Country,
                        as: 'country',
                        attributes: ['name', 'iso2']
                    }
                ]
            });
        }

        // Generate calendar days
        const calendarDays = [];
        const current = moment(calendarStart);

        while (current.isSameOrBefore(calendarEnd)) {
            const dateStr = current.format('YYYY-MM-DD');
            const isCurrentMonth = current.month() === (month - 1);
            const isToday = current.isSame(moment(), 'day');
            const isWeekend = current.day() === 0 || current.day() === 6; // Sunday = 0, Saturday = 6

            // Check if this date is a holiday and get the holiday details
            const currentHoliday = holidays.find(holiday => {
                const holidayStart = moment(holiday.from_date);
                const holidayEnd = moment(holiday.to_date);
                return current.isSame(holidayStart, 'day') ||
                    current.isSame(holidayEnd, 'day') ||
                    (current.isAfter(holidayStart, 'day') && current.isBefore(holidayEnd, 'day'));
            });

            const isHoliday = !!currentHoliday;

            // Determine day type and color
            let dayType = 'working';
            let colorClass = 'working-day';
            let backgroundColor = '#ffffff';
            let textColor = '#333333';

            if (!isCurrentMonth) {
                dayType = 'other-month';
                colorClass = 'other-month-day';
                backgroundColor = '#f8f9fa';
                textColor = '#6c757d';
            } else if (isHoliday) {
                dayType = 'holiday';
                colorClass = 'holiday-day';
                backgroundColor = '#ffebee'; // Light red for holidays
                textColor = '#c62828';
            } else if (isWeekend) {
                dayType = 'weekend';
                colorClass = 'weekend-day';
                backgroundColor = '#f3f4f6'; // Light gray for weekends
                textColor = '#6b7280';
            } else if (isToday) {
                dayType = 'today';
                colorClass = 'today-day';
                backgroundColor = '#e3f2fd'; // Light blue for today
                textColor = '#1565c0';
            }

            const dayData = {
                date: dateStr,
                day: current.date(),
                dayName: current.format('ddd'),
                fullDayName: current.format('dddd'),
                isCurrentMonth: isCurrentMonth,
                isToday: isToday,
                isWeekend: isWeekend,
                isHoliday: isHoliday,
                holidayName: currentHoliday ? currentHoliday.name : null,
                dayType: dayType,
                colorClass: colorClass,
                styling: {
                    backgroundColor: backgroundColor,
                    textColor: textColor
                },
                isBusinessDay: !isWeekend && !isHoliday && isCurrentMonth
            };

            calendarDays.push(dayData);
            current.add(1, 'day');
        }

        // Group days by weeks
        const weeks = [];
        for (let i = 0; i < calendarDays.length; i += 7) {
            weeks.push(calendarDays.slice(i, i + 7));
        }

        // Calculate statistics
        const currentMonthDays = calendarDays.filter(day => day.isCurrentMonth);
        const businessDays = currentMonthDays.filter(day => day.isBusinessDay).length;
        const weekendDays = currentMonthDays.filter(day => day.isWeekend).length;
        const holidayDays = currentMonthDays.filter(day => day.isHoliday).length;
        const totalDays = currentMonthDays.length;

        // Get country info if provided
        let countryInfo = null;
        if (country_id) {
            countryInfo = await db.Country.findByPk(country_id, {
                attributes: ['id', 'name', 'iso2', 'iso3']
            });
        }

        const response = {
            success: true,
            data: {
                calendar: {
                    month: month,
                    year: year,
                    monthName: startOfMonth.format('MMMM'),
                    fullMonthYear: startOfMonth.format('MMMM YYYY'),
                    weeks: weeks,
                    days: calendarDays
                },
                statistics: {
                    totalDays: totalDays,
                    businessDays: businessDays,
                    weekendDays: weekendDays,
                    holidayDays: holidayDays,
                    workingDaysPercentage: Math.round((businessDays / totalDays) * 100)
                },
                country: countryInfo,
                holidays: holidays.map(holiday => ({
                    id: holiday.id,
                    fromDate: moment(holiday.from_date).format('YYYY-MM-DD'),
                    toDate: moment(holiday.to_date).format('YYYY-MM-DD'),
                    duration: moment(holiday.to_date).diff(moment(holiday.from_date), 'days') + 1,
                    formattedDuration: `${moment(holiday.from_date).format('MMM DD')} - ${moment(holiday.to_date).format('MMM DD, YYYY')}`,
                    country: holiday.country
                })),
                legend: {
                    workingDay: {
                        description: "Regular working day",
                        backgroundColor: "#ffffff",
                        textColor: "#333333"
                    },
                    weekend: {
                        description: "Weekend (Saturday/Sunday) - Visa centers closed",
                        backgroundColor: "#f3f4f6",
                        textColor: "#6b7280"
                    },
                    holiday: {
                        description: "Public holiday - Visa centers closed",
                        backgroundColor: "#ffebee",
                        textColor: "#c62828"
                    },
                    today: {
                        description: "Today",
                        backgroundColor: "#e3f2fd",
                        textColor: "#1565c0"
                    }
                },
                navigation: {
                    previousMonth: {
                        month: month === 1 ? 12 : month - 1,
                        year: month === 1 ? year - 1 : year
                    },
                    nextMonth: {
                        month: month === 12 ? 1 : month + 1,
                        year: month === 12 ? year + 1 : year
                    }
                }
            }
        };

        res.status(200).json(response);

    } catch (error) {
        console.error('Error in getCustomCalendar:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

exports.createVendor = async (req, res) => {
    try {
        const data = req.body;
        const files = req.files;
        const createdBy = req?.user?.id;

        if (!data.email || !createdBy) {
            return res.status(400).json({ success: false, message: "Email Required!!!" });
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
                return res.status(400).json({ success: false, message: "Vendor with this email already exists !!!" });
            }
            if (checkExistingUser.phone === data.phone?.trim()) {
                return res.status(400).json({ success: false, message: "Vendor with this phone number already exists !!!" });
            }
        }

        const addData = {
            company_name: data.company_name,
            first_name: data.first_name,
            last_name: data.last_name,
            email: data.email,
            phone: data.phone,
            country_id: data.country_id,
            vendor_type: data.vendor_type,
            user_type: "vendor",
            created_by: createdBy,
            password: await bcrypt.hash(data.phone, 10),
            is_active: 1,
        };

        const newUser = await db.User.create(addData);

        try {
            await sendUserAccountEmail(
                {
                    email: data.email,
                    username: `${data.first_name} ${data.last_name}`,
                    mobile: data.phone || "NA",
                    user_type: "vendor",
                },
                data?.phone || null
            );
        } catch (error) {
            console.log(error);
            console.log("Error in sending email to vendor");
        }

        if (data.userCountries?.length) {
            for (const uc of data.userCountries) {
                await db.UserCountries.create({
                    user_id: newUser.id,
                    country_id: uc
                })
            }
        }

        for (const field in files) {
            let dt = {
                reference_id: newUser.id,
            }

            if (field.type = 'businessLicence') {
                dt.file_name = path.basename(field['businessLicence'][0].path);
                dt.file_type = 'business';
            }

            if (field.type = 'taxRegistration') {
                dt.file_name = path.basename(field['taxRegistration'][0].path);
                dt.file_type = 'tax';
            }

            if (field.type = 'idProof') {
                dt.file_name = path.basename(field['idProof'][0].path);
                dt.file_type = 'id_proof';
            }

            if (field.type = 'additional') {
                dt.file_name = path.basename(field['additional'][0].path);
                dt.file_type = 'additional';
            }

            await db.Documents.create(dt);
        }

        // Add functionality to send password to vendor email address
        return res.status(200).json({ success: true, message: "Vendor added successfully!!!" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.updateVendor = async (req, res) => {
    try {
        const id = req.params.id || req.user.id;
        const updateData = req.body;
        const files = req.files;

        if (!id) {
            return res.status(400).json({ success: false, message: "Vendor ID is required" });
        }

        const existingVendor = await db.User.findByPk(id);
        if (!existingVendor) {
            return res.status(404).json({ success: false, message: "Vendor not found" });
        }

        // Check if email or phone is being changed and if they're already in use by other non-deleted users
        if (updateData.email && updateData.email !== existingVendor.email) {
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

        if (updateData.phone && updateData.phone !== existingVendor.phone) {
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

        updateData.password = updateData.password ? await bcrypt.hash(updateData.password, 10) : existingVendor.password;

        await db.User.update(updateData, { where: { id } });

        if (updateData.userCountries?.length) {
            await db.UserCountries.destroy({
                where: {
                    user_id: existingVendor.id,
                }
            });
            for (const uc of updateData.userCountries) {
                await db.UserCountries.create({
                    user_id: existingVendor.id,
                    country_id: uc
                })
            }
        }

        for (const field in files) {
            let dt = {
                reference_id: existingVendor.id,
            }

            if (field.type = 'businessLicence') {
                dt.file_name = path.basename(field['businessLicence'][0].path);
                dt.file_type = 'business';
            }

            if (field.type = 'taxRegistration') {
                dt.file_name = path.basename(field['taxRegistration'][0].path);
                dt.file_type = 'tax';
            }

            if (field.type = 'idProof') {
                dt.file_name = path.basename(field['idProof'][0].path);
                dt.file_type = 'id_proof';
            }

            if (field.type = 'additional') {
                dt.file_name = path.basename(field['additional'][0].path);
                dt.file_type = 'additional';
            }

            await db.Documents.create(dt);
        }

        const updatedVendor = await db.User.findByPk(id);
        res.status(200).json({ success: true, message: "Vendor updated successfully", data: updatedVendor });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.getVendorById = async (req, res) => {
    try {
        const id = req.params.id || req.user.id;
        const vendor = await db.User.findOne({
            where: {
                id: id,
                is_deleted: 0
            },
        });

        if (!vendor) {
            return res.status(404).json({ success: false, message: "Vendor not found" });
        }

        const formattedVendor = {
            ...vendor.dataValues,
            cancelCheque: vendor.cancel_cheque ? process.env.BASE_URL + vendor.cancel_cheque : '',
            panCard: vendor.pan_card ? process.env.BASE_URL + vendor.pan_card : '',
            aadharCard: vendor.aadhar_card ? process.env.BASE_URL + vendor.aadhar_card : '',
            password: ''
        };

        res.status(200).json({ success: true, data: formattedVendor });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.getVendors = async (req, res) => {
    try {
        let { page, limit, searchQuery, vendor_type, is_active } = req.query;
        const createdByIdFromToken = req?.user?.id;
        const userMode = req?.user?.user_type;

        page = parseInt(page) || 1;
        limit = parseInt(limit) || 10;
        const offset = (page - 1) * limit;

        let where = {
            user_type: "vendor",
            is_deleted: 0
        };

        // if (userMode === "admin") {
        //     where.created_by = createdByIdFromToken;
        // }

        if (vendor_type) {
            const vendorTypes = vendor_type.split(',');
            where.vendor_type = {
                [Op.in]: vendorTypes
            };
        }

        if (is_active) {
            where.is_active = is_active == 'true' ? 1 : 0;
        }

        if (searchQuery) {
            where = {
                ...where,
                [Op.or]: [
                    { full_name: { [Op.like]: `%${searchQuery}%` } },
                    { phone: { [Op.like]: `%${searchQuery}%` } },
                    { email: { [Op.like]: `%${searchQuery}%` } },
                ],
            };
        }

        const totalUsers = await db.User.count({ where });

        const rows = await db.User.findAll({
            where,
            include: [
                {
                    model: db.Country,
                    as: 'country',
                    required: false,
                    attributes: ['name']
                }
            ],
            attributes: [
                'id',
                'unique_code',
                'company_name',
                'first_name',
                'last_name',
                'phone',
                'email',
                'is_active',
                'vendor_type',
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
                ]
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

exports.deleteVendor = async (req, res) => {
    try {
        const { id } = req.params;
        const existingVendor = await db.User.findByPk(id);

        if (!existingVendor) {
            return res.status(404).json({ success: false, message: "Vendor not found" });
        }

        await db.User.update({ is_deleted: 1 }, { where: { id } });
        await db.UserCountries.destroy({
            where: {
                user_id: existingVendor.id,
            }
        })
        res.status(200).json({ success: true, message: "Vendor deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.toggleVendorStatus = async (req, res) => {
    try {
        const id = req.body.id || req.user.id;
        const { is_active } = req.body;

        const existingVendor = await db.User.findByPk(id);
        if (!existingVendor) {
            return res.status(404).json({ success: false, message: "Vendor not found" });
        }

        await db.User.update({ is_active }, { where: { id } });

        res.status(200).json({ success: true, message: "Vendor status updated", data: {} });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.getDropdown = async (req, res) => {
    try {
        const data = await db.User.findAll({
            where: {
                user_type: 'vendor',
                is_deleted: 0,
                is_active: 1
            },
            attributes: ['id', 'first_name', 'last_name'],
            order: [['createdAt', 'DESC']]
        });

        res.status(200).json({
            success: true,
            data: data
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.getVisas = async (req, res) => {
    try {
        let { page, limit, searchQuery, visa_type, citizenOf, goingTo, departureDate, returnDate, userType } = req.query;

        page = parseInt(page) || 1;
        limit = parseInt(limit) || 10;
        const offset = (page - 1) * limit;

        let where = { is_active: 1, is_deleted: 0 };

        // Filter visas based on user role and available pricing
        // const userType = req.user?.user_type;
        if (userType === 'user') {
            // For B2C users, only show visas that have B2C pricing (greater than 0)
            where.b2c_price = { [Op.gt]: 0 };
        } else {
            // For B2B users, only show visas that have B2B pricing (greater than 0)
            where.b2b_price = { [Op.gt]: 0 };
        }
        // For admin/super-admin users, show all visas (no additional filtering)

        let cond = {
            where,
            include: [
                {
                    model: db.Country,
                    as: 'country',
                    required: true,
                    attributes: ['name', 'currency', 'iso2', 'iso3', 'allow_minor_to_apply']
                },
                {
                    model: db.VisaEligibilityCriterion,
                    as: 'eligiblities',
                    required: false,
                    include: [
                        {
                            model: db.EligibilityCriterion,
                            as: 'criteria',
                            required: false,
                            attributes: ['name', 'image_url']
                        }
                    ]
                },
                {
                    model: db.VisaDocumentLinks,
                    as: 'documents',
                    required: false,
                    include: [
                        {
                            model: db.VisaDocuments,
                            as: 'document',
                            required: false,
                            attributes: ['name']
                        }
                    ]
                },
                {
                    model: db.VisaUploads,
                    as: 'uploads',
                    required: false,
                },
            ],
            attributes: [
                'id',
                'name',
                'country_id',
                'short_description',
                'detailed_description',
                'visa_type',
                'entry_type',
                'validity_days',
                'stay_duration_details',
                'base_price',
                'processing_time_standard',
                'processing_price_standard',
                'processing_time_express',
                'processing_price_express',
                'processing_time_urgent',
                'processing_price_urgent',
                'discount_percent',
                'is_featured',
                'display_order',
                'b2b_price',
                'b2b_processing_time',
                'b2b_processing_type',
                'b2b_discount',
                'b2c_price',
                'b2c_processing_time',
                'b2c_processing_type',
                'b2c_discount',
                [
                    fn(
                        'DATE_FORMAT',
                        fn(
                            'CONVERT_TZ',
                            col('Visa.created_at'),
                            '+00:00',
                            '+05:30'
                        ),
                        '%Y-%m-%d %h:%i %p'
                    ),
                    'created_at'
                ]
            ],
            limit,
            offset,
            order: [
                // [col('Visa.is_featured'), 'DESC'],
                [literal('`Visa`.`display_order` IS NULL, `Visa`.`display_order` ASC')],
                [col('Visa.created_at'), 'DESC']
            ],
            group: ['Visa.id']
        }


        if (searchQuery) {
            // Update to use proper nested where conditions for associations
            cond.where = {
                ...cond.where,
                [Op.or]: [
                    { name: { [Op.substring]: searchQuery } },
                    { short_description: { [Op.substring]: searchQuery } },
                    { visa_type: { [Op.substring]: searchQuery } },
                    { entry_type: { [Op.substring]: searchQuery } },
                    { '$country.name$': { [Op.substring]: searchQuery } }
                ]
            };
        }

        // Filter by visa type if provided
        if (visa_type && visa_type !== 'All') {
            where.visa_type = visa_type.toLowerCase();
        }

        if (citizenOf) {
            // Add VisaEligibleNationality to includes with required: true for filtering
            cond.include.push({
                model: db.VisaEligibleNationality,
                as: 'nationalities',
                required: true, // This ensures only visas with matching nationalities are returned
                where: {
                    country_id: citizenOf
                },
                include: [
                    {
                        model: db.Country,
                        as: 'country',
                        required: false,
                        attributes: ['name', 'iso2']
                    }
                ]
            });
        } else {
            // If no citizenOf filter, still include nationalities for display but not required
            cond.include.push({
                model: db.VisaEligibleNationality,
                as: 'nationalities',
                required: false,
                include: [
                    {
                        model: db.Country,
                        as: 'country',
                        required: false,
                        attributes: ['name', 'iso2']
                    }
                ]
            });
        }

        if (goingTo) {
            where.country_id = goingTo;
        }

        // Count query should include the same nationality filter if citizenOf is provided
        let countInclude = [];

        // Always include Country model in count query if we're searching by country name
        if (searchQuery) {
            countInclude.push({
                model: db.Country,
                as: 'country',
                required: false,
                where: {
                    name: { [Op.substring]: searchQuery }
                },
                attributes: [] // Don't select attributes for count query
            });
        }

        if (citizenOf) {
            countInclude.push({
                model: db.VisaEligibleNationality,
                as: 'nationalities',
                required: true,
                where: {
                    country_id: citizenOf
                },
                attributes: [] // Don't select attributes for count query
            });
        }

        const totalVisas = await db.Visa.count({
            where,
            include: countInclude
        });

        const rows = await db.Visa.findAll(cond);

        const formattedRows = await Promise.all(rows.map(async row => {
            // Calculate initial delivery date based on processing time (business days only)
            const currentDate = moment();
            const baseProcessingDays = Number(row.b2b_processing_time);

            let b2b_processing_time_extended = 0;
            let b2c_processing_time_extended = 0;

            if (row.country_id) {
                try {
                    // Calculate the initial processing end date using business days (excluding weekends)
                    const initialProcessingEndDate = addBusinessDays(currentDate, baseProcessingDays);

                    // Get all calendar entries (holidays/closures) for this country that might affect processing
                    // We need to extend the search range to account for potential weekend shifts
                    const extendedEndDate = moment(initialProcessingEndDate).add(14, 'days'); // Buffer for weekends and holidays

                    const calendar = await db.Calendar.findAll({
                        where: {
                            country_id: row.country_id,
                            // Get calendar entries that overlap with our processing period
                            [Op.or]: [
                                {
                                    // Holiday starts within processing period
                                    from_date: {
                                        [Op.between]: [currentDate.format('YYYY-MM-DD'), extendedEndDate.format('YYYY-MM-DD')]
                                    }
                                },
                                {
                                    // Holiday ends within processing period
                                    to_date: {
                                        [Op.between]: [currentDate.format('YYYY-MM-DD'), extendedEndDate.format('YYYY-MM-DD')]
                                    }
                                },
                                {
                                    // Holiday completely encompasses processing period
                                    [Op.and]: [
                                        { from_date: { [Op.lte]: currentDate.format('YYYY-MM-DD') } },
                                        { to_date: { [Op.gte]: extendedEndDate.format('YYYY-MM-DD') } }
                                    ]
                                }
                            ]
                        }
                    });

                    if (calendar && calendar.length > 0) {
                        calendar.forEach(cal => {
                            const holidayStart = moment(cal.from_date);
                            const holidayEnd = moment(cal.to_date);
                            const processingStart = moment(currentDate);
                            const processingEnd = moment(initialProcessingEndDate);

                            // Calculate overlap between holiday period and processing period
                            const overlapStart = moment.max(holidayStart, processingStart);
                            const overlapEnd = moment.min(holidayEnd, processingEnd);

                            if (overlapStart.isSameOrBefore(overlapEnd)) {
                                // Calculate business days within the holiday overlap period
                                const overlapBusinessDays = getBusinessDaysBetween(overlapStart, overlapEnd);
                                b2b_processing_time_extended += overlapBusinessDays;
                                b2c_processing_time_extended += overlapBusinessDays;
                            }
                        });
                    }
                } catch (calendarError) {
                    console.error('Error fetching calendar data for country_id:', row.country_id, calendarError);
                    // Continue without extended processing time if calendar fetch fails
                }
            }

            // Calculate final delivery date based on processing type
            let finalDeliveryDate;
            let deliveryBy;
            let businessHoursInfo = {};

            // Use new EVISA processing time calculation
            const actualProcessingTime = Number(row.b2b_processing_time) || 4;
            businessHoursInfo = calculateEVISADeliveryTime(actualProcessingTime, row.b2b_processing_type || 'day');
            finalDeliveryDate = businessHoursInfo.deliveryTime;
            
            // Add holiday extensions for day-based processing
            if (row.b2b_processing_type === 'day' && b2b_processing_time_extended > 0) {
                finalDeliveryDate = addBusinessDays(finalDeliveryDate, b2b_processing_time_extended);
                finalDeliveryDate.hour(17).minute(0).second(0); // Maintain 5 PM delivery time
            }
            
            // Format delivery date based on processing type
            if (row.b2b_processing_type === 'hour') {
                // For hour-based processing, show date only (time will be added for delayed messages)
                deliveryBy = finalDeliveryDate.format('Do MMM, YYYY');
            } else {
                // For day-based processing, show date only
                deliveryBy = finalDeliveryDate.format('Do MMM, YYYY');
            }

            // Generate visa timing message based on departure date and business hours
            let visaTimingMessage = null;
            let visaTimingStatus = 'on_time'; // 'on_time', 'delayed', 'unknown'
            let businessHoursNote = '';

            // Add EVISA processing information
            if (businessHoursInfo.processingDetails) {
                const details = businessHoursInfo.processingDetails;
                
                if (details.type === 'hour') {
                    if (businessHoursInfo.isWeekend) {
                        // businessHoursNote = ` (Weekend application - processing starts next business day, result by ${details.deliveryTime})`;
                    } else if (!businessHoursInfo.canProcessToday) {
                        businessHoursNote = ` (Application received after ${details.cutoffTime} cutoff - processing next business day, result by ${details.deliveryTime})`;
                    } else {
                        businessHoursNote = ` (Application received before ${details.cutoffTime} cutoff - result today by ${details.deliveryTime})`;
                    }
                } else if (details.type === 'day') {
                    if (businessHoursInfo.isWeekend) {
                        // businessHoursNote = ` (Weekend application - processing starts next business day, ${details.businessDaysToAdd} working days)`;
                    } else if (!businessHoursInfo.canProcessToday) {
                        businessHoursNote = ` (Application received after ${details.cutoffTime} cutoff - processing starts next business day, ${details.businessDaysToAdd} working days)`;
                    } else {
                        businessHoursNote = ` (Application received before ${details.cutoffTime} cutoff - ${details.businessDaysToAdd} working days processing)`;
                    }
                }
            }

            if (departureDate) {
                const userDepartureDate = moment(departureDate);
                if (userDepartureDate.isValid()) {
                    // For proper comparison, set departure to end of day (23:59:59)
                    const departureEndOfDay = userDepartureDate.clone().endOf('day');

                    if (finalDeliveryDate.isAfter(departureEndOfDay)) {
                        // Visa will arrive after departure date (next day or later)
                        let deliveryByWithTime;
                        if (row.b2b_processing_type === 'hour') {
                            deliveryByWithTime = `${finalDeliveryDate.format('Do MMM, YYYY')}`;
                        } else {
                            deliveryByWithTime = finalDeliveryDate.format('Do MMM, YYYY');
                        }
                        visaTimingMessage = `Your visa will not come in time before your departure date. Your visa will be delivered on ${deliveryByWithTime}${businessHoursNote}`;
                        visaTimingStatus = 'delayed';
                    } else {
                        // Visa will arrive on time
                        if (row.b2b_processing_type === 'hour') {
                            const hoursBeforeDeparture = departureEndOfDay.diff(finalDeliveryDate, 'hours');
                            if (hoursBeforeDeparture >= 24) {
                                const daysBeforeDeparture = Math.floor(hoursBeforeDeparture / 24);
                                visaTimingMessage = `Estimated visa arrival by ${deliveryBy} (${daysBeforeDeparture} day${daysBeforeDeparture > 1 ? 's' : ''} before departure)${businessHoursNote}`;
                            } else if (hoursBeforeDeparture >= 1) {
                                visaTimingMessage = `Estimated visa arrival by ${deliveryBy} (${hoursBeforeDeparture} hour${hoursBeforeDeparture > 1 ? 's' : ''} before departure)${businessHoursNote}`;
                            } else {
                                visaTimingMessage = `Estimated visa arrival by ${deliveryBy}${businessHoursNote}`;
                            }
                        } else {
                            const daysBeforeDeparture = departureEndOfDay.diff(finalDeliveryDate, 'days');
                            if (daysBeforeDeparture >= 1) {
                                visaTimingMessage = `Estimated visa arrival by ${deliveryBy} (${daysBeforeDeparture} day${daysBeforeDeparture > 1 ? 's' : ''} before departure)`;
                            } else {
                                visaTimingMessage = `Estimated visa arrival by ${deliveryBy}`;
                            }
                        }
                        visaTimingStatus = 'on_time';
                    }
                }
            } else {
                // No departure date provided, show general estimate
                const processingTypeText = row.b2b_processing_type === 'hour' ?
                    `${baseProcessingDays} hour${baseProcessingDays > 1 ? 's' : ''}` :
                    `${baseProcessingDays} business day${baseProcessingDays > 1 ? 's' : ''}`;

                visaTimingMessage = `Estimated visa arrival by ${deliveryBy} (${processingTypeText} processing time)${businessHoursNote}`;
                visaTimingStatus = 'unknown';
            }

            // Calculate processing time in readable format
            const getProcessingTimeText = (days) => {
                if (!days) return 'Standard processing';
                return `${days} ${days === 1 ? 'day' : 'days'}`;
            };

            // Generate tags for the visa
            const tags = [];

            // Add visa type tag
            if (row.visa_type) {
                tags.push({
                    text: row.visa_type.charAt(0).toUpperCase() + row.visa_type.slice(1),
                    iconClass: 'fas fa-passport'
                });
            }

            // Add entry type tag
            if (row.entry_type) {
                tags.push({
                    text: row.entry_type === 'single' ? 'Single Entry' : 'Multiple Entry',
                    iconClass: 'fas fa-plane-departure'
                });
            }

            // Add validity tag
            if (row.validity_days) {
                const validityText = row.validity_days > 365
                    ? `${Math.floor(row.validity_days / 365)} year${Math.floor(row.validity_days / 365) > 1 ? 's' : ''}`
                    : `${row.validity_days} days`;
                tags.push({
                    text: `Valid ${validityText}`,
                    iconClass: 'fas fa-calendar-check'
                });
            }

            // Generate image overlay tags
            const imageOverlayTags = [];

            // Add processing time overlay
            if (row.processing_time_standard) {
                imageOverlayTags.push({
                    text: getProcessingTimeText(row.processing_time_standard),
                    iconClass: 'fas fa-clock'
                });
            }

            // Add featured badge if applicable
            if (row.is_featured) {
                imageOverlayTags.push({
                    text: 'Featured',
                    iconClass: 'fas fa-star'
                });
            }

            const finalPrice = row.discount_percent > 0
                ? row.base_price * (1 - row.discount_percent / 100)
                : row.base_price;

            const originalB2BPrice = row.b2b_price;
            const b2bDiscountedPrice = row.b2b_discount > 0
                ? originalB2BPrice * (1 - row.b2b_discount / 100)
                : originalB2BPrice;

            const originalB2CPrice = parseFloat(row.b2c_price);
            const b2cDiscountedPrice = parseFloat(row.b2c_discount) > 0
                ? originalB2CPrice * (1 - parseFloat(row.b2c_discount) / 100)
                : originalB2CPrice;

            const formattedRow = {
                id: row.id,
                displayName: row.name,
                shortName: row.country?.name || '',
                price: finalPrice,
                originalPrice: row.discount_percent > 0 ? row.base_price : null,
                discountPercent: row.discount_percent || 0,
                currency: row.country?.currency || 'USD',
                countryName: row.country?.name || '',
                countryCode: row.country?.iso2 || '',
                allow_minor_to_apply: row.country?.allow_minor_to_apply || false,
                visaType: row.visa_type,
                entryType: row.entry_type,
                validityDays: row.validity_days,
                stayDurationDetails: row.stay_duration_details,
                shortDescription: row.short_description,
                detailedDescription: row.detailed_description,
                processingTimeStandard: row.processing_time_standard,
                processingPriceStandard: row.processing_price_standard,
                processingTimeExpress: row.processing_time_express,
                processingPriceExpress: row.processing_price_express,
                processingTimeUrgent: row.processing_time_urgent,
                processingPriceUrgent: row.processing_price_urgent,
                b2b_price: row.b2b_price,
                b2b_processing_time: row.b2b_processing_time,
                b2b_processing_type: row.b2b_processing_type,
                b2b_processing_time_extended: b2b_processing_time_extended,
                b2b_discount: row.b2b_discount || 0,
                b2b_discounted_price: b2bDiscountedPrice,
                b2c_price: row.b2c_price,
                b2c_processing_time: row.b2c_processing_time,
                b2c_processing_type: row.b2c_processing_type,
                b2c_processing_time_extended: b2c_processing_time_extended,
                b2c_discount: row.b2c_discount || 0,
                b2c_discounted_price: b2cDiscountedPrice,
                isFeatured: row.is_featured,
                imageUrl: row.uploads?.[0]?.image_path ? resolveImageUrl(row.uploads?.[0]?.image_path) : '',
                searchThumbUrl: row.uploads?.[0]?.image_path ? resolveImageUrl(row.uploads?.[0]?.image_path) : '',
                createdAt: row.created_at,
                deliveryBy: deliveryBy,
                visaTimeShort: getProcessingTimeText(row.processing_time_standard),
                tags: tags,
                imageOverlayTags: imageOverlayTags,
                eligibleNationalities: row.nationalities?.map(nat => ({
                    countryName: nat.country?.name,
                    countryCode: nat.country?.iso2
                })) || [],
                eligibilityCriteria: row.eligiblities?.map(elig => ({
                    name: elig.criteria?.name,
                    imageUrl: elig.criteria?.image_url
                })) || [],
                requiredDocuments: row.documents?.map(doc => doc.document?.name).filter(Boolean) || [],
                visaTimingMessage: visaTimingMessage,
                visaTimingStatus: visaTimingStatus,
                // EVISA Processing information
                evisaProcessing: {
                    processingType: row.b2b_processing_type || 'day',
                    processingTime: actualProcessingTime,
                    currentTime: businessHoursInfo.currentTime,
                    canProcessToday: businessHoursInfo.canProcessToday,
                    willProcessNextDay: businessHoursInfo.isNextDay,
                    isWeekend: businessHoursInfo.isWeekend,
                    processingDetails: businessHoursInfo.processingDetails,
                    deliveryDateTime: finalDeliveryDate.format('YYYY-MM-DD HH:mm:ss')
                }
            };

            return formattedRow;
        }));

        // Sort by fastest processing first: hour-based (lowest hours first), then day-based (lowest days first)
        formattedRows.sort((a, b) => {
            const aType = a.evisaProcessing.processingType;
            const bType = b.evisaProcessing.processingType;
            const aTime = a.evisaProcessing.processingTime;
            const bTime = b.evisaProcessing.processingTime;
            
            // 1. Prioritize hour-based processing over day-based
            if (aType === 'hour' && bType === 'day') return -1;
            if (aType === 'day' && bType === 'hour') return 1;
            
            // 2. Within same processing type, sort by lowest time first
            if (aType === bType) {
                if (aTime < bTime) return -1;
                if (aTime > bTime) return 1;
                
                // 3. If same processing time, sort by earliest delivery date/time
                const aDeliveryTime = moment(a.evisaProcessing.deliveryDateTime);
                const bDeliveryTime = moment(b.evisaProcessing.deliveryDateTime);
                return aDeliveryTime.isBefore(bDeliveryTime) ? -1 : 1;
            }
            
            return 0;
        });

        // Also provide search suggestions for autocomplete
        const searchSuggestions = formattedRows.slice(0, 5).map(row => ({
            id: row.id,
            displayName: row.displayName,
            shortName: row.shortName,
            imageUrl: row.imageUrl,
            searchThumbUrl: row.searchThumbUrl,
            visaTimeShort: row.visaTimeShort,
            price: row.price,
            currency: row.currency
        }));

        // Generate filter options with counts accounting for citizenOf filter
        // Batch the count queries for better performance
        const filterCounts = await Promise.all([
            db.Visa.count({ where: { ...where, visa_type: 'tourist' }, include: countInclude }),
            db.Visa.count({ where: { ...where, visa_type: 'business' }, include: countInclude }),
            db.Visa.count({ where: { ...where, visa_type: 'student' }, include: countInclude }),
            db.Visa.count({ where: { ...where, visa_type: 'transit' }, include: countInclude })
        ]);

        const filterOptions = [
            { name: 'All', count: totalVisas },
            { name: 'Tourist', count: filterCounts[0] },
            { name: 'Business', count: filterCounts[1] },
            { name: 'Student', count: filterCounts[2] },
            { name: 'Transit', count: filterCounts[3] }
        ];

        res.status(200).json({
            success: true,
            currentPage: page,
            totalPages: Math.ceil(totalVisas / limit),
            totalRecords: totalVisas,
            data: formattedRows,
            searchSuggestions: searchSuggestions,
            filterOptions: filterOptions
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.getVisaDetails = async (req, res) => {
    try {
        let { id } = req.params;
        let { departureDate } = req.query; // Add departure date from query params

        const visaDetails = await db.Visa.findOne({
            where: {
                id: id,
                is_active: 1,
                is_deleted: 0
            },
            include: [
                {
                    model: db.Country,
                    as: 'country',
                    required: false,
                    attributes: ['name', 'currency', 'iso2', 'iso3', 'allow_minor_to_apply']
                },
                {
                    model: db.VisaEligibleNationality,
                    as: 'nationalities',
                    required: false,
                    include: [
                        {
                            model: db.Country,
                            as: 'country',
                            required: false,
                            attributes: ['name', 'iso2']
                        }
                    ]
                },
                {
                    model: db.VisaEligibilityCriterion,
                    as: 'eligiblities',
                    required: false,
                    include: [
                        {
                            model: db.EligibilityCriterion,
                            as: 'criteria',
                            required: false,
                            attributes: ['name', 'image_url']
                        }
                    ]
                },
                {
                    model: db.VisaDocumentLinks,
                    as: 'documents',
                    required: false,
                    include: [
                        {
                            model: db.VisaDocuments,
                            as: 'document',
                            required: false,
                            attributes: ['name']
                        }
                    ]
                },
                {
                    model: db.VisaUploads,
                    as: 'uploads',
                    required: false,
                },
            ],
            attributes: [
                'id',
                'name',
                'country_id',
                'short_description',
                'detailed_description',
                'visa_type',
                'entry_type',
                'validity_days',
                'stay_duration_details',
                'base_price',
                'processing_time_standard',
                'processing_price_standard',
                'processing_time_express',
                'processing_price_express',
                'processing_time_urgent',
                'processing_price_urgent',
                'discount_percent',
                'b2c_price',
                'b2c_processing_time',
                'b2c_processing_type',
                'b2c_discount',
                'is_featured',
                [
                    fn(
                        'DATE_FORMAT',
                        fn(
                            'CONVERT_TZ',
                            col('Visa.created_at'),
                            '+00:00',
                            '+05:30'
                        ),
                        '%Y-%m-%d %h:%i %p'
                    ),
                    'created_at'
                ]
            ],
        });

        if (!visaDetails) {
            return res.status(404).json({ success: false, message: 'Visa not found!' });
        }

        // Helper function to format processing time
        const getProcessingTimeText = (days) => {
            if (!days) return 'Standard processing';
            return `${days} ${days === 1 ? 'day' : 'days'}`;
        };

        // Helper function to calculate final price after discount
        const calculateFinalPrice = (basePrice, discountPercent) => {
            return discountPercent > 0
                ? basePrice * (1 - discountPercent / 100)
                : basePrice;
        };

        // Generate required documents with icons and descriptions
        const getRequiredDocuments = () => {
            const documentMap = {
                'Passport Copy': {
                    icon: 'fas fa-passport',
                    title: 'Passport Copy',
                    description: 'Clear copy of passport with at least 6 months validity'
                },
                'Photo': {
                    icon: 'fas fa-camera',
                    title: 'Passport Size Photo',
                    description: 'Recent passport size photograph with white background'
                },
                'Flight Itinerary': {
                    icon: 'fas fa-plane',
                    title: 'Flight Itinerary',
                    description: 'Round trip flight booking confirmation'
                },
                'Hotel Booking': {
                    icon: 'fas fa-bed',
                    title: 'Hotel Booking',
                    description: 'Confirmed hotel reservation for your stay'
                },
                'Bank Statement': {
                    icon: 'fas fa-university',
                    title: 'Bank Statement',
                    description: 'Last 3 months bank statement showing sufficient funds'
                },
                'Application Form': {
                    icon: 'fas fa-file-alt',
                    title: 'Application Form',
                    description: 'Completed and signed visa application form'
                }
            };

            const documents = visaDetails.documents?.map(doc => doc.document?.name).filter(Boolean) || [];
            return documents.map(docName => documentMap[docName] || {
                icon: 'fas fa-file',
                title: docName,
                description: 'Required document for visa application'
            });
        };

        // Generate visa packages
        const getVisaPackages = () => {
            const packages = [];
            const countryName = visaDetails.country?.name || '';

            // Standard package
            if (visaDetails.processing_time_standard && visaDetails.processing_price_standard) {
                packages.push({
                    type: 'Standard',
                    price: visaDetails.processing_price_standard,
                    entryType: visaDetails.entry_type === 'single' ? 'Single Entry' : 'Multiple Entry',
                    processingTime: getProcessingTimeText(visaDetails.processing_time_standard),
                    stayDuration: visaDetails.stay_duration_details || `${visaDetails.validity_days} days`,
                    features: [
                        'Embassy fee included',
                        'Document verification',
                        'Application tracking',
                        'Customer support'
                    ]
                });
            }

            // Express package
            if (visaDetails.processing_time_express && visaDetails.processing_price_express) {
                packages.push({
                    type: 'Express',
                    price: visaDetails.processing_price_express,
                    entryType: visaDetails.entry_type === 'single' ? 'Single Entry' : 'Multiple Entry',
                    processingTime: getProcessingTimeText(visaDetails.processing_time_express),
                    stayDuration: visaDetails.stay_duration_details || `${visaDetails.validity_days} days`,
                    features: [
                        'Priority processing',
                        'Embassy fee included',
                        'Express document verification',
                        'Dedicated support',
                        'SMS updates'
                    ]
                });
            }

            // Urgent package
            if (visaDetails.processing_time_urgent && visaDetails.processing_price_urgent) {
                packages.push({
                    type: 'Urgent',
                    price: visaDetails.processing_price_urgent,
                    entryType: visaDetails.entry_type === 'single' ? 'Single Entry' : 'Multiple Entry',
                    processingTime: getProcessingTimeText(visaDetails.processing_time_urgent),
                    stayDuration: visaDetails.stay_duration_details || `${visaDetails.validity_days} days`,
                    features: [
                        'Urgent processing',
                        'Embassy fee included',
                        'Immediate document verification',
                        'Premium support',
                        'Real-time updates',
                        'Emergency contact'
                    ]
                });
            }

            return packages;
        };

        // Calculate delivery timing with holidays
        const calculateDeliveryTiming = async (packageType = 'standard') => {
            const currentDate = moment();
            let processingDays = 0;

            // Check if this is a request from B2B user (vendor)
            const isB2BRequest = req.user && req.user.user_type === 'vendor';

            if (isB2BRequest && visaDetails.b2b_processing_time && visaDetails.b2b_processing_type) {
                // For B2B users, use B2B processing time
                processingDays = convertB2BProcessingTimeToDays(visaDetails.b2b_processing_time, visaDetails.b2b_processing_type);
            } else {
                // For regular users, use standard processing times based on package type
                switch (packageType.toLowerCase()) {
                    case 'standard':
                        processingDays = Number(visaDetails.processing_time_standard) || 5;
                        break;
                    case 'express':
                        processingDays = Number(visaDetails.processing_time_express) || 3;
                        break;
                    case 'urgent':
                        processingDays = Number(visaDetails.processing_time_urgent) || 1;
                        break;
                    default:
                        processingDays = Number(visaDetails.processing_time_standard) || 5;
                }
            }

            let b2b_processing_time_extended = 0;

            if (visaDetails.country_id) {
                try {
                    const initialProcessingEndDate = moment().add(processingDays, 'days');

                    const calendar = await db.Calendar.findAll({
                        where: {
                            country_id: visaDetails.country_id,
                            [Op.or]: [
                                {
                                    from_date: {
                                        [Op.between]: [currentDate.format('YYYY-MM-DD'), initialProcessingEndDate.format('YYYY-MM-DD')]
                                    }
                                },
                                {
                                    to_date: {
                                        [Op.between]: [currentDate.format('YYYY-MM-DD'), initialProcessingEndDate.format('YYYY-MM-DD')]
                                    }
                                },
                                {
                                    [Op.and]: [
                                        { from_date: { [Op.lte]: currentDate.format('YYYY-MM-DD') } },
                                        { to_date: { [Op.gte]: initialProcessingEndDate.format('YYYY-MM-DD') } }
                                    ]
                                }
                            ]
                        }
                    });

                    if (calendar && calendar.length > 0) {
                        calendar.forEach(cal => {
                            const holidayStart = moment(cal.from_date);
                            const holidayEnd = moment(cal.to_date);
                            const processingStart = moment(currentDate);
                            const processingEnd = moment(initialProcessingEndDate);

                            const overlapStart = moment.max(holidayStart, processingStart);
                            const overlapEnd = moment.min(holidayEnd, processingEnd);

                            if (overlapStart.isSameOrBefore(overlapEnd)) {
                                const overlapDays = overlapEnd.diff(overlapStart, 'days') + 1;
                                b2b_processing_time_extended += overlapDays;
                            }
                        });
                    }
                } catch (calendarError) {
                    console.error('Error fetching calendar data for visa details:', calendarError);
                }
            }

            const finalDeliveryDate = moment().add(processingDays + b2b_processing_time_extended, 'days');

            // Skip weekends
            while (finalDeliveryDate.day() === 0 || finalDeliveryDate.day() === 6) {
                finalDeliveryDate.add(1, 'day');
            }

            return {
                deliveryDate: finalDeliveryDate,
                extendedDays: b2b_processing_time_extended,
                formattedDate: finalDeliveryDate.format('Do MMM, YYYY')
            };
        };

        // Calculate timing for all packages
        const standardTiming = await calculateDeliveryTiming('standard');
        const expressTiming = await calculateDeliveryTiming('express');
        const urgentTiming = await calculateDeliveryTiming('urgent');

        // Generate timing messages for each package
        const generateTimingMessage = (timing, packageType) => {
            let visaTimingMessage = null;
            let visaTimingStatus = 'on_time';

            if (departureDate) {
                const userDepartureDate = moment(departureDate);
                if (userDepartureDate.isValid()) {
                    if (timing.deliveryDate.isAfter(userDepartureDate)) {
                        visaTimingMessage = `Your visa will not come in time before your departure date. Your visa will be delivered on ${timing.formattedDate}`;
                        visaTimingStatus = 'delayed';
                    } else {
                        const daysBeforeDeparture = userDepartureDate.diff(timing.deliveryDate, 'days');
                        if (daysBeforeDeparture >= 1) {
                            visaTimingMessage = `Estimated visa arrival by ${timing.formattedDate} (${daysBeforeDeparture} day${daysBeforeDeparture > 1 ? 's' : ''} before departure)`;
                        } else {
                            visaTimingMessage = `Estimated visa arrival by ${timing.formattedDate}`;
                        }
                        visaTimingStatus = 'on_time';
                    }
                }
            } else {
                visaTimingMessage = `Estimated visa arrival by ${timing.formattedDate}`;
                visaTimingStatus = 'unknown';
            }

            return { visaTimingMessage, visaTimingStatus };
        };

        const originalB2CPrice = parseFloat(visaDetails.b2c_price);
        const b2cDiscountedPrice = parseFloat(visaDetails.b2c_discount) > 0
            ? originalB2CPrice * (1 - parseFloat(visaDetails.b2c_discount) / 100)
            : originalB2CPrice;

        // Format the response data
        const formattedResponse = {
            id: visaDetails.id,
            name: visaDetails.name,
            country_id: visaDetails.country_id,
            countryName: visaDetails.country?.name || '',
            countryCode: visaDetails.country?.iso2 || '',
            allow_minor_to_apply: visaDetails.country?.allow_minor_to_apply || false,
            currency: 'INR',
            visaType: visaDetails.visa_type,
            entryType: visaDetails.entry_type,
            validityDays: visaDetails.validity_days,
            stayDurationDetails: visaDetails.stay_duration_details,
            shortDescription: visaDetails.short_description,
            detailedDescription: visaDetails.detailed_description,
            isFeatured: visaDetails.is_featured,
            discountPercent: visaDetails.discount_percent,
            b2cPrice: b2cDiscountedPrice,
            b2cProcessingTime: visaDetails.b2c_processing_time,
            b2cProcessingType: visaDetails.b2c_processing_type,
            b2cDiscount: visaDetails.b2c_discount,
            // Images
            images: {
                main: visaDetails.uploads?.[0]?.image_path ? resolveImageUrl(visaDetails.uploads?.[0]?.image_path) : '',
                secondary: [
                    visaDetails.uploads?.[1]?.image_path ? `${process.env.BASE_URL}${visaDetails.uploads[1].image_path}` : `${process.env.BASE_URL}defaults/country-1.jpg`,
                    visaDetails.uploads?.[2]?.image_path ? `${process.env.BASE_URL}${visaDetails.uploads[2].image_path}` : `${process.env.BASE_URL}defaults/country-2.jpg`
                ]
            },

            // Pricing information
            visaFees: {
                currencyCode: 'INR',
                standard: b2cDiscountedPrice
            },

            // Processing information
            processingTimes: {
                standard: getProcessingTimeText(visaDetails.processing_time_standard),
                express: visaDetails.processing_time_express ? getProcessingTimeText(visaDetails.processing_time_express) : null,
                urgent: visaDetails.processing_time_urgent ? getProcessingTimeText(visaDetails.processing_time_urgent) : null
            },

            // Structured data for components
            requiredDocuments: getRequiredDocuments(),
            visaPackages: [
                {
                    type: 'Standard',
                    price: b2cDiscountedPrice,
                    entryType: visaDetails.entry_type === 'single' ? 'Single Entry' : 'Multiple Entry',
                    processingTime: visaDetails.b2c_processing_time + ' ' + visaDetails.b2c_processing_type,
                    stayDuration: visaDetails.stay_duration_details || `${visaDetails.validity_days} days`,
                    features: [
                        'Document verification',
                        'Application tracking',
                        'Customer support'
                    ]
                }
            ],

            // Eligibility information
            eligibleNationalities: visaDetails.nationalities?.map(nat => ({
                countryName: nat.country?.name,
                countryCode: nat.country?.iso2
            })) || [],

            eligibilityCriteria: visaDetails.eligiblities?.map(elig => ({
                name: elig.criteria?.name,
                imageUrl: elig.criteria?.image_url ? `${process.env.BASE_URL}${elig.criteria.image_url}` : ''
            })) || [],

            // Additional metadata
            createdAt: visaDetails.created_at,
            visaTypes: [visaDetails.visa_type],

            // Delivery timing
            deliveryTiming: {
                standard: standardTiming,
                express: expressTiming,
                urgent: urgentTiming
            },

            // Visa timing messages
            visaTimingMessages: {
                standard: generateTimingMessage(standardTiming, 'standard'),
                express: generateTimingMessage(expressTiming, 'express'),
                urgent: generateTimingMessage(urgentTiming, 'urgent')
            }
        };

        res.status(200).json({
            success: true,
            message: 'Visa details fetched successfully.',
            data: formattedResponse
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.createVisaApplication = async (req, res) => {
    const transaction = await db.sequelize.transaction();
    try {
        const userId = req.user.id;
        const { visa_application_id, visa_id, package_name, travellers, number_of_travellers, departure_date, return_date, coupon_code } = req.body;
        // Input validation
        if (!userId) {
            await transaction.rollback();
            return res.status(401).json({ success: false, message: 'User authentication required!' });
        }

        if (!visa_id || !travellers || !number_of_travellers || !departure_date || !return_date) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: visa_id, travellers, number_of_travellers, departure_date, return_date'
            });
        }

        if (!Array.isArray(travellers) || travellers.length === 0) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: 'Travellers array is required and cannot be empty!' });
        }

        if (travellers.length !== parseInt(number_of_travellers)) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Number of travellers (${number_of_travellers}) does not match travellers array length (${travellers.length})!`
            });
        }

        // Validate dates
        const departureDate = new Date(departure_date);
        const returnDate = new Date(return_date);
        const currentDate = new Date();

        // if (departureDate < currentDate) {
        //     await transaction.rollback();
        //     return res.status(400).json({ success: false, message: 'Departure date cannot be in the past!' });
        // }

        if (returnDate <= departureDate) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: 'Return date must be after departure date!' });
        }

        // Fetch visa details with transaction
        const visa = await db.Visa.findOne({
            where: {
                id: visa_id,
                is_active: 1,
                is_deleted: 0
            },
            transaction
        });

        if (!visa) {
            await transaction.rollback();
            return res.status(404).json({ success: false, message: 'Visa not found or inactive!' });
        }

        // Validate processing time against current business hours and departure date
        const processingTimeValidation = validateVisaProcessingTime(visa, 'user', departure_date); // B2C application
        if (!processingTimeValidation.canProcess) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: processingTimeValidation.message,
                code: 'PROCESSING_TIME_EXCEEDED',
                details: processingTimeValidation.deliveryInfo
            });
        }

        // Validate delivery timeline - B2C booking validation
        try {
            const deliveryInfo = await calculateDeliveryDate(visa, true, departure_date);
            const userDepartureDate = moment(departure_date).endOf('day'); // Set to end of day for proper comparison

            if (deliveryInfo.deliveryWithBuffer.isAfter(userDepartureDate)) {
                await transaction.rollback();
                const processingTimeText = deliveryInfo.processingType === 'hour' ?
                    `${deliveryInfo.processingTime} hour${deliveryInfo.processingTime > 1 ? 's' : ''}` :
                    `${deliveryInfo.processingTime} business day${deliveryInfo.processingTime > 1 ? 's' : ''}`;

                return res.status(400).json({
                    success: false,
                    message: `Booking not allowed. Visa processing time (${processingTimeText}) exceeds your departure date. Please choose an earlier departure date or select a faster processing option.`,
                    details: {
                        estimatedDelivery: deliveryInfo.deliveryDate.format('Do MMM, YYYY [at] h:mm A'),
                        departureDate: userDepartureDate.format('Do MMM, YYYY'),
                        processingTime: processingTimeText,
                        processingType: deliveryInfo.processingType
                    }
                });
            }
        } catch (deliveryError) {
            console.error('Error validating delivery timeline for B2C booking:', deliveryError);
            // Continue with booking if delivery validation fails (don't block user)
        }

        // Calculate price based on package
        let price = parseFloat(visa.b2c_price);
        // const packageNameLower = package_name?.toLowerCase();

        // switch (packageNameLower) {
        //     case 'standard':
        //         price = parseFloat(visa.processing_price_standard) || 0;
        //         break;
        //     case 'express':
        //         price = parseFloat(visa.processing_price_express) || 0;
        //         break;
        //     case 'urgent':
        //         price = parseFloat(visa.processing_price_urgent) || 0;
        //         break;
        //     default:
        //         await transaction.rollback();
        //         return res.status(400).json({
        //             success: false,
        //             message: 'Invalid package name. Must be one of: standard, express, urgent'
        //         });
        // }

        if (price <= 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Price not available!`
            });
        }

        // Calculate base amount
        const baseAmount = price * parseInt(number_of_travellers);
        let totalAmount = baseAmount;
        let visaDiscountAmount = 0;

        // Apply visa discount if available
        const discount = parseFloat(visa.b2c_discount) || 0;
        if (discount > 0) {
            const discountRate = discount / 100;
            visaDiscountAmount = Math.round(baseAmount * discountRate);
            totalAmount = baseAmount - visaDiscountAmount;
        }

        // Handle coupon application
        let couponDiscountAmount = 0;
        let appliedCoupon = null;
        let finalAmount = totalAmount;

        if (coupon_code) {
            // Validate coupon for B2C users
            const couponValidation = await couponService.validateCouponCode(
                coupon_code,
                totalAmount,
                userId,
                'user'
            );

            if (!couponValidation.success) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: couponValidation.message
                });
            }

            couponDiscountAmount = couponValidation.data.discount_amount;
            finalAmount = couponValidation.data.final_amount;
            appliedCoupon = {
                id: couponValidation.data.coupon_id,
                code: coupon_code,
                discount_amount: couponDiscountAmount
            };
        }

        let visaApplication;
        let existingTravellerFields = [];
        let isUpdating = false;

        // SCENARIO HANDLING: Check if visa_application_id is provided
        if (visa_application_id) {
            // Scenario 1: Update existing draft application
            visaApplication = await db.VisaApplication.findOne({
                where: {
                    id: visa_application_id,
                    user_id: userId,
                    status: ['pending_payment', 'pending'] // Only allow updating draft/pending applications
                },
                include: [
                    {
                        model: db.VisaApplicationField,
                        as: 'visa_application_fields'
                    }
                ],
                transaction
            });

            if (!visaApplication) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Visa application not found or cannot be updated!'
                });
            }

            // Store existing traveller fields for updating
            existingTravellerFields = visaApplication.visa_application_fields || [];

            // Update the main application record
            await visaApplication.update({
                visa_id,
                departure_date: departureDate,
                return_date: returnDate,
                visa_type: visa.visa_type,
                entry_type: visa.entry_type,
                number_of_travellers: parseInt(number_of_travellers),
                status: 'pending',
                amount: finalAmount,
                discount: couponDiscountAmount,
                coupon_code: appliedCoupon ? appliedCoupon.code : null,
                coupon_id: appliedCoupon ? appliedCoupon.id : null,
            }, { transaction });

            isUpdating = true;
        } else {
            // Scenario 2: Create new visa application
            visaApplication = await db.VisaApplication.create({
                visa_id,
                user_id: userId,
                application_id: await getVisaApplicationCode('application'),
                departure_date: departureDate,
                return_date: returnDate,
                visa_type: visa.visa_type,
                entry_type: visa.entry_type,
                number_of_travellers: parseInt(number_of_travellers),
                status: 'pending',
                amount: finalAmount,
                discount: couponDiscountAmount,
                coupon_code: appliedCoupon ? appliedCoupon.code : null,
                coupon_id: appliedCoupon ? appliedCoupon.id : null,
                type: 'b2c',
            }, { transaction });
        }

        if (!visaApplication) {
            await transaction.rollback();
            return res.status(500).json({ success: false, message: 'Failed to create/update visa application!' });
        }

        // Process travellers and their documents
        const createdTravellers = [];

        // If updating, first delete existing traveller fields to replace with new ones
        if (isUpdating && existingTravellerFields.length > 0) {
            await db.VisaApplicationField.destroy({
                where: {
                    visa_application_id: visaApplication.id
                },
                transaction
            });
        }

        for (let i = 0; i < travellers.length; i++) {
            const traveller = travellers[i];

            let passport_front_photo, passport_back_photo, passport_size_photo, pan_card_photo, itr_1st_year_photo, itr_2nd_year_photo, itr_3rd_year_photo, invitation_letter, hotel_booking, flight_booking, travel_insurance, travel_itinerary, employment_letter, proof_of_funds, medical_insurance_certificate, vaccination_certificate, three_months_bank_statement, six_months_bank_statement, three_months_bank_signed_and_stamped_statement, six_months_bank_signed_and_stamped_statement, aadhar_card, passport_external_cover;

            // For updating: Preserve existing file paths if no new files are uploaded
            if (isUpdating && existingTravellerFields[i]) {
                const existingField = existingTravellerFields[i];
                passport_front_photo = passport_front_photo || existingField.passport_front_photo;
                passport_back_photo = passport_back_photo || existingField.passport_back_photo;
                passport_size_photo = passport_size_photo || existingField.passport_size_photo;
                pan_card_photo = pan_card_photo || existingField.pan_card_photo;
                itr_1st_year_photo = itr_1st_year_photo || existingField.itr_1st_year_photo;
                itr_2nd_year_photo = itr_2nd_year_photo || existingField.itr_2nd_year_photo;
                itr_3rd_year_photo = itr_3rd_year_photo || existingField.itr_3rd_year_photo;
                travel_itinerary = travel_itinerary || existingField.travel_itinerary;
                proof_of_funds = proof_of_funds || existingField.proof_of_funds;
                employment_letter = employment_letter || existingField.employment_letter;
                medical_insurance_certificate = medical_insurance_certificate || existingField.medical_insurance_certificate;
                vaccination_certificate = vaccination_certificate || existingField.vaccination_certificate;
                flight_booking = flight_booking || existingField.flight_booking;
                hotel_booking = hotel_booking || existingField.hotel_booking;
                invitation_letter = invitation_letter || existingField.invitation_letter;
                three_months_bank_statement = three_months_bank_statement || existingField.three_months_bank_statement;
                six_months_bank_statement = six_months_bank_statement || existingField.six_months_bank_statement;
                three_months_bank_signed_and_stamped_statement = three_months_bank_signed_and_stamped_statement || existingField.three_months_bank_signed_and_stamped_statement;
                six_months_bank_signed_and_stamped_statement = six_months_bank_signed_and_stamped_statement || existingField.six_months_bank_signed_and_stamped_statement;
                aadhar_card = aadhar_card || existingField.aadhar_card;
                passport_external_cover = passport_external_cover || existingField.passport_external_cover;
            }

            // Get files for this traveller
            const passport_front_field = `travellers[${i}][passport_front_photo]`;
            const passport_back_field = `travellers[${i}][passport_back_photo]`;
            const passport_size_photo_field = `travellers[${i}][passport_size_photo]`;
            const invitation_letter_field = `travellers[${i}][invitation_letter]`;
            const hotel_booking_field = `travellers[${i}][hotel_booking]`;
            const travel_itinerary_field = `travellers[${i}][travel_itinerary]`;
            const flight_booking_field = `travellers[${i}][flight_booking]`;
            const proof_of_funds_field = `travellers[${i}][proof_of_funds]`;
            const pan_card_photo_field = `travellers[${i}][pan_card_photo]`;
            const employment_letter_field = `travellers[${i}][employment_letter]`;
            const medical_insurance_certificate_field = `travellers[${i}][medical_insurance_certificate]`;
            const vaccination_certificate_field = `travellers[${i}][vaccination_certificate]`;
            const itr_1st_year_photo_field = `travellers[${i}][itr_1st_year_photo]`;
            const itr_2nd_year_photo_field = `travellers[${i}][itr_2nd_year_photo]`;
            const itr_3rd_year_photo_field = `travellers[${i}][itr_3rd_year_photo]`;

            const three_months_bank_statement_field = `travellers[${i}][three_months_bank_statement]`;
            const six_months_bank_statement_field = `travellers[${i}][six_months_bank_statement]`;
            const three_months_bank_signed_and_stamped_statement_field = `travellers[${i}][three_months_bank_signed_and_stamped_statement]`;
            const six_months_bank_signed_and_stamped_statement_field = `travellers[${i}][six_months_bank_signed_and_stamped_statement]`;
            const aadhar_card_field = `travellers[${i}][aadhar_card]`;
            const passport_external_cover_field = `travellers[${i}][passport_external_cover]`;

            // Extract file paths from newly uploaded files (overwrites existing if new files are uploaded)
            if (req.files && req.files[passport_front_field] && req.files[passport_front_field][0]) {
                passport_front_photo = req.files[passport_front_field][0].path;
            }

            if (req.files && req.files[passport_back_field] && req.files[passport_back_field][0]) {
                passport_back_photo = req.files[passport_back_field][0].path;
            }

            if (req.files && req.files[passport_size_photo_field] && req.files[passport_size_photo_field][0]) {
                passport_size_photo = req.files[passport_size_photo_field][0].path;
            }

            if (req.files && req.files[three_months_bank_statement_field] && req.files[three_months_bank_statement_field][0]) {
                three_months_bank_statement = req.files[three_months_bank_statement_field][0].path;
            }

            if (req.files && req.files[six_months_bank_statement_field] && req.files[six_months_bank_statement_field][0]) {
                six_months_bank_statement = req.files[six_months_bank_statement_field][0].path;
            }

            if (req.files && req.files[three_months_bank_signed_and_stamped_statement_field] && req.files[three_months_bank_signed_and_stamped_statement_field][0]) {
                three_months_bank_signed_and_stamped_statement = req.files[three_months_bank_signed_and_stamped_statement_field][0].path;
            }

            if (req.files && req.files[six_months_bank_signed_and_stamped_statement_field] && req.files[six_months_bank_signed_and_stamped_statement_field][0]) {
                six_months_bank_signed_and_stamped_statement = req.files[six_months_bank_signed_and_stamped_statement_field][0].path;
            }

            if (req.files && req.files[invitation_letter_field] && req.files[invitation_letter_field][0]) {
                invitation_letter = req.files[invitation_letter_field][0].path;
            }

            if (req.files && req.files[hotel_booking_field] && req.files[hotel_booking_field][0]) {
                hotel_booking = req.files[hotel_booking_field][0].path;
            }

            if (req.files && req.files[travel_itinerary_field] && req.files[travel_itinerary_field][0]) {
                travel_itinerary = req.files[travel_itinerary_field][0].path;
            }

            if (req.files && req.files[flight_booking_field] && req.files[flight_booking_field][0]) {
                flight_booking = req.files[flight_booking_field][0].path;
            }

            if (req.files && req.files[proof_of_funds_field] && req.files[proof_of_funds_field][0]) {
                proof_of_funds = req.files[proof_of_funds_field][0].path;
            }

            if (req.files && req.files[pan_card_photo_field] && req.files[pan_card_photo_field][0]) {
                pan_card_photo = req.files[pan_card_photo_field][0].path;
            }

            if (req.files && req.files[employment_letter_field] && req.files[employment_letter_field][0]) {
                employment_letter = req.files[employment_letter_field][0].path;
            }

            if (req.files && req.files[medical_insurance_certificate_field] && req.files[medical_insurance_certificate_field][0]) {
                medical_insurance_certificate = req.files[medical_insurance_certificate_field][0].path;
            }

            if (req.files && req.files[vaccination_certificate_field] && req.files[vaccination_certificate_field][0]) {
                vaccination_certificate = req.files[vaccination_certificate_field][0].path;
            }

            if (req.files && req.files[itr_1st_year_photo_field] && req.files[itr_1st_year_photo_field][0]) {
                itr_1st_year_photo = req.files[itr_1st_year_photo_field][0].path;
            }

            if (req.files && req.files[itr_2nd_year_photo_field] && req.files[itr_2nd_year_photo_field][0]) {
                itr_2nd_year_photo = req.files[itr_2nd_year_photo_field][0].path;
            }

            if (req.files && req.files[itr_3rd_year_photo_field] && req.files[itr_3rd_year_photo_field][0]) {
                itr_3rd_year_photo = req.files[itr_3rd_year_photo_field][0].path;
            }

            if (req.files && req.files[aadhar_card_field] && req.files[aadhar_card_field][0]) {
                aadhar_card = req.files[aadhar_card_field][0].path;
            }

            if (req.files && req.files[passport_external_cover_field] && req.files[passport_external_cover_field][0]) {
                passport_external_cover = req.files[passport_external_cover_field][0].path;
            }

            const visaApplicationFields = await db.VisaApplicationField.create({
                visa_application_id: visaApplication.id,
                first_name: traveller.first_name?.trim(),
                middle_name: traveller.middle_name?.trim() || null,
                last_name: traveller.last_name?.trim(),
                gender: traveller.gender,
                date_of_birth: new Date(traveller.date_of_birth),
                place_of_birth: traveller.place_of_birth?.trim() || null,
                marital_status: traveller.marital_status || null,
                address: traveller.address?.trim() || null,
                pincode: traveller.pincode?.trim() || null,
                emergency_number: traveller.emergency_number ? parseInt(traveller.emergency_number) : null,
                alternate_number: traveller.alternate_number ? parseInt(traveller.alternate_number) : null,
                company_name: traveller.company_name?.trim() || null,
                vendor_type: traveller.vendor_type || null,
                passport_number: traveller.passport_number?.trim(),
                passport_issue_date: traveller.passport_issue_date ? new Date(traveller.passport_issue_date) : null,
                passport_expiry_date: traveller.passport_expiry_date ? new Date(traveller.passport_expiry_date) : null,
                passport_issue_country: traveller.passport_issue_country?.trim() || null,
                passport_expiry_country: traveller.passport_expiry_country?.trim() || null,
                passport_issue_place: traveller.passport_issue_place?.trim() || null,

                // File uploads
                passport_size_photo: passport_size_photo,
                passport_front_photo: passport_front_photo,
                passport_back_photo: passport_back_photo,
                invitation_letter: invitation_letter,
                hotel_booking: hotel_booking,
                travel_itinerary: travel_itinerary,
                flight_booking: flight_booking,
                proof_of_funds: proof_of_funds,
                pan_card_photo: pan_card_photo,
                employment_letter: employment_letter,
                medical_insurance_certificate: medical_insurance_certificate,
                vaccination_certificate: vaccination_certificate,
                itr_1st_year_photo: itr_1st_year_photo,
                itr_2nd_year_photo: itr_2nd_year_photo,
                itr_3rd_year_photo: itr_3rd_year_photo,
                three_months_bank_statement: three_months_bank_statement,
                six_months_bank_statement: six_months_bank_statement,
                three_months_bank_signed_and_stamped_statement: three_months_bank_signed_and_stamped_statement,
                six_months_bank_signed_and_stamped_statement: six_months_bank_signed_and_stamped_statement,
                aadhar_card: aadhar_card,
                passport_external_cover: passport_external_cover,

                // Visa details
                visa_type: traveller.visa_type || visa.visa_type,
                visa_category: traveller.visa_category || null,
                purpose_of_visit: traveller.purpose_of_visit?.trim() || null,
                intended_travel_date: traveller.intended_travel_date ? new Date(traveller.intended_travel_date) : departureDate,
                intended_return_date: traveller.intended_return_date ? new Date(traveller.intended_return_date) : returnDate,
                number_of_entries: traveller.number_of_entries ? parseInt(traveller.number_of_entries) : null,
                duration_of_stay: traveller.duration_of_stay ? parseInt(traveller.duration_of_stay) : null,
                previously_visited: traveller.previously_visited === 'true' || traveller.previously_visited === true,
                previously_visited_dates: traveller.previously_visited_dates?.trim() || null,

                // Employment details
                current_occupation: traveller.current_occupation?.trim() || null,
                employer_name: traveller.employer_name?.trim() || null,
                employer_address: traveller.employer_address?.trim() || null,
                monthly_income: traveller.monthly_income ? parseFloat(traveller.monthly_income) : null,
                previous_employment: traveller.previous_employment?.trim() || null,
                previous_education: traveller.previous_education?.trim() || null,
                previous_employment_dates: traveller.previous_employment_dates ? new Date(traveller.previous_employment_dates) : null,
                previous_education_dates: traveller.previous_education_dates ? new Date(traveller.previous_education_dates) : null,
                previous_employment_details: traveller.previous_employment_details?.trim() || null,
                previous_education_details: traveller.previous_education_details?.trim() || null,
            }, { transaction });

            if (!visaApplicationFields) {
                await transaction.rollback();
                return res.status(500).json({
                    success: false,
                    message: `Failed to create visa application field for traveller ${i + 1}!`
                });
            }

            createdTravellers.push({
                index: i + 1,
                id: visaApplicationFields.id,
                name: `${traveller.first_name} ${traveller.last_name}`,
                passport_number: traveller.passport_number
            });
        }

        // Create payment record with Zoho order
        const visaApplicationPayment = await db.VisaApplicationPayment.create({
            user_id: userId,
            payment_method: 'online',
            payment_status: 'pending',
            visa_application_id: visaApplication.id,
            amount: finalAmount,
            payment_currency: 'INR',
            payment_gateway: 'zoho'
        }, { transaction });

        if (!visaApplicationPayment) {
            await transaction.rollback();
            return res.status(500).json({ success: false, message: 'Failed to create payment record!' });
        }

        // Get user details for Zoho order
        const user = await db.User.findByPk(userId, { transaction });
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({ success: false, message: 'User not found!' });
        }

        // Create Zoho payment order
        const zohoOrderOptions = {
            amount: finalAmount,
            currency: 'INR',
            receipt: `visa_app_${visaApplication.application_id}`,
            notes: {
                visa_application_id: visaApplication.id,
                payment_id: visaApplicationPayment.id,
                user_id: userId,
                visa_name: visa.name,
                package_name: 'B2C'
            },
            customerId: user.email // We'll use email as customer identifier
        };

        let zohoOrder;
        try {
            zohoOrder = await zohoPaymentsService.createPaymentOrder(zohoOrderOptions);
        } catch (orderError) {
            await transaction.rollback();
            return res.status(500).json({ success: false, message: 'Failed to create Zoho payment order!', error: orderError.message });
        }

        // Create Zoho payment session to obtain payments_session_id
        const zohoSessionOptions = {
            amount: finalAmount,
            currency: 'INR',
            reference_id: zohoOrder.id,
            name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Vendor',
            email: user.email,
            phone: user.phone,
            notes: zohoOrder.notes
        };

        let zohoSession;
        try {
            zohoSession = await zohoPaymentsService.createPaymentSession(zohoSessionOptions);
        } catch (sessionError) {
            await transaction.rollback();
            console.error('Zoho payment session creation error:', sessionError.zohoError || sessionError.message);
            return res.status(503).json({
                success: false,
                message: 'Payment gateway is temporarily unavailable. Please try again in a few minutes or contact support if this continues.',
                code: 'PAYMENT_GATEWAY_UNAVAILABLE'
            });
        }

        // Update payment record with Zoho order details
        await db.VisaApplicationPayment.update({
            payment_reference: zohoSession.id,
            payment_info: JSON.stringify({ session: zohoSession })
        }, {
            where: { id: visaApplicationPayment.id },
            transaction
        });

        // Commit transaction
        await transaction.commit();

        // Apply coupon usage tracking if coupon was used
        if (appliedCoupon) {
            try {
                await couponService.applyCoupon(
                    appliedCoupon.id,
                    userId,
                    visaApplication.id,
                    totalAmount,
                    'user'
                );
            } catch (couponError) {
                console.error('Error applying coupon usage:', couponError);
                // Don't fail the application if coupon tracking fails
            }
        }

        // Send notification to admins about new visa application
        // try {
        //     await notificationService.handleVisaApplicationReceived(visaApplication, visa, user.dataValues);
        // } catch (notificationError) {
        //     console.error('Failed to send visa application notification:', notificationError);
        //     // Don't fail the response if notification fails
        // }

        // Prepare response data
        const responseData = {
            application: {
                id: visaApplication.id,
                application_id: visaApplication.application_id,
                visa_id: visaApplication.visa_id,
                visa_name: visa.name,
                visa_type: visaApplication.visa_type,
                entry_type: visaApplication.entry_type,
                package_name: 'B2C',
                departure_date: visaApplication.departure_date,
                return_date: visaApplication.return_date,
                number_of_travellers: visaApplication.number_of_travellers,
                status: visaApplication.status,
                amount: visaApplication.amount,
                created_at: visaApplication.created_at
            },
            travellers: createdTravellers,
            payment_session_id: zohoSession.id,
            payment: {
                id: visaApplicationPayment.id,
                amount: visaApplicationPayment.amount,
                currency: visaApplicationPayment.payment_currency,
                status: visaApplicationPayment.payment_status,
                method: visaApplicationPayment.payment_method,
                gateway: 'zoho',
                order_id: zohoOrder.id
            },
            zoho: {
                payment_session_id: zohoSession.id,
                order_id: zohoOrder.id,
                amount: zohoOrder.amount,
                currency: zohoOrder.currency,
                client_id: process.env.ZOHO_CLIENT_ID,
                name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User',
                email: user.email,
                contact: user.phone,
                description: `Visa Application - ${visa.name}`,
                notes: zohoOrder.notes,
                theme: {
                    color: '#3399cc'
                }
            }
        };

        const successMessage = isUpdating
            ? 'Visa application updated successfully! Please complete the payment.'
            : 'Visa application created successfully! Please complete the payment.';

        return res.status(200).json({
            success: true,
            message: successMessage,
            data: responseData
        });

    } catch (error) {
        // Rollback transaction on any error
        await transaction.rollback();
        console.error('createVisaApplication error:', error);

        // Handle specific error types
        if (error.name === 'SequelizeValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.errors.map(e => ({ field: e.path, message: e.message }))
            });
        }

        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid reference data provided'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

exports.getVisaSearchSuggestions = async (req, res) => {
    try {
        const { query } = req.query;

        if (!query || query.trim().length < 2) {
            return res.status(200).json({
                success: true,
                data: []
            });
        }

        const searchQuery = query.trim();

        const suggestions = await db.Visa.findAll({
            where: {
                is_active: 1,
                is_deleted: 0,
                [Op.or]: [
                    { name: { [Op.like]: `%${searchQuery}%` } },
                    { '$country.name$': { [Op.like]: `%${searchQuery}%` } }
                ]
            },
            include: [
                {
                    model: db.Country,
                    as: 'country',
                    required: false,
                    attributes: ['name', 'currency', 'iso2']
                },
                {
                    model: db.VisaUploads,
                    as: 'uploads',
                    required: false,
                }
            ],
            attributes: [
                'id',
                'name',
                'base_price',
                'processing_time_standard',
                'discount_percent'
            ],
            limit: 8,
            order: [
                ['is_featured', 'DESC'],
                ['display_order', 'ASC']
            ]
        });

        const formattedSuggestions = suggestions.map(visa => {
            // Calculate processing time in readable format
            const getProcessingTimeText = (days) => {
                if (!days) return 'Standard processing';
                return `${days} ${days === 1 ? 'day' : 'days'}`;
            };

            // Calculate final price after discount
            const finalPrice = visa.discount_percent > 0
                ? visa.base_price * (1 - visa.discount_percent / 100)
                : visa.base_price;

            return {
                id: visa.id,
                displayName: visa.name,
                shortName: visa.country?.name || '',
                price: finalPrice,
                currency: visa.country?.currency || 'USD',
                countryCode: visa.country?.iso2 || '',
                imageUrl: visa.uploads?.[0]?.image_path ? resolveImageUrl(visa.uploads?.[0]?.image_path) : '',
                searchThumbUrl: visa.uploads?.[0]?.image_path ? resolveImageUrl(visa.uploads?.[0]?.image_path) : '',
                visaTimeShort: getProcessingTimeText(visa.processing_time_standard)
            };
        });

        res.status(200).json({
            success: true,
            data: formattedSuggestions
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.getDynamicVisaForm = async (req, res) => {
    try {
        const { visaId } = req.params;

        const visa = await db.Visa.findOne({
            where: {
                id: visaId,
                is_active: 1,
                is_deleted: 0
            }
        });

        if (!visa) {
            return res.status(404).json({ success: false, message: 'Visa not found!' });
        }

        const visaForm = await db.VisaFormField.findOne({
            where: {
                country_id: visa.country_id,
                is_active: 1,
                is_deleted: 0
            },
            attributes: { exclude: ['id', 'nationality', 'created_at', 'updated_at', 'is_active', 'is_deleted'] }
        });

        if (!visaForm) {
            return res.status(200).json({ success: true, message: 'Visa form not found!' });
        }

        res.status(200).json({ success: true, message: 'Visa form found!', data: { ...visaForm.dataValues, visa_name: visa.name } });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.getVisaPricing = async (req, res) => {
    try {
        const { visa_id, package_name, number_of_travellers } = req.body;

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

        let price = 0;
        let package_price = 0;
        if (package_name?.toLowerCase() === 'standard') {
            package_price = parseFloat(visa.processing_price_standard);
        }
        if (package_name?.toLowerCase() === 'express') {
            package_price = parseFloat(visa.processing_price_express);
        }
        if (package_name?.toLowerCase() === 'urgent') {
            package_price = parseFloat(visa.processing_price_urgent);
        }

        price = package_price * number_of_travellers;

        return res.status(200).json({ success: true, message: 'Visa pricing fetched successfully.', data: { price, visa_name: visa.name, visa_type: visa.visa_type, package_name, package_price, number_of_travellers } });

    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.submitVendorVisaApplication = async (req, res) => {
    const transaction = await db.sequelize.transaction();
    try {
        const userId = req.user.id;
        const { visa_application_id, visa_id, travellers, number_of_travellers, departure_date, return_date, coupon_code, from = 'vendor' } = req.body;

        // Input validation
        if (!userId) {
            await transaction.rollback();
            return res.status(401).json({ success: false, message: 'User authentication required!' });
        }

        if (!visa_id || !travellers || !number_of_travellers || !departure_date || !return_date) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: visa_id, travellers, number_of_travellers, departure_date, return_date'
            });
        }

        if (!Array.isArray(travellers) || travellers.length === 0) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: 'Travellers array is required and cannot be empty!' });
        }

        if (travellers.length !== parseInt(number_of_travellers)) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Number of travellers (${number_of_travellers}) does not match travellers array length (${travellers.length})!`
            });
        }

        // Validate dates
        const departureDate = new Date(departure_date);
        const returnDate = new Date(return_date);
        const currentDate = new Date();

        // if (departureDate < currentDate) {
        //     await transaction.rollback();
        //     return res.status(400).json({ success: false, message: 'Departure date cannot be in the past!' });
        // }

        if (returnDate <= departureDate) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: 'Return date must be after departure date!' });
        }

        // Fetch visa details with transaction
        const visa = await db.Visa.findOne({
            where: {
                id: visa_id,
                is_active: 1,
                is_deleted: 0
            },
            transaction
        });

        if (!visa) {
            await transaction.rollback();
            return res.status(404).json({ success: false, message: 'Visa not found or inactive!' });
        }

        // Validate processing time against current business hours and departure date
        const processingTimeValidation = validateVisaProcessingTime(visa, from, departure_date);
        if (!processingTimeValidation.canProcess) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: processingTimeValidation.message,
                code: 'PROCESSING_TIME_EXCEEDED',
                details: processingTimeValidation.deliveryInfo
            });
        }

        // Validate delivery timeline - B2B booking validation
        try {
            const deliveryInfo = await calculateDeliveryDate(visa, false, departure_date);
            const userDepartureDate = moment(departure_date).endOf('day'); // Set to end of day for proper comparison

            if (deliveryInfo.deliveryWithBuffer.isAfter(userDepartureDate)) {
                await transaction.rollback();
                const processingTimeText = deliveryInfo.processingType === 'hour' ?
                    `${deliveryInfo.processingTime} hour${deliveryInfo.processingTime > 1 ? 's' : ''}` :
                    `${deliveryInfo.processingTime} business day${deliveryInfo.processingTime > 1 ? 's' : ''}`;

                return res.status(400).json({
                    success: false,
                    message: `Booking not allowed. Visa processing time (${processingTimeText}) exceeds your departure date. Please choose an earlier departure date or contact support for expedited processing.`,
                    details: {
                        estimatedDelivery: deliveryInfo.deliveryDate.format('Do MMM, YYYY [at] h:mm A'),
                        departureDate: userDepartureDate.format('Do MMM, YYYY'),
                        processingTime: processingTimeText,
                        processingType: deliveryInfo.processingType
                    }
                });
            }
        } catch (deliveryError) {
            console.error('Error validating delivery timeline for B2B booking:', deliveryError);
            // Continue with booking if delivery validation fails (don't block vendor)
        }
        // Dynamic pricing based on 'from' parameter
        const isUserApplication = from === 'user';
        const price = parseFloat(isUserApplication ? visa.b2c_price : visa.b2b_price) || 0;
        const discount = parseFloat(isUserApplication ? visa.b2c_discount : visa.b2b_discount) || 0;

        if (price <= 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `${isUserApplication ? 'B2C' : 'B2B'} price not available for this visa`
            });
        }

        // Calculate base amount
        const baseAmount = price * parseInt(number_of_travellers);
        let totalAmount = baseAmount;
        let visaDiscountAmount = 0;

        // Apply visa discount if available
        if (discount > 0) {
            const discountRate = discount / 100;
            visaDiscountAmount = Math.round(baseAmount * discountRate);
            totalAmount = baseAmount - visaDiscountAmount;
        }

        // Handle coupon application
        let couponDiscountAmount = 0;
        let appliedCoupon = null;
        let finalAmount = totalAmount;

        if (coupon_code) {
            const userType = isUserApplication ? 'user' : 'vendor';

            // Validate coupon
            const couponValidation = await couponService.validateCouponCode(
                coupon_code,
                totalAmount,
                userId,
                userType
            );

            if (!couponValidation.success) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: couponValidation.message
                });
            }

            couponDiscountAmount = couponValidation.data.discount_amount;
            finalAmount = couponValidation.data.final_amount;
            totalAmount = finalAmount;
            appliedCoupon = {
                id: couponValidation.data.coupon_id,
                code: coupon_code,
                discount_amount: couponDiscountAmount
            };
        }

        // Check if this is a draft save or immediate payment
        const submitForPayment = req.body.submit_for_payment === 'true' || req.body.submit_for_payment === true;
        const applicationStatus = 'pending_payment';

        let visaApplication;
        let existingTravellerFields = [];
        let isUpdating = false;

        // SCENARIO HANDLING: Check if visa_application_id is provided
        if (visa_application_id) {
            // Scenario 1: Update existing draft application
            visaApplication = await db.VisaApplication.findOne({
                where: {
                    id: visa_application_id,
                    user_id: userId,
                    status: ['pending_payment', 'pending'] // Only allow updating draft/pending applications
                },
                include: [
                    {
                        model: db.VisaApplicationField,
                        as: 'visa_application_fields'
                    }
                ],
                transaction
            });

            if (!visaApplication) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Visa application not found or cannot be updated!'
                });
            }

            // Store existing traveller fields for updating
            existingTravellerFields = visaApplication.visa_application_fields || [];

            // Update the main application record
            await visaApplication.update({
                visa_id,
                departure_date: departureDate,
                return_date: returnDate,
                visa_type: visa.visa_type,
                entry_type: visa.entry_type,
                number_of_travellers: parseInt(number_of_travellers),
                status: applicationStatus,
                amount: finalAmount,
                discount: couponDiscountAmount,
                coupon_code: appliedCoupon ? appliedCoupon.code : null,
                coupon_id: appliedCoupon ? appliedCoupon.id : null,
            }, { transaction });

            isUpdating = true;
        } else {
            // Scenario 2: Create new visa application
            visaApplication = await db.VisaApplication.create({
                visa_id,
                user_id: userId,
                application_id: await getVisaApplicationCode('application'),
                departure_date: departureDate,
                return_date: returnDate,
                visa_type: visa.visa_type,
                entry_type: visa.entry_type,
                number_of_travellers: parseInt(number_of_travellers),
                status: applicationStatus,
                amount: finalAmount,
                type: isUserApplication ? 'b2c' : 'b2b',
                discount: couponDiscountAmount,
                coupon_code: appliedCoupon ? appliedCoupon.code : null,
                coupon_id: appliedCoupon ? appliedCoupon.id : null,
            }, { transaction });
        }

        if (!visaApplication) {
            await transaction.rollback();
            return res.status(500).json({ success: false, message: 'Failed to create/update visa application!' });
        }

        // Process travellers and their documents
        const processedTravellers = [];

        // If updating, first delete existing traveller fields to replace with new ones
        if (isUpdating && existingTravellerFields.length > 0) {
            await db.VisaApplicationField.destroy({
                where: {
                    visa_application_id: visaApplication.id
                },
                transaction
            });
        }

        for (let i = 0; i < travellers.length; i++) {
            const traveller = travellers[i];

            let { passport_front_photo, passport_back_photo, passport_size_photo, marital_status, first_name, middle_name, last_name, gender, date_of_birth, place_of_birth, passport_issue_place, passport_number, passport_issue_date, passport_expiry_date, country_id, pan_card_photo, itr_1st_year_photo, itr_2nd_year_photo, itr_3rd_year_photo, hotel_booking, invitation_letter, three_months_bank_statement, six_months_bank_statement, three_months_bank_signed_and_stamped_statement, six_months_bank_signed_and_stamped_statement, flight_booking, travel_itinerary, travel_insurance, proof_of_funds, employment_letter, medical_insurance_certificate, vaccination_certificate, aadhar_card, passport_external_cover } = traveller;

            // For updating: Preserve existing file paths if no new files are uploaded
            if (isUpdating && existingTravellerFields[i]) {
                const existingField = existingTravellerFields[i];
                passport_front_photo = passport_front_photo || existingField.passport_front_photo;
                passport_back_photo = passport_back_photo || existingField.passport_back_photo;
                passport_size_photo = passport_size_photo || existingField.passport_size_photo;
                pan_card_photo = pan_card_photo || existingField.pan_card_photo;
                itr_1st_year_photo = itr_1st_year_photo || existingField.itr_1st_year_photo;
                itr_2nd_year_photo = itr_2nd_year_photo || existingField.itr_2nd_year_photo;
                itr_3rd_year_photo = itr_3rd_year_photo || existingField.itr_3rd_year_photo;
                travel_itinerary = travel_itinerary || existingField.travel_itinerary;
                travel_insurance = travel_insurance || existingField.travel_insurance;
                proof_of_funds = proof_of_funds || existingField.proof_of_funds;
                employment_letter = employment_letter || existingField.employment_letter;
                medical_insurance_certificate = medical_insurance_certificate || existingField.medical_insurance_certificate;
                vaccination_certificate = vaccination_certificate || existingField.vaccination_certificate;
                flight_booking = flight_booking || existingField.flight_booking;
                hotel_booking = hotel_booking || existingField.hotel_booking;
                invitation_letter = invitation_letter || existingField.invitation_letter;
                three_months_bank_statement = three_months_bank_statement || existingField.three_months_bank_statement;
                six_months_bank_statement = six_months_bank_statement || existingField.six_months_bank_statement;
                three_months_bank_signed_and_stamped_statement = three_months_bank_signed_and_stamped_statement || existingField.three_months_bank_signed_and_stamped_statement;
                six_months_bank_signed_and_stamped_statement = six_months_bank_signed_and_stamped_statement || existingField.six_months_bank_signed_and_stamped_statement;
                aadhar_card = aadhar_card || existingField.aadhar_card;
                passport_external_cover = passport_external_cover || existingField.passport_external_cover;
            }

            // Get files for this traveller from uploaded files
            const passport_front_field = `travellers[${i}][passport_front_photo]`;
            const passport_back_field = `travellers[${i}][passport_back_photo]`;
            const passport_size_photo_field = `travellers[${i}][passport_size_photo]`;
            const pan_card_photo_field = `travellers[${i}][pan_card_photo]`;
            const itr_1st_year_photo_field = `travellers[${i}][itr_1st_year_photo]`;
            const itr_2nd_year_photo_field = `travellers[${i}][itr_2nd_year_photo]`;
            const itr_3rd_year_photo_field = `travellers[${i}][itr_3rd_year_photo]`;
            const flight_booking_field = `travellers[${i}][flight_booking]`;
            const travel_itinerary_field = `travellers[${i}][travel_itinerary]`;
            const travel_insurance_field = `travellers[${i}][travel_insurance]`;
            const proof_of_funds_field = `travellers[${i}][proof_of_funds]`;
            const employment_letter_field = `travellers[${i}][employment_letter]`;
            const medical_insurance_certificate_field = `travellers[${i}][medical_insurance_certificate]`;
            const vaccination_certificate_field = `travellers[${i}][vaccination_certificate]`;
            const hotel_booking_field = `travellers[${i}][hotel_booking]`;
            const invitation_letter_field = `travellers[${i}][invitation_letter]`;
            const three_months_bank_statement_field = `travellers[${i}][three_months_bank_statement]`;
            const six_months_bank_statement_field = `travellers[${i}][six_months_bank_statement]`;
            const three_months_bank_signed_and_stamped_statement_field = `travellers[${i}][three_months_bank_signed_and_stamped_statement]`;
            const six_months_bank_signed_and_stamped_statement_field = `travellers[${i}][six_months_bank_signed_and_stamped_statement]`;
            const aadhar_card_field = `travellers[${i}][aadhar_card]`;
            const passport_external_cover_field = `travellers[${i}][passport_external_cover]`;

            // Extract file paths from newly uploaded files (overwrites existing if new files are uploaded)
            if (req.files && req.files[passport_front_field] && req.files[passport_front_field][0]) {
                passport_front_photo = req.files[passport_front_field][0].path;
            }

            if (req.files && req.files[passport_back_field] && req.files[passport_back_field][0]) {
                passport_back_photo = req.files[passport_back_field][0].path;
            }

            if (req.files && req.files[passport_size_photo_field] && req.files[passport_size_photo_field][0]) {
                passport_size_photo = req.files[passport_size_photo_field][0].path;
            }

            if (req.files && req.files[pan_card_photo_field] && req.files[pan_card_photo_field][0]) {
                pan_card_photo = req.files[pan_card_photo_field][0].path;
            }

            if (req.files && req.files[itr_1st_year_photo_field] && req.files[itr_1st_year_photo_field][0]) {
                itr_1st_year_photo = req.files[itr_1st_year_photo_field][0].path;
            }

            if (req.files && req.files[itr_2nd_year_photo_field] && req.files[itr_2nd_year_photo_field][0]) {
                itr_2nd_year_photo = req.files[itr_2nd_year_photo_field][0].path;
            }

            if (req.files && req.files[itr_3rd_year_photo_field] && req.files[itr_3rd_year_photo_field][0]) {
                itr_3rd_year_photo = req.files[itr_3rd_year_photo_field][0].path;
            }

            if (req.files && req.files[flight_booking_field] && req.files[flight_booking_field][0]) {
                flight_booking = req.files[flight_booking_field][0].path;
            }

            if (req.files && req.files[travel_itinerary_field] && req.files[travel_itinerary_field][0]) {
                travel_itinerary = req.files[travel_itinerary_field][0].path;
            }

            if (req.files && req.files[travel_insurance_field] && req.files[travel_insurance_field][0]) {
                travel_insurance = req.files[travel_insurance_field][0].path;
            }

            if (req.files && req.files[proof_of_funds_field] && req.files[proof_of_funds_field][0]) {
                proof_of_funds = req.files[proof_of_funds_field][0].path;
            }

            if (req.files && req.files[employment_letter_field] && req.files[employment_letter_field][0]) {
                employment_letter = req.files[employment_letter_field][0].path;
            }

            if (req.files && req.files[medical_insurance_certificate_field] && req.files[medical_insurance_certificate_field][0]) {
                medical_insurance_certificate = req.files[medical_insurance_certificate_field][0].path;
            }

            if (req.files && req.files[vaccination_certificate_field] && req.files[vaccination_certificate_field][0]) {
                vaccination_certificate = req.files[vaccination_certificate_field][0].path;
            }

            if (req.files && req.files[hotel_booking_field] && req.files[hotel_booking_field][0]) {
                hotel_booking = req.files[hotel_booking_field][0].path;
            }

            if (req.files && req.files[invitation_letter_field] && req.files[invitation_letter_field][0]) {
                invitation_letter = req.files[invitation_letter_field][0].path;
            }

            if (req.files && req.files[three_months_bank_statement_field] && req.files[three_months_bank_statement_field][0]) {
                three_months_bank_statement = req.files[three_months_bank_statement_field][0].path;
            }

            if (req.files && req.files[six_months_bank_statement_field] && req.files[six_months_bank_statement_field][0]) {
                six_months_bank_statement = req.files[six_months_bank_statement_field][0].path;
            }

            if (req.files && req.files[three_months_bank_signed_and_stamped_statement_field] && req.files[three_months_bank_signed_and_stamped_statement_field][0]) {
                three_months_bank_signed_and_stamped_statement = req.files[three_months_bank_signed_and_stamped_statement_field][0].path;
            }

            if (req.files && req.files[six_months_bank_signed_and_stamped_statement_field] && req.files[six_months_bank_signed_and_stamped_statement_field][0]) {
                six_months_bank_signed_and_stamped_statement = req.files[six_months_bank_signed_and_stamped_statement_field][0].path;
            }

            if (req.files && req.files[aadhar_card_field] && req.files[aadhar_card_field][0]) {
                aadhar_card = req.files[aadhar_card_field][0].path;
            }

            if (req.files && req.files[passport_external_cover_field] && req.files[passport_external_cover_field][0]) {
                passport_external_cover = req.files[passport_external_cover_field][0].path;
            }

            // Create new traveller field (whether new application or updating existing)
            const visaApplicationFields = await db.VisaApplicationField.create({
                visa_application_id: visaApplication.id,
                first_name: traveller.first_name?.trim(),
                middle_name: traveller.middle_name?.trim() || null,
                last_name: traveller.last_name?.trim(),
                gender: traveller.gender,
                date_of_birth: new Date(traveller.date_of_birth),
                place_of_birth: traveller.place_of_birth?.trim() || null,
                marital_status: traveller.marital_status || null,
                address: traveller.address?.trim() || null,
                pincode: traveller.pincode?.trim() || null,
                emergency_number: traveller.emergency_number ? parseInt(traveller.emergency_number) : null,
                alternate_number: traveller.alternate_number ? parseInt(traveller.alternate_number) : null,
                company_name: traveller.company_name?.trim() || null,
                vendor_type: traveller.vendor_type || null,
                passport_number: traveller.passport_number?.trim(),
                passport_issue_date: traveller.passport_issue_date ? new Date(traveller.passport_issue_date) : null,
                passport_expiry_date: traveller.passport_expiry_date ? new Date(traveller.passport_expiry_date) : null,
                passport_issue_country: traveller.passport_issue_country?.trim() || null,
                passport_expiry_country: traveller.passport_expiry_country?.trim() || null,
                passport_issue_place: traveller.passport_issue_place?.trim() || null,

                // File uploads
                passport_size_photo: passport_size_photo,
                passport_front_photo: passport_front_photo,
                passport_back_photo: passport_back_photo,
                pan_card_photo: pan_card_photo,
                itr_1st_year_photo: itr_1st_year_photo,
                itr_2nd_year_photo: itr_2nd_year_photo,
                itr_3rd_year_photo: itr_3rd_year_photo,
                vaccination_certificate: vaccination_certificate,
                medical_insurance_certificate: medical_insurance_certificate,
                employment_letter: employment_letter,
                proof_of_funds: proof_of_funds,
                flight_booking: flight_booking,
                travel_insurance: travel_insurance,
                travel_itinerary: travel_itinerary,
                hotel_booking: hotel_booking,
                invitation_letter: invitation_letter,
                three_months_bank_statement: three_months_bank_statement,
                six_months_bank_statement: six_months_bank_statement,
                three_months_bank_signed_and_stamped_statement: three_months_bank_signed_and_stamped_statement,
                six_months_bank_signed_and_stamped_statement: six_months_bank_signed_and_stamped_statement,
                aadhar_card: aadhar_card,
                passport_external_cover: passport_external_cover,

                // Additional fields
                visa_type: traveller.visa_type || visa.visa_type,
                visa_category: traveller.visa_category || null,
                purpose_of_visit: traveller.purpose_of_visit?.trim() || null,
                intended_travel_date: traveller.intended_travel_date ? new Date(traveller.intended_travel_date) : departureDate,
                intended_return_date: traveller.intended_return_date ? new Date(traveller.intended_return_date) : returnDate,
                number_of_entries: traveller.number_of_entries ? parseInt(traveller.number_of_entries) : null,
                duration_of_stay: traveller.duration_of_stay ? parseInt(traveller.duration_of_stay) : null,
                previously_visited: traveller.previously_visited === 'true' || traveller.previously_visited === true,
                previously_visited_dates: traveller.previously_visited_dates?.trim() || null,
                current_occupation: traveller.current_occupation?.trim() || null,
                employer_name: traveller.employer_name?.trim() || null,
                employer_address: traveller.employer_address?.trim() || null,
                monthly_income: traveller.monthly_income ? parseFloat(traveller.monthly_income) : null,
                previous_employment: traveller.previous_employment?.trim() || null,
                previous_education: traveller.previous_education?.trim() || null,
                previous_employment_dates: traveller.previous_employment_dates ? new Date(traveller.previous_employment_dates) : null,
                previous_education_dates: traveller.previous_education_dates ? new Date(traveller.previous_education_dates) : null,
                previous_employment_details: traveller.previous_employment_details?.trim() || null,
                previous_education_details: traveller.previous_education_details?.trim() || null,
            }, { transaction });

            if (!visaApplicationFields) {
                await transaction.rollback();
                return res.status(500).json({
                    success: false,
                    message: `Failed to create/update visa application field for traveller ${i + 1}!`
                });
            }

            processedTravellers.push({
                index: i + 1,
                id: visaApplicationFields.id,
                name: `${traveller.first_name} ${traveller.last_name}`,
                passport_number: traveller.passport_number
            });
        }

        // Only create payment record if submitting for immediate payment
        if (!submitForPayment) {
            // This is a draft save - commit transaction and return
            await transaction.commit();

            const draftMessage = isUpdating
                ? 'Visa application updated and saved as draft successfully!'
                : 'Visa application draft saved successfully!';

            return res.status(200).json({
                success: true,
                message: draftMessage,
                data: {
                    application: {
                        id: visaApplication.id,
                        application_id: visaApplication.application_id,
                        status: visaApplication.status,
                        created_at: visaApplication.created_at,
                        updated_at: visaApplication.updated_at,
                        amount: visaApplication.amount,
                        visa_name: visa.name,
                        is_updated: isUpdating
                    },
                    travellers: processedTravellers
                }
            });
        }

        // Create payment record with Zoho order
        const visaApplicationPayment = await db.VisaApplicationPayment.create({
            user_id: userId,
            payment_method: 'online',
            payment_status: 'pending',
            visa_application_id: visaApplication.id,
            amount: totalAmount,
            payment_currency: 'INR',
            payment_gateway: 'zoho'
        }, { transaction });

        if (!visaApplicationPayment) {
            await transaction.rollback();
            return res.status(500).json({ success: false, message: 'Failed to create payment record!' });
        }

        // Get user details for Zoho order
        const user = await db.User.findByPk(userId, { transaction });
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({ success: false, message: 'User not found!' });
        }

        // Create Zoho order
        const zohoOrderOptions = {
            amount: totalAmount,
            currency: 'INR',
            receipt: `vendor_visa_app_${visaApplication.application_id}`,
            notes: {
                visa_application_id: visaApplication.id,
                payment_id: visaApplicationPayment.id,
                user_id: userId,
                visa_name: visa.name,
                application_type: 'vendor_b2b'
            }
        };

        let zohoOrder;
        try {
            zohoOrder = await zohoPaymentsService.createPaymentOrder(zohoOrderOptions);
        } catch (orderError) {
            await transaction.rollback();
            return res.status(500).json({ success: false, message: 'Failed to create Zoho payment order!', error: orderError.message });
        }

        // Create Zoho payment session to obtain payments_session_id
        const zohoSessionOptions = {
            amount: totalAmount,
            currency: 'INR',
            reference_id: zohoOrder.id,
            name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Vendor',
            email: user.email,
            phone: user.phone,
            notes: zohoOrder.notes
        };

        let zohoSession;
        try {
            zohoSession = await zohoPaymentsService.createPaymentSession(zohoSessionOptions);
        } catch (sessionError) {
            await transaction.rollback();
            console.error('Zoho payment session creation error:', sessionError.zohoError || sessionError.message);
            return res.status(503).json({
                success: false,
                message: 'Payment gateway is temporarily unavailable. Please try again in a few minutes or contact support if this continues.',
                code: 'PAYMENT_GATEWAY_UNAVAILABLE'
            });
        }

        // Update payment record with Zoho order details
        await db.VisaApplicationPayment.update({
            payment_reference: zohoSession.id,
            payment_info: JSON.stringify({ order: zohoOrder, session: zohoSession })
        }, {
            where: { id: visaApplicationPayment.id },
            transaction
        });

        // Commit transaction
        await transaction.commit();

        // Apply coupon usage tracking if coupon was used
        if (appliedCoupon && submitForPayment) {
            try {
                const userType = isUserApplication ? 'user' : 'vendor';
                await couponService.applyCoupon(
                    appliedCoupon.id,
                    userId,
                    visaApplication.id,
                    totalAmount,
                    userType
                );
            } catch (couponError) {
                console.error('Error applying coupon usage:', couponError);
                // Don't fail the application if coupon tracking fails
            }
        }

        // Prepare response data
        const responseData = {
            application: {
                id: visaApplication.id,
                application_id: visaApplication.application_id,
                visa_id: visaApplication.visa_id,
                visa_name: visa.name,
                visa_type: visaApplication.visa_type,
                entry_type: visaApplication.entry_type,
                departure_date: visaApplication.departure_date,
                return_date: visaApplication.return_date,
                number_of_travellers: visaApplication.number_of_travellers,
                status: visaApplication.status,
                amount: visaApplication.amount,
                application_type: 'vendor_b2b',
                created_at: visaApplication.created_at
            },
            travellers: processedTravellers,
            payment_session_id: zohoSession.id,
            payment: {
                id: visaApplicationPayment.id,
                amount: visaApplicationPayment.amount,
                currency: visaApplicationPayment.payment_currency,
                status: visaApplicationPayment.payment_status,
                method: visaApplicationPayment.payment_method,
                gateway: 'zoho',
                order_id: zohoOrder.id
            },
            zoho: {
                payment_session_id: zohoSession.id,
                order_id: zohoOrder.id,
                amount: zohoOrder.amount,
                currency: zohoOrder.currency,
                client_id: process.env.ZOHO_CLIENT_ID,
                name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Vendor',
                email: user.email,
                contact: user.phone,
                description: `Vendor Visa Application - ${visa.name}`,
                notes: zohoOrder.notes,
                theme: {
                    color: '#3399cc'
                }
            }
        };

        const successMessage = isUpdating
            ? 'Vendor visa application updated successfully! Please complete the payment.'
            : 'Vendor visa application created successfully! Please complete the payment.';

        return res.status(200).json({
            success: true,
            message: successMessage,
            data: responseData
        });

    } catch (error) {
        // Rollback transaction on any error
        await transaction.rollback();
        console.error('submitVendorVisaApplication error:', error);

        // Handle specific error types
        if (error.name === 'SequelizeValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.errors.map(e => ({ field: e.path, message: e.message }))
            });
        }

        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid reference data provided'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// Verify Payment API
exports.verifyPayment = async (req, res) => {
    const transaction = await db.sequelize.transaction();
    try {
        const {
            payment_id,
        } = req.query;

        // Input validation
        if (!payment_id) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Missing required payment parameters!'
            });
        }

        // Get payment status from Zoho Payments API
        const paymentResponse = await zohoPaymentsService.getZohoPaymentStatus(payment_id);

        if (!paymentResponse || paymentResponse.code !== 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: paymentResponse?.message || 'Failed to verify payment status!'
            });
        }

        const paymentData = paymentResponse.payment;

        // Find payment record by payment reference
        const payment = await db.VisaApplicationPayment.findOne({
            where: { payment_reference: paymentData.payments_session_id || payment_id },
            transaction
        });

        if (!payment) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Payment record not found!'
            });
        }

        // Map Zoho payment status to our payment status
        let paymentStatus;
        switch (paymentData.status) {
            case 'paid':
            case 'succeeded':
                paymentStatus = 'completed';
                break;
            case 'failed':
            case 'Cancelled':
                paymentStatus = 'failed';
                break;
            default:
                paymentStatus = 'pending';
        }

        // Extract payment method details
        const paymentMethodDetails = paymentData.payment_method ? {
            type: paymentData.payment_method.type,
            details: paymentData.payment_method.card ? {
                card_holder_name: paymentData.payment_method.card.card_holder_name,
                last_four_digits: paymentData.payment_method.card.last_four_digits,
                expiry_month: paymentData.payment_method.card.expiry_month,
                expiry_year: paymentData.payment_method.card.expiry_year,
                brand: paymentData.payment_method.card.brand
            } : {}
        } : {};

        // Update payment status and details
        await db.VisaApplicationPayment.update({
            payment_status: paymentStatus,
            txn_id: paymentData.payment_id,
            payment_date: new Date(paymentData.date * 1000), // Convert timestamp to date
            payment_info: JSON.stringify({
                zoho_payment_id: paymentData.payment_id,
                amount: paymentData.amount,
                currency: paymentData.currency,
                status: paymentData.status,
                description: paymentData.description,
                fee_amount: paymentData.fee_amount,
                total_fee_amount: paymentData.total_fee_amount,
                net_amount: paymentData.net_amount,
                payment_method: paymentMethodDetails,
                statement_descriptor: paymentData.statement_descriptor,
                meta_data: paymentData.meta_data,
                receipt_email: paymentData.receipt_email,
                reference_number: paymentData.reference_number,
                transaction_reference_number: paymentData.transaction_reference_number,
                verified_at: new Date()
            })
        }, {
            where: { id: payment.id },
            transaction
        });

        // Update visa application payment status
        // If the current status is 'pending_payment', update to 'pending', otherwise keep existing logic
        const newStatus = 'pending';

        // Only update if payment was successful
        if (paymentStatus === 'completed') {
            await db.VisaApplication.update({
                payment_status: 1,
                status: newStatus
            }, {
                where: { id: payment.visa_application_id },
                transaction
            });
        }

        // Commit transaction
        await transaction.commit();

        // Get updated application details with user and travellers
        const visaApplication = await db.VisaApplication.findOne({
            where: { id: payment.visa_application_id },
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
                },
                {
                    model: db.VisaApplicationField,
                    as: 'visa_application_fields',
                    attributes: ['first_name', 'last_name', 'passport_number']
                }
            ]
        });

        // Send payment confirmation email only if payment is completed
        if (paymentStatus === 'completed') {
            if (visaApplication.coupon_id) {
                // Increment usage count
                await db.Coupon.increment('used_count', {
                    by: 1,
                    where: { id: visaApplication.coupon_id }
                });
            }
            try {
                const emailData = {
                    user: {
                        first_name: visaApplication.user.first_name,
                        last_name: visaApplication.user.last_name,
                        email: visaApplication.user.email
                    },
                    visa: {
                        name: visaApplication.visa?.name || 'Visa Application',
                    },
                    application: {
                        application_id: visaApplication.application_id,
                        number_of_travellers: visaApplication.number_of_travellers,
                        departure_date: visaApplication.departure_date,
                        return_date: visaApplication.return_date
                    },
                    payment: {
                        payment_id: paymentData.payment_id,
                        amount: paymentData.amount,
                        currency: paymentData.currency,
                        method: paymentMethodDetails
                    },
                    travellers: visaApplication.visa_application_fields?.map((field) => ({
                        name: `${field.first_name} ${field.last_name}`,
                        passport_number: field.passport_number
                    })) || []
                };

                await sendPaymentConfirmationEmail(emailData);

                // Send admin notification email
                await sendAdminApplicationNotificationEmail(emailData);
            } catch (emailError) {
                console.error('Failed to send payment confirmation email:', emailError);
                // Don't fail the payment success response if email fails
            }

            // Send notifications for payment completion and status update
            try {
                // Add notification for visa application received
                await notificationService.handleVisaApplicationReceived(visaApplication, visaApplication.visa, visaApplication.user);

                // Notify about payment completion
                await notificationService.handlePaymentCompleted(payment, visaApplication);
            } catch (notificationError) {
                console.error('Failed to send payment/status notifications:', notificationError);
                // Don't fail the payment success response if notification fails
            }
        }

        return res.status(200).json({
            success: paymentStatus === 'completed',
            message: paymentStatus === 'completed' ? 'Payment completed successfully!' : 'Payment status verified.',
            data: {
                payment_id: paymentData.payment_id,
                session_id: paymentData.payments_session_id,
                application_id: visaApplication.application_id,
                visa_name: visaApplication.visa?.name,
                country_name: visaApplication.visa?.country?.name,
                amount: paymentData.amount,
                currency: paymentData.currency,
                status: paymentStatus,
                payment_date: new Date(paymentData.date * 1000),
                payment_method: paymentData.payment_method?.type,
                card_details: paymentData.payment_method?.card ? {
                    card_holder_name: paymentData.payment_method.card.card_holder_name,
                    last_four_digits: paymentData.payment_method.card.last_four_digits,
                    brand: paymentData.payment_method.card.brand
                } : null,
                statement_descriptor: paymentData.statement_descriptor
            }
        });

    } catch (error) {
        await transaction.rollback();
        console.error('Payment success error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// Payment Failure API
exports.paymentFailure = async (req, res) => {
    const transaction = await db.sequelize.transaction();
    try {
        const {
            zoho_order_id,
            error_code,
            error_description,
            error_source,
            error_step,
            error_reason
        } = req.body;

        // Input validation
        if (!zoho_order_id) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Order ID is required!'
            });
        }

        // Find payment record by Zoho order ID
        const payment = await db.VisaApplicationPayment.findOne({
            where: { payment_reference: zoho_order_id },
            transaction
        });

        if (!payment) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Payment record not found!'
            });
        }

        // Update payment status to failed
        await db.VisaApplicationPayment.update({
            payment_status: 'failed',
            payment_date: new Date(),
            payment_info: JSON.stringify({
                zoho_order_id,
                error_code,
                error_description,
                error_source,
                error_step,
                error_reason,
                payment_failed_at: new Date()
            })
        }, {
            where: { id: payment.id },
            transaction
        });

        // Keep visa application status as pending for retry
        await db.VisaApplication.update({
            payment_status: 0,
            status: 'pending'
        }, {
            where: { id: payment.visa_application_id },
            transaction
        });

        // Commit transaction
        await transaction.commit();

        // Get application details
        const visaApplication = await db.VisaApplication.findOne({
            where: { id: payment.visa_application_id },
            include: [
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
        });

        // Send notification for payment failure
        try {
            await notificationService.handlePaymentFailed(payment, visaApplication);
        } catch (notificationError) {
            console.error('Failed to send payment failure notification:', notificationError);
            // Don't fail the response if notification fails
        }

        return res.status(200).json({
            success: false,
            message: 'Payment failed. You can retry the payment.',
            data: {
                order_id: zoho_order_id,
                application_id: visaApplication.application_id,
                visa_name: visaApplication.visa?.name,
                country_name: visaApplication.visa?.country?.name,
                amount: payment.amount,
                status: 'failed',
                error: {
                    code: error_code,
                    description: error_description,
                    source: error_source,
                    step: error_step,
                    reason: error_reason
                }
            }
        });

    } catch (error) {
        await transaction.rollback();
        console.error('Payment failure error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// Get Payment Status API
exports.getPaymentStatus = async (req, res) => {
    try {
        const { order_id } = req.params;
        const userId = req.user.id;

        if (!order_id) {
            return res.status(400).json({
                success: false,
                message: 'Order ID is required!'
            });
        }

        // Find payment record
        const payment = await db.VisaApplicationPayment.findOne({
            where: {
                payment_reference: order_id,
                user_id: userId
            },
            include: [
                {
                    model: db.VisaApplication,
                    as: 'visa_application',
                    include: [
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

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment record not found!'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Payment status retrieved successfully!',
            data: {
                payment_id: payment.txn_id,
                order_id: payment.payment_reference,
                application_id: payment.visa_application?.application_id,
                visa_name: payment.visa_application?.visa?.name,
                country_name: payment.visa_application?.visa?.country?.name,
                amount: payment.amount,
                currency: payment.payment_currency,
                status: payment.payment_status,
                payment_date: payment.payment_date,
                gateway: payment.payment_gateway
            }
        });

    } catch (error) {
        console.error('Get payment status error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// Retry Payment API
exports.retryPayment = async (req, res) => {
    const transaction = await db.sequelize.transaction();
    try {
        const { visa_application_id } = req.body;
        const userId = req.user.id;

        // Input validation
        if (!visa_application_id) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Visa application ID is required!'
            });
        }

        // Find visa application
        const visaApplication = await db.VisaApplication.findOne({
            where: {
                id: visa_application_id,
                user_id: userId
            },
            include: [
                {
                    model: db.Visa,
                    as: 'visa',
                    required: true
                }
            ],
            transaction
        });

        if (!visaApplication) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Visa application not found!'
            });
        }

        // Check if payment is already completed
        if (visaApplication.payment_status === 1) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Payment is already completed for this application!'
            });
        }

        // Find existing payment record
        const existingPayment = await db.VisaApplicationPayment.findOne({
            where: {
                visa_application_id: visa_application_id,
                user_id: userId
            },
            transaction
        });

        if (!existingPayment) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Payment record not found!'
            });
        }

        // Get user details for Zoho order
        const user = await db.User.findByPk(userId, { transaction });
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({ success: false, message: 'User not found!' });
        }

        // Create new Zoho order
        const zohoOrderOptions = {
            amount: existingPayment.amount,
            currency: 'INR',
            receipt: `visa_app_retry_${visaApplication.application_id}_${Date.now()}`,
            notes: {
                visa_application_id: visaApplication.id,
                payment_id: existingPayment.id,
                user_id: userId,
                visa_name: visaApplication.visa.name,
                retry_attempt: true
            }
        };

        // Update payment record with new Zoho order details
        await db.VisaApplicationPayment.update({
            payment_reference: zohoOrder.id,
            payment_info: JSON.stringify({ order: zohoOrder, session: zohoSession }),
            payment_status: 'pending'
        }, {
            where: { id: existingPayment.id },
            transaction
        });

        // Commit transaction
        await transaction.commit();

        // Prepare response data
        const responseData = {
            application: {
                id: visaApplication.id,
                application_id: visaApplication.application_id,
                visa_name: visaApplication.visa.name,
                amount: existingPayment.amount
            },
            payment: {
                id: existingPayment.id,
                amount: existingPayment.amount,
                currency: existingPayment.payment_currency,
                status: 'pending',
                gateway: 'zoho',
                order_id: zohoOrder.id
            },
            zoho: {
                payment_session_id: zohoSession.id,
                order_id: zohoOrder.id,
                amount: zohoOrder.amount,
                currency: zohoOrder.currency,
                client_id: process.env.ZOHO_CLIENT_ID,
                name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User',
                email: user.email,
                contact: user.phone,
                description: `Visa Application - ${visaApplication.visa.name} (Retry)`,
                notes: zohoOrder.notes,
                theme: {
                    color: '#3399cc'
                }
            }
        };

        return res.status(200).json({
            success: true,
            message: 'Payment retry initiated successfully! Please complete the payment.',
            data: responseData
        });

    } catch (error) {
        await transaction.rollback();
        console.error('Retry payment error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

exports.getVendorVisaApplication = async (req, res) => {
    try {
        const userId = req.user.id;
        let { page, limit, status } = req.query;

        page = parseInt(page) || 1;
        limit = parseInt(limit) || 10;
        const offset = (page - 1) * limit;

        let where = {
            user_id: userId
        };

        // Filter by status if provided
        if (status && status !== 'all') {
            where.status = status;
        }

        // Get status counts for all applications of this vendor (including drafts)
        // Simplified query without payment joins for accurate counts
        const statusCounts = await db.VisaApplication.findAll({
            where: {
                user_id: userId
            },
            attributes: [
                'status',
                [fn('COUNT', col('VisaApplication.id')), 'count']
            ],
            group: ['status'],
            raw: true
        });

        // Format status counts into an object
        const formattedStatusCounts = {
            all: 0,
            pending_payment: 0,
            pending: 0,
            processing: 0,
            approved: 0,
            rejected: 0,
            cancelled: 0
        };

        // Calculate total and individual status counts
        statusCounts.forEach(item => {
            const statusKey = item.status || 'pending';
            const count = parseInt(item.count) || 0;
            formattedStatusCounts[statusKey] = count;
            formattedStatusCounts.all += count;
        });

        // Simple count query to match the fetch query logic
        const totalApplications = await db.VisaApplication.count({
            where,
            include: [
                {
                    model: db.Visa,
                    as: 'visa',
                    required: true,
                    attributes: [],
                    include: [
                        {
                            model: db.Country,
                            as: 'country',
                            required: false, // Make consistent with fetch query
                            attributes: []
                        }
                    ]
                },
                {
                    model: db.VisaApplicationField,
                    as: 'visa_application_fields',
                    required: true,
                    attributes: []
                },
                {
                    model: db.User,
                    as: 'user',
                    required: true,
                    attributes: []
                }
            ]
        });

        const visaApplications = await db.VisaApplication.findAll({
            where,
            include: [
                {
                    model: db.Visa,
                    as: 'visa',
                    required: true,
                    attributes: ['id', 'name', 'b2b_processing_time', 'b2b_processing_type', 'b2b_price', 'b2b_discount', 'b2c_price', 'b2c_discount'],
                    include: [
                        {
                            model: db.Country,
                            as: 'country',
                            required: true,
                            attributes: ['name']
                        }
                    ]
                },
                {
                    model: db.VisaApplicationPayment,
                    as: 'visa_application_payments',
                    required: false, // Keep as optional to include drafts
                    attributes: ['payment_status', 'amount', 'payment_currency', 'payment_date', 'txn_id']
                    // Remove the where clause to properly handle drafts without payment records
                },
                {
                    model: db.VisaApplicationField,
                    as: 'visa_application_fields',
                    required: true,
                    attributes: ['first_name', 'last_name', 'passport_number', 'uploaded_document']
                },
                {
                    model: db.User,
                    as: 'user',
                    required: true,
                    attributes: ['id', 'user_type']
                }
            ],
            limit,
            offset,
            order: [['created_at', 'DESC']]
        });

        // Format the response data to match UI requirements
        const formattedApplications = visaApplications.map(app => {
            const traveller = app.visa_application_fields?.[0];
            const payment = app.visa_application_payments?.[0];

            // Check if this is a draft application
            const isDraft = app.status === 'pending_payment';
            const canCompletePayment = isDraft && !payment;

            // Determine application status and progress
            let applicationStatus = app.status;
            let progressSteps = {
                errorsFixed: true,
                applicationComplete: true,
                applicationPaid: payment?.payment_status === 'completed',
                submittedToImmigration: false,
                visaApproved: false
            };

            // Update status based on payment and application status
            if (payment?.payment_status === 'completed') {
                applicationStatus = 'processing';
                progressSteps.submittedToImmigration = ["processing", "approved", "completed"].includes(app.status) ? true : false;
            }

            if (app.status === 'approved') {
                applicationStatus = 'approved';
                progressSteps.visaApproved = true;
            }

            // Calculate expected visa date based on B2B processing time
            const expectedDate = new Date(app.created_at);
            if (app.visa && app.visa.b2b_processing_time && app.visa.b2b_processing_type) {
                // Use B2B processing time for vendor users
                const processingDays = convertB2BProcessingTimeToDays(app.visa.b2b_processing_time, app.visa.b2b_processing_type);
                expectedDate.setDate(expectedDate.getDate() + processingDays);
            } else {
                // Fallback to default 15 days if B2B processing time is not available
                expectedDate.setDate(expectedDate.getDate() + 15);
            }

            let documentToDownload = [];

if (app.uploaded_document?.trim()) {
    documentToDownload.push(resolveImageUrl(app.uploaded_document));
}

app.visa_application_fields?.forEach(doc => {
    if (doc.uploaded_document?.trim()) {
        const fullUrl = resolveImageUrl(doc.uploaded_document);

        if (!documentToDownload.includes(fullUrl)) {
            documentToDownload.push(fullUrl);
        }
    }
});

            // Calculate proper B2B/B2C pricing with discounts
            let calculatedAmount = app.amount; // Default fallback
            let visaDiscountAmount = 0;
            let finalCalculatedAmount = app.amount;

            // Determine if this is B2B or B2C application based on user type
            const isUserApplication = app.user?.user_type === 'user'; // B2C if user_type is 'user', B2B if 'vendor'
            // Get appropriate pricing
            const price = parseFloat(isUserApplication ? app.visa.b2c_price : app.visa.b2b_price) || 0;
            const discount = parseFloat(isUserApplication ? app.visa.b2c_discount : app.visa.b2b_discount) || 0;

            if (app.visa && app.number_of_travellers) {

                if (price > 0) {
                    // Calculate fresh base amount
                    const baseAmount = price * parseInt(app.number_of_travellers);
                    let totalAmount = baseAmount;

                    // Apply visa discount if available
                    if (discount > 0) {
                        const discountRate = discount / 100;
                        visaDiscountAmount = Math.round(baseAmount * discountRate);
                        totalAmount = baseAmount - visaDiscountAmount;
                    }

                    // Note: Not including coupon discount here as it's already applied and stored in app.amount
                    // But we show the proper base calculation with visa discounts
                    calculatedAmount = totalAmount;
                    finalCalculatedAmount = app.amount; // Keep the actual stored amount (includes any coupon discounts)
                }
            }
            return {
                id: app.id,
                reference_number: app.reference_number,
                amendment_enabled: app.amendment_enabled,
                amendment_enabled_until: app.amendment_enabled_until,
                amendment_expires_in_hours: app.amendment_enabled_until ?
                    Math.max(0, Math.ceil((new Date(app.amendment_enabled_until) - new Date()) / (1000 * 60 * 60))) : null,
                uploaded_document: documentToDownload,
                application_id: app.application_id,
                applicantName: traveller ? `${traveller.first_name} ${traveller.last_name}` : 'N/A',
                passportNumber: traveller?.passport_number || 'N/A',
                createdAt: app.created_at,
                createdDate: new Date(app.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                }),
                createdTime: new Date(app.created_at).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                }),

                // Visa Information
                visaInfo: {
                    country: app.visa?.country?.name || 'N/A',
                    visaType: `${app.visa?.country?.name || 'Unknown'} ${app.visa_type || 'Visa'}`,
                    travelDates: `${new Date(app.departure_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} — ${new Date(app.return_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
                    numberOfTravellers: app.number_of_travellers
                },

                // Application Status
                status: app.status,
                applicationStatus: applicationStatus,
                paymentStatus: payment?.payment_status || 'pending',

                // Progress Steps
                progressSteps: progressSteps,
                parametersChecked: `${Object.values(progressSteps).filter(Boolean).length}/${Object.keys(progressSteps).length}`,

                // Expected Visa Date
                expectedVisaDate: expectedDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                }),

                // Payment Information - Show properly calculated amount with B2B/B2C pricing and discounts
                amount: payment?.amount || finalCalculatedAmount,
                baseAmount: discount > 0 ? calculatedAmount / app.number_of_travellers : calculatedAmount, // Amount before coupon discounts
                visaDiscount: visaDiscountAmount, // Visa-specific discount amount
                currency: payment?.payment_currency || 'INR',
                paymentDate: payment?.payment_date,
                transactionId: payment?.txn_id,

                // Application Details
                applicationDetails: {
                    errorsFixed: progressSteps.errorsFixed,
                    applicationComplete: progressSteps.applicationComplete,
                    applicationPaid: progressSteps.applicationPaid,
                    submittedToImmigration: progressSteps.submittedToImmigration,
                    visaApproved: progressSteps.visaApproved
                },

                // Draft specific fields
                isDraft: isDraft,
                canCompletePayment: canCompletePayment,
                totalAmount: finalCalculatedAmount, // Properly calculated amount with all discounts
                applicationUserType: app.user?.user_type || 'vendor' // Show whether this is B2B or B2C application
            };
        });

        return res.status(200).json({
            success: true,
            message: 'Vendor visa applications fetched successfully!',
            currentPage: page,
            totalPages: Math.ceil(totalApplications / limit),
            totalRecords: totalApplications,
            data: formattedApplications,
            statusCounts: formattedStatusCounts
        });
    } catch (error) {
        console.error('Get vendor visa application error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

exports.getVendorVisaApplicationDetails = async (req, res) => {
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
        const userId = req.user.id;
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Application ID is required!'
            });
        }

        const visaApplication = await db.VisaApplication.findOne({
            where: {
                id: id,
                user_id: userId
            },
            include: [
                {
                    model: db.Visa,
                    as: 'visa',
                    include: [
                        {
                            model: db.Country,
                            as: 'country',
                            attributes: ['name', 'iso2', 'currency']
                        }
                    ]
                },
                {
                    model: db.VisaApplicationPayment,
                    as: 'visa_application_payments',
                },
                {
                    model: db.VisaApplicationField,
                    as: 'visa_application_fields',
                },
                {
                    model: db.Coupon,
                    as: 'coupon',
                    attributes: ['id', 'code', 'name', 'description', 'discount_type', 'discount_value', 'maximum_discount_amount'],
                    required: false
                }
            ]
        });

        if (!visaApplication) {
            return res.status(404).json({
                success: false,
                message: 'Visa application not found!'
            });
        }

        const travellers = visaApplication.visa_application_fields || [];
        const payment = visaApplication.visa_application_payments?.[0];

        // Determine application status and progress
        let progressSteps = {
            errorsFixed: true,
            applicationComplete: true,
            applicationPaid: visaApplication?.payment_status ? true : false,
            submittedToImmigration: visaApplication?.payment_status && ["processing", "approved", "completed"].includes(visaApplication.status) ? true : false,
            visaApproved: visaApplication.status === 'approved'
        };

        // Calculate expected visa date
        const expectedDate = new Date(visaApplication.created_at);
        expectedDate.setDate(expectedDate.getDate() + 15);

        // Format traveller details
        const formattedTravellers = travellers.map((traveller, index) => ({
            id: traveller.id,
            travellerNumber: index + 1,
            status: traveller.status,
            referenceNumber: traveller.reference_number,
            uploadedDocument: traveller.uploaded_document ? `${process.env.BASE_URL}${traveller.uploaded_document}` : null,
            remark: traveller.remark,
            statusInfo: {
                status: traveller.status,
                statusMessage: getStatusMessage(traveller.status),
                lastUpdated: traveller.updatedAt || traveller.createdAt
            },
            personalInfo: {
                firstName: traveller.first_name,
                middleName: traveller.middle_name,
                lastName: traveller.last_name,
                fullName: `${traveller.first_name} ${traveller.middle_name || ''} ${traveller.last_name}`.trim(),
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
                passportFrontPhoto: resolveImageUrl(traveller.passport_front_photo),
                passportBackPhoto: resolveImageUrl(traveller.passport_back_photo),
                passportSizePhoto: resolveImageUrl(traveller.passport_size_photo),
                photographUpload: resolveImageUrl(traveller.photograph_upload),
                invitationLetter: resolveImageUrl(traveller.invitation_letter),
                travelItinerary: resolveImageUrl(traveller.travel_itinerary),
                hotelBooking: resolveImageUrl(traveller.hotel_booking),
                flightBooking: resolveImageUrl(traveller.flight_booking),
                proofOfFunds: resolveImageUrl(traveller.proof_of_funds),
                employmentLetter: resolveImageUrl(traveller.employment_letter),
                medicalInsurance: resolveImageUrl(traveller.medical_insurance_certificate),
                vaccinationCertificate: resolveImageUrl(traveller.vaccination_certificate),
                panCardPhoto: resolveImageUrl(traveller.pan_card_photo),
                itr1stYearPhoto: resolveImageUrl(traveller.itr_1st_year_photo),
                itr2ndYearPhoto: resolveImageUrl(traveller.itr_2nd_year_photo),
                itr3rdYearPhoto: resolveImageUrl(traveller.itr_3rd_year_photo),
                threeMonthsBankStatement: resolveImageUrl(traveller.three_months_bank_statement),
                sixMonthsBankStatement: resolveImageUrl(traveller.six_months_bank_statement),
                threeMonthsBankSignedAndStampedStatement: resolveImageUrl(traveller.three_months_bank_signed_and_stamped_statement),
                sixMonthsBankSignedAndStampedStatement: resolveImageUrl(traveller.six_months_bank_signed_and_stamped_statement),
                aadharCard: resolveImageUrl(traveller.aadhar_card),
                passportExternalCover: resolveImageUrl(traveller.passport_external_cover),
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

        const detailedResponse = {
            id: visaApplication.id,
            application_id: visaApplication.application_id,

            // Application Type
            applicationType: 'Individual', // or 'Group' based on number_of_travellers

            // Visa Information
            visaInfo: {
                visaType: `${visaApplication.visa?.country?.name} ${visaApplication.visa_type}`,
                country: visaApplication.visa?.country?.name,
                countryCode: visaApplication.visa?.country?.iso2,
                entryType: visaApplication.entry_type,
                numberOfTravellers: visaApplication.number_of_travellers,
                travelDates: `${new Date(visaApplication.departure_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${new Date(visaApplication.return_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
                departureDate: visaApplication.departure_date,
                returnDate: visaApplication.return_date
            },

            // Application Status and Progress
            status: visaApplication.status,
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
                createdAt: visaApplication.created_at,
                createdDate: new Date(visaApplication.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                }),
                createdTime: new Date(visaApplication.created_at).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                }),
                internalId: visaApplication.application_id,
                groupName: formattedTravellers[0]?.personalInfo?.fullName || 'N/A',
                reliance: 'Standard Plan included with Visa for each traveler'
            },

            // Price Details
            priceDetails: {
                traveller1: payment?.amount || visaApplication.amount,
                total: payment?.amount || visaApplication.amount,
                couponDiscount: visaApplication.discount || 0,
                finalAmount: payment?.amount || visaApplication.amount,
                currency: payment?.payment_currency || 'INR',
                currentWalletBalance: 0 // This would come from user's wallet
            },

            // Payment Information
            paymentInfo: {
                amount: payment?.amount || visaApplication.amount,
                currency: payment?.payment_currency || 'INR',
                paymentMethod: payment?.payment_method || 'online',
                paymentStatus: payment?.payment_status || 'pending',
                paymentDate: payment?.payment_date,
                transactionId: payment?.payment_reference,
                paymentGateway: payment?.payment_gateway
            },

            // Coupon Information
            couponInfo: visaApplication.coupon ? {
                applied: true,
                couponCode: visaApplication.coupon_code,
                couponName: visaApplication.coupon.name,
                couponDescription: visaApplication.coupon.description,
                discountType: visaApplication.coupon.discount_type,
                discountValue: visaApplication.coupon.discount_type === 'percentage' 
                    ? `${visaApplication.coupon.discount_value}%` 
                    : `₹${visaApplication.coupon.discount_value}`,
                discountAmount: visaApplication.discount || 0,
                maximumDiscountAmount: visaApplication.coupon.maximum_discount_amount || null
            } : {
                applied: false,
                couponCode: null,
                discountAmount: 0
            },

            // Travellers Details
            travellers: formattedTravellers,

            // Know Before You Pay section
            knowBeforeYouPay: {
                autoValidation: 'Auto-validation upon submission',
                stellerserviceValidation: 'Stellar service performs automated validation after submission. We will let you know if there are any problems with the application.',
                visaProcessing: 'Visa processed within 30 minutes',
                automaticProcessing: 'Stellar service automatically processes your visa',
                nonRefundable: 'Non-refundable after you pay',
                cancellationPolicy: 'If cancelled after payment, you will not be refunded.'
            }
        };

        return res.status(200).json({
            success: true,
            message: 'Visa application details fetched successfully!',
            data: detailedResponse
        });

    } catch (error) {
        console.error('Get vendor visa application details error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

exports.getVendorVisaApplicationPayments = async (req, res) => {
    try {
        const userId = req.user.id;
        let { page, limit, search } = req.query;

        // Set pagination defaults
        page = parseInt(page) || 1;
        limit = parseInt(limit) || 10;
        const offset = (page - 1) * limit;

        // Base where condition for payments
        let where = {
            user_id: userId,
            payment_status: 'completed'
        };

        // Build include array with search conditions
        let includeArray = [
            {
                model: db.VisaApplication,
                as: 'visa_application',
                attributes: ['id', 'application_id', 'visa_id', 'user_id', 'departure_date', 'return_date', 'number_of_travellers', 'status', 'amount', 'created_at'],
                required: true,
                include: [
                    {
                        model: db.Visa,
                        as: 'visa',
                        attributes: ['id', 'name', 'visa_type', 'entry_type', 'b2b_price', 'created_at'],
                        required: true
                    }
                ]
            }
        ];

        // Enhanced search functionality
        if (search && search.trim()) {
            const searchTerm = search.trim();

            // Add search conditions to the main where clause and includes
            where = {
                ...where,
                [Op.or]: [
                    // Payment related search
                    { txn_id: { [Op.like]: `%${searchTerm}%` } },
                    { payment_reference: { [Op.like]: `%${searchTerm}%` } },
                    { payment_method: { [Op.like]: `%${searchTerm}%` } },
                    { payment_gateway: { [Op.like]: `%${searchTerm}%` } },

                    // Search in visa application fields
                    { '$visa_application.application_id$': { [Op.like]: `%${searchTerm}%` } },
                    { '$visa_application.status$': { [Op.like]: `%${searchTerm}%` } },
                    { '$visa_application.visa_type$': { [Op.like]: `%${searchTerm}%` } },
                    { '$visa_application.entry_type$': { [Op.like]: `%${searchTerm}%` } },

                    // Search in visa fields
                    { '$visa_application.visa.name$': { [Op.like]: `%${searchTerm}%` } },
                    { '$visa_application.visa.visa_type$': { [Op.like]: `%${searchTerm}%` } },
                    { '$visa_application.visa.entry_type$': { [Op.like]: `%${searchTerm}%` } }
                ]
            };
        }

        // Get total count for pagination
        const totalPayments = await db.VisaApplicationPayment.count({
            where,
            include: includeArray
        });

        // Get paginated results
        const visaApplicationPayments = await db.VisaApplicationPayment.findAll({
            where,
            include: includeArray,
            limit,
            offset,
            order: [['created_at', 'DESC']]
        });

        return res.status(200).json({
            success: true,
            message: 'Vendor visa application payments fetched successfully!',
            currentPage: page,
            totalPages: Math.ceil(totalPayments / limit),
            totalRecords: totalPayments,
            data: visaApplicationPayments
        });
    } catch (error) {
        console.error('Get vendor visa application payments error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
        });
    }
};

exports.getVendorProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const vendor = await db.User.findOne({
            where: {
                id: userId,
                user_type: 'vendor',
                is_deleted: 0,
                is_active: 1
            }
        });
        if (!vendor) {
            return res.status(404).json({ success: false, message: 'Vendor not found' });
        }
        const vendorProfile = {
            id: vendor.id,
            name: vendor.first_name + ' ' + vendor.last_name,
            aadhar_card: vendor.aadhar_card ? process.env.BASE_URL + vendor.aadhar_card : null,
            pan_card: vendor.pan_card ? process.env.BASE_URL + vendor.pan_card : null,
            aadhar_number: vendor.aadhar_number,
            pincode: vendor.pincode,
            email: vendor.email,
            phone: vendor.phone,
            address: vendor.address,
            address_line_2: vendor.address_line_2,
            city: vendor.city,
            state: vendor.state,
            country_id: vendor.country_id,
            gst_number: vendor.gst_number,
            gst_certificate_img: vendor.gst_certificate_img ? process.env.BASE_URL + vendor.gst_certificate_img : null,
            cancel_cheque_img: vendor.cancel_cheque_img ? process.env.BASE_URL + vendor.cancel_cheque_img : null,
            office_img: vendor.office_img ? process.env.BASE_URL + vendor.office_img : null,
            created_by: vendor.created_by,
            created_at: vendor.created_at,
            updated_at: vendor.updated_at
        };
        return res.status(200).json({ success: true, message: 'Vendor profile fetched successfully!', data: vendorProfile });
    } catch (error) {
        console.error('Get vendor profile error:', error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.updateVendorProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        let data = req.body;

        const vendor = await db.User.findOne({
            where: {
                id: userId,
                user_type: 'vendor',
                is_deleted: 0,
                is_active: 1
            }
        });
        if (!vendor) {
            return res.status(404).json({ success: false, message: 'Vendor not found' });
        }

        let aadhar_card = null;
        let pan_card = null;
        let gst_certificate_img = null;
        let cancel_cheque_img = null;
        let office_img = null;

        if (req.files) {
            aadhar_card = req.files.aadhar_card?.[0]?.path || null;
            pan_card = req.files.pan_card?.[0]?.path || null;
            gst_certificate_img = req.files.gst_certificate_img?.[0]?.path || null;
            cancel_cheque_img = req.files.cancel_cheque_img?.[0]?.path || null;
            office_img = req.files.office_img?.[0]?.path || null;
        }

        await db.User.update({
            country_id: data.country_id,
            address: data.address,
            address_line_2: data.address_line_2,
            city: data.city,
            state: data.state,
            pincode: data.pincode,
            gst_number: data.gst_number,
            aadhar_number: data.aadhar_number,
            aadhar_card: aadhar_card,
            pan_card: pan_card,
            gst_certificate_img: gst_certificate_img,
            cancel_cheque_img: cancel_cheque_img,
            office_img: office_img
        }, {
            where: {
                id: userId,
            }
        });

        return res.status(200).json({ success: true, message: 'Vendor profile updated successfully!', data: vendor });
    } catch (error) {
        console.error('Update vendor profile error:', error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Save Visa Application as Draft
exports.saveVisaApplicationDraft = async (req, res) => {
    const transaction = await db.sequelize.transaction();
    try {
        const userId = req.user.id;
        const { visa_id, travellers, number_of_travellers, departure_date, return_date, from = 'vendor', coupon_code } = req.body;

        // Input validation
        if (!userId) {
            await transaction.rollback();
            return res.status(401).json({ success: false, message: 'User authentication required!' });
        }

        if (!visa_id || !travellers || !number_of_travellers || !departure_date || !return_date) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: visa_id, travellers, number_of_travellers, departure_date, return_date'
            });
        }

        // Validate dates
        const departureDate = new Date(departure_date);
        const returnDate = new Date(return_date);

        if (returnDate <= departureDate) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: 'Return date must be after departure date!' });
        }

        // Fetch visa details
        const visa = await db.Visa.findOne({
            where: {
                id: visa_id,
                is_active: 1,
                is_deleted: 0
            },
            transaction
        });

        if (!visa) {
            await transaction.rollback();
            return res.status(404).json({ success: false, message: 'Visa not found or inactive!' });
        }

        // Use B2C price for user applications, B2B price for vendor applications
        const isUserApplication = from === 'user';
        const price = parseFloat(isUserApplication ? visa.b2c_price : visa.b2b_price) || 0;
        const priceType = isUserApplication ? 'B2C' : 'B2B';

        if (price <= 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `${priceType} price not available for this visa`
            });
        }

        // Calculate base amount
        const baseAmount = price * parseInt(number_of_travellers);
        let totalAmount = baseAmount;
        let visaDiscountAmount = 0;

        // Apply visa discount if available
        const discount = parseFloat(isUserApplication ? visa.b2c_discount : visa.b2b_discount) || 0;
        if (discount > 0) {
            const discountRate = discount / 100;
            visaDiscountAmount = Math.round(baseAmount * discountRate);
            totalAmount = baseAmount - visaDiscountAmount;
        }

        // Handle coupon application
        let couponDiscountAmount = 0;
        let appliedCoupon = null;
        let finalAmount = totalAmount;

        if (coupon_code) {
            const userType = isUserApplication ? 'user' : 'vendor';

            // Validate coupon
            const couponValidation = await couponService.validateCouponCode(
                coupon_code,
                totalAmount,
                userId,
                userType
            );

            if (!couponValidation.success) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: couponValidation.message
                });
            }

            couponDiscountAmount = couponValidation.data.discount_amount;
            finalAmount = couponValidation.data.final_amount;
            appliedCoupon = {
                id: couponValidation.data.coupon_id,
                code: coupon_code,
                discount_amount: couponDiscountAmount
            };
        }

        // Create visa application as draft
        const visaApplication = await db.VisaApplication.create({
            visa_id,
            user_id: userId,
            application_id: await getVisaApplicationCode('application'),
            departure_date: departureDate,
            return_date: returnDate,
            visa_type: visa.visa_type,
            entry_type: visa.entry_type,
            number_of_travellers: parseInt(number_of_travellers),
            status: 'pending_payment', // Draft status
            amount: finalAmount,
            discount: couponDiscountAmount,
            coupon_code: appliedCoupon ? appliedCoupon.code : null,
            coupon_id: appliedCoupon ? appliedCoupon.id : null,
        }, { transaction });

        if (!visaApplication) {
            await transaction.rollback();
            return res.status(500).json({ success: false, message: 'Failed to create visa application draft!' });
        }

        // Process travellers and their documents (same logic as submitVendorVisaApplication)
        const createdTravellers = [];

        for (let i = 0; i < travellers.length; i++) {
            const traveller = travellers[i];

            // Get files for this traveller
            const passport_front_field = `travellers[${i}][passport_front_photo]`;
            const passport_back_field = `travellers[${i}][passport_back_photo]`;
            const passport_size_photo_field = `travellers[${i}][passport_size_photo]`;
            const pan_card_photo_field = `travellers[${i}][pan_card_photo]`;
            const itr_1st_year_photo_field = `travellers[${i}][itr_1st_year_photo]`;
            const itr_2nd_year_photo_field = `travellers[${i}][itr_2nd_year_photo]`;
            const itr_3rd_year_photo_field = `travellers[${i}][itr_3rd_year_photo]`;
            const flight_booking_field = `travellers[${i}][flight_booking]`;
            const hotel_booking_field = `travellers[${i}][hotel_booking]`;
            const travel_itinerary_field = `travellers[${i}][travel_itinerary]`;
            const proof_of_funds_field = `travellers[${i}][proof_of_funds]`;
            const employment_letter_field = `travellers[${i}][employment_letter]`;
            const medical_insurance_certificate_field = `travellers[${i}][medical_insurance_certificate]`;
            const vaccination_certificate_field = `travellers[${i}][vaccination_certificate]`;
            const invitation_letter_field = `travellers[${i}][invitation_letter]`;
            const travel_insurance_field = `travellers[${i}][travel_insurance]`;
            const three_months_bank_statement_field = `travellers[${i}][three_months_bank_statement]`;
            const six_months_bank_statement_field = `travellers[${i}][six_months_bank_statement]`;
            const three_months_bank_signed_and_stamped_statement_field = `travellers[${i}][three_months_bank_signed_and_stamped_statement]`;
            const six_months_bank_signed_and_stamped_statement_field = `travellers[${i}][six_months_bank_signed_and_stamped_statement]`;
            const aadhar_card_field = `travellers[${i}][aadhar_card]`;
            const passport_external_cover_field = `travellers[${i}][passport_external_cover]`;

            let passport_front_photo = traveller.passport_front_photo;
            let passport_back_photo = traveller.passport_back_photo;
            let passport_size_photo = traveller.passport_size_photo;
            let pan_card_photo = traveller.pan_card_photo;
            let itr_1st_year_photo = traveller.itr_1st_year_photo;
            let itr_2nd_year_photo = traveller.itr_2nd_year_photo;
            let itr_3rd_year_photo = traveller.itr_3rd_year_photo;
            let flight_booking = traveller.flight_booking;
            let hotel_booking = traveller.hotel_booking;
            let travel_itinerary = traveller.travel_itinerary;
            let proof_of_funds = traveller.proof_of_funds;
            let employment_letter = traveller.employment_letter;
            let medical_insurance_certificate = traveller.medical_insurance_certificate;
            let vaccination_certificate = traveller.vaccination_certificate;
            let invitation_letter = traveller.invitation_letter;
            let travel_insurance = traveller.travel_insurance;
            let three_months_bank_statement = traveller.three_months_bank_statement;
            let six_months_bank_statement = traveller.six_months_bank_statement;
            let three_months_bank_signed_and_stamped_statement = traveller.three_months_bank_signed_and_stamped_statement;
            let six_months_bank_signed_and_stamped_statement = traveller.six_months_bank_signed_and_stamped_statement;
            let aadhar_card = traveller.aadhar_card;
            let passport_external_cover = traveller.passport_external_cover;

            // Extract file paths from uploaded files
            if (req.files[passport_front_field] && req.files[passport_front_field][0]) {
                passport_front_photo = req.files[passport_front_field][0].path;
            }
            if (req.files[passport_back_field] && req.files[passport_back_field][0]) {
                passport_back_photo = req.files[passport_back_field][0].path;
            }
            if (req.files[passport_size_photo_field] && req.files[passport_size_photo_field][0]) {
                passport_size_photo = req.files[passport_size_photo_field][0].path;
            }
            if (req.files[pan_card_photo_field] && req.files[pan_card_photo_field][0]) {
                pan_card_photo = req.files[pan_card_photo_field][0].path;
            }
            if (req.files[itr_1st_year_photo_field] && req.files[itr_1st_year_photo_field][0]) {
                itr_1st_year_photo = req.files[itr_1st_year_photo_field][0].path;
            }
            if (req.files[itr_2nd_year_photo_field] && req.files[itr_2nd_year_photo_field][0]) {
                itr_2nd_year_photo = req.files[itr_2nd_year_photo_field][0].path;
            }
            if (req.files[itr_3rd_year_photo_field] && req.files[itr_3rd_year_photo_field][0]) {
                itr_3rd_year_photo = req.files[itr_3rd_year_photo_field][0].path;
            }
            if (req.files[flight_booking_field] && req.files[flight_booking_field][0]) {
                flight_booking = req.files[flight_booking_field][0].path;
            }
            if (req.files[hotel_booking_field] && req.files[hotel_booking_field][0]) {
                hotel_booking = req.files[hotel_booking_field][0].path;
            }
            if (req.files[travel_itinerary_field] && req.files[travel_itinerary_field][0]) {
                travel_itinerary = req.files[travel_itinerary_field][0].path;
            }
            if (req.files[proof_of_funds_field] && req.files[proof_of_funds_field][0]) {
                proof_of_funds = req.files[proof_of_funds_field][0].path;
            }
            if (req.files[employment_letter_field] && req.files[employment_letter_field][0]) {
                employment_letter = req.files[employment_letter_field][0].path;
            }
            if (req.files[medical_insurance_certificate_field] && req.files[medical_insurance_certificate_field][0]) {
                medical_insurance_certificate = req.files[medical_insurance_certificate_field][0].path;
            }
            if (req.files[vaccination_certificate_field] && req.files[vaccination_certificate_field][0]) {
                vaccination_certificate = req.files[vaccination_certificate_field][0].path;
            }
            if (req.files[invitation_letter_field] && req.files[invitation_letter_field][0]) {
                invitation_letter = req.files[invitation_letter_field][0].path;
            }
            if (req.files[travel_insurance_field] && req.files[travel_insurance_field][0]) {
                travel_insurance = req.files[travel_insurance_field][0].path;
            }
            if (req.files[three_months_bank_statement_field] && req.files[three_months_bank_statement_field][0]) {
                three_months_bank_statement = req.files[three_months_bank_statement_field][0].path;
            }
            if (req.files[six_months_bank_statement_field] && req.files[six_months_bank_statement_field][0]) {
                six_months_bank_statement = req.files[six_months_bank_statement_field][0].path;
            }
            if (req.files[three_months_bank_signed_and_stamped_statement_field] && req.files[three_months_bank_signed_and_stamped_statement_field][0]) {
                three_months_bank_signed_and_stamped_statement = req.files[three_months_bank_signed_and_stamped_statement_field][0].path;
            }
            if (req.files[six_months_bank_signed_and_stamped_statement_field] && req.files[six_months_bank_signed_and_stamped_statement_field][0]) {
                six_months_bank_signed_and_stamped_statement = req.files[six_months_bank_signed_and_stamped_statement_field][0].path;
            }
            if (req.files[aadhar_card_field] && req.files[aadhar_card_field][0]) {
                aadhar_card = req.files[aadhar_card_field][0].path;
            }
            if (req.files[passport_external_cover_field] && req.files[passport_external_cover_field][0]) {
                passport_external_cover = req.files[passport_external_cover_field][0].path;
            }

            const visaApplicationFields = await db.VisaApplicationField.create({
                visa_application_id: visaApplication.id,
                first_name: traveller.first_name?.trim(),
                middle_name: traveller.middle_name?.trim() || null,
                last_name: traveller.last_name?.trim(),
                gender: traveller.gender,
                date_of_birth: new Date(traveller.date_of_birth),
                place_of_birth: traveller.place_of_birth?.trim() || null,
                marital_status: traveller.marital_status || null,
                address: traveller.address?.trim() || null,
                pincode: traveller.pincode?.trim() || null,
                emergency_number: traveller.emergency_number ? parseInt(traveller.emergency_number) : null,
                alternate_number: traveller.alternate_number ? parseInt(traveller.alternate_number) : null,
                company_name: traveller.company_name?.trim() || null,
                vendor_type: traveller.vendor_type || null,
                passport_number: traveller.passport_number?.trim(),
                passport_issue_date: traveller.passport_issue_date ? new Date(traveller.passport_issue_date) : null,
                passport_expiry_date: traveller.passport_expiry_date ? new Date(traveller.passport_expiry_date) : null,
                passport_issue_country: traveller.passport_issue_country?.trim() || null,
                passport_expiry_country: traveller.passport_expiry_country?.trim() || null,
                passport_issue_place: traveller.passport_issue_place?.trim() || null,

                // File uploads
                passport_size_photo: passport_size_photo,
                passport_front_photo: passport_front_photo,
                passport_back_photo: passport_back_photo,
                pan_card_photo: pan_card_photo,
                itr_1st_year_photo: itr_1st_year_photo,
                itr_2nd_year_photo: itr_2nd_year_photo,
                itr_3rd_year_photo: itr_3rd_year_photo,
                vaccination_certificate: vaccination_certificate,
                medical_insurance_certificate: medical_insurance_certificate,
                employment_letter: employment_letter,
                proof_of_funds: proof_of_funds,
                flight_booking: flight_booking,
                travel_insurance: travel_insurance,
                travel_itinerary: travel_itinerary,
                hotel_booking: hotel_booking,
                invitation_letter: invitation_letter,
                three_months_bank_statement: three_months_bank_statement,
                six_months_bank_statement: six_months_bank_statement,
                three_months_bank_signed_and_stamped_statement: three_months_bank_signed_and_stamped_statement,
                six_months_bank_signed_and_stamped_statement: six_months_bank_signed_and_stamped_statement,
                aadhar_card: aadhar_card,
                passport_external_cover: passport_external_cover,

                // Additional fields
                visa_type: traveller.visa_type || visa.visa_type,
                visa_category: traveller.visa_category || null,
                purpose_of_visit: traveller.purpose_of_visit?.trim() || null,
                intended_travel_date: traveller.intended_travel_date ? new Date(traveller.intended_travel_date) : departureDate,
                intended_return_date: traveller.intended_return_date ? new Date(traveller.intended_return_date) : returnDate,
                number_of_entries: traveller.number_of_entries ? parseInt(traveller.number_of_entries) : null,
                duration_of_stay: traveller.duration_of_stay ? parseInt(traveller.duration_of_stay) : null,
                previously_visited: traveller.previously_visited === 'true' || traveller.previously_visited === true,
                previously_visited_dates: traveller.previously_visited_dates?.trim() || null,
                current_occupation: traveller.current_occupation?.trim() || null,
                employer_name: traveller.employer_name?.trim() || null,
                employer_address: traveller.employer_address?.trim() || null,
                monthly_income: traveller.monthly_income ? parseFloat(traveller.monthly_income) : null,
                previous_employment: traveller.previous_employment?.trim() || null,
                previous_education: traveller.previous_education?.trim() || null,
                previous_employment_dates: traveller.previous_employment_dates ? new Date(traveller.previous_employment_dates) : null,
                previous_education_dates: traveller.previous_education_dates ? new Date(traveller.previous_education_dates) : null,
                previous_employment_details: traveller.previous_employment_details?.trim() || null,
                previous_education_details: traveller.previous_education_details?.trim() || null,
            }, { transaction });

            if (!visaApplicationFields) {
                await transaction.rollback();
                return res.status(500).json({
                    success: false,
                    message: `Failed to create visa application field for traveller ${i + 1}!`
                });
            }

            createdTravellers.push({
                index: i + 1,
                id: visaApplicationFields.id,
                name: `${traveller.first_name} ${traveller.last_name}`,
                passport_number: traveller.passport_number
            });
        }

        // Commit transaction
        await transaction.commit();

        return res.status(200).json({
            success: true,
            message: 'Visa application draft saved successfully!',
            data: {
                application: {
                    id: visaApplication.id,
                    application_id: visaApplication.application_id,
                    status: visaApplication.status,
                    created_at: visaApplication.created_at,
                    amount: visaApplication.amount,
                    discount: couponDiscountAmount,
                    coupon_code: appliedCoupon ? appliedCoupon.code : null,
                    coupon_id: appliedCoupon ? appliedCoupon.id : null,
                    visa_name: visa.name
                }
            }
        });

    } catch (error) {
        await transaction.rollback();
        console.error('saveVisaApplicationDraft error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// Update Visa Application Draft
exports.updateVisaApplicationDraft = async (req, res) => {
    const transaction = await db.sequelize.transaction();
    try {
        const userId = req.user.id;
        const { draftId } = req.params;
        const { visa_id, travellers, number_of_travellers, departure_date, return_date, from = 'vendor', coupon_code } = req.body;

        // Find existing draft application
        const existingApplication = await db.VisaApplication.findOne({
            where: {
                id: draftId,
                user_id: userId,
                status: 'pending_payment'
            },
            transaction
        });

        if (!existingApplication) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Draft application not found or already processed!'
            });
        }

        // Validate input (same validation as save draft)
        if (!visa_id || !travellers || !number_of_travellers || !departure_date || !return_date) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: visa_id, travellers, number_of_travellers, departure_date, return_date'
            });
        }

        // Validate dates
        const departureDate = new Date(departure_date);
        const returnDate = new Date(return_date);

        if (returnDate <= departureDate) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: 'Return date must be after departure date!' });
        }

        // Fetch visa details
        const visa = await db.Visa.findOne({
            where: {
                id: visa_id,
                is_active: 1,
                is_deleted: 0
            },
            transaction
        });

        if (!visa) {
            await transaction.rollback();
            return res.status(404).json({ success: false, message: 'Visa not found or inactive!' });
        }

        // Use B2C price for user applications, B2B price for vendor applications
        const isUserApplication = from === 'user';

        const price = parseFloat(isUserApplication ? visa.b2c_price : visa.b2b_price) || 0;
        const priceType = isUserApplication ? 'B2C' : 'B2B';

        if (price <= 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `${priceType} price not available for this visa`
            });
        }

        // Calculate base amount (always fresh calculation based on current traveller count and visa price)
        const baseAmount = price * parseInt(number_of_travellers);
        let totalAmount = baseAmount;
        let visaDiscountAmount = 0;

        // Apply visa discount if available
        const discount = parseFloat(isUserApplication ? visa.b2c_discount : visa.b2b_discount) || 0;
        if (discount > 0) {
            const discountRate = discount / 100;
            visaDiscountAmount = Math.round(baseAmount * discountRate);
            totalAmount = baseAmount - visaDiscountAmount;
        }

        // Handle coupon application - FRESH calculation, not additive to existing
        let couponDiscountAmount = 0;
        let appliedCoupon = null;
        let finalAmount = totalAmount; // Start fresh from totalAmount (not from existing application amount)

        // Only apply coupon if coupon_code is provided in the request
        // If no coupon_code provided, coupon fields will be cleared (set to null)
        if (coupon_code && coupon_code.trim()) {
            const userType = isUserApplication ? 'user' : 'vendor';

            // Validate coupon against the FRESH totalAmount (not existing application amount)
            const couponValidation = await couponService.validateCouponCode(
                coupon_code.trim(),
                totalAmount,
                userId,
                userType
            );

            if (!couponValidation.success) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: couponValidation.message
                });
            }

            couponDiscountAmount = couponValidation.data.discount_amount;
            finalAmount = couponValidation.data.final_amount;
            appliedCoupon = {
                id: couponValidation.data.coupon_id,
                code: coupon_code.trim(),
                discount_amount: couponDiscountAmount
            };
        }
        // If no coupon_code provided, appliedCoupon remains null and coupon fields will be cleared

        // Update visa application with FRESH calculated amounts
        // Note: This will overwrite any existing coupon data with new calculation
        // If no coupon_code provided, coupon fields will be set to null (clearing existing coupons)
        await db.VisaApplication.update({
            visa_id,
            departure_date: departureDate,
            return_date: returnDate,
            visa_type: visa.visa_type,
            entry_type: visa.entry_type,
            number_of_travellers: parseInt(number_of_travellers),
            amount: finalAmount, // Fresh calculation based on current travellers and pricing
            discount: couponDiscountAmount, // Fresh coupon discount (0 if no coupon)
            coupon_code: appliedCoupon ? appliedCoupon.code : null, // Clear if no new coupon
            coupon_id: appliedCoupon ? appliedCoupon.id : null, // Clear if no new coupon
        }, {
            where: { id: draftId },
            transaction
        });

        // Get existing traveller records to preserve file data
        const existingTravellers = await db.VisaApplicationField.findAll({
            where: { visa_application_id: draftId },
            transaction
        });

        // Delete existing traveller records
        await db.VisaApplicationField.destroy({
            where: { visa_application_id: draftId },
            transaction
        });

        // Create updated traveller records (same logic as save draft)
        const createdTravellers = [];

        for (let i = 0; i < travellers.length; i++) {
            const traveller = travellers[i];
            const existingTraveller = existingTravellers[i] || {};

            // Get files for this traveller
            const passport_front_field = `travellers[${i}][passport_front_photo]`;
            const passport_back_field = `travellers[${i}][passport_back_photo]`;
            const passport_size_photo_field = `travellers[${i}][passport_size_photo]`;
            const pan_card_photo_field = `travellers[${i}][pan_card_photo]`;
            const itr_1st_year_photo_field = `travellers[${i}][itr_1st_year_photo]`;
            const itr_2nd_year_photo_field = `travellers[${i}][itr_2nd_year_photo]`;
            const itr_3rd_year_photo_field = `travellers[${i}][itr_3rd_year_photo]`;
            const flight_booking_field = `travellers[${i}][flight_booking]`;
            const hotel_booking_field = `travellers[${i}][hotel_booking]`;
            const travel_itinerary_field = `travellers[${i}][travel_itinerary]`;
            const proof_of_funds_field = `travellers[${i}][proof_of_funds]`;
            const employment_letter_field = `travellers[${i}][employment_letter]`;
            const medical_insurance_certificate_field = `travellers[${i}][medical_insurance_certificate]`;
            const vaccination_certificate_field = `travellers[${i}][vaccination_certificate]`;
            const invitation_letter_field = `travellers[${i}][invitation_letter]`;
            const travel_insurance_field = `travellers[${i}][travel_insurance]`;
            const three_months_bank_statement_field = `travellers[${i}][three_months_bank_statement]`;
            const six_months_bank_statement_field = `travellers[${i}][six_months_bank_statement]`;
            const three_months_bank_signed_and_stamped_statement_field = `travellers[${i}][three_months_bank_signed_and_stamped_statement]`;
            const six_months_bank_signed_and_stamped_statement_field = `travellers[${i}][six_months_bank_signed_and_stamped_statement]`;
            const aadhar_card_field = `travellers[${i}][aadhar_card]`;
            const passport_external_cover_field = `travellers[${i}][passport_external_cover]`;

            // Initialize file fields with existing values, then override with new uploads if present
            let passport_front_photo = existingTraveller.passport_front_photo || traveller.passport_front_photo;
            let passport_back_photo = existingTraveller.passport_back_photo || traveller.passport_back_photo;
            let passport_size_photo = existingTraveller.passport_size_photo || traveller.passport_size_photo;
            let pan_card_photo = existingTraveller.pan_card_photo || traveller.pan_card_photo;
            let itr_1st_year_photo = existingTraveller.itr_1st_year_photo || traveller.itr_1st_year_photo;
            let itr_2nd_year_photo = existingTraveller.itr_2nd_year_photo || traveller.itr_2nd_year_photo;
            let itr_3rd_year_photo = existingTraveller.itr_3rd_year_photo || traveller.itr_3rd_year_photo;
            let flight_booking = existingTraveller.flight_booking || traveller.flight_booking;
            let hotel_booking = existingTraveller.hotel_booking || traveller.hotel_booking;
            let travel_itinerary = existingTraveller.travel_itinerary || traveller.travel_itinerary;
            let proof_of_funds = existingTraveller.proof_of_funds || traveller.proof_of_funds;
            let employment_letter = existingTraveller.employment_letter || traveller.employment_letter;
            let medical_insurance_certificate = existingTraveller.medical_insurance_certificate || traveller.medical_insurance_certificate;
            let vaccination_certificate = existingTraveller.vaccination_certificate || traveller.vaccination_certificate;
            let invitation_letter = existingTraveller.invitation_letter || traveller.invitation_letter;
            let travel_insurance = existingTraveller.travel_insurance || traveller.travel_insurance;
            let three_months_bank_statement = existingTraveller.three_months_bank_statement || traveller.three_months_bank_statement;
            let six_months_bank_statement = existingTraveller.six_months_bank_statement || traveller.six_months_bank_statement;
            let three_months_bank_signed_and_stamped_statement = existingTraveller.three_months_bank_signed_and_stamped_statement || traveller.three_months_bank_signed_and_stamped_statement;
            let six_months_bank_signed_and_stamped_statement = existingTraveller.six_months_bank_signed_and_stamped_statement || traveller.six_months_bank_signed_and_stamped_statement;
            let aadhar_card = existingTraveller.aadhar_card || traveller.aadhar_card;
            let passport_external_cover = existingTraveller.passport_external_cover || traveller.passport_external_cover;

            // Extract file paths from uploaded files - only override if new files are uploaded
            if (req.files[passport_front_field] && req.files[passport_front_field][0]) {
                passport_front_photo = req.files[passport_front_field][0].path;
            }
            if (req.files[passport_back_field] && req.files[passport_back_field][0]) {
                passport_back_photo = req.files[passport_back_field][0].path;
            }
            if (req.files[passport_size_photo_field] && req.files[passport_size_photo_field][0]) {
                passport_size_photo = req.files[passport_size_photo_field][0].path;
            }
            if (req.files[pan_card_photo_field] && req.files[pan_card_photo_field][0]) {
                pan_card_photo = req.files[pan_card_photo_field][0].path;
            }
            if (req.files[itr_1st_year_photo_field] && req.files[itr_1st_year_photo_field][0]) {
                itr_1st_year_photo = req.files[itr_1st_year_photo_field][0].path;
            }
            if (req.files[itr_2nd_year_photo_field] && req.files[itr_2nd_year_photo_field][0]) {
                itr_2nd_year_photo = req.files[itr_2nd_year_photo_field][0].path;
            }
            if (req.files[itr_3rd_year_photo_field] && req.files[itr_3rd_year_photo_field][0]) {
                itr_3rd_year_photo = req.files[itr_3rd_year_photo_field][0].path;
            }
            if (req.files[flight_booking_field] && req.files[flight_booking_field][0]) {
                flight_booking = req.files[flight_booking_field][0].path;
            }
            if (req.files[hotel_booking_field] && req.files[hotel_booking_field][0]) {
                hotel_booking = req.files[hotel_booking_field][0].path;
            }
            if (req.files[travel_itinerary_field] && req.files[travel_itinerary_field][0]) {
                travel_itinerary = req.files[travel_itinerary_field][0].path;
            }
            if (req.files[proof_of_funds_field] && req.files[proof_of_funds_field][0]) {
                proof_of_funds = req.files[proof_of_funds_field][0].path;
            }
            if (req.files[employment_letter_field] && req.files[employment_letter_field][0]) {
                employment_letter = req.files[employment_letter_field][0].path;
            }
            if (req.files[medical_insurance_certificate_field] && req.files[medical_insurance_certificate_field][0]) {
                medical_insurance_certificate = req.files[medical_insurance_certificate_field][0].path;
            }
            if (req.files[vaccination_certificate_field] && req.files[vaccination_certificate_field][0]) {
                vaccination_certificate = req.files[vaccination_certificate_field][0].path;
            }
            if (req.files[invitation_letter_field] && req.files[invitation_letter_field][0]) {
                invitation_letter = req.files[invitation_letter_field][0].path;
            }
            if (req.files[travel_insurance_field] && req.files[travel_insurance_field][0]) {
                travel_insurance = req.files[travel_insurance_field][0].path;
            }
            if (req.files[three_months_bank_statement_field] && req.files[three_months_bank_statement_field][0]) {
                three_months_bank_statement = req.files[three_months_bank_statement_field][0].path;
            }
            if (req.files[six_months_bank_statement_field] && req.files[six_months_bank_statement_field][0]) {
                six_months_bank_statement = req.files[six_months_bank_statement_field][0].path;
            }
            if (req.files[three_months_bank_signed_and_stamped_statement_field] && req.files[three_months_bank_signed_and_stamped_statement_field][0]) {
                three_months_bank_signed_and_stamped_statement = req.files[three_months_bank_signed_and_stamped_statement_field][0].path;
            }
            if (req.files[six_months_bank_signed_and_stamped_statement_field] && req.files[six_months_bank_signed_and_stamped_statement_field][0]) {
                six_months_bank_signed_and_stamped_statement = req.files[six_months_bank_signed_and_stamped_statement_field][0].path;
            }
            if (req.files[aadhar_card_field] && req.files[aadhar_card_field][0]) {
                aadhar_card = req.files[aadhar_card_field][0].path;
            }
            if (req.files[passport_external_cover_field] && req.files[passport_external_cover_field][0]) {
                passport_external_cover = req.files[passport_external_cover_field][0].path;
            }

            const visaApplicationFields = await db.VisaApplicationField.create({
                visa_application_id: draftId,
                first_name: traveller.first_name?.trim(),
                middle_name: traveller.middle_name?.trim() || null,
                last_name: traveller.last_name?.trim(),
                gender: traveller.gender,
                date_of_birth: new Date(traveller.date_of_birth),
                place_of_birth: traveller.place_of_birth?.trim() || null,
                marital_status: traveller.marital_status || null,
                address: traveller.address?.trim() || null,
                pincode: traveller.pincode?.trim() || null,
                emergency_number: traveller.emergency_number ? parseInt(traveller.emergency_number) : null,
                alternate_number: traveller.alternate_number ? parseInt(traveller.alternate_number) : null,
                company_name: traveller.company_name?.trim() || null,
                vendor_type: traveller.vendor_type || null,
                passport_number: traveller.passport_number?.trim(),
                passport_issue_date: traveller.passport_issue_date ? new Date(traveller.passport_issue_date) : null,
                passport_expiry_date: traveller.passport_expiry_date ? new Date(traveller.passport_expiry_date) : null,
                passport_issue_country: traveller.passport_issue_country?.trim() || null,
                passport_expiry_country: traveller.passport_expiry_country?.trim() || null,
                passport_issue_place: traveller.passport_issue_place?.trim() || null,

                // File uploads
                passport_size_photo: passport_size_photo,
                passport_front_photo: passport_front_photo,
                passport_back_photo: passport_back_photo,
                pan_card_photo: pan_card_photo,
                itr_1st_year_photo: itr_1st_year_photo,
                itr_2nd_year_photo: itr_2nd_year_photo,
                itr_3rd_year_photo: itr_3rd_year_photo,
                vaccination_certificate: vaccination_certificate,
                medical_insurance_certificate: medical_insurance_certificate,
                employment_letter: employment_letter,
                proof_of_funds: proof_of_funds,
                flight_booking: flight_booking,
                travel_insurance: travel_insurance,
                travel_itinerary: travel_itinerary,
                hotel_booking: hotel_booking,
                invitation_letter: invitation_letter,
                three_months_bank_statement: three_months_bank_statement,
                six_months_bank_statement: six_months_bank_statement,
                three_months_bank_signed_and_stamped_statement: three_months_bank_signed_and_stamped_statement,
                six_months_bank_signed_and_stamped_statement: six_months_bank_signed_and_stamped_statement,
                aadhar_card: aadhar_card,
                passport_external_cover: passport_external_cover,

                // Additional fields
                visa_type: traveller.visa_type || visa.visa_type,
                visa_category: traveller.visa_category || null,
                purpose_of_visit: traveller.purpose_of_visit?.trim() || null,
                intended_travel_date: traveller.intended_travel_date ? new Date(traveller.intended_travel_date) : departureDate,
                intended_return_date: traveller.intended_return_date ? new Date(traveller.intended_return_date) : returnDate,
                number_of_entries: traveller.number_of_entries ? parseInt(traveller.number_of_entries) : null,
                duration_of_stay: traveller.duration_of_stay ? parseInt(traveller.duration_of_stay) : null,
                previously_visited: traveller.previously_visited === 'true' || traveller.previously_visited === true,
                previously_visited_dates: traveller.previously_visited_dates?.trim() || null,
                current_occupation: traveller.current_occupation?.trim() || null,
                employer_name: traveller.employer_name?.trim() || null,
                employer_address: traveller.employer_address?.trim() || null,
                monthly_income: traveller.monthly_income ? parseFloat(traveller.monthly_income) : null,
                previous_employment: traveller.previous_employment?.trim() || null,
                previous_education: traveller.previous_education?.trim() || null,
                previous_employment_dates: traveller.previous_employment_dates ? new Date(traveller.previous_employment_dates) : null,
                previous_education_dates: traveller.previous_education_dates ? new Date(traveller.previous_education_dates) : null,
                previous_employment_details: traveller.previous_employment_details?.trim() || null,
                previous_education_details: traveller.previous_education_details?.trim() || null,
            }, { transaction });

            createdTravellers.push({
                index: i + 1,
                id: visaApplicationFields.id,
                name: `${traveller.first_name} ${traveller.last_name}`,
                passport_number: traveller.passport_number
            });
        }

        await transaction.commit();

        return res.status(200).json({
            success: true,
            message: 'Visa application draft updated successfully!',
            data: {
                application: {
                    id: draftId,
                    application_id: existingApplication.application_id,
                    status: 'pending_payment',
                    amount: finalAmount,
                    discount: couponDiscountAmount,
                    coupon_code: appliedCoupon ? appliedCoupon.code : null,
                    coupon_id: appliedCoupon ? appliedCoupon.id : null,
                    visa_name: visa.name
                }
            }
        });

    } catch (error) {
        await transaction.rollback();
        console.error('updateVisaApplicationDraft error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// Get Visa Application Draft
exports.getVisaApplicationDraft = async (req, res) => {
    try {
        const userId = req.user.id;
        const { draftId } = req.params;

        const draftApplication = await db.VisaApplication.findOne({
            where: {
                id: draftId,
                user_id: userId,
                status: 'pending_payment'
            },
            include: [
                {
                    model: db.Visa,
                    as: 'visa',
                    attributes: [
                        'id', 'name', 'b2b_price', 'b2c_price',
                        'b2b_discount', 'b2c_discount', 'b2b_processing_time',
                        'b2c_processing_time', 'b2b_processing_type', 'b2c_processing_type',
                        'country_id'
                    ],
                    include: [
                        {
                            model: db.Country,
                            as: 'country',
                            attributes: ['name', 'iso2', 'allow_minor_to_apply']
                        }
                    ]
                },
                {
                    model: db.VisaApplicationField,
                    as: 'visa_application_fields',
                },
                {
                    model: db.Coupon,
                    as: 'coupon',
                },
                {
                    model: db.User,
                    as: 'user',
                    attributes: ['id', 'user_type'],
                    required: false
                }
            ]
        });

        if (!draftApplication) {
            return res.status(404).json({
                success: false,
                message: 'Draft application not found!'
            });
        }

        // FIX: This endpoint was returning raw DB document paths untouched
        // (no resolveImageUrl, no download-filename fix), so PDFs downloaded
        // from a draft application had no extension and looked corrupt/binary
        // when opened. docUrl() applies both fixes consistently here.
        const docUrl = (v) => v ? withDownloadFilename(resolveImageUrl(v)) : v;

        const travelers = draftApplication.visa_application_fields.map(traveller => ({
            first_name: traveller.first_name,
            middle_name: traveller.middle_name,
            last_name: traveller.last_name,
            gender: traveller.gender,
            date_of_birth: traveller.date_of_birth,
            place_of_birth: traveller.place_of_birth,
            marital_status: traveller.marital_status,
            address: traveller.address,
            pincode: traveller.pincode,
            emergency_number: traveller.emergency_number,
            alternate_number: traveller.alternate_number,
            company_name: traveller.company_name,
            vendor_type: traveller.vendor_type,
            passport_number: traveller.passport_number,
            passport_issue_date: traveller.passport_issue_date,
            passport_expiry_date: traveller.passport_expiry_date,
            passport_issue_country: traveller.passport_issue_country,
            passport_expiry_country: traveller.passport_expiry_country,
            passport_issue_place: traveller.passport_issue_place,

            // File paths
            passport_size_photo: docUrl(traveller.passport_size_photo),
            passport_front_photo: docUrl(traveller.passport_front_photo),
            passport_back_photo: docUrl(traveller.passport_back_photo),
            pan_card_photo: docUrl(traveller.pan_card_photo),
            itr_1st_year_photo: docUrl(traveller.itr_1st_year_photo),
            itr_2nd_year_photo: docUrl(traveller.itr_2nd_year_photo),
            itr_3rd_year_photo: docUrl(traveller.itr_3rd_year_photo),
            vaccination_certificate: docUrl(traveller.vaccination_certificate),
            medical_insurance_certificate: docUrl(traveller.medical_insurance_certificate),
            employment_letter: docUrl(traveller.employment_letter),
            proof_of_funds: docUrl(traveller.proof_of_funds),
            flight_booking: docUrl(traveller.flight_booking),
            travel_insurance: docUrl(traveller.travel_insurance),
            travel_itinerary: docUrl(traveller.travel_itinerary),
            hotel_booking: docUrl(traveller.hotel_booking),
            invitation_letter: docUrl(traveller.invitation_letter),
            three_months_bank_statement: docUrl(traveller.three_months_bank_statement),
            six_months_bank_statement: docUrl(traveller.six_months_bank_statement),
            three_months_bank_signed_and_stamped_statement: docUrl(traveller.three_months_bank_signed_and_stamped_statement),
            six_months_bank_signed_and_stamped_statement: docUrl(traveller.six_months_bank_signed_and_stamped_statement),
            aadhar_card: docUrl(traveller.aadhar_card),
            passport_external_cover: docUrl(traveller.passport_external_cover),

            // Additional fields
            visa_type: traveller.visa_type,
            visa_category: traveller.visa_category,
            purpose_of_visit: traveller.purpose_of_visit,
            intended_travel_date: traveller.intended_travel_date,
            intended_return_date: traveller.intended_return_date,
            number_of_entries: traveller.number_of_entries,
            duration_of_stay: traveller.duration_of_stay,
            previously_visited: traveller.previously_visited,
            previously_visited_dates: traveller.previously_visited_dates,
            current_occupation: traveller.current_occupation,
            employer_name: traveller.employer_name,
            employer_address: traveller.employer_address,
            monthly_income: traveller.monthly_income,
            previous_employment: traveller.previous_employment,
            previous_education: traveller.previous_education,
            previous_employment_dates: traveller.previous_employment_dates,
            previous_education_dates: traveller.previous_education_dates,
            previous_employment_details: traveller.previous_employment_details,
            previous_education_details: traveller.previous_education_details,
        }));

        // Calculate per traveller cost based on user type
        const isUserApplication = draftApplication.user?.user_type === 'user' || draftApplication.type === 'b2c';
        const price = parseFloat(isUserApplication ? draftApplication.visa.b2c_price : draftApplication.visa.b2b_price) || 0;
        const discount = parseFloat(isUserApplication ? draftApplication.visa.b2c_discount : draftApplication.visa.b2b_discount) || 0;

        // Calculate base price per traveller
        let basePricePerTraveller = price;
        let discountAmountPerTraveller = 0;
        let finalPricePerTraveller = price;

        // Apply visa discount if available
        if (discount > 0) {
            const discountRate = discount / 100;
            discountAmountPerTraveller = Math.round(basePricePerTraveller * discountRate);
            finalPricePerTraveller = basePricePerTraveller - discountAmountPerTraveller;
        }

        // Calculate coupon discount per traveller if coupon is applied
        let couponDiscountPerTraveller = 0;
        if (draftApplication.coupon && draftApplication.discount > 0) {
            // Distribute total coupon discount across all travellers
            couponDiscountPerTraveller = Math.round(draftApplication.discount / draftApplication.number_of_travellers);
            finalPricePerTraveller = finalPricePerTraveller - couponDiscountPerTraveller;
        }

        return res.status(200).json({
            success: true,
            data: {
                id: draftApplication.id,
                country_id: draftApplication.visa?.country_id,
                coupon: {
                    id: draftApplication.coupon?.id,
                    code: draftApplication.coupon?.code,
                    name: draftApplication.coupon?.name,
                    discount_type: draftApplication.coupon?.discount_type,
                    discount_value: draftApplication.coupon?.discount_value,
                },
                application_id: draftApplication.application_id,
                visa_id: draftApplication.visa_id,
                departure_date: draftApplication.departure_date,
                return_date: draftApplication.return_date,
                number_of_travellers: draftApplication.number_of_travellers,
                amount: draftApplication.amount,
                status: draftApplication.status,
                visa_name: draftApplication.visa?.name,
                country_name: draftApplication.visa?.country?.name,
                allow_minor_to_apply: draftApplication.visa?.country?.allow_minor_to_apply,
                travelers: travelers,
                // Per traveller cost breakdown
                per_traveller_cost: {
                    base_price: basePricePerTraveller,
                    visa_discount_amount: discountAmountPerTraveller,
                    visa_discount_percentage: discount,
                    price_after_visa_discount: finalPricePerTraveller + couponDiscountPerTraveller,
                    coupon_discount_amount: couponDiscountPerTraveller,
                    final_price: finalPricePerTraveller,
                    application_type: isUserApplication ? 'B2C' : 'B2B',
                    currency: 'INR'
                },
                created_at: draftApplication.created_at
            }
        });

    } catch (error) {
        console.error('getVisaApplicationDraft error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// Complete Payment for Saved Application
exports.completeVisaApplicationPayment = async (req, res) => {
    const transaction = await db.sequelize.transaction();
    try {
        const userId = req.user.id;
        const { applicationId } = req.params;

        // Find the draft application
        const visaApplication = await db.VisaApplication.findOne({
            where: {
                id: applicationId,
                user_id: userId,
                status: 'pending_payment'
            },
            include: [
                {
                    model: db.Visa,
                    as: 'visa',
                    required: true
                }
            ],
            transaction
        });

        if (!visaApplication) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Draft application not found!'
            });
        }

        // Check if payment record already exists
        const existingPayment = await db.VisaApplicationPayment.findOne({
            where: { visa_application_id: applicationId },
            transaction
        });

        if (existingPayment) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Payment record already exists for this application!'
            });
        }

        // Create payment record with Zoho order
        const visaApplicationPayment = await db.VisaApplicationPayment.create({
            user_id: userId,
            payment_method: 'online',
            payment_status: 'pending',
            visa_application_id: visaApplication.id,
            amount: visaApplication.amount,
            payment_currency: 'INR',
            payment_gateway: 'zoho'
        }, { transaction });

        // Get user details for Zoho order
        const user = await db.User.findByPk(userId, { transaction });
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({ success: false, message: 'User not found!' });
        }

        // Create Zoho order
        const zohoOrderOptions = {
            amount: visaApplication.amount,
            currency: 'INR',
            receipt: `vendor_visa_app_${visaApplication.application_id}`,
            notes: {
                visa_application_id: visaApplication.id,
                payment_id: visaApplicationPayment.id,
                user_id: userId,
                visa_name: visaApplication.visa.name,
                application_type: 'vendor_b2b_draft_payment'
            }
        };

        // Create Zoho payment session to obtain payments_session_id
        const zohoSessionOptions = {
            amount: totalAmount,
            currency: 'INR',
            reference_id: zohoOrder.id,
            name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Vendor',
            email: user.email,
            phone: user.phone,
            notes: zohoOrder.notes
        };

        let zohoSession;
        try {
            zohoSession = await zohoPaymentsService.createPaymentSession(zohoSessionOptions);
        } catch (sessionError) {
            await transaction.rollback();
            console.error('Zoho payment session creation error:', sessionError.zohoError || sessionError.message);
            return res.status(503).json({
                success: false,
                message: 'Payment gateway is temporarily unavailable. Please try again in a few minutes or contact support if this continues.',
                code: 'PAYMENT_GATEWAY_UNAVAILABLE'
            });
        }

        // Update payment record with Zoho order details
        await db.VisaApplicationPayment.update({
            payment_reference: zohoOrder.id,
            payment_info: JSON.stringify({ order: zohoOrder, session: zohoSession })
        }, {
            where: { id: visaApplicationPayment.id },
            transaction
        });

        await transaction.commit();

        return res.status(200).json({
            success: true,
            message: 'Payment order created successfully!',
            data: {
                application_id: visaApplication.id,
                zoho: {
                    payment_session_id: zohoSession.id,
                    client_id: process.env.ZOHO_CLIENT_ID,
                    amount: zohoOrder.amount,
                    currency: zohoOrder.currency,
                    order_id: zohoOrder.id,
                    payment_session_id: zohoSession.id,
                    name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Vendor',
                    description: `Visa Application Payment - ${visaApplication.visa.name}`,
                    email: user.email,
                    contact: user.phone,
                    notes: zohoOrder.notes,
                    theme: {
                        color: '#2563eb'
                    }
                }
            }
        });

    } catch (error) {
        await transaction.rollback();
        console.error('completeVisaApplicationPayment error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// Get Visa Application for Amendment
exports.getVisaApplicationForAmendment = async (req, res) => {
    try {
        const userId = req.user.id;
        const { applicationId } = req.params;

        const visaApplication = await db.VisaApplication.findOne({
            where: {
                id: applicationId,
                user_id: userId,
                amendment_enabled: true
            },
            include: [
                {
                    model: db.Visa,
                    as: 'visa',
                    include: [
                        {
                            model: db.Country,
                            as: 'country',
                            attributes: ['name', 'iso2']
                        }
                    ]
                },
                {
                    model: db.VisaApplicationField,
                    as: 'visa_application_fields',
                }
            ]
        });

        if (!visaApplication) {
            return res.status(404).json({
                success: false,
                message: 'Amendment not available for this application or application not found!'
            });
        }

        // Check if amendment has expired
        if (visaApplication.amendment_enabled_until) {
            const now = new Date();
            if (now > visaApplication.amendment_enabled_until) {
                // Amendment has expired, disable it
                await visaApplication.update({
                    amendment_enabled: false,
                    amendment_enabled_until: null,
                    amendment_duration_hours: null,
                    amendment_duration_minutes: 0
                });

                return res.status(403).json({
                    success: false,
                    message: 'Amendment period has expired. Please contact support for assistance.'
                });
            }
        }

        const travelers = visaApplication.visa_application_fields.map(traveller => ({
            id: traveller.id,
            first_name: traveller.first_name,
            middle_name: traveller.middle_name,
            last_name: traveller.last_name,
            gender: traveller.gender,
            date_of_birth: traveller.date_of_birth,
            place_of_birth: traveller.place_of_birth,
            marital_status: traveller.marital_status,
            address: traveller.address,
            pincode: traveller.pincode,
            emergency_number: traveller.emergency_number,
            alternate_number: traveller.alternate_number,
            company_name: traveller.company_name,
            vendor_type: traveller.vendor_type,
            passport_number: traveller.passport_number,
            passport_issue_date: traveller.passport_issue_date,
            passport_expiry_date: traveller.passport_expiry_date,
            passport_issue_country: traveller.passport_issue_country,
            passport_expiry_country: traveller.passport_expiry_country,
            passport_issue_place: traveller.passport_issue_place,

            // File paths
            passport_size_photo: resolveImageUrl(traveller.passport_size_photo),
passport_front_photo: resolveImageUrl(traveller.passport_front_photo),
passport_back_photo: resolveImageUrl(traveller.passport_back_photo),
pan_card_photo: resolveImageUrl(traveller.pan_card_photo),
itr_1st_year_photo: resolveImageUrl(traveller.itr_1st_year_photo),
itr_2nd_year_photo: resolveImageUrl(traveller.itr_2nd_year_photo),
itr_3rd_year_photo: resolveImageUrl(traveller.itr_3rd_year_photo),
vaccination_certificate: resolveImageUrl(traveller.vaccination_certificate),
medical_insurance_certificate: resolveImageUrl(traveller.medical_insurance_certificate),
employment_letter: resolveImageUrl(traveller.employment_letter),
proof_of_funds: resolveImageUrl(traveller.proof_of_funds),
flight_booking: resolveImageUrl(traveller.flight_booking),
travel_insurance: resolveImageUrl(traveller.travel_insurance),
travel_itinerary: resolveImageUrl(traveller.travel_itinerary),
hotel_booking: resolveImageUrl(traveller.hotel_booking),
invitation_letter: resolveImageUrl(traveller.invitation_letter),
three_months_bank_statement: resolveImageUrl(traveller.three_months_bank_statement),
six_months_bank_statement: resolveImageUrl(traveller.six_months_bank_statement),
three_months_bank_signed_and_stamped_statement: resolveImageUrl(traveller.three_months_bank_signed_and_stamped_statement),
six_months_bank_signed_and_stamped_statement: resolveImageUrl(traveller.six_months_bank_signed_and_stamped_statement),
aadhar_card: resolveImageUrl(traveller.aadhar_card),
passport_external_cover: resolveImageUrl(traveller.passport_external_cover),
            // Additional fields
            visa_type: traveller.visa_type,
            visa_category: traveller.visa_category,
            purpose_of_visit: traveller.purpose_of_visit,
            intended_travel_date: traveller.intended_travel_date,
            intended_return_date: traveller.intended_return_date,
            number_of_entries: traveller.number_of_entries,
            duration_of_stay: traveller.duration_of_stay,
            previously_visited: traveller.previously_visited,
            previously_visited_dates: traveller.previously_visited_dates,
            current_occupation: traveller.current_occupation,
            employer_name: traveller.employer_name,
            employer_address: traveller.employer_address,
            monthly_income: traveller.monthly_income,
            previous_employment: traveller.previous_employment,
            previous_education: traveller.previous_education,
            previous_employment_dates: traveller.previous_employment_dates,
            previous_education_dates: traveller.previous_education_dates,
            previous_employment_details: traveller.previous_employment_details,
            previous_education_details: traveller.previous_education_details,
        }));

        return res.status(200).json({
            success: true,
            message: 'Visa application retrieved for amendment',
            data: {
                id: visaApplication.id,
                application_id: visaApplication.application_id,
                visa_id: visaApplication.visa_id,
                departure_date: visaApplication.departure_date,
                return_date: visaApplication.return_date,
                number_of_travellers: visaApplication.number_of_travellers,
                amount: visaApplication.amount,
                status: visaApplication.status,
                amendment_enabled: visaApplication.amendment_enabled,
                amendment_enabled_until: visaApplication.amendment_enabled_until,
                amendment_duration_hours: visaApplication.amendment_duration_hours,
                amendment_duration_minutes: visaApplication.amendment_duration_minutes,
                visa_name: visaApplication.visa?.name,
                country_name: visaApplication.visa?.country?.name,
                travelers: travelers,
                created_at: visaApplication.created_at
            }
        });

    } catch (error) {
        console.error('getVisaApplicationForAmendment error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// Update Visa Application Amendment
exports.updateVisaApplicationAmendment = async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
        const userId = req.user.id;
        const { applicationId } = req.params;
        const data = req.body;
        const files = req.files;

        // Find the application
        const visaApplication = await db.VisaApplication.findOne({
            where: {
                id: applicationId,
                user_id: userId,
                amendment_enabled: true
            }
        });

        if (!visaApplication) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: 'Amendment not available for this application or application not found!'
            });
        }

        // Check if amendment has expired
        if (visaApplication.amendment_enabled_until) {
            const now = new Date();
            if (now > visaApplication.amendment_enabled_until) {
                // Amendment has expired, disable it
                await visaApplication.update({
                    amendment_enabled: false,
                    amendment_enabled_until: null,
                    amendment_duration_hours: null,
                    amendment_duration_minutes: null
                }, { transaction: t });

                await t.rollback();
                return res.status(403).json({
                    success: false,
                    message: 'Amendment period has expired. Please contact support for assistance.'
                });
            }
        }

        // Update main application details if provided
        if (data.departure_date || data.return_date || data.visa_type || data.entry_type) {
            await visaApplication.update({
                departure_date: data.departure_date || visaApplication.departure_date,
                return_date: data.return_date || visaApplication.return_date,
                visa_type: data.visa_type || visaApplication.visa_type,
                entry_type: data.entry_type || visaApplication.entry_type,
                updated_at: new Date()
            }, { transaction: t });
        }

        // Update traveller fields (but not add new travellers)
        if (data.travellers && Array.isArray(data.travellers)) {
            for (let i = 0; i < data.travellers.length; i++) {
                const travellerData = data.travellers[i];
                const travellerId = travellerData.id;

                if (!travellerId) {
                    await t.rollback();
                    return res.status(400).json({
                        success: false,
                        message: 'Traveller ID is required for amendments. Cannot add new travellers.'
                    });
                }

                // Find existing traveller
                const existingTraveller = await db.VisaApplicationField.findOne({
                    where: {
                        id: travellerId,
                        visa_application_id: applicationId
                    }
                });

                if (!existingTraveller) {
                    await t.rollback();
                    return res.status(400).json({
                        success: false,
                        message: `Traveller with ID ${travellerId} not found in this application`
                    });
                }

                // Prepare update data for traveller
                const updateData = { ...travellerData };
                delete updateData.id; // Remove id from update data

                // Handle file uploads for this traveller
                const fileFields = [
                    'passport_size_photo', 'passport_front_photo', 'passport_back_photo',
                    'pan_card_photo', 'itr_1st_year_photo', 'itr_2nd_year_photo', 'itr_3rd_year_photo',
                    'vaccination_certificate', 'medical_insurance_certificate', 'employment_letter',
                    'proof_of_funds', 'flight_booking', 'travel_insurance', 'travel_itinerary',
                    'hotel_booking', 'invitation_letter', 'three_months_bank_statement',
                    'six_months_bank_statement', 'three_months_bank_signed_and_stamped_statement',
                    'six_months_bank_signed_and_stamped_statement', 'aadhar_card', 'passport_external_cover'
                ];

                // Process file uploads
                fileFields.forEach(fieldName => {
                    const fileKey = `travellers[${i}][${fieldName}]`;
                    if (files && files[fileKey] && files[fileKey].length > 0) {
                        updateData[fieldName] = files[fileKey][0].path;
                    }
                });

                // Update the traveller
                await existingTraveller.update(updateData, { transaction: t });
            }
        }

        await visaApplication.update({
            amendment_enabled: false
        }, { transaction: t });

        await t.commit();

        // Send email notification to admin and support (don't await to avoid blocking response)
        try {
            // Get vendor, visa, and user data for email
            const vendor = await db.User.findByPk(userId);
            const visa = await db.Visa.findByPk(visaApplication.visa_id);
            const user = visaApplication.user_id ? await db.User.findByPk(visaApplication.user_id) : null;

            if (vendor && visa) {
                // Prepare changes summary
                const changesSummary = [];
                if (data.departure_date) changesSummary.push(`Departure date updated to ${data.departure_date}`);
                if (data.return_date) changesSummary.push(`Return date updated to ${data.return_date}`);
                if (data.visa_type) changesSummary.push(`Visa type updated to ${data.visa_type}`);
                if (data.entry_type) changesSummary.push(`Entry type updated to ${data.entry_type}`);
                if (data.travellers && data.travellers.length > 0) {
                    changesSummary.push(`Updated ${data.travellers.length} traveller(s) information`);
                }

                const emailData = {
                    user: user,
                    visa: visa,
                    application: visaApplication,
                    vendor: vendor,
                    changes: changesSummary.length > 0 ? changesSummary.join(', ') : 'General application amendments made'
                };

                await sendVendorAmendmentNotificationEmail(emailData);
            }
        } catch (emailError) {
            console.error('Failed to send vendor amendment notification email:', emailError);
            // Don't fail the main operation if email fails
        }

        return res.status(200).json({
            success: true,
            message: 'Visa application amended successfully',
            data: {
                id: visaApplication.id,
                application_id: visaApplication.application_id,
                updated_at: new Date()
            }
        });

    } catch (error) {
        await t.rollback();
        console.error('updateVisaApplicationAmendment error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// Get Featured Visas
exports.getFeaturedVisas = async (req, res) => {
    try {
        // Fetch featured visas with necessary fields
        const featuredVisas = await db.Visa.findAll({
            where: {
                is_featured: true,
                is_active: true,
                is_deleted: false,
                b2c_price: {
                    [Op.gt]: 0
                }
            },
            attributes: [
                'id',
                'name',
                'b2c_price',
                'b2c_discount',
                'b2c_processing_time',
                'b2c_processing_type',
                'country_id'
            ],
            include: [
                {
                    model: db.VisaUploads,
                    as: 'uploads',
                    attributes: ['image_path'],
                    limit: 1 // Get only the first image
                },
                {
                    model: db.Country,
                    as: 'country',
                    attributes: ['name', 'iso2']
                }
            ],
            order: [['display_order', 'ASC'], ['created_at', 'DESC']]
        });

        // Format the response data
        const formattedVisas = featuredVisas.map(visa => {
            const originalPrice = parseFloat(visa.b2c_price) || 0;
            const discount = parseFloat(visa.b2c_discount) || 0;
            
            // Calculate discounted price: discountedPrice = originalPrice * (1 - discount / 100)
            const discountedPrice = discount > 0 
                ? originalPrice * (1 - discount / 100)
                : originalPrice;

            return {
                id: visa.id,
                name: visa.name,
                country: visa.country ? {
                    name: visa.country.name,
                    iso2: visa.country.iso2
                } : null,
                b2c_price: originalPrice,
                b2c_discount: discount,
                b2c_discounted_price: parseFloat(discountedPrice.toFixed(2)),
                b2c_processing_time: visa.b2c_processing_time,
                b2c_processing_type: visa.b2c_processing_type,
                imageUrl: visa.uploads?.[0]?.image_path 
                    ? resolveImageUrl(visa.uploads?.[0]?.image_path) 
                    : null
            };
        });

        return res.status(200).json({
            success: true,
            message: 'Featured visas retrieved successfully',
            data: formattedVisas,
            count: formattedVisas.length
        });

    } catch (error) {
        console.error('getFeaturedVisas error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error',
            error: 'Internal server error'
        });
    }
};
