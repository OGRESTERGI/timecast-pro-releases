/**
 * questions-api.js
 * Κοινό API για διαχείριση ερωτήσεων - συμβατό με server.js & main.js
 * © 2025 Sovereign Event Systems
 */

const os = require('os');

// Company Name Intelligence Database
const COMPANY_ALIASES = {
    "coca-cola s.a": ["coca cola", "cocacola", "coca-cola", "κοκα κολα", "κοκα-κολα", "coke"],
    "microsoft corp": ["microsoft", "ms", "μايкروsoft", "μαικροσοφτ"],
    "google llc": ["google", "alphabet", "γκουγκλ", "γκουγκλε"],
    "apple inc": ["apple", "αππλε", "μηλο"],
    "amazon inc": ["amazon", "αμαζον", "αμαζόνιος"],
    "meta platforms": ["facebook", "meta", "φεισμπουκ", "φέισμπουκ"],
    "tesla inc": ["tesla", "τέσλα", "τεσλα"],
    "netflix inc": ["netflix", "νετφλιξ"],
    "vodafone group": ["vodafone", "βοδαφόνε", "βοντάφον"],
    "cosmote s.a": ["cosmote", "κοσμότε", "ote"],
    "εθνική τράπεζα": ["εθνικη", "εθνική", "national bank", "nbg"],
    "alpha bank": ["alpha", "άλφα", "αλφα"],
    "eurobank s.a": ["eurobank", "ευρωμπάνκ", "ευρωπάνκ"],
    "πειραιώς τράπεζα": ["πειραιως", "πειραιώς", "piraeus", "πειραιά"],
    "pfizer inc": ["pfizer", "fizer", "φάιζερ", "φαιζερ"],
    "johnson & johnson": ["jnj", "j&j", "johnson", "τζόνσον"],
    "bayer ag": ["bayer", "μπάγερ", "μπαγερ"],
    "novartis ag": ["novartis", "νοβάρτις"],
    "roche holding": ["roche", "ρος", "ροσ"],
    "toyota motor": ["toyota", "toyotan", "τογιότα", "τογιοτα"],
    "honda motor": ["honda", "χόντα", "χοντα"],
    "nissan motor": ["nissan", "νίσσαν", "νισσαν"],
    "bmw group": ["bmw", "μπέμβε", "μπεμβε"],
    "mercedes-benz": ["mercedes", "μερσεντές", "μερσεντες"],
    "volkswagen ag": ["volkswagen", "vw", "φολκσβάγκεν"],
    "samsung electronics": ["samsung", "σάμσουνγκ", "σαμσουνγκ"],
    "sony corporation": ["sony", "σόνι", "σονι"],
    "lg electronics": ["lg", "ελτζι", "el gee"],
    "siemens ag": ["siemens", "σίμενς", "σιμενς"],
    "intel corporation": ["intel", "ιντελ", "ίντελ"],
    "oracle corporation": ["oracle", "οράκλ", "ορακλ"],
    "cisco systems": ["cisco", "σίσκο", "σισκο"],
    "ibm corporation": ["ibm", "αιμπιεμ", "ι.μπι.εμ"],
    "hewlett packard": ["hp", "hewlett", "packard", "χιούλετ"],
    "dell technologies": ["dell", "ντελ"],
    "lenovo group": ["lenovo", "λένοβο"]
};

// Dynamic Learning Database - αποθηκεύει νέα patterns
let dynamicCompanyPatterns = {};

/**
 * Normalization function για company names με dynamic learning
 * @param {string} input - Όνομα εταιρείας που εισήγαγε ο χρήστης
 * @returns {string} - Normalized όνομα εταιρείας
 */
function normalizeCompanyName(input) {
    if (!input || typeof input !== 'string') return input;
    
    const originalInput = input.trim();
    
    // Καθαρισμός: lowercase, αφαίρεση κενών, σημείων στίξης
    const cleaned = input.toLowerCase()
        .trim()
        .replace(/[.,;:!?()]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/-+/g, '')
        .replace(/\s/g, '');
    
    // 1. Έλεγχος για ακριβές match σε γνωστές εταιρείες
    for (const [official, aliases] of Object.entries(COMPANY_ALIASES)) {
        const normalizedAliases = aliases.map(alias => 
            alias.toLowerCase().replace(/[.,;:!?()-\s]/g, '')
        );
        
        if (normalizedAliases.includes(cleaned)) {
            return official;
        }
    }
    
    // 2. Fuzzy matching με γνωστές εταιρείες (80% threshold)
    let bestMatch = originalInput;
    let bestScore = 0;
    
    for (const [official, aliases] of Object.entries(COMPANY_ALIASES)) {
        const allNames = [official, ...aliases];
        
        for (const name of allNames) {
            const normalizedName = name.toLowerCase().replace(/[.,;:!?()-\s]/g, '');
            const similarity = calculateSimilarity(cleaned, normalizedName);
            
            if (similarity > 0.8 && similarity > bestScore) {
                bestMatch = official;
                bestScore = similarity;
            }
        }
    }
    
    // Αν βρέθηκε fuzzy match, επέστρεψε το
    if (bestMatch !== originalInput) {
        return bestMatch;
    }
    
    // 3. Cross-matching με ήδη καταχωρημένες άγνωστες εταιρείες
    const existingMatch = findSimilarUnknownCompany(originalInput);
    if (existingMatch) {
        updateDynamicPatterns(originalInput, existingMatch);
        return existingMatch;
    }
    
    // 4. Dynamic Pattern Recognition για άγνωστες εταιρείες
    const normalizedUnknown = normalizeUnknownCompany(originalInput);
    
    // 5. Dynamic Learning - Συσχέτιση παρόμοιων inputs
    updateDynamicPatterns(originalInput, normalizedUnknown);
    
    return normalizedUnknown;
}

/**
 * Βρίσκει παρόμοιες άγνωστες εταιρείες που ήδη καταχωρήθηκαν
 * @param {string} input 
 * @returns {string|null}
 */
function findSimilarUnknownCompany(input) {
    const cleanInput = input.toLowerCase().replace(/[^\w\s]/g, '').trim();
    
    // Έλεγχος με τις ήδη καταχωρημένες άγνωστες εταιρείες
    for (const [normalizedCompany, aliases] of Object.entries(dynamicCompanyPatterns)) {
        const cleanNormalized = normalizedCompany.toLowerCase().replace(/[^\w\s]/g, '').trim();
        
        // Direct similarity με το κύριο όνομα
        const similarity = calculateSimilarity(cleanInput, cleanNormalized);
        if (similarity > 0.85) { // Πιο strict για άγνωστες εταιρείες
            console.log(`🎯 Found similar unknown company: "${input}" → "${normalizedCompany}" (${Math.round(similarity * 100)}% match)`);
            return normalizedCompany;
        }
        
        // Έλεγχος και με τα aliases
        for (const alias of aliases) {
            const aliasSimilarity = calculateSimilarity(cleanInput, alias);
            if (aliasSimilarity > 0.85) {
                console.log(`🎯 Found similar alias: "${input}" → "${normalizedCompany}" (via "${alias}", ${Math.round(aliasSimilarity * 100)}% match)`);
                return normalizedCompany;
            }
        }
        
        // Special handling για common typos
        if (isCommonTypo(cleanInput, cleanNormalized)) {
            console.log(`🔧 Common typo detected: "${input}" → "${normalizedCompany}"`);
            return normalizedCompany;
        }
    }
    
    return null;
}

/**
 * Ελέγχει για common typos patterns
 * @param {string} input 
 * @param {string} target 
 * @returns {boolean}
 */
function isCommonTypo(input, target) {
    // Missing first letter: "fizer" vs "pfizer"
    if (input.length + 1 === target.length && target.slice(1) === input) {
        return true;
    }
    
    // Extra letter at start: "pfizer" vs "fizer" (reverse)
    if (input.length === target.length + 1 && input.slice(1) === target) {
        return true;
    }
    
    // Single letter substitution in small words
    if (Math.abs(input.length - target.length) <= 1 && input.length >= 4) {
        let differences = 0;
        const maxLen = Math.max(input.length, target.length);
        
        for (let i = 0; i < maxLen; i++) {
            if (input[i] !== target[i]) {
                differences++;
                if (differences > 2) return false; // Πάρα πολλές διαφορές
            }
        }
        
        return differences <= 2; // Μέχρι 2 διαφορές για typo
    }
    
    return false;
}

/**
 * Smart normalization για άγνωστες εταιρείες
 * @param {string} input 
 * @returns {string}
 */
function normalizeUnknownCompany(input) {
    let normalized = input.trim();
    
    // Common patterns for Greek companies
    const greekPatterns = [
        { pattern: /\b(α\.?ε\.?|αε)\b/gi, replacement: 'Α.Ε.' },
        { pattern: /\b(ο\.?ε\.?|οε)\b/gi, replacement: 'Ο.Ε.' },
        { pattern: /\b(επε|ε\.?π\.?ε\.?)\b/gi, replacement: 'Ε.Π.Ε.' },
        { pattern: /\b(αβεε|α\.?β\.?ε\.?ε\.?)\b/gi, replacement: 'Α.Β.Ε.Ε.' },
        { pattern: /\b(ι\.?κ\.?ε\.?|ικε)\b/gi, replacement: 'Ι.Κ.Ε.' }
    ];
    
    // Common patterns for International companies  
    const intlPatterns = [
        { pattern: /\b(ltd|ltd\.?)\b/gi, replacement: 'Ltd.' },
        { pattern: /\b(inc|inc\.?)\b/gi, replacement: 'Inc.' },
        { pattern: /\b(corp|corp\.?)\b/gi, replacement: 'Corp.' },
        { pattern: /\b(llc|l\.?l\.?c\.?)\b/gi, replacement: 'LLC' },
        { pattern: /\b(s\.?a\.?|sa)\b/gi, replacement: 'S.A.' },
        { pattern: /\b(gmbh|g\.?m\.?b\.?h\.?)\b/gi, replacement: 'GmbH' }
    ];
    
    // Εφαρμογή patterns
    [...greekPatterns, ...intlPatterns].forEach(({ pattern, replacement }) => {
        normalized = normalized.replace(pattern, replacement);
    });
    
    // Capitalize first letter of each word
    normalized = normalized.replace(/\b\w/g, l => l.toUpperCase());
    
    // Καθαρισμός επιπλέον κενών
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    return normalized;
}

/**
 * Dynamic learning - συσχετίζει παρόμοια inputs
 * @param {string} original 
 * @param {string} normalized 
 */
function updateDynamicPatterns(original, normalized) {
    const cleanOriginal = original.toLowerCase().replace(/[^\w\s]/g, '').trim();
    
    // Αν υπάρχει ήδη pattern για αυτή την εταιρεία
    if (dynamicCompanyPatterns[normalized]) {
        // Προσθήκη του νέου alias αν δεν υπάρχει
        if (!dynamicCompanyPatterns[normalized].includes(cleanOriginal)) {
            dynamicCompanyPatterns[normalized].push(cleanOriginal);
            console.log(`🧠 Dynamic learning: Added "${original}" as alias for "${normalized}"`);
        }
    } else {
        // Νέα εταιρεία
        dynamicCompanyPatterns[normalized] = [cleanOriginal];
        console.log(`🏢 New company registered: "${normalized}" (from "${original}")`);
    }
}

/**
 * Web lookup για company validation με OpenCorporates API
 * @param {string} companyName 
 * @returns {Promise<{official: string, suggestions: string[], confidence: number}>}
 */
async function webLookupCompany(companyName) {
    if (!companyName || companyName.length < 3) {
        return { official: companyName, suggestions: [], confidence: 0 };
    }
    
    try {
        console.log(`🌐 Web lookup for: "${companyName}"`);
        
        // Multiple API sources (reliable free APIs only)
        const results = await Promise.allSettled([
            lookupWikipediaCompanies(companyName),
            lookupFortuneGlobal500(companyName)
        ]);
        
        const validResults = results
            .filter(result => result.status === 'fulfilled' && result.value)
            .map(result => result.value);
        
        if (validResults.length === 0) {
            return { official: companyName, suggestions: [], confidence: 0 };
        }
        
        // Επιλογή καλύτερου αποτελέσματος
        const bestResult = validResults.reduce((best, current) => 
            current.confidence > best.confidence ? current : best
        );
        
        console.log(`✅ Web lookup result: "${companyName}" → "${bestResult.official}" (${Math.round(bestResult.confidence * 100)}% confidence, source: ${bestResult.source})`);
        return bestResult;
        
    } catch (error) {
        console.error(`❌ Web lookup failed for "${companyName}":`, error.message);
        return { official: companyName, suggestions: [], confidence: 0 };
    }
}

// OpenCorporates API removed - requires API key and has usage limits
// System now relies on Wikipedia (free) + Fortune 500 (static) for web lookup

/**
 * Wikipedia companies lookup (primary web source)
 * @param {string} companyName 
 */
async function lookupWikipediaCompanies(companyName) {
    try {
        const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(companyName)}`;
        
        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'TimeCast-Conference-System/1.0'
            },
            timeout: 2000
        });
        
        if (!response.ok) return null;
        
        const data = await response.json();
        
        // Έλεγχος αν είναι company page (πιο επιθετικό matching)
        const extract = data.extract?.toLowerCase() || '';
        const title = data.title?.toLowerCase() || '';
        
        if (extract.includes('company') || extract.includes('corporation') || 
            extract.includes('inc.') || extract.includes('ltd.') ||
            extract.includes('multinational') || extract.includes('manufacturer') ||
            extract.includes('electronics') || extract.includes('technology') ||
            title.includes('company') || title.includes('corp')) {
            
            // Υπολογισμός confidence βάσει similarity με το input
            const similarity = calculateSimilarity(
                companyName.toLowerCase(),
                data.title.toLowerCase()
            );
            
            return {
                official: data.title,
                suggestions: [],
                confidence: Math.max(0.7, similarity), // Τουλάχιστον 0.7 για Wikipedia matches
                source: 'Wikipedia'
            };
        }
        
        return null;
        
    } catch (error) {
        return null;
    }
}

// BusinessPortal.gr functions removed - API endpoints not accessible
// The site (ΓΕΜΗ - Γενικό Εμπορικό Μητρώο) exists but requires 
// interactive browser session with autocomplete, not REST API access

/**
 * Fortune Global 500 companies lookup (static list για top companies)
 * @param {string} companyName 
 */
async function lookupFortuneGlobal500(companyName) {
    const fortune500 = [
        // Original Fortune 500 companies
        'Walmart', 'Amazon', 'Apple', 'CVS Health', 'UnitedHealth Group',
        'Exxon Mobil', 'Berkshire Hathaway', 'Alphabet', 'McKesson', 'AmerisourceBergen',
        'Microsoft', 'Costco', 'Cigna', 'AT&T', 'Cardinal Health',
        'Chevron', 'Ford Motor', 'General Motors', 'Walgreens Boots Alliance', 'JPMorgan Chase',
        'Verizon', 'General Electric', 'Phillips 66', 'Valero Energy', 'Marathon Petroleum',
        'Bank of America', 'Home Depot', 'IBM', 'Boeing', 'Wells Fargo',
        'Pfizer', 'Johnson & Johnson', 'Coca-Cola', 'PepsiCo', 'Intel',
        'Oracle', 'Cisco Systems', 'Merck', 'Abbott Laboratories', 'Bristol-Myers Squibb',
        
        // Automobile companies
        'Toyota', 'Volkswagen', 'Mercedes-Benz', 'BMW', 'Honda', 'Nissan', 'Hyundai',
        'Ford', 'Chrysler', 'Ferrari', 'Porsche', 'Audi', 'Lexus', 'Mazda',
        
        // Technology & Electronics 
        'Samsung', 'Sony', 'LG Electronics', 'Panasonic', 'Toshiba', 'Philips',
        'Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'Huawei', 'Xiaomi',
        'NVIDIA', 'AMD', 'Qualcomm', 'Broadcom', 'Taiwan Semiconductor',
        
        // Consumer goods & Industrial
        'Nestle', 'Unilever', 'Procter & Gamble', 'Siemens', 'Shell', 'BP',
        'GE', 'Caterpillar', 'John Deere', '3M', 'Honeywell', 'DuPont',
        
        // Telecommunications & Media
        'Vodafone', 'T-Mobile', 'Sprint', 'Disney', 'Netflix', 'Comcast',
        
        // Financial & Consulting
        'Goldman Sachs', 'Morgan Stanley', 'American Express', 'Visa', 'Mastercard',
        'McKinsey', 'BCG', 'Bain', 'Deloitte', 'PwC', 'EY', 'KPMG'
    ];
    
    const cleanInput = companyName.toLowerCase().replace(/[^\w\s]/g, '').trim();
    
    for (const company of fortune500) {
        const cleanCompany = company.toLowerCase().replace(/[^\w\s]/g, '').trim();
        const similarity = calculateSimilarity(cleanInput, cleanCompany);
        
        if (similarity > 0.6) { // Χαμηλώνω από 0.8 → 0.6 για καλύτερο matching
            return {
                official: company,
                suggestions: [],
                confidence: similarity,
                source: 'Fortune500'
            };
        }
    }
    
    return null;
}

/**
 * Υπολογισμός similarity score (Levenshtein distance)
 * @param {string} str1 
 * @param {string} str2 
 * @returns {number} - Score από 0 έως 1
 */
function calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
}

/**
 * Levenshtein Distance algorithm
 * @param {string} str1 
 * @param {string} str2 
 * @returns {number}
 */
function levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }
    
    return matrix[str2.length][str1.length];
}

// Persistent storage για ερωτήσεις με JSON αρχεία
const fs = require('fs');
const path = require('path');

let questions = [];
let questionCounter = 1;

// Documents folder storage - cross-platform compatible
const documentsDir = path.join(os.homedir(), 'Documents', 'TimeCast Pro');
const questionsPath = path.join(documentsDir, 'Questions.json');

// Custom path storage - remembers last loaded file location
let customQuestionsPath = null;

// Ensure Documents/TimeCast Pro directory exists
function ensureDocumentsDir() {
    try {
        if (!fs.existsSync(documentsDir)) {
            fs.mkdirSync(documentsDir, { recursive: true });
            console.log(`📁 Created TimeCast Pro directory in Documents`);
        }
        return true;
    } catch (error) {
        console.error(`❌ Failed to create Documents directory:`, error);
        return false;
    }
}

/**
 * Δημιουργεί όνομα αρχείου με format: Questions_DD-MM-YYYY_HH-MM.json
 * @returns {string} - Όνομα αρχείου
 */
function getQuestionFileName() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    return `Questions_${day}-${month}-${year}_${hours}-${minutes}.json`;
}

/**
 * Αποθηκεύει τις ερωτήσεις στο Documents JSON αρχείο
 * Επαναγράφει το αρχείο κάθε φορά με όλες τις ερωτήσεις
 */
function saveQuestionsToDocuments() {
    try {
        // Χρήση custom path αν υπάρχει, αλλιώς Documents folder
        const targetPath = customQuestionsPath || questionsPath;
        
        // Αν χρησιμοποιούμε Documents path, βεβαιωνόμαστε ότι υπάρχει ο φάκελος
        if (!customQuestionsPath && !ensureDocumentsDir()) {
            return null;
        }
        
        const data = {
            timestamp: new Date().toISOString(),
            totalQuestions: questions.length,
            questionCounter: questionCounter,
            questions: questions
        };
        
        fs.writeFileSync(targetPath, JSON.stringify(data, null, 2));
        
        if (customQuestionsPath) {
            console.log(`💾 Questions saved to custom location: ${questions.length} questions → ${customQuestionsPath}`);
        } else {
            console.log(`💾 Questions saved to Documents: ${questions.length} questions`);
        }
        
        return targetPath;
    } catch (error) {
        console.error('❌ Error saving questions:', error.message);
        return null;
    }
}

/**
 * Φορτώνει ερωτήσεις από το Documents JSON αρχείο (στην εκκίνηση)
 */
function loadQuestionsFromDocuments() {
    try {
        if (fs.existsSync(questionsPath)) {
            const fileContent = fs.readFileSync(questionsPath, 'utf8');
            const data = JSON.parse(fileContent);
            
            if (data.questions && Array.isArray(data.questions)) {
                questions = data.questions;
                questionCounter = data.questionCounter || questions.length + 1;
                console.log(`📖 Loaded ${questions.length} questions from Documents`);
                return true;
            }
        }
        console.log('📖 No existing questions file found in Documents');
        return false;
    } catch (error) {
        console.error('❌ Error loading questions from Documents:', error.message);
        return false;
    }
}


// Auto-load στο startup από Documents
loadQuestionsFromDocuments();

/**
 * Αφαιρεί τόνους και κάνει lowercase για flexible matching
 * @param {string} text - Κείμενο προς επεξεργασία
 * @returns {string} - Κείμενο χωρίς τόνους και lowercase
 */
function normalizeText(text) {
    return text
        .toLowerCase()
        .replace(/ά/g, 'α')
        .replace(/έ/g, 'ε')
        .replace(/ή/g, 'η')
        .replace(/ί/g, 'ι')
        .replace(/ό/g, 'ο')
        .replace(/ύ/g, 'υ')
        .replace(/ώ/g, 'ω')
        .replace(/ΐ/g, 'ι')
        .replace(/ΰ/g, 'υ');
}

/**
 * Εξαγωγή ομιλητών από timeline events
 * @param {Array} eventMarkers - Array με events από το timeline
 * @returns {Array} - Λίστα με ομιλητές
 */
function extractSpeakersFromTimeline(eventMarkers = []) {
    const speakers = new Set();
    
    // Keywords που δείχνουν ομιλία (normalized - χωρίς τόνους)
    const speakerKeywords = [
        'ομιλια', 'παρουσιαση', 'διαλεξη', 'workshop', 
        'presentation', 'speech', 'talk', 'keynote'
    ];
    
    eventMarkers.forEach(event => {
    if (!event.title) return;
    
    console.log(`🔍 Processing marker: "${event.title}"`); // DEBUG
    
    const normalizedTitle = normalizeText(event.title);
    
    // Έλεγχος αν περιέχει keyword ομιλίας (normalized matching)
    const hasSpeakerKeyword = speakerKeywords.some(keyword => 
        normalizedTitle.includes(keyword)
    );
    
    console.log(`   Has speaker keyword: ${hasSpeakerKeyword}`); // DEBUG
        
        if (hasSpeakerKeyword) {
            // Pattern matching για εξαγωγή ονόματος
            // Μορφές: "Ομιλία: Πάνος Τερζής - Θέμα" ή "Παρουσίαση Μαρία Κων/νου"
            
            // Patterns που δουλεύουν με flexible matching (με ή χωρίς τόνους, κεφαλαία/μικρά)
            const patterns = [
    // "Ομιλία: Όνομα, Τίτλος - Θέμα" - κρατάει όλο το κείμενο μετά το separator
    /(?:ομιλ[ίι][άα]|παρουσ[ίι][άα]ση|δι[άα]λεξη|workshop|presentation|speech|talk|keynote)\s*[:,-./]\s*([Α-Ωα-ωΆ-ώA-Za-z\s,.-]+?)(?:\s*$)/i,
    // "Ομιλία Όνομα Επώνυμο, Τίτλος" - παίρνει όλο το κείμενο μέχρι το τέλος
    /(?:ομιλ[ίι][άα]|παρουσ[ίι][άα]ση|δι[άα]λεξη|workshop|presentation|speech|talk|keynote)\s+([Α-Ωα-ωΆ-ώA-Za-z\s,.-]+?)(?:\s*$)/i,
    // "Παρουσίαση από Όνομα, Τίτλος"
    /(?:ομιλ[ίι][άα]|παρουσ[ίι][άα]ση|δι[άα]λεξη|workshop|presentation|speech|talk|keynote)\s+(?:[άα]π[όο]\s+)?([Α-Ωα-ωΆ-ώA-Za-z\s,.-]+?)(?:\s*$)/i
];
            
            for (const pattern of patterns) {
                // Κάνουμε match στο original title για να κρατήσουμε τους τόνους στο όνομα
                const match = event.title.match(pattern);
                if (match) {
                    const speakerName = match[1].trim();
                    
                    // Φιλτράρισμα κενών και μη-ονομάτων
                    if (speakerName.length > 2 && 
                        !speakerName.toLowerCase().includes('διάλειμμα') &&
                        !speakerName.toLowerCase().includes('break') &&
                        !speakerName.toLowerCase().includes('coffee')) {
                        speakers.add(speakerName);
                        console.log(`📝 Detected speaker: "${speakerName}" from "${event.title}"`);
                    }
                    break;
                }
            }
        }
    });
    
    // Μετατροπή σε array και ταξινόμηση
    const speakerList = Array.from(speakers).sort();
    console.log(`🎤 Total speakers detected: ${speakerList.length}`, speakerList);
    // Αν δεν βρέθηκαν ομιλητές, χρήση fallback
if (speakerList.length === 0) {
    speakerList.push(
        'Γιάννης Παπαδόπουλος',
        'Μαρία Κωνσταντίνου', 
        'Νίκος Αλεξίου'
    );
    console.log('📝 Using fallback speakers');
}
    return speakerList;
 
    
}

/**
 * Λήψη device info από user agent και IP
 * @param {Object} req - Express request object
 * @returns {Object} - Device information
 */
function getDeviceInfo(req) {
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 
               (req.headers['x-forwarded-for'] || '').split(',').pop().trim() || 'unknown';
    
    // Ανάλυση συσκευής από User Agent
    let deviceType = 'Unknown';
    let deviceName = 'Unknown Device';
    
    if (/Mobile|Android|iPhone|iPad|iPod|Windows Phone/i.test(userAgent)) {
        deviceType = 'Mobile';
        
        if (/iPhone/i.test(userAgent)) {
            deviceName = 'iPhone';
        } else if (/iPad/i.test(userAgent)) {
            deviceName = 'iPad';
        } else if (/Android/i.test(userAgent)) {
            deviceName = 'Android Device';
        } else if (/Windows Phone/i.test(userAgent)) {
            deviceName = 'Windows Phone';
        } else {
            deviceName = 'Mobile Device';
        }
    } else if (/Tablet/i.test(userAgent)) {
        deviceType = 'Tablet';
        deviceName = 'Tablet';
    } else {
        deviceType = 'Desktop';
        
        if (/Windows/i.test(userAgent)) {
            const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || 'Unknown';
            const cleanIP = clientIP.replace('::ffff:', '');
            deviceName = cleanIP !== 'Unknown' ? `PC ${cleanIP}` : 'Windows PC';
        } else if (/Mac/i.test(userAgent)) {
            deviceName = 'Mac';
        } else if (/Linux/i.test(userAgent)) {
            deviceName = 'Linux PC';
        } else {
            deviceName = 'Desktop Computer';
        }
    }
    
    return {
        ip: ip,
        type: deviceType,
        name: deviceName,
        userAgent: userAgent,
        timestamp: new Date().toISOString()
    };
}

/**
 * Δημιουργία νέας ερώτησης
 * @param {Object} questionData - Δεδομένα ερώτησης
 * @param {Object} req - Express request για device info
 * @returns {Object} - Η νέα ερώτηση
 */
async function createQuestion(questionData, req) {
    const deviceInfo = getDeviceInfo(req);
    
    // Smart company name normalization με web lookup
    const originalCompany = questionData.company || '';
    let normalizedCompany = normalizeCompanyName(originalCompany);
    
    // Αν δεν βρέθηκε στη local database, δοκίμασε web lookup
    if (originalCompany && normalizedCompany === originalCompany && originalCompany.length >= 3) {
        try {
            console.log(`🔍 Starting web lookup for: "${originalCompany}"`);
            const webResult = await webLookupCompany(originalCompany);
            console.log(`📊 Web result: ${JSON.stringify(webResult)}`);
            
            if (webResult.confidence > 0.6) { // Χαμηλώνω από 0.7 → 0.6
                normalizedCompany = webResult.official;
                console.log(`🌐 Web lookup success: "${originalCompany}" → "${normalizedCompany}" (${webResult.source}, ${Math.round(webResult.confidence * 100)}%)`);
                
                // Προσθήκη στη dynamic database για μελλοντική χρήση
                updateDynamicPatterns(originalCompany, normalizedCompany);
            } else {
                console.log(`📉 Web lookup confidence too low: ${Math.round(webResult.confidence * 100)}% < 60%`);
            }
        } catch (error) {
            console.log(`⚠️ Web lookup failed for "${originalCompany}": ${error.message}`);
        }
    }
    
    if (originalCompany && normalizedCompany !== originalCompany) {
        console.log(`🏢 Company normalized: "${originalCompany}" → "${normalizedCompany}"`);
    }
    
    const question = {
        id: `q_${Date.now()}_${questionCounter++}`,
        timestamp: new Date().toISOString(),
        
        // Στοιχεία υποβάλλοντος
        submitter: {
            name: questionData.name || '',
            company: normalizedCompany,
            originalCompany: originalCompany, // Κρατάμε και το original
            department: questionData.department || '',
            email: questionData.email || '',
            device: deviceInfo
        },
        
        // Στοιχεία ερώτησης
        question: {
            targetSpeaker: questionData.targetSpeaker || '',
            subject: questionData.subject || '',
            text: questionData.question || ''
        },
        
        // Κατάσταση και metadata
        status: 'pending', // pending, approved, addressed, rejected
        priority: 'normal', // high, normal, low
        votes: 0,
        adminNotes: '',
        wasApproved: false, // Έχει εγκριθεί κάποτε (παραμένει true ακόμα κι αν γίνει addressed)
        rejectionReason: '', // Λόγος απόρριψης (μόνο αν status = 'rejected')
        
        // Display tracking
        isCurrentlyDisplayed: false,
        displayHistory: [],
        
        // Timestamps
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    questions.push(question);
    console.log(`📝 New question created: ${question.id} by ${question.submitter.name} (${deviceInfo.name}/${deviceInfo.ip})`);
    
    // Auto-save to Documents
    saveQuestionsToDocuments();
    
    return question;
}

/**
 * Λήψη όλων των ερωτήσεων
 * @param {Object} filters - Φίλτρα (status, speaker, priority)
 * @returns {Array} - Φιλτραρισμένες ερωτήσεις
 */
function getQuestions(filters = {}) {
    let filteredQuestions = [...questions];
    
    if (filters.status && filters.status !== 'all') {
        filteredQuestions = filteredQuestions.filter(q => q.status === filters.status);
    }
    
    if (filters.speaker && filters.speaker !== 'all') {
        filteredQuestions = filteredQuestions.filter(q => 
            q.question.targetSpeaker === filters.speaker
        );
    }
    
    if (filters.priority && filters.priority !== 'all') {
        filteredQuestions = filteredQuestions.filter(q => q.priority === filters.priority);
    }
    
    // Ταξινόμηση: Πρώτα οι προβαλλόμενες, μετά κατά priority, μετά κατά χρόνο
    // Ταξινόμηση: Κατά priority, μετά κατά χρόνο (χωρίς προτεραιότητα στις προβαλλόμενες)
return filteredQuestions.sort((a, b) => {
    const priorityOrder = { high: 3, normal: 2, low: 1 };
    const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    
    return new Date(b.timestamp) - new Date(a.timestamp);
});
}

/**
 * Ενημέρωση κατάστασης ερώτησης
 * @param {string} questionId - ID ερώτησης
 * @param {Object} updates - Αλλαγές
 * @returns {Object|null} - Ενημερωμένη ερώτηση ή null
 */
function updateQuestion(questionId, updates) {
    const questionIndex = questions.findIndex(q => q.id === questionId);
    if (questionIndex === -1) return null;
    
    const question = questions[questionIndex];
    
    // ΠΡΟΣΘΗΚΗ: Χειρισμός nested object updates
    Object.keys(updates).forEach(key => {
        if (key.includes('.')) {
            // Nested property (π.χ. 'question.targetSpeaker', 'submitter.company')
            const [parent, child] = key.split('.');
            console.log(`📝 Updating nested: ${parent}.${child} = "${updates[key]}"`);
            
            if (question[parent]) {
                const oldValue = question[parent][child];
                question[parent][child] = updates[key];
                console.log(`   ✅ Updated: "${oldValue}" → "${question[parent][child]}"`);
            } else {
                console.log(`   ❌ Parent object "${parent}" not found in question`);
                console.log(`   🔍 Available parents:`, Object.keys(question));
            }
        } else {
            // Regular property
            question[key] = updates[key];
        }
    });
    
    // Αν το status γίνεται 'approved', θέτουμε wasApproved = true
    if (updates.status === 'approved') {
        question.wasApproved = true;
    }
    
    question.updatedAt = new Date().toISOString();
    
    console.log(`📝 Question ${questionId} updated:`, updates);
    
    // Auto-save to Documents
    saveQuestionsToDocuments();
    
    return question;
}
/**
 * Διαγραφή ερώτησης
 * @param {string} questionId - ID ερώτησης
 * @returns {boolean} - Success
 */
function deleteQuestion(questionId) {
    const questionIndex = questions.findIndex(q => q.id === questionId);
    if (questionIndex === -1) return false;
    
    const deletedQuestion = questions.splice(questionIndex, 1)[0];
    console.log(`🗑️ Question deleted: ${questionId} by ${deletedQuestion.submitter.name}`);
    
    // Auto-save to Documents
    saveQuestionsToDocuments();
    
    return true;
}

/**
 * Στατιστικά ερωτήσεων
 * @returns {Object} - Στατιστικά
 */
function getQuestionStats() {
    const stats = {
        total: questions.length,
        pending: questions.filter(q => q.status === 'pending').length,
        approved: questions.filter(q => q.wasApproved === true).length, // Όλες που εγκρίθηκαν (ακόμα κι αν addressed)
        addressed: questions.filter(q => q.status === 'addressed').length,
        rejected: questions.filter(q => q.status === 'rejected').length,
        currentlyDisplayed: questions.filter(q => q.isCurrentlyDisplayed).length
    };
    
    // Device breakdown
    const devices = {};
    questions.forEach(q => {
        const deviceType = q.submitter.device.type;
        devices[deviceType] = (devices[deviceType] || 0) + 1;
    });
    stats.devices = devices;
    
    // Speaker breakdown
    const speakers = {};
    questions.forEach(q => {
        const speaker = q.question.targetSpeaker;
        speakers[speaker] = (speakers[speaker] || 0) + 1;
    });
    stats.speakers = speakers;
    
    return stats;
}

/**
 * Export για Excel/CSV
 * @returns {Array} - Δεδομένα για export
 */
function exportQuestionsData() {
    return questions.map(q => {
        // Split speaker name from title/position for better Excel layout
        const fullSpeaker = q.question.targetSpeaker || '';
        const separators = [',', '.', ';', '-', '|', '_'];
        let speakerName = fullSpeaker;
        let speakerTitle = '';
        
        for (const sep of separators) {
            if (fullSpeaker.includes(sep)) {
                const parts = fullSpeaker.split(sep);
                speakerName = parts[0].trim();
                speakerTitle = parts.slice(1).join(sep).trim();
                break;
            }
        }
        
        // Ενωμένη εταιρεία - δείχνει normalization αν υπάρχει
        const originalCompany = q.submitter.originalCompany || q.submitter.company;
        const normalizedCompany = q.submitter.company;
        let companyDisplay = normalizedCompany;
        
        // Αν διαφέρουν, δείξε και τις δύο
        if (originalCompany && normalizedCompany && originalCompany !== normalizedCompany) {
            companyDisplay = `${normalizedCompany} (από: ${originalCompany})`;
        }

        // Μετατροπή timestamps σε ελληνικό format
        function formatGreekDateTime(isoString) {
            if (!isoString) return '';
            
            const date = new Date(isoString);
            const day = String(date.getDate()).padStart(2, '0');
            const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 
                               'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            const month = monthNames[date.getMonth()];
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            
            return `${day}-${month}-${year} ${hours}:${minutes}`;
        }

        return {
            ID: q.id,
            'Ημερομηνία Υποβολής': formatGreekDateTime(q.timestamp),
            'Submitter Name (ΑΠΟ)': q.submitter.name,
            'Company (Εταιρεία)': companyDisplay,
            Department: q.submitter.department,
            Email: q.submitter.email,
            'Speaker Name (ΠΡΟΣ)': speakerName,
            'Speaker Title': speakerTitle,
            'Full Speaker (ΠΡΟΣ)': fullSpeaker,
            'Subject (Θέμα)': q.question.subject,
            'Question Text (Ερώτηση)': q.question.text,
            Status: q.status,
            Priority: q.priority,
            Votes: q.votes,
            'Admin Notes': q.adminNotes,
            'Rejection Reason': q.rejectionReason || '',
            'Display Count': q.displayHistory.filter(h => h.action === 'display_start').length,
            'Device IP': q.submitter.device.ip,
            'Device Name': q.submitter.device.name,
            'Device Type': q.submitter.device.type,
            'Δημιουργήθηκε': formatGreekDateTime(q.createdAt),
            'Ενημερώθηκε': formatGreekDateTime(q.updatedAt)
        };
    });
}

/**
 * Setup Express routes για questions API
 * @param {Object} app - Express app instance
 * @param {Object} io - Socket.IO instance
 * @param {Array} eventMarkers - Reference to eventMarkers array
 */
function setupRoutes(app, io, eventMarkers, timerFunctions = {}) {
    const express = require('express');
    
    // API endpoint για λήψη ομιλητών από timeline
    app.get('/api/questions/speakers', (req, res) => {
        try {
            const speakers = extractSpeakersFromTimeline(eventMarkers);
            res.json({ 
                success: true,
                speakers: speakers,
                count: speakers.length
            });
        } catch (error) {
            console.error('Error getting speakers:', error);
            res.status(500).json({ 
                success: false,
                error: 'Failed to get speakers'
            });
        }
    });

    // API endpoint για υποβολή νέας ερώτησης
    app.post('/api/questions/submit', express.json(), async (req, res) => {
        try {
            const questionData = req.body;
            const newQuestion = await createQuestion(questionData, req);
            
            // Real-time ενημέρωση για νέα ερώτηση
            io.emit('newQuestionSubmitted', {
                question: newQuestion,
                stats: getQuestionStats()
            });
            
            res.json({ 
                success: true,
                questionId: newQuestion.id,
                message: 'Question submitted successfully'
            });
        } catch (error) {
            console.error('Error submitting question:', error);
            res.status(500).json({ 
                success: false,
                error: 'Failed to submit question'
            });
        }
    });

    // API endpoint για λήψη λίστας ερωτήσεων
    app.get('/api/questions/list', (req, res) => {
        try {
            const allQuestions = getQuestions();
            const stats = getQuestionStats();
            
            res.json({ 
                success: true,
                questions: allQuestions,
                stats: stats
            });
        } catch (error) {
            console.error('Error getting questions:', error);
            res.status(500).json({ 
                success: false,
                error: 'Failed to get questions'
            });
        }
    });

    // API endpoint για ενημέρωση κατάστασης ερώτησης
    app.put('/api/questions/:id/status', express.json(), (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;
            
            const updatedQuestion = updateQuestion(id, { status });
            
            if (!updatedQuestion) {
                return res.status(404).json({ 
                    success: false,
                    error: 'Question not found'
                });
            }
            
            // Real-time ενημέρωση
            io.emit('questionStatusUpdate', {
                question: updatedQuestion,
                stats: getQuestionStats()
            });
            
            res.json({ 
                success: true,
                question: updatedQuestion
            });
        } catch (error) {
            console.error('Error updating question status:', error);
            res.status(500).json({ 
                success: false,
                error: 'Failed to update question status'
            });
        }
    });

    // API endpoint για απόρριψη ερώτησης με λόγο
    app.put('/api/questions/:id/reject', express.json(), (req, res) => {
        try {
            const { id } = req.params;
            const { rejectionReason } = req.body;
            
            const updatedQuestion = updateQuestion(id, { 
                status: 'rejected',
                rejectionReason: rejectionReason || 'Δεν δόθηκε λόγος'
            });
            
            if (!updatedQuestion) {
                return res.status(404).json({ 
                    success: false,
                    error: 'Question not found'
                });
            }
            
            // Real-time ενημέρωση
            io.emit('questionStatusUpdate', {
                question: updatedQuestion,
                stats: getQuestionStats()
            });
            
            res.json({ 
                success: true,
                question: updatedQuestion
            });
        } catch (error) {
            console.error('Error rejecting question:', error);
            res.status(500).json({ 
                success: false,
                error: 'Failed to reject question'
            });
        }
    });

    // API endpoint για επεξεργασία ερώτησης
    app.put('/api/questions/:id/edit', express.json(), (req, res) => {
        try {
            const { id } = req.params;
            const { company, targetSpeaker, subject, text } = req.body;
            
            console.log(`🔧 Edit request for question ${id}:`, req.body);
            
            const updates = {};
            
            // Update company (submitter info)
            if (company !== undefined) {
                updates['submitter.company'] = company;
                console.log(`   📝 Company update: "${company}"`);
            }
            
            // Update question fields
            if (targetSpeaker !== undefined) {
                updates['question.targetSpeaker'] = targetSpeaker;
            }
            if (subject !== undefined) {
                updates['question.subject'] = subject;
            }
            if (text !== undefined) {
                updates['question.text'] = text;
            }
            
            console.log(`   📋 All updates:`, updates);
            
            const updatedQuestion = updateQuestion(id, updates);
            
            if (updatedQuestion) {
                console.log(`   ✅ Updated company field: "${updatedQuestion.submitter.company}"`);
            }
            
            if (!updatedQuestion) {
                return res.status(404).json({ 
                    success: false,
                    error: 'Question not found'
                });
            }
            
            // Real-time ενημέρωση
            io.emit('questionUpdated', {
                question: updatedQuestion,
                stats: getQuestionStats()
            });
            
            console.log(`✏️ Question ${id} edited by admin`);
            
            res.json({ 
                success: true,
                question: updatedQuestion
            });
        } catch (error) {
            console.error('Error editing question:', error);
            res.status(500).json({ 
                success: false,
                error: 'Failed to edit question'
            });
        }
    });

    // API endpoint για διαγραφή όλων των ερωτήσεων (πρέπει να είναι πριν το :id route)
    app.delete('/api/questions/delete-all', (req, res) => {
        try {
            const questionCount = questions.length;
            console.log(`🗑️ DELETE ALL: Deleting ${questionCount} questions...`);
            
            // Καθαρισμός όλων των ερωτήσεων
            questions = []; 
            questionCounter = 1; 
            saveQuestionsToDocuments(); // Save empty state
            
            // Broadcast deletion to all clients
            io.emit('allQuestionsDeleted', { 
                deletedCount: questionCount,
                timestamp: new Date().toISOString()
            });
            
            console.log(`✅ All ${questionCount} questions deleted successfully`);
            
            res.json({ 
                success: true,
                message: `Διαγράφηκαν επιτυχώς όλες οι ερωτήσεις (${questionCount})`,
                deletedCount: questionCount
            });
            
        } catch (error) {
            console.error('❌ Error deleting all questions:', error);
            res.status(500).json({ 
                success: false,
                error: 'Internal server error'
            });
        }
    });

    // API endpoint για διαγραφή ερώτησης
    app.delete('/api/questions/:id', (req, res) => {
        try {
            const questionId = req.params.id;
            const success = deleteQuestion(questionId);
            
            if (success) {
                // Broadcast deletion to all clients
                io.emit('questionDeleted', { questionId });
                
                res.json({ 
                    success: true,
                    message: 'Question deleted successfully',
                    questionId
                });
            } else {
                res.status(404).json({ 
                    success: false,
                    error: 'Question not found'
                });
            }
        } catch (error) {
            console.error('❌ Error deleting question:', error);
            res.status(500).json({ 
                success: false,
                error: 'Failed to delete question'
            });
        }
    });

    // API endpoint για φόρτωση backup ερωτήσεων από Documents
    app.post('/api/questions/load-backup', (req, res) => {
        try {
            const backupLoaded = loadQuestionsFromDocuments();
            const currentCount = questions.length;
            
            if (backupLoaded && currentCount > 0) {
                // Broadcast updated questions to all clients
                io.emit('questionsUpdated', { 
                    questions: questions,
                    message: `Φορτώθηκαν ${currentCount} ερωτήσεις από backup` 
                });
                
                res.json({
                    success: true,
                    questionsLoaded: currentCount,
                    message: `Επιτυχής φόρτωση ${currentCount} ερωτήσεων από Documents/TimeCast Pro/Questions.json`
                });
            } else if (currentCount === 0) {
                res.json({
                    success: false,
                    questionsLoaded: 0,
                    message: 'Δεν βρέθηκαν αποθηκευμένες ερωτήσεις στο Documents/TimeCast Pro/'
                });
            } else {
                res.json({
                    success: true,
                    questionsLoaded: currentCount,
                    message: `Φορτώθηκαν ${currentCount} ερωτήσεις από backup`
                });
            }
        } catch (error) {
            console.error('❌ Error loading backup questions:', error);
            res.status(500).json({
                success: false,
                error: 'Σφάλμα κατά τη φόρτωση backup ερωτήσεων'
            });
        }
    });

    // API endpoint για φόρτωση ερωτήσεων από αρχείο (file picker)
    app.post('/api/questions/load-from-file', express.json(), (req, res) => {
        try {
            const { questions: questionsData, filename, filePath } = req.body;
            
            if (!Array.isArray(questionsData)) {
                return res.status(400).json({
                    success: false,
                    error: 'Μη έγκυρη δομή δεδομένων - αναμένεται array ερωτήσεων'
                });
            }
            
            // Καθαρισμός υπαρχουσών ερωτήσεων
            questions.length = 0;
            
            // Προσθήκη νέων ερωτήσεων
            questionsData.forEach(questionData => {
                questions.push(questionData);
            });
            
            // Ρύθμιση custom path για μελλοντικά auto-saves
            if (filePath && filePath.trim()) {
                const cleanPath = filePath.trim();
                // Έλεγχος αν είναι έγκυρο path
                if (cleanPath.length > 3 && (cleanPath.includes(':') || cleanPath.includes('/') || cleanPath.includes('\\'))) {
                    customQuestionsPath = cleanPath;
                    console.log(`📌 Set custom autosave path: ${customQuestionsPath}`);
                } else {
                    customQuestionsPath = null;
                    console.log(`📌 Invalid path provided: "${cleanPath}", using Documents folder`);
                }
            } else {
                // Fallback στο Documents αν δεν έχουμε path
                customQuestionsPath = null;
                console.log(`📌 Using Documents folder for autosave (no custom path)`);
            }
            
            // Αποθήκευση στην επιλεγμένη τοποθεσία
            const savedPath = saveQuestionsToDocuments();
            
            // Broadcast updated questions to all clients
            io.emit('questionsUpdated', { 
                questions: questions,
                message: `Φορτώθηκαν ${questionsData.length} ερωτήσεις από αρχείο` 
            });
            
            console.log(`📂 Loaded ${questionsData.length} questions from ${filename || 'file'}`);
            
            const locationMsg = customQuestionsPath 
                ? `Autosave: ${customQuestionsPath}` 
                : `Autosave: Documents/TimeCast Pro/`;
            
            res.json({
                success: true,
                questionsLoaded: questionsData.length,
                message: `Επιτυχής φόρτωση ${questionsData.length} ερωτήσεων από ${filename || 'αρχείο'}`,
                autosavePath: customQuestionsPath || questionsPath,
                locationMessage: locationMsg
            });
            
        } catch (error) {
            console.error('❌ Error loading questions from file:', error);
            res.status(500).json({
                success: false,
                error: 'Σφάλμα κατά τη φόρτωση ερωτήσεων από αρχείο'
            });
        }
    });

    // API endpoint για προβολή ερώτησης στο timer
    app.post('/api/questions/display', express.json(), (req, res) => {
        try {
            const { questionId } = req.body;
            
            // Βρες την ερώτηση
            const question = questions.find(q => q.id === questionId);
            
            if (!question) {
                return res.status(404).json({ 
                    success: false,
                    error: 'Question not found'
                });
            }
            
            // Ενημέρωση κατάστασης - μόνο αυτή εμφανίζεται
            questions.forEach(q => {
                q.isCurrentlyDisplayed = (q.id === questionId);
            });
            
            // Στείλε την ερώτηση στο timer για προβολή
            io.emit('displayQuestion', {
                question: question
            });
            
            console.log(`📺 Question ${questionId} sent to timer for display`);
            
            // 🎯 AUTO-TIMER LOGIC: Ξεκίνησε auto-timer αν είναι ενεργοποιημένο
            if (timerFunctions.startAutoTimer && timerFunctions.timerState) {
                // Διάβασε ΤΡΕΧΟΥΣΕΣ ρυθμίσεις από timerState (fresh values)
                const autoTimer = timerFunctions.timerState.autoTimer;
                
                console.log('🔍 Current auto-timer state:', autoTimer);
                
                if (autoTimer.enabled) {
                    console.log(`⏱️ Auto-timer enabled - starting ${autoTimer.minutes} minute timer for question`);
                    
                    const success = timerFunctions.startAutoTimer(autoTimer.minutes, 'question');
                    
                    if (success) {
                        console.log('✅ Auto-timer started successfully');
                        
                        // Ενημέρωση admin panel για auto-timer
                        io.emit('autoTimerTriggered', {
                            questionId: questionId,
                            minutes: autoTimer.minutes,
                            source: 'question',
                            timestamp: Date.now(),
                            message: `Auto-timer ξεκίνησε για ερώτηση (${autoTimer.minutes} λεπτά)`
                        });
                    } else {
                        console.log('⚠️ Auto-timer start rejected due to priority conflict');
                    }
                } else {
                    console.log('ℹ️ Auto-timer disabled - no timer started');
                }
            } else {
                console.log('⚠️ Auto-timer functions not available');
            }
            
            res.json({ 
                success: true,
                message: 'Question sent to timer'
            });
        } catch (error) {
            console.error('Error displaying question:', error);
            res.status(500).json({ 
                success: false,
                error: 'Failed to display question'
            });
        }
    });

    // API endpoint για απόκρυψη ερώτησης από timer
    app.post('/api/questions/hide', express.json(), (req, res) => {
        try {
            const { questionId } = req.body;
            
            // Ενημέρωση κατάστασης - καμία δεν εμφανίζεται
            questions.forEach(q => {
                q.isCurrentlyDisplayed = false;
            });
            
            // Στείλε εντολή απόκρυψης στο timer
            io.emit('hideQuestion', {
                questionId: questionId
            });
            
            console.log(`🙈 Question ${questionId} hidden from timer`);
            
            res.json({ 
                success: true,
                message: 'Question hidden from timer'
            });
        } catch (error) {
            console.error('Error hiding question:', error);
            res.status(500).json({ 
                success: false,
                error: 'Failed to hide question'
            });
        }
    });

    // API endpoint για company lookup suggestions (για autocomplete)
    app.get('/api/questions/company-lookup/:name', async (req, res) => {
        try {
            const companyName = req.params.name;
            
            if (!companyName || companyName.length < 2) {
                return res.json({
                    success: true,
                    suggestions: [],
                    official: companyName
                });
            }
            
            // Quick local lookup πρώτα
            const localResult = normalizeCompanyName(companyName);
            
            // Αν βρέθηκε στη local database, επίστρεψε το
            if (localResult !== companyName) {
                return res.json({
                    success: true,
                    official: localResult,
                    suggestions: [localResult],
                    source: 'local'
                });
            }
            
            // Web lookup για unknown companies
            const webResult = await webLookupCompany(companyName);
            
            res.json({
                success: true,
                official: webResult.official,
                suggestions: webResult.suggestions || [],
                confidence: webResult.confidence || 0,
                source: webResult.source || 'local'
            });
            
        } catch (error) {
            console.error('Company lookup error:', error);
            res.status(500).json({
                success: false,
                error: 'Company lookup failed'
            });
        }
    });

    // DEBUG endpoint για testing company normalization
    app.get('/api/questions/debug-company/:name', async (req, res) => {
        try {
            const companyName = req.params.name;
            console.log(`🧪 DEBUG: Testing company normalization for "${companyName}"`);
            
            const localResult = normalizeCompanyName(companyName);
            console.log(`📍 Local result: "${companyName}" → "${localResult}"`);
            
            let webResult = null;
            if (localResult === companyName && companyName.length >= 3) {
                webResult = await webLookupCompany(companyName);
                console.log(`🌐 Web result:`, webResult);
            }
            
            res.json({
                input: companyName,
                localResult: localResult,
                webResult: webResult,
                final: webResult?.confidence > 0.6 ? webResult.official : localResult
            });
            
        } catch (error) {
            console.error('Debug company error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // API endpoint για Excel/CSV export
    app.get('/api/questions/export', (req, res) => {
        try {
            const format = req.query.format || 'xlsx';
            const data = exportQuestionsData();
            
            if (data.length === 0) {
                return res.status(200).send('No questions available for export');
            }
            
            if (format === 'xlsx') {
                // Native Excel export με filters και formatting
                const XLSX = require('xlsx');
                
                // Δημιουργία workbook και worksheet
                const workbook = XLSX.utils.book_new();
                const worksheet = XLSX.utils.json_to_sheet(data);
                
                // Ορισμός column widths
                const columnWidths = [
                    { wch: 8 },   // ID
                    { wch: 20 },  // Ημερομηνία Υποβολής (ελληνικό format)
                    { wch: 20 },  // Submitter Name (ΑΠΟ)
                    { wch: 35 },  // Company (Εταιρεία) - μεγαλύτερο για "από: original"
                    { wch: 15 },  // Department
                    { wch: 25 },  // Email
                    { wch: 25 },  // Speaker Name (ΠΡΟΣ)
                    { wch: 20 },  // Speaker Title
                    { wch: 30 },  // Full Speaker (ΠΡΟΣ)
                    { wch: 30 },  // Subject (Θέμα)
                    { wch: 50 },  // Question Text (Ερώτηση)
                    { wch: 12 },  // Status
                    { wch: 10 },  // Priority
                    { wch: 8 },   // Votes
                    { wch: 25 },  // Admin Notes
                    { wch: 25 },  // Rejection Reason
                    { wch: 12 },  // Display Count
                    { wch: 15 },  // Device IP
                    { wch: 15 },  // Device Name
                    { wch: 12 },  // Device Type
                    { wch: 20 },  // Δημιουργήθηκε (ελληνικό format)
                    { wch: 20 }   // Ενημερώθηκε (ελληνικό format)
                ];
                worksheet['!cols'] = columnWidths;
                
                // Auto-filter για όλα τα headers (το κλειδί!)
                const range = XLSX.utils.decode_range(worksheet['!ref']);
                worksheet['!autofilter'] = { ref: worksheet['!ref'] };
                
                // Header styling - bold headers
                const headerRow = 1;
                for (let col = range.s.c; col <= range.e.c; col++) {
                    const cellRef = XLSX.utils.encode_cell({ r: headerRow - 1, c: col });
                    if (worksheet[cellRef]) {
                        worksheet[cellRef].s = {
                            font: { bold: true, color: { rgb: "FFFFFF" } },
                            fill: { fgColor: { rgb: "3498DB" } },
                            alignment: { horizontal: "center" }
                        };
                    }
                }
                
                // Προσθήκη worksheet στο workbook
                XLSX.utils.book_append_sheet(workbook, worksheet, 'Ερωτήσεις');
                
                // Δημιουργία Excel buffer
                const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
                
                const timestamp = new Date().toISOString().split('T')[0];
                
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename="TimeCast-Questions-${timestamp}.xlsx"`);
                res.send(excelBuffer);
                
            } else if (format === 'csv') {
                // Fallback CSV export
                const headers = Object.keys(data[0]);
                const csvRows = [
                    headers.join(','),
                    ...data.map(row => 
                        headers.map(header => {
                            const value = row[header] || '';
                            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                                return `"${value.replace(/"/g, '""')}"`;
                            }
                            return value;
                        }).join(',')
                    )
                ];
                
                const csvContent = csvRows.join('\n');
                const timestamp = new Date().toISOString().split('T')[0];
                
                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="TimeCast-Questions-${timestamp}.csv"`);
                res.send('\ufeff' + csvContent);
            } else {
                // JSON format
                res.json({
                    success: true,
                    data: data,
                    count: data.length,
                    exported_at: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('❌ Export error:', error);
            res.status(500).json({ 
                success: false,
                error: 'Failed to export questions'
            });
        }
    });

    
    console.log('✅ Questions API routes setup complete');
}

// Export functions για χρήση από server.js & main.js
module.exports = {
    extractSpeakersFromTimeline,
    getDeviceInfo,
    createQuestion,
    getQuestions,
    updateQuestion,
    deleteQuestion,
    getQuestionStats,
    exportQuestionsData,
    setupRoutes,
    normalizeCompanyName, // Export για χρήση σε άλλα modules
    
    // Direct access για debugging
    getAllQuestions: () => questions,
    setQuestions: (newQuestions) => { questions = newQuestions; },
    clearQuestions: () => { 
        questions = []; 
        questionCounter = 1; 
        saveQuestionsToDocuments(); // Save empty state
    }
};