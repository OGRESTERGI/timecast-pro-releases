const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

// Initialize i18next in the main world (preload context)
let i18nextInstance = null;

async function initI18next() {
    try {
        const i18next = require('i18next');
        const Backend = require('i18next-fs-backend');
        
        // Try to read saved language preference from a simple config file
        let savedLanguage = 'el'; // default
        try {
            const configPath = path.join(__dirname, 'language-config.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                savedLanguage = config.language || 'el';
                console.log('📂 Loaded saved language preference:', savedLanguage);
            }
        } catch (e) {
            console.log('📂 No saved language config found, using default: el');
        }
        
        await i18next.use(Backend).init({
            lng: savedLanguage, // Use saved language instead of auto-detection
            fallbackLng: 'el',
            supportedLngs: ['el', 'en'],
            ns: ['admin', 'common'],
            defaultNS: 'admin',
            backend: {
                loadPath: path.join(__dirname, 'locales', '{{lng}}', '{{ns}}.json')
            }
        });
        
        i18nextInstance = i18next;
        console.log('✅ i18next initialized in preload.js - Language:', i18next.language);
        return true;
    } catch (error) {
        console.error('❌ i18next initialization failed in preload.js:', error);
        return false;
    }
}

// Initialize i18next immediately
initI18next();

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    openTimerWindow: () => ipcRenderer.invoke('open-timer-window'),
    closeTimerWindow: () => ipcRenderer.invoke('close-timer-window'),
    getDisplaysCount: () => ipcRenderer.invoke('get-displays-count'),
    
    selectExcelFile: async () => {
        console.log('📂 Preload: Excel file selection...');
        const result = await ipcRenderer.invoke('select-excel-file');
        return result;
    },
    
    validateExcelFile: (filePath) => ipcRenderer.invoke('validate-excel-file', filePath),
    showConfirmDialog: (options) => ipcRenderer.invoke('showConfirmDialog', options),

    // HDMI Warning Dialogs
    showHdmiElectronWarning: () => ipcRenderer.invoke('show-hdmi-electron-warning'),
    showHdmiDisplayWarning: () => ipcRenderer.invoke('show-hdmi-display-warning'),

    // Auto-backup restore
    restoreAutoBackup: () => ipcRenderer.invoke('restore-auto-backup'),
    
    // Auto-backup file check
    checkAutoBackupExists: () => ipcRenderer.invoke('check-auto-backup-exists'),

    // File-based auto-save persistence
    saveAutoBackupFile: (data) => ipcRenderer.invoke('save-auto-backup-file', data),
    loadAutoBackupFile: () => ipcRenderer.invoke('load-auto-backup-file'),

    // License System API
    getMachineInfo: () => ipcRenderer.invoke('getMachineInfo'),
    activateLicense: (licenseKey, machineFingerprint) => ipcRenderer.invoke('activateLicense', licenseKey, machineFingerprint),
    deactivateMachine: (licenseKey) => ipcRenderer.invoke('deactivateMachine', licenseKey),
    validateCurrentLicense: () => ipcRenderer.invoke('validateCurrentLicense'),
    validateCurrentLicenseOnline: () => ipcRenderer.invoke('validateCurrentLicenseOnline'),
    licenseActivated: (result) => ipcRenderer.send('licenseActivated', result),
    cancelLicense: () => ipcRenderer.send('cancelLicense'),

    // i18next Translation Methods
    translate: (key, options = {}) => {
        if (i18nextInstance) {
            return i18nextInstance.t(key, options);
        }
        console.warn('⚠️ i18nextInstance not ready, returning key:', key);
        return key;
    },
    
    changeLanguage: async (lang) => {
        if (i18nextInstance) {
            await i18nextInstance.changeLanguage(lang);
            console.log('🌐 Language changed to:', lang);
            
            // Save language preference to file
            try {
                const configPath = path.join(__dirname, 'language-config.json');
                const config = { language: lang, timestamp: Date.now() };
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                console.log('💾 Language preference saved to file:', lang);
            } catch (error) {
                console.error('❌ Failed to save language preference:', error);
            }
            
            // Also update Electron native menu
            try {
                const result = await ipcRenderer.invoke('change-language', lang);
                console.log('🍎 Electron menu language changed:', result);
            } catch (error) {
                console.error('❌ Failed to update Electron menu language:', error);
            }
            
            return lang;
        }
        console.warn('⚠️ i18nextInstance not ready for language change');
        return null;
    },
    
    getCurrentLanguage: () => {
        if (i18nextInstance) {
            return i18nextInstance.language;
        }
        return 'el'; // fallback
    },
    
    isI18nextReady: () => {
        return i18nextInstance !== null;
    },

    // Environment detection
    isElectron: true,
    platform: process.platform,
    version: process.versions.electron,

    // App version
    getAppVersion: () => ipcRenderer.invoke('get-app-version')
});