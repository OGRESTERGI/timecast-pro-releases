/**
 * TimeCast™ Pro i18n Integration Helper
 * Simple integration examples for existing codebase
 */

// Import the configuration
const { initI18n, t, changeLanguage, getCurrentLanguage, getAvailableLanguages } = require('./i18n-config');

// Initialize i18n system
async function setupI18n() {
    try {
        await initI18n();
        console.log('✅ i18n system ready');
        
        // Set up language change listeners
        if (typeof document !== 'undefined') {
            document.addEventListener('languageChanged', (event) => {
                console.log(`🔄 Language changed to: ${event.detail.language}`);
                updateAllTexts();
            });
        }
        
        return true;
    } catch (error) {
        console.error('❌ Failed to setup i18n:', error);
        return false;
    }
}

// Helper function to update text elements
function updateAllTexts() {
    // Update elements with data-i18n attribute
    const elements = document.querySelectorAll('[data-i18n]');
    
    elements.forEach(element => {
        const key = element.getAttribute('data-i18n');
        const namespace = element.getAttribute('data-ns') || 'common';
        const fullKey = namespace + ':' + key;
        
        // Get translation
        const translation = t(fullKey);
        
        // Update element based on type
        if (element.tagName === 'INPUT' && element.hasAttribute('placeholder')) {
            element.placeholder = translation;
        } else {
            element.textContent = translation;
        }
    });
    
    console.log(`🔄 Updated ${elements.length} text elements`);
}

// Helper function to create language switcher
function createLanguageSwitcher(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`Container ${containerId} not found for language switcher`);
        return;
    }
    
    const languages = getAvailableLanguages();
    const currentLang = getCurrentLanguage();
    
    const select = document.createElement('select');
    select.className = 'language-switcher';
    
    languages.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = `${lang.flag} ${lang.name}`;
        option.selected = lang.code === currentLang;
        select.appendChild(option);
    });
    
    select.addEventListener('change', async (e) => {
        const success = await changeLanguage(e.target.value);
        if (success) {
            console.log(`✅ Language switched to: ${e.target.value}`);
        }
    });
    
    container.appendChild(select);
}

// Example usage functions
const i18nHelpers = {
    // Simple text translation
    getText: (key, namespace = 'common') => {
        return t(`${namespace}:${key}`);
    },
    
    // Translation with variables
    getTextWithVars: (key, variables, namespace = 'common') => {
        return t(`${namespace}:${key}`, variables);
    },
    
    // Get button text
    getButton: (buttonName) => {
        return t(`common:buttons.${buttonName}`);
    },
    
    // Get status text
    getStatus: (statusName) => {
        return t(`common:status.${statusName}`);
    },
    
    // Get error message
    getError: (category, errorName) => {
        return t(`errors:${category}.${errorName}`);
    },
    
    // Format time with translation
    formatTime: (seconds, showSeconds = true) => {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        
        if (showSeconds) {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        } else {
            return t('common:time.remaining', { time: `${minutes}${t('common:time.minute')}` });
        }
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        setupI18n,
        updateAllTexts,
        createLanguageSwitcher,
        ...i18nHelpers
    };
} else {
    // Browser global
    window.i18nHelpers = {
        setupI18n,
        updateAllTexts,
        createLanguageSwitcher,
        ...i18nHelpers
    };
}

// Usage examples in comments:
/*

// In your HTML:
<button data-i18n="start" data-ns="timer">Start</button>
<span data-i18n="status.ready" data-ns="common">Ready</span>
<input placeholder="Enter name" data-i18n="placeholder.name" data-ns="questions">

// In your JavaScript:
// Initialize system
await setupI18n();

// Use translations
console.log(i18nHelpers.getText('start', 'timer')); // "Εκκίνηση" or "Start"
console.log(i18nHelpers.getButton('save')); // "Αποθήκευση" or "Save"

// With variables
const msg = i18nHelpers.getTextWithVars('timerStarted', { minutes: 5 }, 'timer');
// "Το χρονόμετρο ξεκίνησε με 5 λεπτά" or "Timer started with 5 minutes"

// Change language
await changeLanguage('en');
updateAllTexts(); // Updates all elements with data-i18n

// Create language switcher
createLanguageSwitcher('language-container');

*/

console.log('🌐 TimeCast Pro i18n integration helper loaded');