const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class PassportService {
    constructor() {
        this.apiUrl = process.env.GOOGLE_CLOUD_VISION_API_URL;
        this.apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
        // Mindee configuration
        this.mindeeApiKey = process.env.MINDEE_API_KEY;
        this.mindeeModelId = process.env.MINDEE_PASSPORT_MODEL_ID || '35b13cb3-b120-4bd2-abad-e5f5480c1f03';
        // Gemini configuration
        this.geminiApiKey = process.env.GEMINI_API_KEY;
        this.genAI = new GoogleGenerativeAI(this.geminiApiKey);
    }

    /**
     * Convert image file to base64
     */
    imageToBase64(filePath) {
        try {
            const imageBuffer = fs.readFileSync(filePath);
            return imageBuffer.toString('base64');
        } catch (error) {
            throw new Error(`Error reading image file: ${error.message}`);
        }
    }

    /**
     * Extract passport data using only Mindee API
     */
    async extractPassportWithMindee(imagePath) {
        try {
            if (!this.mindeeApiKey) {
                throw new Error('MINDEE_API_KEY is not configured');
            }

            const result = await this.sendFileWithPolling(
                imagePath,
                this.mindeeModelId,
                this.mindeeApiKey
            );

            return this.parseMindeePassportResponse(result);
        } catch (error) {
            console.error('Error extracting passport data with Mindee:', error);
            throw new Error(`Mindee API error: ${error.message}`);
        }
    }

    /**
     * Send file to Mindee API with polling
     */
    async sendFileWithPolling(filePath, modelId, apiKey, maxRetries = 30, pollingInterval = 2) {
        const fileName = path.basename(filePath);
        const headers = {
            "Authorization": apiKey
        };

        const formData = new FormData();
        formData.append("model_id", modelId);
        formData.append("rag", "false");
        formData.append("file", fs.createReadStream(filePath), {
            filename: fileName
        });

        console.log(`Enqueuing file: ${filePath}`);
        const response = await axios.post(
            "https://api-v2.mindee.net/v2/inferences/enqueue",
            formData,
            { headers: { ...headers, ...formData.getHeaders() } }
        );

        const jobData = response.data.job;
        const pollingUrl = jobData.polling_url;

        // Initial wait before polling
        await new Promise(resolve => setTimeout(resolve, 3000));

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            console.log(`Polling on: ${pollingUrl}`);

            const pollResponse = await axios.get(pollingUrl, {
                headers,
                maxRedirects: 0,
                validateStatus: status => status >= 200 && status < 400
            });

            const pollData = pollResponse.data;
            const jobStatus = pollData.job?.status;

            if (pollResponse.status === 302 || jobStatus === "Processed") {
                const resultUrl = pollData.job?.result_url;
                console.log(`Get result from: ${resultUrl}`);

                const resultResponse = await axios.get(resultUrl, { headers });
                return resultResponse.data;
            }
            await new Promise(resolve => setTimeout(resolve, pollingInterval * 1000));
        }
        throw new Error(`Polling timed out after ${maxRetries} attempts`);
    }

    /**
     * Parse Mindee passport response into standardized format
     */
    parseMindeePassportResponse(mindeeResponse) {
        try {
            const inference = mindeeResponse?.inference;
            if (!inference) {
                throw new Error('Invalid Mindee response: no inference found');
            }

            const prediction = inference?.result?.fields;

            if (!prediction) {
                throw new Error('Invalid Mindee response: no prediction found');
            }

            // Extract passport data from Mindee response
            const passportData = {
                givenName: prediction.given_names?.value || '',
                lastName: prediction.surnames?.value || '',
                passportNumber: prediction.passport_number?.value || '',
                nationality: prediction.nationality?.value || '',
                dateOfBirth: prediction.date_of_birth?.value || '',
                placeOfBirth: prediction.place_of_birth?.value || '',
                sex: prediction.sex?.value || '',
                dateOfIssue: prediction.date_of_issue?.value || '',
                dateOfExpiry: prediction.date_of_expiry?.value || '',
                issuingCountry: prediction.issuing_country?.value || '',
                apiUsed: 'mindee'
            };

            return {
                success: true,
                data: passportData,
                rawResponse: mindeeResponse,
                extractedText: this.extractTextFromMindeeResponse(prediction),
                confidence: inference?.confidence || 0
            };
        } catch (error) {
            console.error('Error parsing Mindee response:', error);
            throw new Error(`Failed to parse Mindee response: ${error.message}`);
        }
    }

    /**
     * Extract raw text from Mindee response for fallback processing
     */
    extractTextFromMindeeResponse(prediction) {
        const textParts = [];

        // Collect all text values from the prediction
        Object.keys(prediction).forEach(key => {
            const field = prediction[key];
            if (field && field.value) {
                textParts.push(field.value);
            } else if (Array.isArray(field)) {
                field.forEach(item => {
                    if (item && item.value) {
                        textParts.push(item.value);
                    }
                });
            }
        });

        return textParts.join('\n');
    }

    /**
     * Extract text from image using Google Cloud Vision API
     */
    async extractTextFromImage(imagePath) {
        try {
            const base64Image = this.imageToBase64(imagePath);

            const requestBody = {
                requests: [
                    {
                        image: {
                            content: base64Image
                        },
                        features: [
                            {
                                type: 'TEXT_DETECTION',
                                maxResults: 1
                            }
                        ]
                    }
                ]
            };

            const response = await axios.post(`${this.apiUrl}?key=${this.apiKey}`, requestBody, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.data.responses && response.data.responses[0].textAnnotations) {
                return response.data.responses[0].textAnnotations[0].description;
            } else {
                throw new Error('No text detected in the image');
            }
        } catch (error) {
            console.error('Error extracting text from image:', error);
            throw new Error(`Vision API error: ${error.message}`);
        }
    }

    /**
     * Parse passport data from extracted text
     */
    parsePassportData(extractedText) {
        try {
            const lines = extractedText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

            const passportData = {
                passportNumber: null,
                passportType: null,
                countryCode: null,
                firstName: null,
                middleName: null,
                lastName: null,
                nationality: null,
                sex: null,
                dateOfBirth: null,
                placeOfBirth: null,
                placeOfIssue: null,
                dateOfIssue: null,
                dateOfExpiry: null,
                extractedText: extractedText
            };

            // Common passport patterns
            const patterns = {
                passportNumber: /P[A-Z0-9]{7,9}|[A-Z]{1,2}[0-9]{6,8}/,
                datePattern: /\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}|\d{4}[\/\-\.]\d{2}[\/\-\.]\d{2}/,
                mrzLine: /[A-Z0-9<]{44}|[A-Z0-9<]{36}/,
                countryCode: /^[A-Z]{3}$/
            };

            // Extract passport type (usually "P" for personal passport)
            const passportTypeMatch = extractedText.match(/TYPE[\s:]*([A-Z])/i) || extractedText.match(/PASSPORT|PASSEPORT|REISEPASS/i);
            if (passportTypeMatch) {
                if (passportTypeMatch[1]) {
                    passportData.passportType = passportTypeMatch[1].toUpperCase();
                } else {
                    passportData.passportType = 'P'; // Default to P for personal passport
                }
            }

            // Try to find passport number
            const passportNumberMatch = extractedText.match(patterns.passportNumber);
            if (passportNumberMatch) {
                passportData.passportNumber = passportNumberMatch[0];
            }

            // Extract dates
            const dates = extractedText.match(new RegExp(patterns.datePattern.source, 'g'));
            if (dates && dates.length >= 2) {
                // Usually date of birth comes first, then expiry
                passportData.dateOfBirth = this.formatDate(dates[0]);
                passportData.dateOfExpiry = this.formatDate(dates[dates.length - 1]);

                if (dates.length >= 3) {
                    passportData.dateOfIssue = this.formatDate(dates[1]);
                }
            }

            // Extract sex/gender
            const sexMatch = extractedText.match(/\b(M|F|MALE|FEMALE)\b/i);
            if (sexMatch) {
                passportData.sex = sexMatch[0].toUpperCase();
                if (passportData.sex === 'MALE' || passportData.sex === 'M') passportData.gender = 'Male';
                if (passportData.sex === 'FEMALE' || passportData.sex === 'F') passportData.gender = 'Female';
            }

            // Extract country codes (3 letter codes)
            const countryMatches = extractedText.match(new RegExp(patterns.countryCode.source, 'g'));
            if (countryMatches && countryMatches.length > 0) {
                passportData.countryCode = countryMatches[0];
                passportData.nationality = countryMatches[0];
            }

            // Try to extract names and places from specific positions
            this.extractNamesAndPlaces(lines, passportData);

            return passportData;
        } catch (error) {
            console.error('Error parsing passport data:', error);
            throw new Error(`Error parsing passport data: ${error.message}`);
        }
    }

    /**
     * Extract names and places from passport text lines
     */
    extractNamesAndPlaces(lines, passportData) {
        try {
            // Look for surname and given names patterns
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].toUpperCase();

                // Extract surname/last name
                if (line.includes('SURNAME') || line.includes('NOM') || line.includes('APELLIDOS')) {
                    if (i + 1 < lines.length) {
                        passportData.lastName = lines[i + 1].trim();
                    }
                }

                // Extract given names (first and middle names)
                if (line.includes('GIVEN NAMES') || line.includes('PRENOM') || line.includes('NOMBRES')) {
                    if (i + 1 < lines.length) {
                        const givenNames = lines[i + 1].trim();
                        this.parseGivenNames(givenNames, passportData);
                    }
                }

                // Extract place of birth
                if (line.includes('PLACE OF BIRTH') || line.includes('LIEU DE NAISSANCE') || line.includes('LUGAR DE NACIMIENTO')) {
                    if (i + 1 < lines.length) {
                        passportData.placeOfBirth = lines[i + 1].trim();
                    }
                }

                // Extract place of issue
                if (line.includes('PLACE OF ISSUE') || line.includes('LIEU DE DELIVRANCE') || line.includes('LUGAR DE EXPEDICION')) {
                    if (i + 1 < lines.length) {
                        passportData.placeOfIssue = lines[i + 1].trim();
                    }
                }

                // Extract authority/issuing office for place of issue
                if (line.includes('AUTHORITY') || line.includes('AUTORITE') || line.includes('AUTORIDAD')) {
                    if (i + 1 < lines.length) {
                        passportData.placeOfIssue = lines[i + 1].trim();
                    }
                }

                // Sometimes names appear after nationality
                if (line.includes('NATIONALITY') || line.includes('NATIONALITE')) {
                    // Names often appear in the next few lines
                    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
                        const nameLine = lines[j];
                        if (nameLine && /^[A-Z\s]+$/.test(nameLine) && nameLine.length > 2) {
                            if (!passportData.lastName && !nameLine.includes('/')) {
                                passportData.lastName = nameLine.trim();
                            } else if (!passportData.firstName && nameLine.includes('/')) {
                                const parts = nameLine.split('/');
                                passportData.lastName = parts[0].trim();
                                this.parseGivenNames(parts[1].trim(), passportData);
                            }
                        }
                    }
                }

                // Look for specific place indicators
                if (line.includes('BORN IN') || line.includes('NE A') || line.includes('NACIDO EN')) {
                    const restOfLine = line.split(/BORN IN|NE A|NACIDO EN/i)[1];
                    if (restOfLine) {
                        passportData.placeOfBirth = restOfLine.trim();
                    }
                }
            }

            // Additional extraction from MRZ (Machine Readable Zone) if present
            this.extractFromMRZ(lines, passportData);

        } catch (error) {
            console.error('Error extracting names and places:', error);
        }
    }

    /**
     * Parse given names into first name and middle name
     */
    parseGivenNames(givenNames, passportData) {
        try {
            if (!givenNames) return;

            const nameParts = givenNames.split(/\s+/).filter(part => part.length > 0);

            if (nameParts.length > 0) {
                passportData.firstName = nameParts[0];

                if (nameParts.length > 1) {
                    // Join remaining parts as middle name
                    passportData.middleName = nameParts.slice(1).join(' ');
                }
            }
        } catch (error) {
            console.error('Error parsing given names:', error);
        }
    }

    /**
     * Extract data from Machine Readable Zone (MRZ)
     */
    extractFromMRZ(lines, passportData) {
        try {
            for (const line of lines) {
                // Look for MRZ lines (typically 44 characters for passport)
                if (line.length === 44 && /^P</.test(line)) {
                    // First MRZ line format: P<CCCLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
                    // Where CCC is country code, L is surname and given names
                    const countryCode = line.substring(2, 5);
                    if (countryCode && countryCode !== '<<<') {
                        passportData.countryCode = countryCode;
                        passportData.nationality = countryCode;
                    }

                    // Extract names from MRZ
                    const namesPart = line.substring(5).replace(/</g, ' ').trim();
                    const mrzNames = namesPart.split('  ').filter(part => part.length > 0);

                    if (mrzNames.length > 0 && !passportData.lastName) {
                        passportData.lastName = mrzNames[0].trim();
                    }

                    if (mrzNames.length > 1 && !passportData.firstName) {
                        this.parseGivenNames(mrzNames[1].trim(), passportData);
                    }
                }

                // Second MRZ line contains passport number, birth date, etc.
                if (line.length === 44 && /^[A-Z0-9]/.test(line) && !line.startsWith('P<')) {
                    // Extract passport number (first 9 characters)
                    const mrzPassportNumber = line.substring(0, 9).replace(/</g, '');
                    if (mrzPassportNumber && !passportData.passportNumber) {
                        passportData.passportNumber = mrzPassportNumber;
                    }

                    // Extract birth date (positions 13-18: YYMMDD)
                    const birthDateMRZ = line.substring(13, 19);
                    if (birthDateMRZ && /^\d{6}$/.test(birthDateMRZ) && !passportData.dateOfBirth) {
                        passportData.dateOfBirth = this.formatMRZDate(birthDateMRZ);
                    }

                    // Extract expiry date (positions 21-26: YYMMDD)
                    const expiryDateMRZ = line.substring(21, 27);
                    if (expiryDateMRZ && /^\d{6}$/.test(expiryDateMRZ) && !passportData.dateOfExpiry) {
                        passportData.dateOfExpiry = this.formatMRZDate(expiryDateMRZ);
                    }

                    // Extract sex (position 20)
                    const sexMRZ = line.charAt(20);
                    if ((sexMRZ === 'M' || sexMRZ === 'F') && !passportData.sex) {
                        passportData.sex = sexMRZ;
                    }
                }
            }
        } catch (error) {
            console.error('Error extracting from MRZ:', error);
        }
    }

    /**
     * Format MRZ date (YYMMDD) to YYYY-MM-DD
     */
    formatMRZDate(mrzDate) {
        try {
            if (mrzDate.length !== 6) return mrzDate;

            const year = parseInt(mrzDate.substring(0, 2));
            const month = mrzDate.substring(2, 4);
            const day = mrzDate.substring(4, 6);

            // Determine century (assume years 00-30 are 2000s, 31-99 are 1900s)
            const fullYear = year <= 30 ? 2000 + year : 1900 + year;

            return `${fullYear}-${month}-${day}`;
        } catch (error) {
            return mrzDate;
        }
    }

    /**
     * Format date to YYYY-MM-DD
     */
    formatDate(dateString) {
        try {
            // Handle different date formats
            const cleanDate = dateString.replace(/[\.\/\-]/g, '/');
            const parts = cleanDate.split('/');

            if (parts.length === 3) {
                // Determine if it's DD/MM/YYYY or MM/DD/YYYY or YYYY/MM/DD
                if (parts[0].length === 4) {
                    // YYYY/MM/DD
                    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                } else if (parts[2].length === 4) {
                    // DD/MM/YYYY or MM/DD/YYYY - assume DD/MM/YYYY for passport dates
                    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
            }

            return dateString; // Return original if can't parse
        } catch (error) {
            return dateString;
        }
    }

    /**
     * Scan passport image and extract data
     */
    async scanPassport(imagePath) {
        try {
            // Extract text from image
            const extractedText = await this.extractTextFromImage(imagePath);

            // Parse passport data
            const passportData = this.parsePassportData(extractedText);

            return {
                success: true,
                data: passportData,
                extractedText: extractedText
            };
        } catch (error) {
            console.error('Error scanning passport:', error);
            return {
                success: false,
                error: error.message,
                extractedText: null
            };
        }
    }

    /**
     * Extract passport data using Gemini AI
     * @param {string} imagePath - Path to the passport image file
     * @returns {Object} Structured passport data
     */
    async extractPassportWithGemini(imagePath) {
        try {
            if (!this.genAI) {
                throw new Error('GEMINI_API_KEY is not configured');
            }

            // Check if image file exists
            if (!fs.existsSync(imagePath)) {
                throw new Error('Image file not found');
            }

            // Convert image to base64
            const imageBase64 = this.imageToBase64(imagePath);

            // Determine MIME type based on file extension
            const fileExtension = path.extname(imagePath).toLowerCase();
            let mimeType = 'image/jpeg'; // default
            if (fileExtension === '.png') {
                mimeType = 'image/png';
            } else if (fileExtension === '.webp') {
                mimeType = 'image/webp';
            }

            // Create the model
            const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

            // Create the prompt for passport data extraction
            const prompt = `Analyze this passport image and extract the following information in JSON format. Be precise and only include information that is clearly visible in the image. If any field is not visible or unclear, use null:

            {
            "givenName": "",
            "lastName": "",
            "passportNumber": "",
            "nationality": "",
            "dateOfBirth": "",
            "placeOfBirth": "",
            "sex": "",
            "dateOfIssue": "",
            "dateOfExpiry": "",
            "issuingCountry": "",
            "placeOfIssue": "",
            }

            Important:
            - Return ONLY the JSON object, no additional text or explanation
            - Use ISO date format (YYYY-MM-DD) for dates when possible
            - For sex, use "Male" or "Female"
            - Extract exact text as it appears on the passport`;

            // Generate content
            const result = await model.generateContent([
                {
                    inlineData: {
                        data: imageBase64,
                        mimeType: mimeType
                    }
                },
                prompt
            ]);

            const response = await result.response;
            const text = response.text();

            // Parse the JSON response
            let passportData;
            try {
                // Clean the response text (remove any markdown formatting or extra text)
                const cleanedText = text.replace(/```json\n?|```\n?/g, '').trim();
                passportData = JSON.parse(cleanedText);
            } catch (parseError) {
                console.error('Failed to parse Gemini response as JSON:', text);
                throw new Error('Invalid JSON response from Gemini AI');
            }
            
            // Validate that we got the expected structure
            const requiredFields = [
                'givenName', 'lastName', 'passportNumber', 'nationality',
                'dateOfBirth', 'placeOfBirth', 'sex', 'dateOfIssue',
                'dateOfExpiry', 'issuingCountry', 'placeOfIssue'
            ];

            const missingFields = requiredFields.filter(field => !(field in passportData));
            if (missingFields.length > 0) {
                console.warn('Missing fields in Gemini response:', missingFields);
            }

            return {
                success: true,
                data: passportData,
                confidence: 0.85, // Estimated confidence for Gemini
                source: 'gemini',
                rawResponse: text
            };

        } catch (error) {
            console.error('Error extracting passport data with Gemini:', error);
            throw new Error(`Gemini API error: ${error.message}`);
        }
    }
}

module.exports = new PassportService(); 