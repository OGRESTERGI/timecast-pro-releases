/**
 * TimeCast™ Pro i18n Configuration
 * Professional multilanguage support using i18next
 */

const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const LanguageDetector = require('i18next-browser-languagedetector');

// Configuration for TimeCast Pro
const i18nConfig = {
    // Default language (English for international distribution)
    fallbackLng: 'en',
    
    // Available languages
    supportedLngs: ['el', 'en'],
    
    // Debug only in development
    debug: process.env.NODE_ENV !== 'production',
    
    // Backend configuration for file loading
    backend: {
        // Path to translation files
        loadPath: './locales/{{lng}}/{{ns}}.json'
    },
    
    // Language detection options
    detection: {
        // Detection order
        order: ['localStorage', 'navigator', 'htmlTag'],
        
        // Cache language preference
        caches: ['localStorage'],
        
        // LocalStorage key
        lookupLocalStorage: 'timecast_language',
        
        // Don't detect from subdomain/path
        checkWhitelist: true
    },
    
    // Interpolation options
    interpolation: {
        // Disable escaping for HTML content
        escapeValue: false,
        
        // Custom formatting functions
        format: function(value, format, lng) {
            // Time formatting
            if (format === 'time') {
                const minutes = Math.floor(value / 60);
                const seconds = value % 60;
                return `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
            
            // Number formatting for Greek
            if (format === 'number' && lng === 'el') {
                return value.toLocaleString('el-GR');
            }
            
            return value;
        }
    },
    
    // Namespace configuration
    ns: ['common', 'timer', 'admin', 'questions', 'errors'],
    defaultNS: 'common',
    
    // React-like key separator
    keySeparator: '.',
    nsSeparator: ':',
    
    // Pluralization
    pluralSeparator: '_',
    
    // Return objects for nested translations
    returnObjects: true,
    
    // Update missing keys in development
    updateMissing: process.env.NODE_ENV === 'development',
    
    // Save missing keys to backend
    saveMissing: process.env.NODE_ENV === 'development'
};

// Initialize i18next
const initI18n = async () => {
    try {
        await i18next
            .use(Backend)
            .use(LanguageDetector)
            .init(i18nConfig);
        
        console.log('✅ i18next initialized successfully');
        console.log(`🌐 Current language: ${i18next.language}`);
        console.log(`🌐 Available languages: ${i18nConfig.supportedLngs.join(', ')}`);
        
        return i18next;
    } catch (error) {
        console.error('❌ Failed to initialize i18next:', error);
        throw error;
    }
};

// Helper functions for TimeCast Pro
const t = (key, options = {}) => {
    return i18next.t(key, options);
};

const changeLanguage = async (lng) => {
    try {
        await i18next.changeLanguage(lng);
        console.log(`🔄 Language changed to: ${lng}`);
        
        // Emit custom event for UI updates
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('languageChanged', {
                detail: { language: lng }
            }));
        }
        
        return true;
    } catch (error) {
        console.error(`❌ Failed to change language to ${lng}:`, error);
        return false;
    }
};

const getCurrentLanguage = () => {
    return i18next.language || i18nConfig.fallbackLng;
};

const getAvailableLanguages = () => {
    return [
        { 
            code: 'el', 
            name: 'Ελληνικά', 
            nativeName: 'Ελληνικά',
            flag: '🇬🇷' 
        },
        { 
            code: 'en', 
            name: 'English', 
            nativeName: 'English',
            flag: '🇬🇧' 
        }
    ];
};

// Export for Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initI18n,
        i18next,
        t,
        changeLanguage,
        getCurrentLanguage,
        getAvailableLanguages
    };
} else {
    // Browser global
    window.i18nTimeCast = {
        initI18n,
        i18next,
        t,
        changeLanguage,
        getCurrentLanguage,
        getAvailableLanguages
    };
}

console.log('🌐 TimeCast Pro i18n configuration loaded');