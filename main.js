const { app, BrowserWindow, shell, screen, ipcMain, dialog, Menu } = require('electron');

const path = require('path');
const os = require('os');
const fs = require('fs');
// ΟΡΙΑ ΓΙΑ ΠΡΟΣΤΑΣΙΑ ΑΠΟ MEMORY LEAK
const MAX_SAVED_MESSAGES = 100;
const MAX_EVENT_MARKERS = 500;
const MAX_MESSAGE_LENGTH = 1000;

const GoogleSheetsMonitor = require('./google-sheets-monitor');
let googleSheetsMonitor = null;

// License Manager - TimeCast Pro Licensing System
const TimeCastLicenseManager = require('./license-manager');
let licenseManager = null;

// Trial Manager - TimeCast Pro Trial System
const TrialManager = require('./trial-manager');
let trialManager = null;

// Update Checker - Auto-update notification system
const UpdateChecker = require('./update-checker');
let updateChecker = null;
let updateInfo = null; // Stores latest update information

// Current application language
let currentLanguage = 'el'; // Default to Greek

// HDMI toggle protection
let isMenuHdmiToggling = false;

// Load saved language preference on startup
function loadSavedLanguage() {
    try {
        const path = require('path');
        const fs = require('fs');
        const configPath = path.join(__dirname, 'language-config.json');
        
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.language) {
                currentLanguage = config.language;
                console.log(`🌐 Loaded saved language: ${currentLanguage}`);
                return currentLanguage;
            }
        }
    } catch (error) {
        console.log('📂 No saved language config found, using default: el');
    }
    return 'el';
}

// Questions API - θα φορτωθεί μέσα στην startEmbeddedServer
let questionsAPI = null;

// Global timer state for auto-backup system
let timerState = {
    timeLeft: 300,
    originalTime: 300,
    isRunning: false,
    title: "TimeCast™ Pro Conference Timer",
    message: '',
    messageVisible: false,
    warningThreshold: 60,
    backgroundColor: '#1a1a1a',
    logoDataUrl: null,
    logoSize: 120,
    logoPositions: {},
    soundEnabled: false,
    soundVolume: 50,
    timerFont: 'Arial',
    vmixSettings: {},
    clockMode: false,
    timelineSettings: {
        startTime: '09:00',
        endTime: '17:00'
    },
    savedMessages: {
        message1: '',
        message2: ''
    }
};

// Global event markers for auto-backup system
let serverEventMarkers = [];

// Βοηθητική συνάρτηση για sanitization
function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    
    return input
        .trim()
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .slice(0, MAX_MESSAGE_LENGTH);
}

let mainWindow;
let timerWindow = null;
let splashWindow = null;
let aboutDialog = null;
let gdprDialog = null;
let exitDialog = null;
let gracePeriodDialog = null;

// Συνάρτηση για εύρεση της πραγματικής IP
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const interface of interfaces[name]) {
            if (interface.family === 'IPv4' && !interface.internal) {
                return interface.address;
            }
        }
    }
    return 'localhost'; // fallback
}


// Δημιουργία Application Menu με λογικές κατηγορίες
function createApplicationMenu() {
    // Menu translations
    const menuTexts = {
        el: {
            appName: 'TimeCast™ Pro',
            about: 'Σχετικά με το TimeCast™ Pro',
            license: 'Διαχείριση Άδειας...',
            exit: 'Έξοδος',
            files: 'Αρχεία',
            fullImport: 'Πλήρης Εισαγωγή Ημερίδας (JSON)',
            importTitle: 'Εισαγωγή Ρυθμίσεων Ημερίδας',
            fullExport: 'Πλήρης Εξαγωγή Ημερίδας (JSON)',
            exportTitle: 'Εξαγωγή Ρυθμίσεων Ημερίδας',
            view: 'Προβολή',
            openTimer: 'Άνοιγμα Timer σε Δεύτερη Οθόνη',
            closeTimer: 'Κλείσιμο Timer Δεύτερης Οθόνης',
            alwaysOnTop: 'Πάντα στην Κορυφή',
            reload: 'Επαναφόρτωση',
            help: 'Βοήθεια',
            gdpr: 'Προστασία Δεδομένων (GDPR)...',
            aboutApp: 'Σχετικά με το Conference Timer...',
            errorTitle: 'Σφάλμα',
            errorMessage: 'Δεν ήταν δυνατή η ανάγνωση του αρχείου:',
            noTimerOpen: 'Κανένα Timer Window δεν είναι ανοιχτό',
            timelineImport: 'Εισαγωγή μόνο Χρονοσειράς',
            clearAll: 'Καθαρισμός Όλων',
            clearConfirmTitle: 'Επιβεβαίωση Καθαρισμού',
            clearConfirmMessage: 'ΠΡΟΣΟΧΗ - ΠΛΗΡΗΣ ΔΙΑΓΡΑΦΗ!',
            clearConfirmDetail: 'Αυτή η ενέργεια θα διαγράψει ΌΛΑ τα δεδομένα:\\n\\n• Όλα τα Event Markers\\n• Όλα τα Saved Messages\\n• Excel & Google Sheets monitoring\\n• Λογότυπα και ρυθμίσεις\\n\\nΞΕΧΝΑ ΤΑ ΠΑΝΤΑ - Start Fresh!\\n\\nΕίστε 100% σίγουροι;',
            buttonCancel: 'Ακύρωση',
            buttonDeleteAll: 'ΔΙΑΓΡΑΦΗ ΌΛΩΝ',
            fullScreen: 'Πλήρης Οθόνη',
            minimize: 'Ελαχιστοποίηση',
            toggleTimerHDMI: 'Άνοιγμα/Κλείσιμο HDMI Timer',
            checkUpdates: 'Έλεγχος για Ενημερώσεις',
            updateAvailable: 'Νέα Έκδοση Διαθέσιμη'
        },
        en: {
            appName: 'TimeCast™ Pro',
            about: 'About TimeCast™ Pro',
            exit: 'Exit',
            files: 'Files',
            fullImport: 'Full Conference Import (JSON)',
            importTitle: 'Import Conference Settings',
            fullExport: 'Full Conference Export (JSON)',
            exportTitle: 'Export Conference Settings',
            view: 'View',
            openTimer: 'Open Timer on Second Screen',
            closeTimer: 'Close Second Screen Timer',
            alwaysOnTop: 'Always on Top',
            reload: 'Reload',
            help: 'Help',
            gdpr: 'Data Protection (GDPR)...',
            aboutApp: 'About Conference Timer...',
            errorTitle: 'Error',
            errorMessage: 'Could not read file:',
            noTimerOpen: 'No Timer Window is open',
            timelineImport: 'Import Timeline Only',
            clearAll: 'Clear All',
            clearConfirmTitle: 'Confirm Clear',
            clearConfirmMessage: 'WARNING - COMPLETE DELETION!',
            clearConfirmDetail: 'This action will delete ALL data:\\n\\n• All Event Markers\\n• All Saved Messages\\n• Excel & Google Sheets monitoring\\n• Logos and settings\\n\\nFORGET EVERYTHING - Start Fresh!\\n\\nAre you 100% sure?',
            buttonCancel: 'Cancel',
            buttonDeleteAll: 'DELETE ALL',
            fullScreen: 'Full Screen',
            minimize: 'Minimize',
            toggleTimerHDMI: 'Toggle HDMI Timer',
            checkUpdates: 'Check for Updates',
            updateAvailable: 'New Version Available'
        }
    };
    
    const t = menuTexts[currentLanguage];
    const template = [
        {
            label: t.appName,
            submenu: [
                {
                    label: t.about,
                    accelerator: 'CmdOrCtrl+I',
                    click: () => {
                        showAboutDialog();
                    }
                },
                { type: 'separator' },
                {
                    label: t.exit,
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: async () => {
                        await performCleanShutdown();
                    }
                }
            ]
        },
        {
            label: t.files,
            submenu: [
               {
    label: t.fullImport,
    accelerator: 'CmdOrCtrl+O',
    click: () => {
        // Χρήση native Electron file dialog
        dialog.showOpenDialog(mainWindow, {
            title: t.importTitle,
            filters: [
                { name: 'JSON Files', extensions: ['json'] }
            ],
            properties: ['openFile']
        }).then(result => {
            if (!result.canceled && result.filePaths.length > 0) {
                const filePath = result.filePaths[0];
                const fs = require('fs');
                
                try {
                    const fileContent = fs.readFileSync(filePath, 'utf8');
                    const fileName = path.basename(filePath);
                    
                    // Χρήση unique timestamp για μοναδικά ονόματα μεταβλητών
                    const timestamp = Date.now();
                    
                    mainWindow.webContents.executeJavaScript(`
                        (() => {
                            // Χρήση IIFE (Immediately Invoked Function Expression) για απομόνωση
                            const importBlob_${timestamp} = new Blob([${JSON.stringify(fileContent)}], {type: 'application/json'});
                            importBlob_${timestamp}.name = '${fileName}';
                            
                            const importEvt_${timestamp} = {
                                target: {
                                    files: [importBlob_${timestamp}],
                                    value: ''
                                }
                            };
                            
                            if (typeof handleImportFile === 'function') {
                                handleImportFile(importEvt_${timestamp});
                            } else {
                                alert('Σφάλμα: Δεν βρέθηκε η function handleImportFile');
                            }
                        })();
                    `);
                    
                } catch (error) {
                    dialog.showErrorBox(t.errorTitle, `${t.errorMessage} ${error.message}`);
                }
            }
        });
    }
},
                {
                    label: t.fullExport,
                    accelerator: 'CmdOrCtrl+S',
                   click: () => {
    mainWindow.webContents.executeJavaScript(`
        if (typeof exportSettings === 'function') {
            exportSettings();
        } else {
            console.log('exportSettings function not found');
        }
    `);
}
                },
                { type: 'separator' },
                {
                    label: t.timelineImport,
                    accelerator: 'CmdOrCtrl+Shift+O',
                    click: () => {
                        mainWindow.webContents.executeJavaScript(`
                            if (typeof selectExcelFile === 'function') {
                                selectExcelFile();
                            } else {
                                console.log('selectExcelFile function not found');
                            }
                        `);
                    }
                },
                { type: 'separator' },
                {
                    label: t.clearAll,
                    accelerator: 'CmdOrCtrl+Shift+Delete',
                    click: async () => {
                        // Use custom dialog instead of Windows native
                        const message = `${t.clearConfirmMessage}\n\n${t.clearConfirmDetail}`;
                        const shouldDelete = await showSimpleConfirmDialog(
                            t.clearConfirmTitle,
                            message,
                            t.buttonDeleteAll,
                            t.buttonCancel
                        );

                        if (shouldDelete) {
                            mainWindow.webContents.executeJavaScript(`
    if (typeof clearAllData === 'function') {
        clearAllData();
    } else {
        console.log('clearAllData function not found');
    }
`);
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Έξοδος',
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
    label: t.view,
    submenu: [
        // ΠΡΟΣΘΗΚΗ: Νέες επιλογές προβολής
        {
    label: t.fullScreen,
    accelerator: 'F11',
    click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            const isCurrentlyFullScreen = mainWindow.isFullScreen();
            
            if (isCurrentlyFullScreen) {
                // Έξοδος από fullscreen → maximized
                mainWindow.setFullScreen(false);
                setTimeout(() => {
                    mainWindow.maximize();
                }, 100);
                console.log('📺 Menu: Exited fullscreen to maximized');
            } else {
                // Είσοδος σε fullscreen
                mainWindow.setFullScreen(true);
                console.log('📺 Menu: Entered fullscreen');
            }
        }
    }
},
        {
            label: 'Μεγιστοποίηση',
            accelerator: 'CmdOrCtrl+Up',
            click: () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.setFullScreen(false);
                    mainWindow.maximize();
                    console.log('📺 Menu: Maximized window');
                }
            }
        },
        {
            label: t.minimize,
            accelerator: 'CmdOrCtrl+Down',
            click: () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.minimize();
                    console.log('📺 Menu: Minimized window');
                }
            }
        },
        { type: 'separator' },
        
        // ΒΕΛΤΙΩΣΗ: Timer Display με proper έλεγχο
        {
            label: t.toggleTimerHDMI,
            accelerator: 'CmdOrCtrl+H',
            click: async () => {
                console.log('🔥 MENU CLICK DETECTED: Toggle HDMI Timer...');
                
                // Protection mechanism (ίδιο με το working κουμπί)
                if (isMenuHdmiToggling) {
                    console.log('HDMI Toggle: Already processing - ignored');
                    return;
                }
                isMenuHdmiToggling = true;
                
                try {
                    // Toggle logic: αν υπάρχει ήδη timer window, κλείσε το
                    if (timerWindow && !timerWindow.isDestroyed()) {
                        console.log('Closing existing timer window...');
                        const success = closeTimerWindow();
                        if (success) {
                            console.log('✅ Timer window closed successfully');
                            
                            // Εμφάνιση close alert (ίδιο με το working κουμπί)
                            if (mainWindow && !mainWindow.isDestroyed()) {
                                mainWindow.webContents.executeJavaScript(`
                                    const lang = localStorage.getItem('preferredLanguage') || 'el';
                                    const title = lang === 'en' ? 'HDMI Timer Closed' : 'Timer HDMI Έκλεισε';
                                    const message = lang === 'en' ? 'Timer closed from second screen' : 'Timer έκλεισε από δεύτερη οθόνη';
                                    customAlert(title, message, 'info');
                                `);
                            }
                        }
                        return;
                    }
                    
                    // Έλεγχος διαθέσιμων οθονών (ίδια logic με το working κουμπί)
                    const displays = screen.getAllDisplays();
                    console.log(`Found ${displays.length} displays`);
                    
                    if (displays.length < 2) {
                        // Εμφάνιση HDMI warning dialog (ίδια με το working κουμπί)
                        console.log('❌ Only one display available - showing warning');
                        await showHdmiWarningDialog(
                            'warning',
                            'Μη Διαθέσιμη Δεύτερη Οθόνη',
                            'Δεν έχει συνδεθεί δεύτερη οθόνη!',
                            'Συνδέστε μια δεύτερη οθόνη (HDMI/DisplayPort/USB-C) και δοκιμάστε ξανά.',
                            { okText: 'Εντάξει' }
                        );
                        return;
                    }
                    
                    // Άνοιγμα timer στη δεύτερη οθόνη
                    console.log('Opening timer on second screen...');
                    const success = createTimerWindow();
                    if (success) {
                        console.log('✅ Timer window opened successfully');
                        
                        // Εμφάνιση success alert (ίδιο με το working κουμπί)
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.executeJavaScript(`
                                const userLang = localStorage.getItem('preferredLanguage') || 'el';
                                const title = userLang === 'en' ? 'HDMI Timer Opened' : 'Timer HDMI Ανοίχτηκε';
                                const message = userLang === 'en' ? 'Timer opened on second screen!' : 'Timer ανοίχτηκε στη δεύτερη οθόνη!';
                                customAlert(title, message, 'success');
                            `);
                        }
                    } else {
                        console.log('❌ Failed to open timer window');
                        
                        // Εμφάνιση error alert
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.executeJavaScript(`
                                const appLang = localStorage.getItem('preferredLanguage') || 'el';
                                const title = appLang === 'en' ? 'Timer Error' : 'Σφάλμα Timer';
                                const message = appLang === 'en' ? 'Failed to open timer window' : 'Αποτυχία ανοίγματος timer';
                                customAlert(title, message, 'error');
                            `);
                        }
                    }
                } catch (error) {
                    console.error('❌ Error opening timer window:', error);
                } finally {
                    // Reset protection flag after 2 seconds (ίδιο με το working κουμπί)
                    setTimeout(() => {
                        isMenuHdmiToggling = false;
                    }, 2000);
                }
            }
        },
        { type: 'separator' },
        {
            label: t.alwaysOnTop,
            type: 'checkbox',
            checked: false,
            accelerator: 'CmdOrCtrl+T',
            click: (menuItem) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    const shouldBeOnTop = menuItem.checked;
                    mainWindow.setAlwaysOnTop(shouldBeOnTop);
                    console.log(`🔝 Always on top: ${shouldBeOnTop ? 'enabled' : 'disabled'}`);
                    
                    // Save setting to localStorage
                    mainWindow.webContents.executeJavaScript(`
                        localStorage.setItem('alwaysOnTop', '${shouldBeOnTop}');
                    `);
                }
            }
        },
        { type: 'separator' },
        {
            label: t.reload,
            accelerator: 'CmdOrCtrl+R',
            click: () => {
                console.log('🔄 Reload requested via menu/shortcut');
                global.isReloading = true;
                mainWindow.reload();
            }
        },
        {
            label: 'Developer Tools',
            accelerator: 'F12',
            role: 'toggleDevTools'
        },
        { type: 'separator' }
    ]
},
        {
            label: t.help,
            submenu: [
                {
                    label: '📧 Send Error Report',
                    click: () => {
                        // Trigger error report from renderer
                        mainWindow.webContents.executeJavaScript(`
                            (async () => {
                                const result = await ErrorReporter.sendReport();
                                if (result.success) {
                                    showCustomNotification('✅ Error Report Sent', 'Thank you for helping improve TimeCast Pro.\\n\\nYour error report has been sent to our support team.', 'success');
                                } else {
                                    showCustomNotification('❌ Error Report Failed', 'Failed to send error report:\\n\\n' + result.message, 'error');
                                }
                            })();
                        `);
                    }
                },
                { type: 'separator' },
                {
                    label: t.gdpr,
                    accelerator: 'CmdOrCtrl+P',
                    click: () => {
                        showGDPRDialog();
                    }
                },
                { type: 'separator' },
                {
                    label: updateInfo && updateInfo.updateAvailable
                        ? `🔴 ${t.updateAvailable} v${updateInfo.latestVersion}`
                        : t.checkUpdates,
                    click: () => {
                        checkForUpdatesManually();
                    }
                }
            ]
        }
    ];

    // Προσαρμογή για macOS
    if (process.platform === 'darwin') {
        template[0].label = app.getName();
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// Function to update application language and rebuild menu
function updateApplicationLanguage(newLanguage) {
    currentLanguage = newLanguage;
    createApplicationMenu(); // Rebuild menu with new language
    console.log(`🌐 Application menu updated to: ${newLanguage}`);
}

// IPC handler for language changes from renderer
ipcMain.handle('change-language', async (event, newLanguage) => {
    updateApplicationLanguage(newLanguage);
    return { success: true, language: newLanguage };
});

let serverProcess = null;
// ΠΡΟΣΘΗΚΗ: Αποθήκευση τελευταίας διαδρομής Excel
let lastExcelDirectory = null;

// ============================================================
// 📂 FILE DIALOG API για Excel Import
// ============================================================


ipcMain.handle('select-excel-file', async () => {
    try {
        const defaultPath = lastExcelDirectory || app.getPath('documents');
        
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Επιλογή Excel Αρχείου',
            defaultPath: defaultPath,
            filters: [
                { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        // ----> ΠΡΟΣΘΕΣΤΕ ΑΥΤΗ ΤΗ ΓΡΑΜΜΗ ΕΔΩ <----
        if (mainWindow) mainWindow.focus();

        if (!result.canceled && result.filePaths.length > 0) {
            lastExcelDirectory = path.dirname(result.filePaths[0]);
            console.log('📂 Last Excel directory saved:', lastExcelDirectory);
        }
        
        console.log('📂 File dialog result:', result);
        return result;
        
    } catch (error) {
        console.error('❌ File dialog error:', error);

        // ----> ΚΑΙ ΠΡΟΛΗΠΤΙΚΑ, ΠΡΟΣΘΕΣΤΕ ΤΗΝ ΚΑΙ ΕΔΩ <----
        if (mainWindow) mainWindow.focus();

        return { canceled: true, error: error.message };
    }
});




async function checkPortAndCleanZombies(port = 3000) {
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    try {
        // Check if port is in use
        const netstatResult = await execPromise(`netstat -ano | findstr :${port}`);
        
        if (netstatResult.stdout.trim()) {
            console.log(`⚠️ Port ${port} is in use`);
            
            // Extract PID from netstat output
            const lines = netstatResult.stdout.split('\n');
            const listeningLine = lines.find(line => line.includes('LISTENING'));
            
            if (listeningLine) {
                const pidMatch = listeningLine.trim().split(/\s+/).pop();
                const currentPid = parseInt(pidMatch);
                
                // Check if it's our old zombie process
                const pidFile = path.join(__dirname, 'server-pid.txt');
                let savedPid = null;
                
                try {
                    if (fs.existsSync(pidFile)) {
                        savedPid = parseInt(fs.readFileSync(pidFile, 'utf8').trim());
                    }
                } catch (error) {
                    console.log('Warning: Could not read PID file:', error.message);
                }
                
                // If it matches our saved PID, it's a zombie - safe to kill
                if (savedPid && currentPid === savedPid) {
                    console.log(`🧟 Detected zombie process (PID: ${currentPid}) - cleaning up...`);
                    
                    try {
                        await execPromise(`taskkill //PID ${currentPid} //F`);
                        console.log('✅ Zombie process cleaned up successfully');
                        
                        // Clean up PID file
                        fs.unlinkSync(pidFile);
                        
                        // Wait a moment for port to be released
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        return { success: true, port };
                    } catch (killError) {
                        console.log('❌ Failed to kill zombie process:', killError.message);
                        return { success: false, port: port + 1, reason: 'zombie_cleanup_failed' };
                    }
                } else {
                    console.log(`🚫 Port ${port} occupied by different process (PID: ${currentPid})`);
                    return { success: false, port: port + 1, reason: 'port_occupied' };
                }
            }
        }
        
        console.log(`✅ Port ${port} is available`);
        return { success: true, port };
        
    } catch (error) {
        // netstat didn't find anything, port is likely free
        console.log(`✅ Port ${port} appears to be available`);
        return { success: true, port };
    }
}

async function startEmbeddedServer() {
    if (serverProcess) {
        console.log('Server already running');
        return serverProcess;
    }
    
    // Check port and clean zombies first
    const portCheck = await checkPortAndCleanZombies(3000);
    const PORT = portCheck.port;
    
    if (!portCheck.success) {
        console.log(`⚠️ Using alternative port: ${PORT} (reason: ${portCheck.reason})`);
    }
    
    // Σκοτώνουμε τυχόν zombie servers πριν ξεκινήσουμε νέο
    try {
        const { exec } = require('child_process');
        exec('netstat -ano | findstr :3000', (error, stdout) => {
            if (!error && stdout) {
                const lines = stdout.split('\n');
                const listeningLine = lines.find(line => line.includes('LISTENING'));
                if (listeningLine) {
                    const pid = listeningLine.trim().split(/\s+/).pop();
                    if (pid && !isNaN(pid)) {
                        console.log(`🧟 Killing zombie server PID: ${pid}`);
                        exec(`taskkill //F //PID ${pid}`, () => {
                            console.log('✅ Zombie server killed');
                        });
                    }
                }
            }
        });
    } catch (e) {
        // Ignore errors
    }
    
    console.log('🚀 Starting FULL embedded server...');
    
    // ΦΟΡΤΩΣΗ QUESTIONS API με safe require
    try {
        questionsAPI = require('./questions-api');
        console.log('✅ Questions API loaded successfully');
    } catch (error) {
        console.error('❌ Failed to load questions-api:', error.message);
        questionsAPI = null;
    }
    
    // ΟΛΟΚΛΗΡΟΣ Ο SERVER.JS ΚΩΔΙΚΑΣ ΕΔΩ ΜΕΣΑ
    const express = require('express');
    const http = require('http');
    const { Server } = require('socket.io');
    const os = require('os');
    // Δημιουργία Express app
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server);

    // vMix Display Integration
    const VmixDisplay = require('./vmix-display');
    const vmixDisplay = new VmixDisplay();

    // vMix API Integration για video monitoring
    const VmixAPI = require('./vmix-api');
    let vmixAPI = null; // Will be initialized when connection is applied

    // Connection throttling
    const connectionLimiter = new Map();
    const CONNECTION_LIMIT = 20;
    const CLEANUP_INTERVAL = 30000;

    setInterval(() => {
        connectionLimiter.clear();
    }, CLEANUP_INTERVAL);

    // Initialize/extend the global timerState with server-specific properties
    Object.assign(timerState, {
        timeLeft: 900,
        originalTime: 900,
        lastUpdate: Date.now(),
        currentTextareaContent: '',
        flashSentForEnd: false,  // ΠΡΟΣΘΗΚΗ: Εμποδίζει ατελείωτα flash alerts
        autoTimer: {
            enabled: true,        // false = manual control only
            minutes: 3,          // default minutes for auto-timer
            isActive: false,     // currently running auto-timer
            priority: 'none',    // 'question' | 'manual' | 'none'
            timeoutId: null      // timeout ID για 10-second delay
        },
        displaySettings: {
            titleFontSize: 24,
            logoDataUrl: '',
            logoSize: 80,
            backgroundColor: '#2c3e50',
            timerFontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
            logoPositions: {
                tl: true,
                tc: false,
                tr: true,
                bl: true,
                bc: false,
                br: true
            }
        },
        soundSettings: {
            enabled: true,
            volume: 0.7
        },
        
        // vMix Video Timer για video duration
        secondaryTimer: {
            active: false,
            title: '',
            remaining: 0,
            total: 0,
            state: 'stopped'
        }
    });

    // Default settings για reset functionality
    const DEFAULT_SETTINGS = {
        timer: {
            timeLeft: 900,
            originalTime: 900,
            warningThreshold: 60
        },
        display: {
            title: "TimeCast® Pro Conference Timer",
            titleFontSize: 24,
            logoDataUrl: '',
            logoSize: 80,
            backgroundColor: '#2c3e50',
            timerFontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
            logoPositions: {
                tl: true,
                tc: false,
                tr: true,
                bl: true,
                bc: false,
                br: true
            }
        },
        sound: {
            enabled: true,
            volume: 0.7
        },
        timeline: {
            startTime: '09:00',
            endTime: '17:00'
        },
        message: '',
        messageVisible: false
    };

    // Αρχική ενημέρωση vMix display
    vmixDisplay.initialize(timerState);

    // vMix API callbacks setup - moved to applyVmixConnection function
    // These will be set up when vMix connection is applied
    
    function setupVmixCallbacks(vmixAPIInstance) {
        vmixAPIInstance.onVideoProgress((videoData) => {
        // Ενημέρωση secondary timer με video progress
        timerState.secondaryTimer = {
            active: true,
            title: videoData.title,
            remaining: videoData.remainingSeconds,
            total: Math.floor(videoData.duration / 1000),
            state: videoData.state.toLowerCase(),
            progressPercent: videoData.progressPercent
        };
        
        // Real-time broadcast σε όλους τους clients
        io.emit('secondaryTimerUpdate', timerState.secondaryTimer);
    });

    vmixAPI.onVideoChange((videoData) => {
        if (videoData) {
            console.log(`🎬 vMix Video Started: ${videoData.title} (${vmixAPI.formatTime(videoData.duration)})`);
            
            timerState.secondaryTimer = {
                active: true,
                title: videoData.title,
                remaining: videoData.remainingSeconds,
                total: Math.floor(videoData.duration / 1000),
                state: videoData.state.toLowerCase(),
                progressPercent: videoData.progressPercent
            };
        } else {
            console.log('⏹️ vMix Video Stopped');
            
            timerState.secondaryTimer = {
                active: false,
                title: '',
                remaining: 0,
                total: 0,
                state: 'stopped',
                progressPercent: 0
            };
        }
        
        // Broadcast αλλαγής video
        io.emit('secondaryTimerUpdate', timerState.secondaryTimer);
    });

    vmixAPI.onConnectionChange((connected) => {
        if (connected) {
            console.log('✅ vMix API connected - starting video monitoring');
            vmixAPI.startMonitoring(1000); // Update κάθε δευτερόλεπτο
        } else {
            console.log('❌ vMix API disconnected');
            timerState.secondaryTimer.active = false;
            io.emit('secondaryTimerUpdate', timerState.secondaryTimer);
        }
    });
    }

    // vMix will be initialized when connection is applied via Auto-Discovery or manual setup
    

    // Διαχειριστής χρονομέτρου
    let timerInterval = null;
    let lastMessageVisibilityState = false;

    // Σερβίρισμα στατικών αρχείων
    app.use(express.static(__dirname));
    app.use(express.json());


    // Διαδρομές
    app.get('/', (req, res) => {
        res.redirect('/admin.html');
    });

   
    

    // Λήψη διευθύνσεων IP
    app.get('/get-ips', (req, res) => {
        try {
            const interfaces = os.networkInterfaces();
            const ips = [];
            
            Object.keys(interfaces).forEach(name => {
                interfaces[name].forEach(interface => {
                    if (interface.family === 'IPv4' && !interface.internal) {
                        ips.push(interface.address);
                    }
                });
            });
            
            res.json({ ips });
        } catch (error) {
            console.error('Σφάλμα λήψης IP διευθύνσεων:', error);
            res.status(500).json({ error: 'Αδυναμία λήψης IP διευθύνσεων' });
        }
    });

    app.get('/api/discover', (req, res) => {
        const interfaces = os.networkInterfaces();
        const ips = [];
        
        Object.keys(interfaces).forEach(name => {
            interfaces[name].forEach(interface => {
                if (interface.family === 'IPv4' && !interface.internal) {
                    ips.push(interface.address);
                }
            });
        });
        
        res.json({
            service: 'TimeCast® Pro Conference Timer',
            version: '3.0.0',
            ips: ips,
            port: PORT
        });
    });

    // vMix API endpoints
    app.get('/api/vmix/test-connection', async (req, res) => {
        try {
            const host = req.query.host || 'localhost';
            const port = parseInt(req.query.port) || 8088;
            
            // Create temporary vMix API instance για test
            const testVmixAPI = require('./vmix-api');
            const testAPI = new testVmixAPI(host, port);
            
            const connected = await testAPI.testConnection();
            
            if (connected) {
                // Προσπάθεια λήψης τρέχοντος video
                const programInput = await testAPI.getProgramInput();
                
                res.json({
                    success: true,
                    host: host,
                    port: port,
                    currentVideo: programInput ? programInput.$.title : null
                });
            } else {
                res.json({
                    success: false,
                    error: 'Connection failed'
                });
            }
            
            testAPI.destroy();
        } catch (error) {
            res.json({
                success: false,
                error: error.message
            });
        }
    });

    // vMix Tally settings endpoint
    app.post('/api/vmix/tally-settings', async (req, res) => {
        try {
            const { timerInputKeys } = req.body;
            
            if (!timerInputKeys || !Array.isArray(timerInputKeys)) {
                return res.status(400).json({
                    success: false,
                    error: 'timerInputKeys must be an array'
                });
            }
            
            vmixAPI.setTimerInputKeys(timerInputKeys);
            
            res.json({
                success: true,
                message: 'Timer input keys updated',
                timerInputKeys: timerInputKeys
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    // Get current tally state
    app.get('/api/vmix/tally-state', async (req, res) => {
        try {
            const tallyState = vmixAPI.getTallyState();
            
            res.json({
                success: true,
                tallyState: tallyState
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // vMix DataSource API - Timer Data
    app.get('/api/timer/current', (req, res) => {
        try {
            const currentStatus = getTimerStatus();

            // Format time για vMix Text Input
            const absTime = Math.abs(timerState.timeLeft);
            const hours = Math.floor(absTime / 3600);
            const minutes = Math.floor((absTime % 3600) / 60);
            const seconds = absTime % 60;

            let timeLeftFormatted;
            if (hours > 0) {
                timeLeftFormatted = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            } else {
                timeLeftFormatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }

            // Προσθήκη "+" για overtime
            if (timerState.timeLeft < 0) {
                timeLeftFormatted = '+' + timeLeftFormatted;
            }

            res.json({
                timeLeft: timerState.timeLeft,
                timeLeftFormatted: timeLeftFormatted, // ΝΕΟ: για vMix Text Input
                originalTime: timerState.originalTime,
                isRunning: timerState.isRunning,
                status: currentStatus,
                warningThreshold: timerState.warningThreshold,
                message: timerState.message,
                messageVisible: timerState.messageVisible,
                currentTextareaContent: timerState.currentTextareaContent, // ΠΡΟΣΘΗΚΗ: για companion feedback
                title: timerState.title,
                logoDataUrl: timerState.displaySettings?.logoDataUrl || '',
                timestamp: Date.now()
            });
        } catch (error) {
            res.json({
                error: error.message,
                timestamp: Date.now()
            });
        }
    });

    // vMix Plain Text API - Μόνο ο χρόνος σε plain text
    app.get('/api/timer/text', (req, res) => {
        try {
            const absTime = Math.abs(timerState.timeLeft);
            const hours = Math.floor(absTime / 3600);
            const minutes = Math.floor((absTime % 3600) / 60);
            const seconds = absTime % 60;

            let timeLeftFormatted;
            if (hours > 0) {
                timeLeftFormatted = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            } else {
                timeLeftFormatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }

            // Προσθήκη "+" για overtime
            if (timerState.timeLeft < 0) {
                timeLeftFormatted = '+' + timeLeftFormatted;
            }

            // Επιστροφή plain text
            res.type('text/plain').send(timeLeftFormatted);
        } catch (error) {
            res.type('text/plain').send('--:--');
        }
    });

    app.get('/api/vmix/status', async (req, res) => {
        try {
            const status = await vmixAPI.getStatus();
            const currentStatus = getTimerStatus();
            res.json({
                success: true,
                connected: vmixAPI.isConnected,
                timer: {
                    timeLeft: timerState.timeLeft,
                    originalTime: timerState.originalTime,
                    isRunning: timerState.isRunning,
                    status: currentStatus,
                    title: timerState.title
                },
                secondaryTimer: timerState.secondaryTimer,
                vmixStatus: status
            });
        } catch (error) {
            res.json({
                success: false,
                error: error.message
            });
        }
    });

    // vMix Get Inputs endpoint for dropdown population
    app.get('/api/vmix/get-inputs', async (req, res) => {
        try {
            const status = await vmixAPI.getStatus();
            
            if (!status || !status.inputs || !status.inputs[0] || !status.inputs[0].input) {
                return res.json({
                    success: false,
                    error: 'No vMix inputs available',
                    inputs: []
                });
            }

            const inputs = status.inputs[0].input.map(input => ({
                key: input.$.key,
                number: input.$.number,
                title: input.$.title || 'Untitled',
                type: input.$.type,
                isTimer: vmixAPI.isTimerInput(input) // Check if this looks like a timer input
            }));

            console.log(`📺 vMix inputs fetched: ${inputs.length} inputs found`);

            res.json({
                success: true,
                inputs: inputs,
                connected: vmixAPI.isConnected
            });

        } catch (error) {
            console.error('❌ Error getting vMix inputs:', error.message);
            res.json({
                success: false,
                error: error.message,
                inputs: []
            });
        }
    });

    // vMix Discovery endpoint - scan LAN for vMix instances
    app.get('/api/vmix/discover', async (req, res) => {
        console.log('🔍 vMix Discovery requested');
        
        try {
            const os = require('os');
            const http = require('http');
            
            // Get local IP to determine subnet
            const interfaces = os.networkInterfaces();
            let localIP = null;
            
            for (const name of Object.keys(interfaces)) {
                for (const iface of interfaces[name]) {
                    if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('192.168')) {
                        localIP = iface.address;
                        break;
                    }
                }
                if (localIP) break;
            }
            
            if (!localIP) {
                return res.json({ success: false, error: 'Could not determine local IP' });
            }
            
            console.log(`🔍 Scanning subnet based on ${localIP}`);
            
            // Extract subnet (e.g., 192.168.5.x)
            const subnet = localIP.split('.').slice(0, 3).join('.');
            const discoveredInstances = [];
            const promises = [];
            
            // Scan common vMix ports
            const portsToScan = [8088, 8089, 8090];
            
            // Scan IPs from .1 to .254
            for (let i = 1; i <= 254; i++) {
                const targetIP = `${subnet}.${i}`;
                
                for (const port of portsToScan) {
                    promises.push(new Promise((resolve) => {
                        const timeout = setTimeout(() => {
                            resolve(null);
                        }, 1000); // 1 second timeout
                        
                        const req = http.get(`http://${targetIP}:${port}/api/`, (response) => {
                            clearTimeout(timeout);
                            
                            let data = '';
                            response.on('data', chunk => data += chunk);
                            response.on('end', () => {
                                if (data.includes('<vmix>')) {
                                    // Parse basic info
                                    const versionMatch = data.match(/<version>(.*?)<\/version>/);
                                    const editionMatch = data.match(/<edition>(.*?)<\/edition>/);
                                    
                                    resolve({
                                        ip: targetIP,
                                        port: port,
                                        version: versionMatch ? versionMatch[1] : 'Unknown',
                                        edition: editionMatch ? editionMatch[1] : 'Unknown',
                                        url: `http://${targetIP}:${port}`
                                    });
                                } else {
                                    resolve(null);
                                }
                            });
                        });
                        
                        req.on('error', () => {
                            clearTimeout(timeout);
                            resolve(null);
                        });
                        
                        req.setTimeout(1000, () => {
                            req.destroy();
                            resolve(null);
                        });
                    }));
                }
            }
            
            console.log(`🔍 Checking ${promises.length} IP:port combinations...`);
            
            const results = await Promise.all(promises);
            const discovered = results.filter(result => result !== null);
            
            console.log(`🔍 Found ${discovered.length} vMix instances:`, discovered);
            
            res.json({
                success: true,
                instances: discovered,
                scannedSubnet: subnet,
                localIP: localIP
            });
            
        } catch (error) {
            console.error('❌ vMix discovery error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // COMPANION MODULE DOWNLOAD ENDPOINT
// =============================================================================

/**
 * GET /api/companion/download-module
 * Κατέβασμα του TimeCast Pro Companion Module
 */
app.get('/api/companion/download-module', (req, res) => {
    console.log('📦 Companion module download requested');
    
    try {
        const path = require('path');
        const fs = require('fs');
        
        // Path to the stable companion module
        const modulePath = path.join(__dirname, 'companion-modules', 'timecast-pro-1.0.0.tgz');
        
        // Check if file exists
        if (!fs.existsSync(modulePath)) {
            console.log('❌ Companion module not found:', modulePath);
            return res.status(404).json({
                success: false,
                error: 'Companion module not found'
            });
        }
        
        console.log('✅ Serving companion module:', modulePath);
        
        // Set headers for download
        res.setHeader('Content-Disposition', 'attachment; filename="timecast-pro-1.0.0.tgz"');
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('X-Module-Version', '1.0.0');
        res.setHeader('X-Module-Name', 'TimeCast® Pro Companion Module');
        
        // Stream the file
        const fileStream = fs.createReadStream(modulePath);
        fileStream.pipe(res);
        
        fileStream.on('error', (error) => {
            console.error('❌ Error streaming companion module:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: 'Failed to download companion module'
                });
            }
        });
        
    } catch (error) {
        console.error('❌ Companion module download error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/companion/module-info
 * Πληροφορίες για το διαθέσιμο Companion Module
 */
app.get('/api/companion/module-info', (req, res) => {
    try {
        const path = require('path');
        const fs = require('fs');
        
        const modulePath = path.join(__dirname, 'companion-modules', 'timecast-pro-1.0.0.tgz');
        const exists = fs.existsSync(modulePath);
        
        let fileSize = 0;
        let lastModified = null;
        
        if (exists) {
            const stats = fs.statSync(modulePath);
            fileSize = stats.size;
            lastModified = stats.mtime;
        }
        
        res.json({
            success: true,
            available: exists,
            filename: 'timecast-pro-1.0.0.tgz',
            version: '1.0.0',
            fileSize: fileSize,
            lastModified: lastModified,
            downloadUrl: '/api/companion/download-module',
            installInstructions: [
                '1. Download το αρχείο timecast-pro-1.0.0.tgz',
                '2. Copy στο φάκελο: C:\\Users\\[username]\\AppData\\Roaming\\Companion\\modules\\',
                '3. Extract: tar -xzf timecast-pro-1.0.0.tgz',
                '4. Rename: mv pkg timecast-pro-1.0.0',
                '5. Restart Companion',
                '6. Add TimeCast Pro instance με Host: 127.0.0.1, Port: 3000'
            ]
        });
        
    } catch (error) {
        console.error('❌ Module info error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

    // QUESTIONS API ENDPOINTS (ELECTRON VERSION)
// =============================================================================

/**
 * GET /api/questions/speakers
 * Λήψη ομιλητών από το timeline (Electron)
 */
app.get('/api/questions/speakers', (req, res) => {
    try {
        // DEBUG: Έλεγχος τι υπάρχει στα eventMarkers
        console.log('🔍 API /speakers called');
        console.log('📊 timerState.eventMarkers length:', (timerState.eventMarkers || []).length);
        console.log('📋 Current markers:', timerState.eventMarkers);
        
        // Χρήση του global eventMarkers από το embedded timeline
        // Δοκιμάζουμε πρώτα το timerState, μετά το serverEventMarkers ως fallback
const markersToCheck = (timerState.eventMarkers && timerState.eventMarkers.length > 0) 
    ? timerState.eventMarkers 
    : serverEventMarkers || [];
    
const speakers = questionsAPI.extractSpeakersFromTimeline(markersToCheck);
        
        console.log('🎤 Extracted speakers:', speakers);
        
        // Προσθήκη default επιλογών
        const speakerOptions = [
            'Γενική Ερώτηση (Όλοι)',
            ...speakers
        ];
        
        res.json({
            success: true,
            speakers: speakerOptions,
            count: speakers.length,
            extracted_from_timeline: true,
            source: 'electron_embedded'
        });
        
        console.log(`📝 [Electron] Speakers list requested: ${speakers.length} speakers found`);
    } catch (error) {
        console.error('[Electron] Error extracting speakers:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to extract speakers',
            speakers: ['Γενική Ερώτηση (Όλοι)'],
            source: 'electron_embedded'
        });
    }
});

// ΓΕΜΗ Rate limiting
let gemiRateLimit = {
    calls: [],
    maxCalls: 8,
    windowMs: 60000 // 1 minute
};

function checkGemiRateLimit() {
    const now = Date.now();
    gemiRateLimit.calls = gemiRateLimit.calls.filter(timestamp => now - timestamp < gemiRateLimit.windowMs);
    
    if (gemiRateLimit.calls.length >= gemiRateLimit.maxCalls) {
        return false;
    }
    
    gemiRateLimit.calls.push(now);
    return true;
}

// INSEE Rate limiting
let inseeRateLimit = {
    calls: [],
    maxCallsPerMinute: 30
};

function checkInseeRateLimit() {
    const now = Date.now();
    inseeRateLimit.calls = inseeRateLimit.calls.filter(timestamp => now - timestamp < 60000);
    
    if (inseeRateLimit.calls.length >= inseeRateLimit.maxCallsPerMinute) {
        return false;
    }
    
    inseeRateLimit.calls.push(now);
    return true;
}

// INSEE Token management
let inseeAccessToken = null;
let tokenExpiry = 0;

async function getInseeAccessToken() {
    const clientId = 'D_CZFbNUEfzHaHGGDVLwV2y6N0Ma';
    const clientSecret = 'R6xnd9SkzFxTQTiqbYmmyZQTapga';
    
    return new Promise((resolve, reject) => {
        const https = require('https');
        const postData = 'grant_type=client_credentials';
        
        const options = {
            hostname: 'api.insee.fr',
            path: '/token',
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const tokenResponse = JSON.parse(data);
                    if (tokenResponse.access_token) {
                        resolve(tokenResponse.access_token);
                    } else {
                        reject(new Error('No access token received'));
                    }
                } catch (error) {
                    reject(error);
                }
            });
        });
        
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function ensureInseeToken() {
    const now = Date.now();
    
    if (!inseeAccessToken || now > tokenExpiry) {
        console.log('🔐 Refreshing INSEE access token...');
        inseeAccessToken = await getInseeAccessToken();
        tokenExpiry = now + 3500000; // 1 hour - 100 seconds buffer
        console.log('✅ INSEE token refreshed');
    }
    
    return inseeAccessToken;
}

// ΓΕΜΗ API proxy endpoint
app.get('/api/gemi/search-companies', async (req, res) => {
    try {
        const { name } = req.query;
        
        if (!name || name.length < 3) {
            return res.status(400).json({
                success: false,
                error: 'Company name must be at least 3 characters'
            });
        }

        if (!checkGemiRateLimit()) {
            console.log(`⚠️ ΓΕΜΗ API rate limit exceeded for: "${name}"`);
            return res.status(429).json({
                success: false,
                error: 'Πολλές αναζητήσεις - περιμένετε λίγο και δοκιμάστε ξανά'
            });
        }

        console.log(`🏢 ΓΕΜΗ API search requested for: "${name}"`);
        
        const https = require('https');
        const url = `https://opendata-api.businessportal.gr/api/opendata/v1/companies?name=${encodeURIComponent(name)}&resultsSize=10`;
        
        const data = await new Promise((resolve, reject) => {
            const options = {
                headers: {
                    'api_key': 'pxIOODz6Zex3fFOLcrXcr0FwIx75wQxE',
                    'User-Agent': 'TimeCast-Pro/4.3.3'
                }
            };
            
            const req = https.get(url, options, (response) => {
                let responseData = '';
                
                response.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                response.on('end', () => {
                    try {
                        if (response.statusCode !== 200) {
                            reject(new Error(`ΓΕΜΗ API error: ${response.statusCode} ${response.statusMessage}`));
                            return;
                        }
                        
                        const jsonData = JSON.parse(responseData);
                        resolve(jsonData);
                    } catch (error) {
                        reject(new Error(`JSON parse error: ${error.message}`));
                    }
                });
            });
            
            req.on('error', (error) => {
                reject(new Error(`Request error: ${error.message}`));
            });
            
            req.setTimeout(10000, () => {
                req.abort();
                reject(new Error('Request timeout'));
            });
        });
        
        console.log(`✅ ΓΕΜΗ API returned ${data.searchResults?.length || 0} companies`);
        
        res.json({
            success: true,
            companies: data.searchResults || [],
            totalCount: data.searchMetadata?.totalCount || 0
        });

    } catch (error) {
        console.error('❌ ΓΕΜΗ API Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Σφάλμα επικοινωνίας με το ΓΕΜΗ API'
        });
    }
});

// INSEE API proxy endpoint 
app.get('/api/insee/search-companies', async (req, res) => {
    try {
        const { name } = req.query;
        
        if (!name || name.length < 3) {
            return res.status(400).json({
                success: false,
                error: 'Company name must be at least 3 characters'
            });
        }

        if (!checkInseeRateLimit()) {
            console.log(`⚠️ INSEE API rate limit exceeded for: "${name}"`);
            return res.status(429).json({
                success: false,
                error: 'Πολλές αναζητήσεις - περιμένετε λίγο και δοκιμάστε ξανά'
            });
        }

        console.log(`🏢 INSEE API search requested for: "${name}"`);
        
        const accessToken = await ensureInseeToken();
        
        const https = require('https');
        const url = `https://api.insee.fr/entreprises/sirene/V3.11/siret?q=denominationUniteLegale:"${encodeURIComponent(name)}"&nombre=10`;
        
        const data = await new Promise((resolve, reject) => {
            const options = {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json',
                    'User-Agent': 'TimeCast-Pro/4.3.3'
                }
            };
            
            const req = https.get(url, options, (response) => {
                let responseData = '';
                
                response.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                response.on('end', () => {
                    try {
                        if (response.statusCode !== 200) {
                            reject(new Error(`INSEE API error: ${response.statusCode} ${response.statusMessage}`));
                            return;
                        }
                        
                        const jsonData = JSON.parse(responseData);
                        resolve(jsonData);
                    } catch (error) {
                        reject(new Error(`JSON parse error: ${error.message}`));
                    }
                });
            });
            
            req.on('error', (error) => {
                reject(new Error(`Request error: ${error.message}`));
            });
            
            req.setTimeout(10000, () => {
                req.abort();
                reject(new Error('Request timeout'));
            });
        });
        
        // Transform INSEE data to consistent format
        const companies = data.etablissements?.map(etablissement => {
            const uniteLegale = etablissement.uniteLegale;
            return {
                name: uniteLegale?.denominationUniteLegale || 
                      `${uniteLegale?.prenom1UniteLegale || ''} ${uniteLegale?.nomUniteLegale || ''}`.trim(),
                siret: etablissement.siret,
                siren: uniteLegale?.siren,
                address: `${etablissement.adresseEtablissement?.numeroVoieEtablissement || ''} ${etablissement.adresseEtablissement?.typeVoieEtablissement || ''} ${etablissement.adresseEtablissement?.libelleVoieEtablissement || ''}`.trim(),
                city: etablissement.adresseEtablissement?.libelleCommuneEtablissement,
                postalCode: etablissement.adresseEtablissement?.codePostalEtablissement,
                country: 'France',
                source: 'INSEE'
            };
        }) || [];
        
        console.log(`✅ INSEE API returned ${companies.length} companies`);
        
        res.json({
            success: true,
            companies: companies,
            totalCount: data.header?.total || 0
        });

    } catch (error) {
        console.error('❌ INSEE API Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Σφάλμα επικοινωνίας με το INSEE API'
        });
    }
});

// Finnish YTJ API proxy endpoint
app.get('/api/ytj/search-companies', async (req, res) => {
    try {
        const { name } = req.query;
        
        if (!name || name.length < 3) {
            return res.status(400).json({
                success: false,
                error: 'Το όνομα πρέπει να έχει τουλάχιστον 3 χαρακτήρες'
            });
        }

        // YTJ API endpoint - free Finnish business register (v3 working endpoint)
        const url = `https://avoindata.prh.fi/opendata-ytj-api/v3/companies?name=${encodeURIComponent(name)}&maxResults=10`;
        
        console.log(`🇫🇮 YTJ API Request: ${name}`);
        
        const data = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'TimeCast-Pro/4.3.3'
            },
            timeout: 5000
        }).then(response => {
            if (!response.ok) {
                throw new Error(`YTJ API error: ${response.status} ${response.statusText}`);
            }
            return response.json();
        });

        // Transform YTJ data to consistent format
        const companies = [];
        if (data.companies && Array.isArray(data.companies)) {
            for (const company of data.companies.slice(0, 10)) {
                // Get current/active company name
                const currentName = company.names?.find(n => !n.endDate) || company.names?.[0];
                
                // Get business address
                const businessAddress = company.addresses?.find(addr => addr.type === 1) || company.addresses?.[0];
                const addressParts = [];
                
                if (businessAddress) {
                    if (businessAddress.street) addressParts.push(businessAddress.street);
                    if (businessAddress.buildingNumber) addressParts.push(businessAddress.buildingNumber);
                    if (businessAddress.postCode) addressParts.push(businessAddress.postCode);
                    if (businessAddress.postOffices?.[0]?.city) addressParts.push(businessAddress.postOffices[0].city);
                }
                
                if (currentName?.name) {
                    companies.push({
                        name: currentName.name,
                        businessId: company.businessId?.value || '',
                        address: addressParts.join(', '),
                        country: 'Finland',
                        source: 'YTJ',
                        flag: '🇫🇮'
                    });
                }
            }
        }

        console.log(`✅ YTJ API returned ${companies.length} companies`);

        res.json({
            success: true,
            companies: companies,
            totalCount: data.totalResults || 0
        });

    } catch (error) {
        console.error('❌ YTJ API Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Σφάλμα επικοινωνίας με το YTJ API'
        });
    }
});

// Danish CVR API proxy endpoint
app.get('/api/cvr/search-companies', async (req, res) => {
    try {
        const { name } = req.query;
        
        if (!name || name.length < 3) {
            return res.status(400).json({
                success: false,
                error: 'Company name must be at least 3 characters'
            });
        }

        console.log('🇩🇰 CVR API search requested for:', `"${name}"`);

        // Make request to CVR API
        const url = `https://cvrapi.dk/api?search=${encodeURIComponent(name)}&country=dk`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'TimeCast-Pro/1.0'
            }
        });

        if (!response.ok) {
            throw new Error(`CVR API responded with status ${response.status}`);
        }

        const data = await response.json();

        // Transform single result to companies array format
        const companies = [];
        if (data && data.name) {
            companies.push({
                name: data.name,
                vat: data.vat,
                address: data.address,
                city: data.city,
                zipcode: data.zipcode,
                phone: data.phone,
                country: 'Denmark',
                source: 'CVR',
                flag: '🇩🇰'
            });
        }

        console.log('✅ CVR API returned', companies.length, 'companies');
        
        res.json({
            success: true,
            companies: companies
        });

    } catch (error) {
        console.error('❌ CVR API Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Σφάλμα επικοινωνίας με το CVR API'
        });
    }
});

// Dutch KVK API removed - test API only contains dummy data, not real companies

/**
 * POST /api/questions/submit
 * Υποβολή νέας ερώτησης (Electron)
 */
app.post('/api/questions/submit', async (req, res) => {
    try {
        const questionData = req.body;
        
        // Validation
        if (!questionData.name || !questionData.company || !questionData.targetSpeaker || 
            !questionData.subject || !questionData.question) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }
        
        // Δημιουργία ερώτησης με web lookup
        const question = await questionsAPI.createQuestion(questionData, req);
        
        // Socket broadcast σε admin clients (Electron)
        io.emit('newQuestion', {
            question: question,
            stats: questionsAPI.getQuestionStats(),
            source: 'electron_embedded'
        });
        
        res.json({
            success: true,
            message: 'Η ερώτησή σας υποβλήθηκε επιτυχώς!',
            questionId: question.id,
            source: 'electron_embedded'
        });
        
        console.log(`📝 [Electron] New question submitted by ${question.submitter.name} (${question.submitter.device.ip})`);
        
    } catch (error) {
        console.error('[Electron] Error submitting question:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to submit question',
            source: 'electron_embedded'
        });
    }
});

/**
 * GET /api/questions/list
 * Λήψη λίστας ερωτήσεων (Electron)
 */
app.get('/api/questions/list', (req, res) => {
    try {
        const filters = {
            status: req.query.status,
            speaker: req.query.speaker,
            priority: req.query.priority
        };
        
        const questions = questionsAPI.getQuestions(filters);
        const stats = questionsAPI.getQuestionStats();
        
        res.json({
            success: true,
            questions: questions,
            stats: stats,
            total: questions.length,
            source: 'electron_embedded'
        });
        
    } catch (error) {
        console.error('[Electron] Error fetching questions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch questions',
            source: 'electron_embedded'
        });
    }
});

/**
 * PUT /api/questions/:id/status
 * Ενημέρωση κατάστασης ερώτησης (Electron)
 */
app.put('/api/questions/:id/status', (req, res) => {
    try {
        const questionId = req.params.id;
        const { status, priority, adminNotes } = req.body;
        
        const updatedQuestion = questionsAPI.updateQuestion(questionId, {
            status,
            priority,
            adminNotes
        });
        
        if (!updatedQuestion) {
            return res.status(404).json({
                success: false,
                error: 'Question not found'
            });
        }
        
        // Socket broadcast για real-time updates (Electron)
        io.emit('questionUpdated', {
            question: updatedQuestion,
            stats: questionsAPI.getQuestionStats(),
            source: 'electron_embedded'
        });
        
        res.json({
            success: true,
            question: updatedQuestion,
            source: 'electron_embedded'
        });
        
        console.log(`📝 [Electron] Question ${questionId} status updated to: ${status}`);
        
    } catch (error) {
        console.error('[Electron] Error updating question:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update question',
            source: 'electron_embedded'
        });
    }
});

//------------------------------------------------------//
/**
 * POST /api/questions/display
 * Προβολή ερώτησης στον timer (φόρτωση στο admin + προσομοίωση κλικ "Αποστολή")
 */
app.post('/api/questions/display', (req, res) => {
    try {
        console.log('🔥 DISPLAY ENDPOINT CALLED'); // DEBUG
        
        const { questionId } = req.body;
        console.log('📋 Question ID received:', questionId); // DEBUG
        
        const question = questionsAPI.getQuestions().find(q => q.id === questionId);
        
        if (!question) {
            console.log('❌ Question not found:', questionId); // DEBUG
            return res.status(404).json({ success: false, error: 'Question not found' });
        }

        console.log('✅ Question found:', question.submitter.name); // DEBUG

        // ΠΡΟΣΘΗΚΗ: Κρύψε όλες τις άλλες ερωτήσεις πρώτα
        questionsAPI.getQuestions().forEach(q => {
            if (q.isCurrentlyDisplayed && q.id !== questionId) {
                questionsAPI.updateQuestion(q.id, { isCurrentlyDisplayed: false });
            }
        });

        // Ενημέρωση της τρέχουσας ερώτησης ως displayed
        questionsAPI.updateQuestion(questionId, { 
            isCurrentlyDisplayed: true 
        });

        // Δημιουργία formatted κειμένου ερώτησης (χωρίς emoji για καθαρό format)
const questionText = `Ερώτηση από: ${question.submitter.name} (${question.submitter.company})
Ερώτηση προς: ${question.question.targetSpeaker}
Θέμα: ${question.question.subject}

${question.question.text}`;

        console.log('📤 About to emit loadQuestionAndSend event'); // DEBUG
        console.log('📤 Connected clients:', io.engine.clientsCount); // DEBUG

        // Φόρτωση στο admin textarea + προσομοίωση κλικ "Αποστολή"
        io.emit('loadQuestionAndSend', {
            message: questionText,
            questionId: questionId,
            source: 'questions_admin'
        });

        // ΠΡΟΣΘΗΚΗ: Άμεση αποστολή στο timer
        io.emit('displayQuestion', {
            question: question,
            questionId: questionId,
            source: 'questions_admin'
        });

        console.log('✅ Event emitted successfully - Question sent to both admin and timer'); // DEBUG

        // 🎯 AUTO-TIMER LOGIC: Ξεκίνησε auto-timer αν είναι ενεργοποιημένο
        if (timerState.autoTimer.enabled) {
            console.log(`⏱️ Auto-timer enabled - starting ${timerState.autoTimer.minutes} minute timer for question`);
            
            const success = startAutoTimer(timerState.autoTimer.minutes, 'question');
            
            if (success) {
                console.log('✅ Auto-timer started successfully');
                
                // Ενημέρωση admin panel για auto-timer
                io.emit('autoTimerTriggered', {
                    questionId: questionId,
                    minutes: timerState.autoTimer.minutes,
                    source: 'question',
                    timestamp: Date.now(),
                    message: `Auto-timer ξεκίνησε για ερώτηση (${timerState.autoTimer.minutes} λεπτά)`
                });
            } else {
                console.log('⚠️ Auto-timer start rejected due to priority conflict');
            }
        } else {
            console.log('ℹ️ Auto-timer disabled - no timer started');
        }

        res.json({ 
            success: true, 
            message: 'Question loaded to admin and sent automatically' 
        });
    } catch (error) {
        console.error('❌ Error displaying question:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

/**
 * POST /api/questions/hide
 * Απόκρυψη ερώτησης από τον timer (καθαρισμός μηνύματος)
 */
app.post('/api/questions/hide', (req, res) => {
    try {
        console.log('🙈 HIDE ENDPOINT CALLED'); // DEBUG
        
        const { questionId } = req.body;
        console.log('📋 Question ID to hide:', questionId); // DEBUG
        
        const question = questionsAPI.getQuestions().find(q => q.id === questionId);
        
        if (!question) {
            console.log('❌ Question not found:', questionId); // DEBUG
            return res.status(404).json({ success: false, error: 'Question not found' });
        }

        // Ενημέρωση isCurrentlyDisplayed
        questionsAPI.updateQuestion(questionId, { 
            isCurrentlyDisplayed: false 
        });

        // Καθαρισμός μηνύματος στον timer
        io.emit('messageUpdate', { message: '' });

        console.log('✅ Question hidden from timer'); // DEBUG

        res.json({ 
            success: true, 
            message: 'Question hidden from timer' 
        });
        
    } catch (error) {
        console.error('[Electron] Error hiding question:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to hide question'
        });
    }
});

/**
 * PUT /api/questions/:id/edit
 * Επεξεργασία στοιχείων ερώτησης
 */
app.put('/api/questions/:id/edit', (req, res) => {
    try {
        console.log('✏️ EDIT ENDPOINT CALLED'); // DEBUG
        
        const questionId = req.params.id;
        const { company, targetSpeaker, subject, text } = req.body;
        
        console.log('📋 Question ID to edit:', questionId); // DEBUG
        console.log('📝 New data:', { company, targetSpeaker, subject, text }); // DEBUG
        
        const question = questionsAPI.getQuestions().find(q => q.id === questionId);
        
        if (!question) {
            console.log('❌ Question not found:', questionId); // DEBUG
            return res.status(404).json({ success: false, error: 'Question not found' });
        }

        // Validation
        if (!targetSpeaker || !subject || !text) {
            return res.status(400).json({
                success: false,
                error: 'Όλα τα πεδία είναι υποχρεωτικά'
            });
        }

        // Ενημέρωση της ερώτησης
        const updates = {
            'question.targetSpeaker': targetSpeaker.trim(),
            'question.subject': subject.trim(),
            'question.text': text.trim()
        };
        
        // Προσθήκη company update αν υπάρχει
        if (company !== undefined) {
            updates['submitter.company'] = company.trim();
        }
        
        const updatedQuestion = questionsAPI.updateQuestion(questionId, updates);

        // Αν η ερώτηση δεν ενημερώθηκε με το παραπάνω τρόπο, δοκιμάζουμε άμεσα
        if (!updatedQuestion) {
            // Fallback: Άμεση ενημέρωση
            question.question.targetSpeaker = targetSpeaker.trim();
            question.question.subject = subject.trim();
            question.question.text = text.trim();
            if (company !== undefined) {
                question.submitter.company = company.trim();
            }
            question.updatedAt = new Date().toISOString();
        }

        console.log('✅ Question edited successfully'); // DEBUG

        // Socket broadcast για ενημέρωση άλλων admin panels
        io.emit('questionUpdated', {
            questionId: questionId,
            updatedQuestion: question,
            source: 'questions_admin'
        });

        res.json({ 
            success: true, 
            message: 'Η ερώτηση ενημερώθηκε επιτυχώς',
            question: question
        });
        
    } catch (error) {
        console.error('❌ Error editing question:', error);
        res.status(500).json({
            success: false,
            error: 'Σφάλμα κατά την επεξεργασία της ερώτησης'
        });
    }
});

/**
 * PUT /api/questions/:id/reject
 * Απόρριψη ερώτησης με λόγο
 */
app.put('/api/questions/:id/reject', (req, res) => {
    try {
        const questionId = req.params.id;
        const { rejectionReason } = req.body;
        
        console.log('❌ REJECT ENDPOINT CALLED:', questionId, 'Reason:', rejectionReason);
        
        const question = questionsAPI.getQuestions().find(q => q.id === questionId);
        
        if (!question) {
            return res.status(404).json({ 
                success: false, 
                error: 'Question not found' 
            });
        }

        // Ενημέρωση της ερώτησης
        const updatedQuestion = questionsAPI.updateQuestion(questionId, {
            status: 'rejected',
            rejectionReason: rejectionReason || 'Δεν δόθηκε λόγος'
        });

        console.log('✅ Question rejected successfully:', questionId);

        // Socket broadcast για ενημέρωση άλλων admin panels
        io.emit('questionUpdated', {
            questionId: questionId,
            updatedQuestion: updatedQuestion || question,
            stats: questionsAPI.getQuestionStats(),
            source: 'questions_admin'
        });

        res.json({ 
            success: true, 
            message: 'Η ερώτηση απορρίφθηκε επιτυχώς',
            question: updatedQuestion || question
        });
        
    } catch (error) {
        console.error('❌ Error rejecting question:', error);
        res.status(500).json({
            success: false,
            error: 'Σφάλμα κατά την απόρριψη της ερώτησης'
        });
    }
});

/**
 * GET /api/questions/company-lookup/:name
 * Smart company name lookup για autocomplete (Electron)
 */
app.get('/api/questions/company-lookup/:name', async (req, res) => {
    try {
        const companyName = req.params.name;
        console.log(`🔍 Company lookup request for: "${companyName}"`);
        
        if (!companyName || companyName.length < 2) {
            return res.json({
                success: true,
                suggestions: [],
                official: companyName,
                confidence: 0
            });
        }
        
        // Quick local lookup πρώτα
        const localResult = questionsAPI.normalizeCompanyName(companyName);
        console.log(`📍 Local normalization: "${companyName}" → "${localResult}"`);
        
        // Αν βρέθηκε στη local database, επίστρεψε το
        if (localResult !== companyName) {
            console.log(`✅ Local match found`);
            return res.json({
                success: true,
                official: localResult,
                suggestions: [localResult],
                confidence: 1.0,
                source: 'local'
            });
        }
        
        // TODO: Web lookup για unknown companies (μελλοντικά)
        // const webResult = await webLookupCompany(companyName);
        
        res.json({
            success: true,
            official: companyName,
            suggestions: [],
            confidence: 0,
            source: 'none'
        });
        
    } catch (error) {
        console.error('❌ Company lookup error:', error);
        res.status(500).json({
            success: false,
            error: 'Company lookup failed'
        });
    }
});


    // Timer functions
    function updateTimer() {
        if (timerState.isRunning) {
            timerState.timeLeft--;
            timerState.lastUpdate = Date.now();
            
            let status = 'normal';
            if (timerState.timeLeft <= timerState.warningThreshold && timerState.timeLeft > 0) {
                status = 'warning';
            } else if (timerState.timeLeft === 0) {
                status = 'danger';
                
                // ΔΙΟΡΘΩΣΗ: Στέλνουμε μήνυμα και flash ΜΟΝΟ την πρώτη φορά
                if (!timerState.flashSentForEnd) {
                    timerState.message = 'ΤΕΛΟΣ ΧΡΟΝΟΥ';
                    timerState.messageVisible = true;
                    timerState.flashSentForEnd = true; // Σημαδεύουμε ότι στάλθηκε
                    
                    io.emit('messageUpdate', {
                        message: timerState.message
                    });
                    
                    io.emit('messageVisibilityUpdate', {
                        visible: true
                    });
                    
                    io.emit('flashAlert', { 
                        active: true, 
                        isAutomatic: true 
                    });
                    
                    // Αυτόματο σταμάτημα του flash μετά από 5 δευτερόλεπτα
                    setTimeout(() => {
                        io.emit('flashAlert', { active: false });
                        console.log('⏹️ Αυτόματο flash σταμάτησε μετά από 5 δευτερόλεπτα');
                    }, 5000);
                    
                    console.log('✅ Server: Αυτόματο μήνυμα "ΤΕΛΟΣ ΧΡΟΝΟΥ" στάλθηκε (μία φορά)');
                }
                
            } else if (timerState.timeLeft < 0) {
                status = 'overtime';
            }
            
            io.emit('timerUpdate', {
                timeLeft: timerState.timeLeft,
                status: status,
                isRunning: timerState.isRunning
            });
            
            console.log(`Server Timer: ${timerState.timeLeft}s, Status: ${status}`);
        }
    }

    function startTimer() {
        if (!timerState.isRunning) {
            timerState.isRunning = true;
            timerState.lastUpdate = Date.now();
            
            if (timerInterval) {
                clearInterval(timerInterval);
            }
            
            timerInterval = setInterval(updateTimer, 1000);
            
            console.log('Timer started by server');
            
            io.emit('command', { 
                type: 'timer', 
                action: 'start',
                serverTime: Date.now()
            });
            
            updateTimer();
        }
    }

    // Auto-timer με priority system
    function startAutoTimer(minutes, source = 'question') {
        console.log(`⏱️ Starting auto-timer: ${minutes} minutes (source: ${source})`);
        
        // Priority check: μόνο question timers μπορούν να override άλλους timers
        if (timerState.autoTimer.priority !== 'none' && source !== 'question') {
            console.log(`⚠️ Auto-timer request rejected - priority conflict (current: ${timerState.autoTimer.priority}, requested: ${source})`);
            return false;
        }
        
        // Σταμάτησε προηγούμενο timer αν τρέχει
        if (timerState.isRunning) {
            pauseTimer();
            console.log('🛑 Previous timer stopped for auto-timer');
        }
        
        // Clear προηγούμενο auto-timer timeout
        if (timerState.autoTimer.timeoutId) {
            clearTimeout(timerState.autoTimer.timeoutId);
            timerState.autoTimer.timeoutId = null;
        }
        
        // Ενημέρωση state
        timerState.autoTimer.isActive = true;
        timerState.autoTimer.priority = source;
        
        // Set νέο χρόνο στο timer
        const totalSeconds = minutes * 60;
        timerState.timeLeft = totalSeconds;
        timerState.originalTime = totalSeconds;
        timerState.minutes = Math.floor(totalSeconds / 60);
        timerState.seconds = totalSeconds % 60;
        
        console.log(`⏱️ Auto-timer set to ${Math.floor(totalSeconds/60)}:${String(totalSeconds%60).padStart(2, '0')}`);
        
        // Άμεση ενημέρωση UI για νέο χρόνο (χωρίς start)
        io.emit('timerUpdate', {
            timeLeft: timerState.timeLeft,
            isRunning: false, // δεν ξεκινάει ακόμα
            status: getTimerStatus(),
            serverTime: Date.now(),
            autoTimer: {
                isActive: true,
                priority: source,
                willStartIn: 10 // 10 δευτερόλεπτα delay
            }
        });
        
        // 10-second delay πριν ξεκινήσει  
        timerState.autoTimer.timeoutId = setTimeout(() => {
            console.log('⏱️ 10-second delay completed - starting auto-timer');
            startTimer();
            
            // Ενημέρωση για auto-timer start
            io.emit('autoTimerStarted', {
                minutes: minutes,
                source: source,
                priority: timerState.autoTimer.priority,
                timestamp: Date.now()
            });
            
        }, 10000); // 10 δευτερόλεπτα
        
        return true;
    }

    // Ακύρωση auto-timer  
    function cancelAutoTimer(reason = 'manual') {
        console.log(`🚫 Canceling auto-timer (reason: ${reason})`);
        
        if (timerState.autoTimer.timeoutId) {
            clearTimeout(timerState.autoTimer.timeoutId);
            timerState.autoTimer.timeoutId = null;
        }
        
        timerState.autoTimer.isActive = false;
        timerState.autoTimer.priority = 'none';
        
        // Ενημέρωση clients
        io.emit('autoTimerCanceled', {
            reason: reason,
            timestamp: Date.now()
        });
    }

    function pauseTimer() {
        if (timerState.isRunning) {
            timerState.isRunning = false;
            
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            
            console.log('Timer paused by server');
            
            io.emit('command', { 
                type: 'timer', 
                action: 'pause',
                serverTime: Date.now()
            });
            
            io.emit('timerUpdate', {
                timeLeft: timerState.timeLeft,
                status: getTimerStatus(),
                isRunning: false
            });
        }
    }

    function resetTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        
        timerState.isRunning = false;
        timerState.timeLeft = timerState.originalTime;
        timerState.lastUpdate = Date.now();
        
        timerState.message = '';
        timerState.messageVisible = false;
        timerState.flashSentForEnd = false; // ΕΠΑΝΑΦΟΡΑ: Επιτρέπουμε νέο flash
        
        io.emit('messageUpdate', { message: '' });
        io.emit('messageVisibilityUpdate', { visible: false }); // ΔΙΟΡΘΩΣΗ: κρυφό
        io.emit('flashAlert', { active: false });
        
        // 🔧 FIX: Reset όλων των ερωτήσεων isCurrentlyDisplayed κατά το reset
        // Fix path για portable exe
    const questionsAPIPath = app.isPackaged 
        ? path.join(process.resourcesPath, 'app.asar.unpacked', 'questions-api')
        : './questions-api';
    const questionsAPI = require(questionsAPIPath);
        const questions = questionsAPI.getAllQuestions();
        questions.forEach(q => {
            q.isCurrentlyDisplayed = false;
        });
        console.log('🔄 RESET: All questions isCurrentlyDisplayed set to false');
        
        console.log('Timer reset by server to', timerState.originalTime, 'seconds');
        
        io.emit('command', { 
            type: 'timer', 
            action: 'reset',
            serverTime: Date.now()
        });
        
        io.emit('timerUpdate', {
            timeLeft: timerState.timeLeft,
            status: 'normal',
            isRunning: false
        });
    }

    function adjustTime(seconds) {
        const oldTime = timerState.timeLeft;
        timerState.timeLeft = Math.max(-999, timerState.timeLeft + seconds);
        timerState.lastUpdate = Date.now();
        
        if (oldTime <= 0 && timerState.timeLeft > 0) {
            console.log('Server: Επιπλέον χρόνος δόθηκε - καθαρισμός μηνύματος "ΤΕΛΟΣ ΧΡΟΝΟΥ"');
            timerState.message = '';
            timerState.messageVisible = false; // ΔΙΟΡΘΩΣΗ: κρυφό
            timerState.flashSentForEnd = false; // ΕΠΑΝΑΦΟΡΑ: Επιτρέπουμε νέο flash στο επόμενο τέλος
            
            io.emit('messageUpdate', { message: '' });
            io.emit('messageVisibilityUpdate', { visible: false }); // ΔΙΟΡΘΩΣΗ: κρυφό
            
            // 🔧 FIX: Reset όλων των ερωτήσεων isCurrentlyDisplayed όταν καθαρίζεται το μήνυμα
            // Fix path για portable exe
    const questionsAPIPath = app.isPackaged 
        ? path.join(process.resourcesPath, 'app.asar.unpacked', 'questions-api')
        : './questions-api';
    const questionsAPI = require(questionsAPIPath);
            const questions = questionsAPI.getAllQuestions();
            questions.forEach(q => {
                q.isCurrentlyDisplayed = false;
            });
            console.log('🔄 MESSAGE CLEAR: All questions isCurrentlyDisplayed set to false');
            
            io.emit('flashAlert', { active: false });
        }
        
        console.log(`Time adjusted by server: ${oldTime} -> ${timerState.timeLeft} (${seconds >= 0 ? '+' : ''}${seconds}s)`);
        
        io.emit('timerUpdate', {
            timeLeft: timerState.timeLeft,
            status: getTimerStatus(),
            isRunning: timerState.isRunning
        });
    }

    function getTimerStatus() {
        if (timerState.timeLeft < 0) return 'overtime';
        if (timerState.timeLeft === 0) return 'danger';
        if (timerState.timeLeft <= timerState.warningThreshold) return 'warning';
        return 'normal';
    }

    function getDeviceInfo(userAgent) {
        const ua = userAgent.toLowerCase();
        let deviceType = 'Unknown Device';
        let browser = 'Unknown Browser';
        
        if (ua.includes('mobile') || ua.includes('android')) deviceType = '📱 Mobile';
        else if (ua.includes('ipad')) deviceType = '📱 iPad';
        else if (ua.includes('iphone')) deviceType = '📱 iPhone';
        else if (ua.includes('tablet')) deviceType = '📱 Tablet';
        else deviceType = '💻 Desktop';
        
        if (ua.includes('chrome')) browser = 'Chrome';
        else if (ua.includes('firefox')) browser = 'Firefox';
        else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
        else if (ua.includes('edge')) browser = 'Edge';
        
        return { deviceType, browser };
    }

    function sendCurrentState(socket) {
        const currentState = {
            timeLeft: timerState.timeLeft,
            originalTime: timerState.originalTime,
            isRunning: timerState.isRunning,
            warningThreshold: timerState.warningThreshold,
            title: timerState.title,
            displaySettings: timerState.displaySettings,
            soundSettings: timerState.soundSettings,
            timelineSettings: timerState.timelineSettings,
            message: timerState.message,
            messageVisible: lastMessageVisibilityState,
            secondaryTimer: timerState.secondaryTimer,
            vmixSettings: timerState.vmixSettings,
            serverTime: Date.now()
        };
        
        // console.log('Sending full state to client:', socket.id, 'messageVisible:', lastMessageVisibilityState); // Disabled for performance
        socket.emit('fullStateUpdate', currentState);
    }


    // ------ STREAM DECK SLOTS MANAGEMENT ------
    let streamDeckSlots = ['', '', '', '', ''];

    app.get('/api/streamdeck-slots', (req, res) => {
        console.log('Stream Deck slots requested');
        res.json({ 
            slots: streamDeckSlots,
            timestamp: Date.now()
        });
    });

    app.post('/api/streamdeck-slots/update', express.json(), (req, res) => {
        const { slotIndex, message } = req.body;
        
        if (typeof slotIndex !== 'number' || slotIndex < 0 || slotIndex >= streamDeckSlots.length) {
            return res.status(400).json({ 
                error: 'Invalid slot index',
                validRange: `0-${streamDeckSlots.length - 1}`
            });
        }
        
        const oldMessage = streamDeckSlots[slotIndex];
        streamDeckSlots[slotIndex] = message || '';
        
        console.log(`Stream Deck Slot ${slotIndex + 1} updated: "${oldMessage}" -> "${streamDeckSlots[slotIndex]}"`);
        
        io.emit('streamDeckSlotsUpdate', {
            slotIndex: slotIndex,
            message: streamDeckSlots[slotIndex],
            allSlots: [...streamDeckSlots],
            timestamp: Date.now()
        });
        
        res.json({ 
            success: true,
            slotIndex: slotIndex,
            message: streamDeckSlots[slotIndex],
            allSlots: streamDeckSlots
        });
    });

    app.post('/api/streamdeck-slots/clear/:slotIndex', (req, res) => {
        const slotIndex = parseInt(req.params.slotIndex);
        
        if (slotIndex >= 0 && slotIndex < streamDeckSlots.length) {
            const oldMessage = streamDeckSlots[slotIndex];
            streamDeckSlots[slotIndex] = '';
            
            console.log(`Stream Deck Slot ${slotIndex + 1} cleared: "${oldMessage}"`);
            
            io.emit('streamDeckSlotsUpdate', {
                slotIndex: slotIndex,
                message: '',
                allSlots: [...streamDeckSlots],
                timestamp: Date.now()
            });
            
            res.json({ success: true, cleared: true });
        } else {
            res.status(400).json({ error: 'Invalid slot index' });
        }
    });

    // ------ SAVED MESSAGES MANAGEMENT ------
    let serverSavedMessages = [];

    app.get('/api/saved-messages', (req, res) => {
        console.log('Saved messages requested');
        res.json({ 
            messages: serverSavedMessages,
            count: serverSavedMessages.length,
            timestamp: Date.now()
        });
    });
    // Import and setup companion API
const createCompanionAPI = require('./companion-api');

// Import Yeelight server integration
const yeelightServer = require('./yeelight-server');

// Create server functions object for companion API
const serverFunctions = {
    startTimer: startTimer,
    pauseTimer: pauseTimer,  
    resetTimer: resetTimer,
    adjustTime: adjustTime,
    toggleHDMI: () => {
        io.emit('companionHDMIToggle');
        return { success: true, message: 'HDMI toggle command broadcasted' };
    }
};
// serverEventMarkers is now global - declared at top of file

// Setup Companion API routes
app.use('/api', createCompanionAPI(timerState, serverSavedMessages, serverEventMarkers, io, serverFunctions));

    // Setup Yeelight API routes
    yeelightServer.setupEndpoints(app);

    app.post('/api/saved-messages/add', express.json(), (req, res) => {
        const { message } = req.body;
        
        if (!message || message.trim() === '') {
            return res.status(400).json({ error: 'Message cannot be empty' });
        }
        
        // ΠΡΟΣΤΑΣΙΑ: Sanitization και όριο μεγέθους
        const sanitizedMessage = sanitizeInput(message);
        
        if (sanitizedMessage.length === 0) {
            return res.status(400).json({ error: 'Invalid message content' });
        }
        
        // ΠΡΟΣΤΑΣΙΑ: Όριο αριθμού μηνυμάτων
        if (serverSavedMessages.length >= MAX_SAVED_MESSAGES) {
            serverSavedMessages.shift();
            console.log('⚠️ Maximum messages reached, removed oldest message');
        }
        
        const messageObj = {
            id: `msg-${Date.now()}`,
            content: sanitizedMessage,
            timestamp: Date.now()
        };
        
        serverSavedMessages.push(messageObj);
        
        console.log(`Saved message added: "${messageObj.content}"`);
        
        io.emit('savedMessagesUpdate', {
            action: 'add',
            message: messageObj,
            allMessages: [...serverSavedMessages],
            timestamp: Date.now()
        });
        
        res.json({ 
            success: true, 
            message: messageObj,
            totalCount: serverSavedMessages.length
        });
    });

    app.post('/api/saved-messages/edit', express.json(), (req, res) => {
        const { id, newContent } = req.body;
        
        const messageIndex = serverSavedMessages.findIndex(msg => msg.id === id);
        
        if (messageIndex === -1) {
            return res.status(404).json({ error: 'Message not found' });
        }
        
        if (!newContent || newContent.trim() === '') {
            return res.status(400).json({ error: 'Message cannot be empty' });
        }
        
        // ΠΡΟΣΤΑΣΙΑ: Sanitization
        const sanitizedContent = sanitizeInput(newContent);
        
        if (sanitizedContent.length === 0) {
            return res.status(400).json({ error: 'Invalid message content' });
        }
        
        const oldContent = serverSavedMessages[messageIndex].content;
        serverSavedMessages[messageIndex].content = sanitizedContent;
        serverSavedMessages[messageIndex].timestamp = Date.now();
        
        console.log(`Saved message edited: "${oldContent}" -> "${sanitizedContent}"`);
        
        io.emit('savedMessagesUpdate', {
            action: 'edit',
            messageId: id,
            oldContent: oldContent,
            newContent: sanitizedContent,
            allMessages: [...serverSavedMessages],
            timestamp: Date.now()
        });
        
        res.json({ 
            success: true,
            message: serverSavedMessages[messageIndex]
        });
    });

    app.delete('/api/saved-messages/:id', (req, res) => {
        const { id } = req.params;
        
        const messageIndex = serverSavedMessages.findIndex(msg => msg.id === id);
        
        if (messageIndex === -1) {
            return res.status(404).json({ error: 'Message not found' });
        }
        
        const deletedMessage = serverSavedMessages.splice(messageIndex, 1)[0];
        
        console.log(`Saved message deleted: "${deletedMessage.content}"`);
        
        io.emit('savedMessagesUpdate', {
            action: 'delete',
            messageId: id,
            deletedContent: deletedMessage.content,
            allMessages: [...serverSavedMessages],
            timestamp: Date.now()
        });
        
        res.json({ 
            success: true,
            deleted: deletedMessage
        });
    });

    app.get('/api/messages', (req, res) => {
        console.log('Messages requested for Stream Deck compatibility');
        const messagesArray = serverSavedMessages.map(msg => msg.content);
        res.json({ 
            messages: messagesArray,
            count: messagesArray.length,
            timestamp: Date.now()
        });
    });

    

// ===== ΠΡΟΣΘΗΚΗ: ΠΛΗΡΗΣ EXCEL FUNCTIONALITY ΣΤΟ ELECTRON =====
        
        // Import Excel functionality
        const { startExcelMonitoring, refreshFromExcel, createSmartSampleExcel, setCurrentExcelFile } = require('./excel-markers');
        
        // Start Excel monitoring for Electron
        let excelMonitor = null;
        
        // Setup Excel monitoring after server arrays are ready
        setTimeout(() => {
            excelMonitor = startExcelMonitoring(serverEventMarkers, io, timerState);
            console.log('📊 Excel monitoring enabled for Electron mode');
        }, 1000);
        
        // Configure multer for Excel file uploads in Electron
        const multer = require('multer');
        const excelStorage = multer.diskStorage({
            destination: function (req, file, cb) {
                cb(null, __dirname);
            },
            filename: function (req, file, cb) {
                const timestamp = Date.now();
                const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
                cb(null, `imported_${timestamp}_${originalName}`);
            }
        });
        const uploadExcel = multer({ 
            storage: excelStorage,
            fileFilter: function (req, file, cb) {
                if (file.originalname.toLowerCase().endsWith('.xlsx') || 
                    file.originalname.toLowerCase().endsWith('.xls')) {
                    cb(null, true);
                } else {
                    cb(new Error('Μόνο Excel αρχεία επιτρέπονται'), false);
                }
            }
        });

        // Excel file upload endpoint for Electron
        app.post('/api/markers/import-excel', uploadExcel.single('excelFile'), (req, res) => {
            console.log('📊 Excel file upload request (Electron mode)');
            
            try {
                if (!req.file) {
                    return res.status(400).json({
                        success: false,
                        error: 'Δεν ελήφθη αρχείο Excel'
                    });
                }
                
                const filePath = req.file.path;
                console.log('📂 Excel file uploaded to:', filePath);
                
                if (excelMonitor && excelMonitor.setFile) {
                    excelMonitor.setFile(filePath);
                    refreshFromExcel();
                    
                    console.log('✅ Excel monitoring started for:', req.file.filename);
                    
                    res.json({
                        success: true,
                        filename: req.file.filename,
                        originalName: req.file.originalname,
                        filePath: filePath,
                        fileSize: req.file.size,
                        markersCount: serverEventMarkers.filter(m => m.id && m.id.startsWith('excel-marker-')).length,
                        message: `Αρχείο ${req.file.originalname} φορτώθηκε επιτυχώς`
                    });
                } else {
                    throw new Error('Excel monitoring system δεν είναι διαθέσιμο');
                }
                
            } catch (error) {
                console.error('❌ Excel upload error (Electron):', error);
                res.status(500).json({
                    success: false,
                    error: error.message || 'Σφάλμα κατά το upload του Excel αρχείου'
                });
            }
        });

        // Excel file path import for Electron
        app.post('/api/markers/import-excel-path', express.json(), (req, res) => {
            console.log('📂 Excel path import request (Electron mode)');
            
            const { filePath } = req.body;
            
            if (!filePath) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Δεν παρελήφθη διαδρομή αρχείου' 
                });
            }
            
            try {
                const fs = require('fs');
                
                if (!fs.existsSync(filePath)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Το αρχείο δεν βρέθηκε στη διαδρομή: ' + filePath
                    });
                }
                
                if (!filePath.toLowerCase().endsWith('.xlsx') && !filePath.toLowerCase().endsWith('.xls')) {
                    return res.status(400).json({
                        success: false,
                        error: 'Μόνο Excel αρχεία επιτρέπονται (.xlsx, .xls)'
                    });
                }
                
                console.log('📂 Excel file path received (Electron):', filePath);
                
                if (excelMonitor && excelMonitor.setFile) {
                    excelMonitor.setFile(filePath);
                    refreshFromExcel();
                    
                    console.log('✅ Excel monitoring switched to:', path.basename(filePath));
                    
                    const stats = fs.statSync(filePath);
                    
                    res.json({
                        success: true,
                        filename: path.basename(filePath),
                        filePath: filePath,
                        fileSize: stats.size,
                        markersCount: serverEventMarkers.filter(m => m.id && m.id.startsWith('excel-marker-')).length,
                        message: `Αρχείο ${path.basename(filePath)} φορτώθηκε και παρακολουθείται`
                    });
                    
                } else {
                    throw new Error('Excel monitoring system δεν είναι διαθέσιμο');
                }
                
            } catch (error) {
                console.error('❌ Excel path import error (Electron):', error);
                res.status(500).json({
                    success: false,
                    error: error.message || 'Σφάλμα κατά το import του Excel αρχείου'
                });
            }
        });

        // Excel status endpoint for Electron
        app.get('/api/markers/excel-status', (req, res) => {
            try {
                let currentFile = null;
                let exists = false;
                let lastModified = null;
                
                if (excelMonitor && excelMonitor.getCurrentFile) {
                    const currentFilePath = excelMonitor.getCurrentFile();
                    
                    if (currentFilePath) {
                        const fs = require('fs');
                        exists = fs.existsSync(currentFilePath);
                        
                        if (exists) {
                            const stats = fs.statSync(currentFilePath);
                            lastModified = stats.mtime.toISOString();
                        }
                        
                        currentFile = {
                            name: path.basename(currentFilePath),
                            path: currentFilePath,
                            exists: exists
                        };
                    }
                }
                
                res.json({
                    currentFile: currentFile,
                    excelFileExists: exists,
                    lastModified: lastModified,
                    monitoringActive: excelMonitor !== null,
                    excelMarkers: serverEventMarkers.filter(m => m.id && m.id.startsWith('excel-marker-')).length,
                    totalMarkers: serverEventMarkers.length,
                    mode: 'electron',
                    timestamp: Date.now()
                });
                
            } catch (error) {
                console.error('❌ Excel status error (Electron):', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Excel refresh endpoint for Electron
        app.post('/api/markers/refresh-excel', (req, res) => {
            try {
                let sourceFile = 'Άγνωστο αρχείο';
                
                if (excelMonitor && excelMonitor.getCurrentFile) {
                    const currentFilePath = excelMonitor.getCurrentFile();
                    if (currentFilePath) {
                        sourceFile = path.basename(currentFilePath);
                    } else {
                        return res.status(400).json({
                            success: false,
                            error: 'Δεν έχει φορτωθεί Excel αρχείο για ανανέωση'
                        });
                    }
                }
                
                refreshFromExcel();
                
                res.json({ 
                    success: true, 
                    markers: serverEventMarkers,
                    count: serverEventMarkers.filter(m => m.id && m.id.startsWith('excel-marker-')).length,
                    sourceFile: sourceFile,
                    mode: 'electron',
                    timestamp: Date.now()
                });
                
            } catch (error) {
                console.error('❌ Refresh error (Electron):', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Stop Excel monitoring endpoint for Electron
        app.post('/api/markers/stop-excel-monitoring', (req, res) => {
            console.log('🛑 Excel monitoring stop requested (Electron mode)');
            
            try {
                // Clear the current Excel file path
                setCurrentExcelFile(null);
                
                console.log('✅ Excel monitoring stopped and file path cleared (Electron)');
                res.json({ 
                    success: true, 
                    message: 'Excel monitoring stopped successfully' 
                });
            } catch (error) {
                console.error('❌ Error stopping Excel monitoring (Electron):', error);
                res.status(500).json({ 
                    success: false, 
                    error: error.message 
                });
            }
        });

        // API endpoint για smart sample creation - ΔΙΟΡΘΩΜΕΝΟΣ
        app.post('/api/markers/create-smart-sample', express.json(), (req, res) => {
            console.log('📊 Smart sample creation requested');
            
            const projectTitle = req.body.title || timerState.title || 'Timer';
            
            // ΠΡΟΣΘΗΚΗ: Εξασφάλιση ότι το global.timerState είναι updated
            if (!global.timerState) {
                global.timerState = timerState;
            } else {
                // Sync το global με το local timerState
                global.timerState.timelineSettings = timerState.timelineSettings;
                global.timerState.title = timerState.title;
            }
            
            console.log('📅 Current timeline for export:', timerState.timelineSettings);
            
            const result = createSmartSampleExcel(serverEventMarkers, projectTitle);
            
            if (result.success) {
                res.json({
                    success: true,
                    filename: result.filename,
                    path: result.path,
                    markersCount: result.markersCount,
                    timeline: {
                        startTime: timerState.timelineSettings?.startTime || '09:00',
                        endTime: timerState.timelineSettings?.endTime || '17:00'
                    },
                    message: `Δημιουργήθηκε: ${result.filename}`
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.error
                });
            }
        });

        // API endpoint για εξαγωγή τρέχουσας χρονοσειράς - ELECTRON VERSION
        app.post('/api/markers/export-current-timeline', express.json(), (req, res) => {
            console.log('📤 Export current timeline requested (Electron mode)');
            
            try {
                // Λήψη τρέχοντος τίτλου από το request body (UI) ή fallback στο timerState
                const currentTitle = req.body.title || timerState.title || 'Timer';
                console.log('📊 Current title:', currentTitle);
                console.log('📊 ServerEventMarkers count:', serverEventMarkers.length);
                
                // Εξασφάλιση ότι το global.timerState είναι updated
                if (!global.timerState) {
                    console.log('📊 Creating new global.timerState');
                    global.timerState = timerState;
                } else {
                    console.log('📊 Updating existing global.timerState');
                    // Sync το global με το local timerState
                    global.timerState.timelineSettings = timerState.timelineSettings;
                    global.timerState.title = timerState.title;
                }
                
                console.log('📊 About to call createSmartSampleExcel...');
                
                // Καλούμε την υπάρχουσα function από το excel-markers.js
                const result = createSmartSampleExcel(serverEventMarkers, currentTitle);
                
                console.log('📊 createSmartSampleExcel result:', result);
                
                if (result && result.success) {
                    console.log(`✅ Timeline exported (Electron): ${result.filename}`);
                    res.json({
                        success: true,
                        filename: result.filename,
                        path: result.path,
                        markersCount: result.markersCount
                    });
                } else {
                    console.error('❌ Export failed (Electron):', result ? result.error : 'Unknown error');
                    res.status(500).json({
                        success: false,
                        error: result ? result.error : 'Unknown error'
                    });
                }
            } catch (error) {
                console.error('❌ Export error (Electron):', error);
                console.error('❌ Error stack:', error.stack);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });        
        
        // ===== GOOGLE SHEETS FUNCTIONALITY =====
        
        // Initialize Google Sheets Monitor
        if (!googleSheetsMonitor) {
            googleSheetsMonitor = new GoogleSheetsMonitor();
            googleSheetsMonitor.init(serverEventMarkers, (eventType, data) => {
                // Broadcast updates via socket
                if (io) {
                    if (eventType === 'settings_update') {
                        io.emit('settingsUpdate', data);
                    } else {
                        io.emit('eventMarkersUpdate', data);
                    }
                }
            });
        }
        
        // Google Sheets connect endpoint  
        app.post('/api/google-sheets/connect', express.json(), (req, res) => {
            console.log('🔗 Google Sheets connect requested (Electron)');
            
            try {
                const { url } = req.body;
                
                if (!url || !url.includes('docs.google.com/spreadsheets')) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid Google Sheets URL'
                    });
                }
                
                googleSheetsMonitor.startMonitoring(url);
                
                res.json({
                    success: true,
                    message: 'Connected to Google Sheets',
                    url: url
                });
                
            } catch (error) {
                console.error('❌ Google Sheets connect error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // Google Sheets import endpoint (για αρχική φόρτωση)
        app.post('/api/google-sheets/import', express.json(), (req, res) => {
            console.log('📊 Google Sheets import requested (Electron)');
            
            try {
                const { url } = req.body;
                
                if (!url || !url.includes('docs.google.com/spreadsheets')) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid Google Sheets URL'
                    });
                }
                
                // Καλούμε το initialImport που κάνει το αρχικό import
                googleSheetsMonitor.initialImport(url)
                    .then(result => {
                        // Ενημέρωση timerState όπως στο server.js
                        if (result.timelineStart) {
                            timerState.timelineSettings.startTime = result.timelineStart;
                        }
                        if (result.timelineEnd) {
                            timerState.timelineSettings.endTime = result.timelineEnd;
                        }
                        if (result.projectTitle) {
                            timerState.title = result.projectTitle;
                        }
                        
                        res.json({
                            success: true,
                            message: 'Google Sheets imported successfully',
                            markersCount: serverEventMarkers.length,
                            timeline: {
                                startTime: result.timelineStart,
                                endTime: result.timelineEnd,
                                projectTitle: result.projectTitle
                            },
                            spreadsheetTitle: result.spreadsheetTitle
                        });
                    })
                    .catch(error => {
                        console.error('❌ Import error:', error);
                        res.status(500).json({
                            success: false,
                            error: error.message
                        });
                    });
                
            } catch (error) {
                console.error('❌ Google Sheets import error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // Google Sheets refresh endpoint
        app.post('/api/google-sheets/refresh', (req, res) => {
            console.log('🔄 Google Sheets refresh requested (Electron)');
            
            try {
                if (!googleSheetsMonitor.state.isActive) {
                    return res.status(400).json({
                        success: false,
                        error: 'No active Google Sheets connection'
                    });
                }
                
                googleSheetsMonitor.manualRefresh();
                
                res.json({
                    success: true,
                    message: 'Google Sheets refreshed'
                });
                
            } catch (error) {
                console.error('❌ Google Sheets refresh error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // Google Sheets disconnect endpoint
        app.post('/api/google-sheets/disconnect', (req, res) => {
            console.log('🔌 Google Sheets disconnect requested (Electron)');
            
            try {
                googleSheetsMonitor.stopMonitoring();
                
                res.json({
                    success: true,
                    message: 'Disconnected from Google Sheets'
                });
                
            } catch (error) {
                console.error('❌ Google Sheets disconnect error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // ===== ΤΕΛΟΣ GOOGLE SHEETS FUNCTIONALITY =====
        // ===== ΤΕΛΟΣ EXCEL FUNCTIONALITY =====

    // ------ CONFERENCE TITLE ENDPOINT ------
    app.get('/api/conference/title', (req, res) => {
        res.json({
            title: timerState.title || 'TimeCast® Pro Conference Timer',
            timestamp: Date.now()
        });
    });
    
    // ------ TIMELINE SETTINGS ENDPOINT ------
    let lastTimelineLogTime = 0;
    app.get('/api/conference/timeline', (req, res) => {
        const now = Date.now();
        // Rate limit timeline logs to every 10 seconds
        if (now - lastTimelineLogTime > 10000) {
            console.log('📅 Timeline API called - timelineSettings:', timerState.timelineSettings);
            lastTimelineLogTime = now;
        }

        const response = {
            startTime: timerState.timelineSettings?.startTime || '09:00',
            endTime: timerState.timelineSettings?.endTime || '17:00',
            title: timerState.title || 'TimeCast® Pro Conference Timer',
            timestamp: Date.now()
        };

        // Only log response occasionally too
        if (now - lastTimelineLogTime < 1000) {
            console.log('📅 Timeline API response:', response);
        }
        res.json(response);
    });

    // ------ AUTO-TIMER SETTINGS ENDPOINTS ------
    app.get('/api/auto-timer/settings', (req, res) => {
        console.log('⏱️ Auto-timer settings requested');
        res.json({
            enabled: timerState.autoTimer.enabled,
            minutes: timerState.autoTimer.minutes,
            isActive: timerState.autoTimer.isActive,
            priority: timerState.autoTimer.priority,
            timestamp: Date.now()
        });
    });

    app.post('/api/auto-timer/settings', (req, res) => {
        console.log('⏱️ Auto-timer settings update received:', req.body);
        
        try {
            const { enabled, minutes } = req.body;
            
            // Validation
            if (enabled !== undefined && typeof enabled === 'boolean') {
                timerState.autoTimer.enabled = enabled;
            }
            
            if (minutes !== undefined) {
                const validMinutes = Math.max(1, Math.min(30, parseInt(minutes)));
                timerState.autoTimer.minutes = validMinutes;
            }
            
            console.log('⏱️ Auto-timer settings updated:', timerState.autoTimer);
            
            res.json({
                success: true,
                settings: {
                    enabled: timerState.autoTimer.enabled,
                    minutes: timerState.autoTimer.minutes,
                    isActive: timerState.autoTimer.isActive,
                    priority: timerState.autoTimer.priority
                }
            });
        } catch (error) {
            console.error('❌ Auto-timer settings update error:', error);
            res.status(400).json({
                success: false,
                error: 'Invalid settings data'
            });
        }
    });

    // ------ EVENT MARKERS MANAGEMENT ------
        app.get('/api/event-markers', (req, res) => {
        console.log('Event markers requested');
        res.json({ 
            markers: serverEventMarkers,
            count: serverEventMarkers.length,
            timestamp: Date.now()
        });
    });

// Marker endpoints αφαιρέθηκαν - χρησιμοποιούμε τα server.js endpoints

    app.post('/api/event-markers/add', express.json(), (req, res) => {
        const { time, title, type, note } = req.body;
        
        if (!title || title.trim() === '') {
            return res.status(400).json({ error: 'Title cannot be empty' });
        }
        
        if (!time || time.trim() === '') {
            return res.status(400).json({ error: 'Time cannot be empty' });
        }
        
        const markerObj = {
            id: `marker-${Date.now()}`,
            time: time.trim(),
            title: title.trim(),
            note: note ? note.trim() : '',
            type: type || null,
            timestamp: Date.now()
        };
        
        serverEventMarkers.push(markerObj);
        
        console.log(`Event marker added: "${markerObj.title}" at ${markerObj.time} (absolute time)`);
        
        io.emit('eventMarkersUpdate', {
            action: 'add',
            marker: markerObj,
            allMarkers: [...serverEventMarkers],
            timestamp: Date.now()
        });
        
        res.json({ 
            success: true, 
            marker: markerObj,
            totalCount: serverEventMarkers.length
        });
    });

    app.delete('/api/event-markers/:id', (req, res) => {
        const { id } = req.params;
        
        const markerIndex = serverEventMarkers.findIndex(marker => marker.id === id);
        
        if (markerIndex === -1) {
            return res.status(404).json({ error: 'Marker not found' });
        }
        
        const deletedMarker = serverEventMarkers.splice(markerIndex, 1)[0];
        
        console.log(`Event marker deleted: "${deletedMarker.title}"`);
        
        io.emit('eventMarkersUpdate', {
            action: 'delete',
            markerId: id,
            deletedMarker: deletedMarker,
            allMarkers: [...serverEventMarkers],
            timestamp: Date.now()
        });
        
        res.json({ 
            success: true,
            deleted: deletedMarker
        });
    });

    app.post('/api/event-markers/edit', express.json(), (req, res) => {
    const { id, newTitle, newTime, newNote, newType, percentage } = req.body;
        
        const markerIndex = serverEventMarkers.findIndex(marker => marker.id === id);
        
        if (markerIndex === -1) {
            return res.status(404).json({ error: 'Marker not found' });
        }
        
        if (!newTitle || newTitle.trim() === '') {
            return res.status(400).json({ error: 'Title cannot be empty' });
        }
        
        const oldTitle = serverEventMarkers[markerIndex].title;
        serverEventMarkers[markerIndex].title = newTitle.trim();
        serverEventMarkers[markerIndex].timestamp = Date.now();
        
        if (newTime !== undefined) {
            serverEventMarkers[markerIndex].time = newTime;
        }
        
        if (newNote !== undefined) {
            serverEventMarkers[markerIndex].note = newNote.trim();
        }
        
        if (percentage !== undefined) {
            serverEventMarkers[markerIndex].percentage = percentage;
        }
        if (newType !== undefined) {
            serverEventMarkers[markerIndex].type = newType;
}
        
        console.log(`Event marker edited: "${oldTitle}" -> "${newTitle}"`);
        
        io.emit('eventMarkersUpdate', {
            action: 'edit',
            markerId: id,
            oldTitle: oldTitle,
            newTitle: newTitle.trim(),
            allMarkers: [...serverEventMarkers],
            timestamp: Date.now()
        });
        
        res.json({ 
            success: true,
            marker: serverEventMarkers[markerIndex]
        });
    });

    // API endpoint για full reset στα default settings
    app.post('/api/reset-to-defaults', (req, res) => {
        console.log('=== FULL RESET TO DEFAULTS REQUESTED ===');
        
        try {
            timerState.timeLeft = DEFAULT_SETTINGS.timer.timeLeft;
            timerState.originalTime = DEFAULT_SETTINGS.timer.originalTime;
            timerState.warningThreshold = DEFAULT_SETTINGS.timer.warningThreshold;
            timerState.isRunning = false;
            
            timerState.title = DEFAULT_SETTINGS.display.title;
            timerState.displaySettings = { ...DEFAULT_SETTINGS.display };
            timerState.soundSettings = { ...DEFAULT_SETTINGS.sound };
            timerState.timelineSettings = { ...DEFAULT_SETTINGS.timeline };
            
            timerState.message = DEFAULT_SETTINGS.message;
            timerState.messageVisible = DEFAULT_SETTINGS.messageVisible;
            
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            
            console.log('Server state reset to defaults');
            
            io.emit('fullStateUpdate', {
                timeLeft: timerState.timeLeft,
                originalTime: timerState.originalTime,
                isRunning: timerState.isRunning,
                warningThreshold: timerState.warningThreshold,
                title: timerState.title,
                displaySettings: timerState.displaySettings,
                soundSettings: timerState.soundSettings,
                timelineSettings: timerState.timelineSettings,
                message: timerState.message,
                messageVisible: timerState.messageVisible,
                serverTime: Date.now()
            });
            
            console.log('Default state broadcast to all clients');
            
            res.json({ 
                success: true, 
                message: 'All settings reset to defaults',
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('Error resetting to defaults:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to reset to defaults' 
            });
        }
    });
// Google Sheets import endpoint με Auto-Monitoring
app.post('/api/import-google-sheets', express.json(), async (req, res) => {
    const { sheetsUrl } = req.body;
    
    console.log('📊 Google Sheets import με Auto-Monitoring requested (Electron)');
    
    try {
        const result = await googleSheetsMonitor.initialImport(sheetsUrl);
        
        // Update Electron timerState
        timerState.timelineSettings.startTime = result.timelineStart;
        timerState.timelineSettings.endTime = result.timelineEnd;
        timerState.title = result.projectTitle;
        
        res.json({
            success: true,
            markersCount: result.loadedCount,
            timeline: {
                startTime: result.timelineStart,
                endTime: result.timelineEnd
            },
            projectTitle: result.projectTitle,
            sourceUrl: sheetsUrl,
            autoMonitoring: true,
            message: `Google Sheets εισήχθη με ${result.loadedCount} markers. Αυτόματη παρακολούθηση ενεργή (Electron).`
        });
        
    } catch (error) {
        console.error('❌ Google Sheets import error (Electron):', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =================== COMPANION API ENDPOINTS ===================
// Load saved message endpoints for Companion buttons
app.post('/api/message/load-saved/1', (req, res) => {
    if (savedMessages.length >= 1) {
        timerState.currentTextareaContent = savedMessages[0].content; // ΠΡΟΣΘΗΚΗ: για companion feedback
        timerState.message = savedMessages[0].content;
        timerState.messageVisible = false; // ΔΙΟΡΘΩΣΗ: Μόνο load, όχι show
        io.emit('messageUpdate', { message: timerState.message, visible: false });
        io.emit('textareaContentUpdate', { content: timerState.currentTextareaContent }); // ΠΡΟΣΘΗΚΗ
        res.json({ success: true, message: savedMessages[0].content, loadedToTextarea: true });
    } else {
        res.json({ success: false, error: 'No message in slot 1' });
    }
});

app.post('/api/message/load-saved/2', (req, res) => {
    if (savedMessages.length >= 2) {
        timerState.currentTextareaContent = savedMessages[1].content; // ΠΡΟΣΘΗΚΗ: για companion feedback
        timerState.message = savedMessages[1].content;
        timerState.messageVisible = false; // ΔΙΟΡΘΩΣΗ: Μόνο load, όχι show
        io.emit('messageUpdate', { message: timerState.message, visible: false });
        io.emit('textareaContentUpdate', { content: timerState.currentTextareaContent }); // ΠΡΟΣΘΗΚΗ
        res.json({ success: true, message: savedMessages[1].content, loadedToTextarea: true });
    } else {
        res.json({ success: false, error: 'No message in slot 2' });
    }
});

app.post('/api/message/load-saved/3', (req, res) => {
    if (savedMessages.length >= 3) {
        timerState.currentTextareaContent = savedMessages[2].content; // ΠΡΟΣΘΗΚΗ: για companion feedback
        timerState.message = savedMessages[2].content;
        timerState.messageVisible = false; // ΔΙΟΡΘΩΣΗ: Μόνο load, όχι show
        io.emit('messageUpdate', { message: timerState.message, visible: false });
        io.emit('textareaContentUpdate', { content: timerState.currentTextareaContent }); // ΠΡΟΣΘΗΚΗ
        res.json({ success: true, message: savedMessages[2].content, loadedToTextarea: true });
    } else {
        res.json({ success: false, error: 'No message in slot 3' });
    }
});

app.post('/api/message/load-saved/4', (req, res) => {
    if (savedMessages.length >= 4) {
        timerState.currentTextareaContent = savedMessages[3].content; // ΠΡΟΣΘΗΚΗ: για companion feedback
        timerState.message = savedMessages[3].content;
        timerState.messageVisible = false; // ΔΙΟΡΘΩΣΗ: Μόνο load, όχι show
        io.emit('messageUpdate', { message: timerState.message, visible: false });
        io.emit('textareaContentUpdate', { content: timerState.currentTextareaContent }); // ΠΡΟΣΘΗΚΗ
        res.json({ success: true, message: savedMessages[3].content, loadedToTextarea: true });
    } else {
        res.json({ success: false, error: 'No message in slot 4' });
    }
});

// Network info endpoint για QR code generation
app.get('/api/network-info', (req, res) => {
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    let networkIP = null;
    let networkURL = null;
    
    // Find the first non-internal IPv4 address
    for (const name of Object.keys(networkInterfaces)) {
        for (const net of networkInterfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                networkIP = net.address;
                networkURL = `http://${net.address}:3000`;
                break;
            }
        }
        if (networkIP) break;
    }
    
    res.json({
        networkIP: networkIP,
        networkURL: networkURL,
        localhost: 'http://localhost:3000',
        success: true
    });
});


app.post('/api/message/load-saved/5', (req, res) => {
    if (savedMessages.length >= 5) {
        timerState.currentTextareaContent = savedMessages[4].content; // ΠΡΟΣΘΗΚΗ: για companion feedback
        timerState.message = savedMessages[4].content;
        timerState.messageVisible = false; // ΔΙΟΡΘΩΣΗ: Μόνο load, όχι show
        io.emit('messageUpdate', { message: timerState.message, visible: false });
        io.emit('textareaContentUpdate', { content: timerState.currentTextareaContent }); // ΠΡΟΣΘΗΚΗ
        res.json({ success: true, message: savedMessages[4].content, loadedToTextarea: true });
    } else {
        res.json({ success: false, error: 'No message in slot 5' });
    }
});

app.post('/api/message/load-saved/6', (req, res) => {
    if (savedMessages.length >= 6) {
        timerState.currentTextareaContent = savedMessages[5].content; // ΠΡΟΣΘΗΚΗ: για companion feedback
        timerState.message = savedMessages[5].content;
        timerState.messageVisible = false; // ΔΙΟΡΘΩΣΗ: Μόνο load, όχι show
        io.emit('messageUpdate', { message: timerState.message, visible: false });
        io.emit('textareaContentUpdate', { content: timerState.currentTextareaContent }); // ΠΡΟΣΘΗΚΗ
        res.json({ success: true, message: savedMessages[5].content, loadedToTextarea: true });
    } else {
        res.json({ success: false, error: 'No message in slot 6' });
    }
});

    // Διαχείριση συνδέσεων Socket.IO
    io.on('connection', (socket) => {
        const clientIP = socket.handshake.address?.replace('::ffff:', '') || 'unknown';

        const isLocalIP = clientIP.startsWith('192.168.') || 
                          clientIP.startsWith('10.') || 
                          clientIP === '127.0.0.1' || 
                          clientIP === 'unknown';

        if (!isLocalIP) {
            const currentConnections = connectionLimiter.get(clientIP) || 0;
            
            if (currentConnections >= CONNECTION_LIMIT) {
                console.log(`🚫 Connection limit reached for IP: ${clientIP}`);
                socket.disconnect();
                return;
            }
            
            connectionLimiter.set(clientIP, currentConnections + 1);
        }

        const clientInfo = {
            id: socket.id,
            connectedAt: new Date().toLocaleString('el-GR'),
            userAgent: socket.handshake.headers['user-agent'] || 'Unknown',
            ip: socket.handshake.address || 'Unknown'
        };
        
        const deviceInfo = getDeviceInfo(clientInfo.userAgent);
        clientInfo.deviceType = deviceInfo.deviceType;
        clientInfo.browser = deviceInfo.browser;
        clientInfo.role = 'Unknown';

        function isLocalConnection(socket) {
            const clientIP = socket.handshake.address || 
                            socket.request.connection.remoteAddress || 
                            socket.conn.remoteAddress || 
                            'Unknown';
            
            clientInfo.cleanIP = clientIP.replace('::ffff:', '');

            const localAddresses = [
                '127.0.0.1',
                '::1',
                '::ffff:127.0.0.1',
                'localhost'
            ];

            // Only log remote connections to reduce console spam
            if (!localAddresses.includes(clientInfo.cleanIP) && clientInfo.cleanIP !== 'undefined') {
                // Get referer URL to identify which page is connecting
                const referer = socket.handshake.headers.referer || socket.handshake.headers.origin || 'Unknown';
                const pageName = referer.split('/').pop() || referer;
                const userAgent = socket.handshake.headers['user-agent'] || '';
                const browser = userAgent.includes('Chrome') ? 'Chrome' :
                               userAgent.includes('Firefox') ? 'Firefox' :
                               userAgent.includes('Safari') ? 'Safari' :
                               userAgent.includes('Edge') ? 'Edge' : 'Browser';

                console.log(`🌐 Remote client connected from IP: ${clientInfo.cleanIP} → ${pageName} (${browser})`);
            }
            
            const interfaces = os.networkInterfaces();
            const serverIPs = [];
            Object.keys(interfaces).forEach(name => {
                interfaces[name].forEach(interface => {
                    if (interface.family === 'IPv4' && !interface.internal) {
                        serverIPs.push(interface.address);
                    }
                });
            });
            
            const isLocal = localAddresses.includes(clientIP) || 
                           serverIPs.includes(clientIP) ||
                           clientIP === undefined;
            
            // Only log remote connection checks to reduce console spam
            if (!isLocal) {
                console.log('🌐 Remote connection detected:', isLocal, 'for IP:', clientIP);
            }
            return isLocal;
        }

        clientInfo.isServerPC = isLocalConnection(socket);

        if (clientInfo.isServerPC) {
            clientInfo.computerName = os.hostname();
            // console.log('Server PC hostname:', clientInfo.computerName); // Disabled for performance
        }
        
        socket.emit('confirmation', {
            message: 'Συνδεθήκατε με επιτυχία στον server',
            socketId: socket.id,
            serverTime: Date.now()
        });
        
        io.emit('clientsCount', io.engine.clientsCount);
        
        // ΔΕΝ στέλνουμε questionsClientsCount εδώ γιατί clientType δεν έχει οριστεί ακόμα
        // Το μέτρημα γίνεται στο registerClient event
        
       // ΑΠΛΗ IP DETECTION - χωρίς πολύπλοκες λειτουργίες
       function getClientIP(socket) {
           const ip = socket.handshake.address?.replace('::ffff:', '') || 'Unknown';
           return ip === '127.0.0.1' ? 'localhost' : ip;
       }
       
       // ΑΠΛΗ COMPUTER NAME DETECTION
       function getComputerName(socket, isServerPC = false, clientHostname = null) {
           // Αν έχουμε hostname από το client, το χρησιμοποιούμε
           if (clientHostname && clientHostname.trim() && clientHostname !== 'Timer-Display') {
               return clientHostname.trim();
           }
           
           if (isServerPC) {
               return os.hostname();
           }
           
           const userAgent = socket.handshake.headers['user-agent'] || '';
           const ip = getClientIP(socket);
           
           // Απλή detection χωρίς regex
           if (userAgent.includes('iPad')) return 'iPad';
           if (userAgent.includes('iPhone')) return 'iPhone';
           if (userAgent.includes('Android')) return 'Android Device';
           if (userAgent.includes('Windows')) return ip !== 'Unknown' ? `PC ${ip}` : 'Windows PC';
           if (userAgent.includes('Mac')) return `Mac`;
           if (userAgent.includes('Linux')) return `Linux PC`;
           
           return ip !== 'Unknown' ? `Device (${ip})` : 'Unknown Device';
       }

       // Rate limiting για client registration logs
       const registrationLogHistory = new Map();
       const countRequestLogHistory = new Map();

       socket.on('registerClient', (data) => {
            const now = Date.now();
            const lastLogged = registrationLogHistory.get(socket.id);

            // Only log if this socket hasn't been logged in the last 5 seconds
            if (!lastLogged || now - lastLogged > 5000) {
                // Enhanced logging με page URL
                const referer = socket.handshake.headers.referer || 'Unknown';
                const pageName = referer.split('/').pop() || 'Unknown';
                const clientIP = socket.handshake.address?.replace('::ffff:', '') || 'Unknown';

                console.log(`📋 Client καταχωρήθηκε: ${socket.id} → Type: ${data.type}, Role: ${data.role}, Page: ${pageName}, IP: ${clientIP}`);
                registrationLogHistory.set(socket.id, now);
            }
            socket.data.clientType = data.type;
            socket.data.clientInfo = data;
            
            // Get device info - ΜΟΝΟ μία φορά
            const deviceIP = getClientIP(socket);
            const isServerPC = isLocalConnection(socket) && data.type === 'admin';
            const computerName = getComputerName(socket, isServerPC, data.hostname);
            
            let deviceRole = 'Unknown';
if (isServerPC) {
    deviceRole = '🖥️ Server PC (Admin)';
} else {
    // ΧΡΗΣΗ SWITCH STATEMENT ΓΙΑ ΟΛΟΥΣ ΤΟΥΣ ΤΥΠΟΥΣ
    switch(data.type) {
        case 'admin':
            deviceRole = '👤 Remote Admin';
            break;
        case 'viewer':
        case 'timer':
            deviceRole = '📺 Timer Display';
            break;
        case 'questions-client':
            deviceRole = '📝 Questions Client';
            break;
        case 'questions-admin':
            deviceRole = '📋 Questions Admin';
            break;
        default:
            deviceRole = '❓ Unknown';
    }
}
            
            // Store info in socket data για επαναχρησιμοποίηση
            socket.data.deviceInfo = {
                ip: deviceIP,
                computerName: computerName,
                role: deviceRole,
                isServerPC: isServerPC
            };
            
            // Collect devices - χρησιμοποιώντας cached info (εξαιρώντας εσωτερικά components)
            const connectedDevices = [];
            io.sockets.sockets.forEach((connectedSocket) => {
                if (connectedSocket.connected && (connectedSocket.data.deviceInfo || connectedSocket.id === socket.id)) {
                    // Αποκρύπτουμε εσωτερικά components της Electron app
                    const clientType = connectedSocket.data.clientType;
                    if (clientType === 'lcd-client') {
                        return; // Skip lcd-client από τη λίστα
                    }

                    const info = connectedSocket.data.deviceInfo || {
                        ip: deviceIP,
                        computerName: computerName,
                        role: deviceRole,
                        isServerPC: isServerPC
                    };

                    connectedDevices.push({
                        id: connectedSocket.id,
                        role: info.role,
                        computerName: info.computerName,
                        ipAddress: info.ip,
                        deviceType: getDeviceInfo(connectedSocket.handshake.headers['user-agent'] || '').deviceType,
                        browser: getDeviceInfo(connectedSocket.handshake.headers['user-agent'] || '').browser,
                        connectedAt: new Date().toLocaleString('el-GR'),
                        isServerPC: info.isServerPC
                    });
                }
            });
            
            // Send device list
            io.emit('connectedDevicesList', connectedDevices);
            sendCurrentState(socket);
            
            // ΚΡΙΣΙΜΗ ΔΙΟΡΘΩΣΗ: Μέτρημα questions clients ΜΕΤΑ το register
            const questionsClientsCount = Array.from(io.sockets.sockets.values())
                .filter(s => s.data.clientType === 'questions-client').length;
            io.emit('questionsClientsCount', questionsClientsCount);
            // Rate limit Questions clients count logs (only log if count changes significantly)
            const prevCount = socket.data.lastLoggedQuestionsCount || 0;
            if (Math.abs(questionsClientsCount - prevCount) >= 1 && questionsClientsCount <= 5) {
                console.log('📊 [REGISTER] Questions clients count after registration:', questionsClientsCount);
                socket.data.lastLoggedQuestionsCount = questionsClientsCount;
            }
        });
       
       // Update hostname event
       socket.on('updateHostname', (data) => {
           console.log('🔄 Updating hostname for client:', socket.id, 'to:', data.hostname);
           
           // Ενημέρωση του clientInfo και deviceInfo
           if (data.hostname && data.hostname.trim() && socket.data.clientInfo && socket.data.deviceInfo) {
               socket.data.clientInfo.hostname = data.hostname.trim();
               
               // Ενημέρωση του cached deviceInfo
               const deviceIP = getClientIP(socket);
               const isServerPC = isLocalConnection(socket) && socket.data.clientType === 'admin';
               const computerName = getComputerName(socket, isServerPC, data.hostname.trim());
               
               socket.data.deviceInfo.computerName = computerName;
               
               console.log('✅ Hostname updated to:', data.hostname.trim());
               
               // Στέλνουμε ενημερωμένη λίστα χρησιμοποιώντας τα cached data
               const connectedDevices = [];
               io.sockets.sockets.forEach((connectedSocket) => {
                   if (connectedSocket.connected && connectedSocket.data.deviceInfo) {
                       const info = connectedSocket.data.deviceInfo;
                       connectedDevices.push({
                           id: connectedSocket.id,
                           role: info.role,
                           computerName: info.computerName,
                           ipAddress: info.ip,
                           deviceType: getDeviceInfo(connectedSocket.handshake.headers['user-agent'] || '').deviceType,
                           browser: getDeviceInfo(connectedSocket.handshake.headers['user-agent'] || '').browser,
                           connectedAt: new Date().toLocaleString('el-GR'),
                           isServerPC: info.isServerPC
                       });
                   }
               });
               io.emit('connectedDevicesList', connectedDevices);
           }
       });
       
       socket.on('disconnect', () => {
           console.log('Αποσύνδεση:', socket.id);
           
           const connectedDevices = [];
           io.sockets.sockets.forEach((connectedSocket) => {
               if (connectedSocket.connected && connectedSocket.data.clientInfo && connectedSocket.id !== socket.id) {
                   // Αποκρύπτουμε εσωτερικά components της Electron app
                   const clientType = connectedSocket.data.clientType;
                   if (clientType === 'lcd-client') {
                       return; // Skip lcd-client από τη λίστα
                   }
                   const info = {
                       id: connectedSocket.id,
                       role: (() => {
                           if (isLocalConnection(connectedSocket) && connectedSocket.data.clientType === 'admin') {
                               return '🖥️ Server PC (Admin)';
                           }
                           // ΠΡΟΣΘΗΚΗ: Πλήρης υποστήριξη client types
const clientType = connectedSocket.data.clientType;
// Βρείτε το ίδιο switch statement στο main.js και προσθέστε:
switch(clientType) {
    case 'admin': return '👤 Admin';
    case 'timer': return '📺 Timer Display';
    case 'questions-client': return '📝 Questions Client';
    case 'questions-admin': return '📋 Questions Admin';  // ← ΠΡΟΣΘΗΚΗ
    default: return '❓ Unknown';
}
                       })(),
                       deviceType: getDeviceInfo(connectedSocket.handshake.headers['user-agent'] || '').deviceType,
                       browser: getDeviceInfo(connectedSocket.handshake.headers['user-agent'] || '').browser,
                       connectedAt: new Date().toLocaleString('el-GR'),
                       isServerPC: isLocalConnection(connectedSocket) && connectedSocket.data.clientType === 'admin'
                   };
                   connectedDevices.push(info);
               }
           });
           
           io.emit('connectedDevicesList', connectedDevices);
           io.emit('clientsCount', io.engine.clientsCount);
        
        // Send questions clients count separately
        const questionsClientsCount = Array.from(io.sockets.sockets.values())
            .filter(s => s.data.clientType === 'questions-client').length;
        io.emit('questionsClientsCount', questionsClientsCount);
        console.log('📊 [DISCONNECT] Questions clients count after disconnect:', questionsClientsCount);
       });
       
       // Handler για αίτημα τρέχοντων counts
       socket.on('requestCurrentCounts', () => {
           const now = Date.now();
           const lastCountRequest = countRequestLogHistory.get(socket.id) || 0;

           // Rate limiting για count request logs (5-second window)
           if (now - lastCountRequest > 5000) {
               console.log('📊 Client requested current counts:', socket.id);
               countRequestLogHistory.set(socket.id, now);
           }

           // Send current questions clients count
           const questionsClientsCount = Array.from(io.sockets.sockets.values())
               .filter(s => s.data.clientType === 'questions-client').length;

           socket.emit('questionsClientsCount', questionsClientsCount);
           socket.emit('clientsCount', io.engine.clientsCount);

           // Rate limiting για count response logs (5-second window)
           if (now - lastCountRequest > 5000) {
               console.log('📊 Sent counts - Questions clients:', questionsClientsCount, 'Total clients:', io.engine.clientsCount);
           }
       });
       
       socket.on('command', (data) => {
           console.log('Εντολή ελήφθη από client:', socket.id, data);
           
           if (data.type === 'timer') {
               switch (data.action) {
                   case 'start':
                       startTimer();
                       break;
                   case 'pause':
                       pauseTimer();
                       break;
                   case 'reset':
                       resetTimer();
                       break;
               }
           }
       });
       
       socket.on('adjustTime', (data) => {
           console.log('Προσαρμογή χρόνου ελήφθη από admin:', socket.id, data);
           
           if (data.seconds !== undefined) {
               adjustTime(data.seconds);
           }
       });
       
       socket.on('messageUpdate', (data) => {
           console.log('Ενημέρωση μηνύματος ελήφθη:', data);
           
           if (data.message !== undefined) {
               timerState.message = data.message;
           }
           
           // Μετάδοση του μηνύματος σε ΌΛΟΥΣ τους clients (συμπεριλαμβανομένου του sender)
           io.emit('messageUpdate', data);
       });
       
       socket.on('messageVisibilityUpdate', (data) => {
           console.log('Ενημέρωση ορατότητας μηνύματος ελήφθη:', data);
           
           timerState.messageVisible = data.visible;
           lastMessageVisibilityState = data.visible;
           
           // 🔄 ΠΡΟΣΘΗΚΗ: Αν το μήνυμα έγινε κρυφό, ενημέρωσε ερωτήσεις ως μη displayed
           if (!data.visible) {
               console.log('👁️ Message hidden - updating questions state to not displayed');
               
               // Χρησιμοποίησε το questions API αν είναι διαθέσιμο
               if (typeof questionsAPI !== 'undefined' && questionsAPI.getAllQuestions) {
                   const allQuestions = questionsAPI.getAllQuestions();
                   allQuestions.forEach(question => {
                       if (question.isCurrentlyDisplayed) {
                           question.isCurrentlyDisplayed = false;
                           console.log(`🔄 Question ${question.id} marked as not displayed`);
                       }
                   });
               }
           }
           
           io.emit('messageVisibilityUpdate', data);
       });
       // ΝΕΟ EVENT: Tracking textarea content
socket.on('textareaContentChanged', (data) => {
    timerState.currentTextareaContent = data.content || '';
    console.log(`Textarea content updated: "${timerState.currentTextareaContent}"`);
    
    // Ενημέρωση όλων των clients για το νέο περιεχόμενο textarea
    io.emit('textareaContentUpdate', { content: timerState.currentTextareaContent });
});
       
       socket.on('settingsUpdate', (data) => {
           console.log('Ενημέρωση ρυθμίσεων ελήφθη:', data);
           // ΠΡΟΣΘΗΚΗ: Χειρισμός Excel imports
if (data.source === 'excel_import' && data.display && data.display.title) {
    timerState.title = data.display.title;
    console.log('📊 Electron: Title updated from Excel import:', data.display.title);
}
           if (data.timer) {
               if (data.timer.timeLeft !== undefined) {
                   timerState.timeLeft = data.timer.timeLeft;
                   console.log('Server: Timer time set to', timerState.timeLeft);
               }
               if (data.timer.originalTime !== undefined) {
                   timerState.originalTime = data.timer.originalTime;
                   console.log('Server: Original time set to', timerState.originalTime);
               }
               if (data.timer.warningThreshold !== undefined) {
                   timerState.warningThreshold = data.timer.warningThreshold;
               }
           }
           
           if (data.display) {
               console.log('🎨 SERVER: Received display settings:', data.display);
               
               if (data.display.title !== undefined) {
                   console.log('📝 SERVER: Title changing from "' + timerState.title + '" to "' + data.display.title + '"');
                   timerState.title = data.display.title;
               }
               if (data.display.titleFontSize !== undefined) {
                   console.log('📏 SERVER: TitleFontSize changing from', timerState.displaySettings.titleFontSize, 'to', data.display.titleFontSize);
                   timerState.displaySettings.titleFontSize = data.display.titleFontSize;
               }
               if (data.display.logoDataUrl !== undefined) timerState.displaySettings.logoDataUrl = data.display.logoDataUrl;
               if (data.display.logoSize !== undefined) timerState.displaySettings.logoSize = data.display.logoSize;
               if (data.display.logoPositions !== undefined) timerState.displaySettings.logoPositions = data.display.logoPositions;
               if (data.display.backgroundColor !== undefined) timerState.displaySettings.backgroundColor = data.display.backgroundColor;
               if (data.display.timerFontFamily !== undefined) timerState.displaySettings.timerFontFamily = data.display.timerFontFamily;
           }
           
           if (data.sound) {
               if (data.sound.enabled !== undefined) timerState.soundSettings.enabled = data.sound.enabled;
               if (data.sound.volume !== undefined) timerState.soundSettings.volume = data.sound.volume;
           }

           if (data.timeline) {
               console.log('📅 Updating timeline settings from Socket.IO:', data.timeline);
               if (data.timeline.startTime !== undefined) {
                   timerState.timelineSettings.startTime = data.timeline.startTime;
                   console.log('✅ Updated startTime to:', data.timeline.startTime);
               }
               if (data.timeline.endTime !== undefined) {
                   timerState.timelineSettings.endTime = data.timeline.endTime;
                   console.log('✅ Updated endTime to:', data.timeline.endTime);
               }
               console.log('📅 Current timerState.timelineSettings:', timerState.timelineSettings);
           }
           
           // Broadcast to ALL clients (timer displays AND other admin panels)
           io.sockets.sockets.forEach((connectedSocket) => {
               // Ελέγχουμε αν το socket είναι ακόμα συνδεδεμένο και ΔΕΝ είναι ο sender
               if (connectedSocket.connected && connectedSocket.id !== socket.id) {
                   connectedSocket.emit('settingsUpdate', data);
                   // console.log('Server: settingsUpdate sent to client:', connectedSocket.id); // Disabled for performance
               }
           });
           
           if (data.timer && (data.timer.timeLeft !== undefined || data.timer.originalTime !== undefined)) {
               io.emit('timerUpdate', {
                   timeLeft: timerState.timeLeft,
                   status: getTimerStatus(),
                   isRunning: timerState.isRunning
               });
           }
       });
       
       // 🔥 CRITICAL: timerUpdate handler για session continuity  
       socket.on('timerUpdate', (data) => {
           console.log('⏰ Server: timerUpdate received:', data);
           
           if (data.totalTime !== undefined) {
               timerState.timeLeft = data.timeLeft || data.totalTime;
               timerState.originalTime = data.originalTime || data.totalTime;
               console.log(`⏰ Server: Timer restored - timeLeft: ${timerState.timeLeft}s, originalTime: ${timerState.originalTime}s`);
           }
           
           if (data.timerRunning !== undefined) {
               timerState.isRunning = data.timerRunning;
               console.log(`⏸️ Server: Timer running state: ${timerState.isRunning}`);
           }
           
           // Broadcast to all clients
           io.emit('timerUpdate', {
               timeLeft: timerState.timeLeft,
               originalTime: timerState.originalTime,
               status: getTimerStatus(),
               isRunning: timerState.isRunning
           });
       });
       
       // Flash Alert handling - DISABLED to prevent infinite loop
       socket.on('flashAlert', (data) => {
           console.log('Flash alert received:', data);
           
           // Safety timeout για flash - μέγιστο 10 δευτερόλεπτα
           if (data.active && !timerState.flashTimeout) {
               timerState.flashTimeout = setTimeout(() => {
                   console.log('⚠️ Flash timeout - auto stopping');
                   io.emit('flashAlert', { active: false });
                   timerState.flashTimeout = null;
               }, 10000); // 10 δευτερόλεπτα maximum
           } else if (!data.active && timerState.flashTimeout) {
               clearTimeout(timerState.flashTimeout);
               timerState.flashTimeout = null;
           }
           
           // Μετάδοση σε ΌΛΟΥΣ τους clients (συμπεριλαμβανομένου του sender)
           io.emit('flashAlert', data);
       });

       // Clock Mode Update handling
       socket.on('clockModeUpdate', (data) => {
           console.log('🕐 Clock mode update received:', data);
           
           // Ενημέρωση του server state
           if (data.clockMode !== undefined) {
               timerState.clockMode = data.clockMode;
           }
           
           // Μετάδοση του clock mode σε όλους τους timer clients
           io.emit('clockModeUpdate', {
               clockMode: timerState.clockMode
           });
       });

       // vMix Settings Update handling
       socket.on('vmixSettingsUpdate', (data) => {
           console.log('📹 vMix settings update received:', data);
           
           // Ενημέρωση του server state
           if (data.enabled !== undefined) timerState.vmixSettings.enabled = data.enabled;
           if (data.host) timerState.vmixSettings.host = data.host;
           if (data.port) timerState.vmixSettings.port = data.port;
           if (data.manualTimerInput !== undefined) timerState.vmixSettings.manualTimerInput = data.manualTimerInput;
           
           // Apply manual timer input setting to vMix API
           if (vmixAPI && data.manualTimerInput !== undefined) {
               vmixAPI.setManualTimerInput(data.manualTimerInput);
               console.log(`🎯 Manual timer input set: "${data.manualTimerInput || 'Auto-detect'}"`);
           }
           
           // Μετάδοση των vMix settings σε όλους τους clients (συμπεριλαμβανομένων των timer displays)
           io.emit('vmixSettingsUpdate', data);
       });

       // Production-grade vMix connection management (Electron)
       socket.on('applyVmixConnection', async (config) => {
           console.log('📡 [Electron] Applying vMix connection:', config);
           
           try {
               // Stop current monitoring
               if (vmixAPI) {
                   vmixAPI.stopMonitoring();
                   vmixAPI.destroy();
                   console.log('⏹️ [Electron] Stopped current vMix monitoring');
                   
                   // Wait 500ms for cleanup to complete
                   await new Promise(resolve => setTimeout(resolve, 500));
               }
               
               // Create new vMix API with new host/port
               const VmixAPI = require('./vmix-api');
               vmixAPI = new VmixAPI(config.host, config.port);
               
               // Set up callbacks using the centralized function
               setupVmixCallbacks(vmixAPI);
               
               // Set manual timer input if provided
               if (config.manualTimerInput) {
                   vmixAPI.setManualTimerInput(config.manualTimerInput);
                   console.log(`🎯 [Electron] Manual timer input set: "${config.manualTimerInput}"`);
               } else {
                   vmixAPI.setManualTimerInput(null); // Clear manual selection, use auto-detect
                   console.log(`🔍 [Electron] Manual timer input cleared - using auto-detect`);
               }
               
               // Start monitoring
               const connected = await vmixAPI.testConnection();
               if (connected) {
                   vmixAPI.startMonitoring(1000);
                   console.log(`✅ [Electron] vMix monitoring started: ${config.host}:${config.port}`);
                   
                   // Restart tally monitoring with new connection
                   console.log('🚨 [Electron] Restarting tally monitoring with new vMix connection...');
                   io.emit('restartTallyMonitoring');
                   
               } else {
                   console.log(`❌ [Electron] Failed to connect to vMix: ${config.host}:${config.port}`);
               }
               
           } catch (error) {
               console.error('[Electron] vMix connection error:', error);
           }
       });

       // Tally Monitoring Events
       socket.on('setTimerInputKeys', (keys) => {
           // console.log('🚨 Setting timer input keys:', keys); // Reduced spam
           if (vmixAPI) {
               vmixAPI.setTimerInputKeys(keys);
           }
       });

       socket.on('startTallyMonitoring', async () => {
           // console.log('🚨 Starting tally monitoring...'); // Reduced spam
           if (vmixAPI) {
               // Try to reconnect if not connected
               if (!vmixAPI.isConnected) {
                   console.log('🔄 vMix not connected, attempting reconnection...');
                   await vmixAPI.testConnection();
               }
               
               // Initialize tally state if not exists
               vmixAPI.currentTallyState = {
                   timerInputOnProgram: false,
                   timerInputOnPreview: false,
                   currentProgramInput: null,
                   currentPreviewInput: null
               };
               
               // Set up tally callback
               vmixAPI.onTallyChange((tallyState) => {
                   console.log('🚨 [SERVER] Broadcasting tally state to all clients:', tallyState);
                   io.emit('tallyStateUpdate', tallyState);
                   console.log(`📡 [SERVER] Sent tallyStateUpdate to ${io.sockets.sockets.size} connected clients`);
               });
               
               // Start monitoring
               vmixAPI.startTallyMonitoring(1000); // Check every 1 second for faster updates
               
               // Send connection status
               io.emit('vmixConnectionStatus', { connected: vmixAPI.isConnected });
           } else {
               console.log('❌ vMix API not initialized');
               io.emit('vmixConnectionStatus', { connected: false });
           }
       });

       socket.on('stopTallyMonitoring', () => {
           console.log('🚨 Stopping tally monitoring...');
           if (vmixAPI) {
               vmixAPI.stopTallyMonitoring();
           }
       });

       // NEW: Request immediate tally status update
       socket.on('requestTallyStatus', async () => {
           console.log('📤 [SERVER] Immediate tally status requested');
           if (vmixAPI && vmixAPI.isConnected) {
               try {
                   // Force immediate tally check
                   await vmixAPI.checkTallyStatus();
                   console.log('✅ [SERVER] Immediate tally status check completed');
               } catch (error) {
                   console.log('❌ [SERVER] Immediate tally status check failed:', error.message);
               }
           } else {
               console.log('❌ [SERVER] vMix API not connected for immediate tally request');
           }
       });
       
       socket.on('requestFullState', (data) => {
           // console.log('Full state requested by:', socket.id); // Disabled for performance

           // 🔄 SERVER RESTART SYNC: Check if client has a running timer
           if (data && data.currentTimerState && data.currentTimerState.isRunning) {
               const clientState = data.currentTimerState;

               console.log('🔄 Client has running timer:', clientState);

               // Update server state with client's timer (client is source of truth)
               timerState.timeLeft = clientState.timeLeft;
               timerState.originalTime = clientState.originalTime;
               timerState.isRunning = clientState.isRunning;

               // Start server countdown interval
               if (!timerInterval) {
                   timerState.lastUpdate = Date.now();
                   timerInterval = setInterval(updateTimer, 1000);
                   console.log('🚀 Server countdown started from client state');
               }
           }

           sendCurrentState(socket);
       });
       socket.on('textareaContentUpdate', (data) => {
    timerState.currentTextareaContent = data.content || '';
    console.log('Textarea content updated:', data.content);
});
// === ΠΡΟΣΘΗΚΗ: Timeline sync event στον embedded server ===
socket.on('timelineSync', (data) => {
    console.log('📅 Embedded Server - Timeline sync received:', data);
    
    // Ενημέρωση timerState timeline settings
    console.log('📅 Timeline sync event received:', data);
    if (timerState.timelineSettings) {
        timerState.timelineSettings.startTime = data.startTime;
        timerState.timelineSettings.endTime = data.endTime;
        console.log('✅ Timeline sync updated:', timerState.timelineSettings);
    } else {
        console.warn('⚠️ timerState.timelineSettings is null/undefined!');
    }
    
    // Broadcast σε όλους τους άλλους clients
    socket.broadcast.emit('timelineUpdate', {
        startTime: data.startTime,
        endTime: data.endTime
    });
    
    // console.log('📡 Embedded Server - Timeline broadcast sent to all clients'); // Disabled for performance
});
// === ΠΡΟΣΘΗΚΗ: Title sync event στον embedded server ===
socket.on('titleSync', (data) => {
    console.log('📝 Embedded Server - Title sync received:', data);
    
    // Ενημέρωση timerState title
    if (timerState.title !== undefined) {
        timerState.title = data.title;
    }
    
    // Broadcast σε όλους τους άλλους clients
    socket.broadcast.emit('titleUpdate', {
        title: data.title
    });
    
    // console.log('📡 Embedded Server - Title broadcast sent to all clients'); // Disabled for performance
});
// Logo sync event
socket.on('logoSync', (data) => {
    console.log('🖼️ Logo sync received:', data);
    
    // Ενημέρωση server state
    if (timerState.displaySettings) {
        if (data.logoDataUrl !== undefined) timerState.displaySettings.logoDataUrl = data.logoDataUrl;
        if (data.logoSize !== undefined) timerState.displaySettings.logoSize = data.logoSize;
        if (data.logoPositions !== undefined) timerState.displaySettings.logoPositions = data.logoPositions;
    }
    
    // Broadcast σε άλλα admin panels
    socket.broadcast.emit('logoUpdate', data);
    console.log('📡 Logo broadcast sent');
});
// Background color sync event
socket.on('backgroundColorSync', (data) => {
    console.log('🎨 Background color sync received:', data);
    
    // Ενημέρωση server state
    if (timerState.displaySettings) {
        timerState.displaySettings.backgroundColor = data.backgroundColor;
    }
    
    // Broadcast σε άλλα admin panels
    socket.broadcast.emit('backgroundColorUpdate', data);
    console.log('📡 Background color broadcast sent');
});
// ΠΡΟΣΘΗΚΗ: Socket handler για fullResetToDefaults
socket.on('fullResetToDefaults', () => {
    console.log('=== SOCKET: FULL RESET TO DEFAULTS (Electron) ===');
    
    try {
        // Reset του timerState στα defaults
        timerState.timeLeft = DEFAULT_SETTINGS.timer.timeLeft;
        timerState.originalTime = DEFAULT_SETTINGS.timer.originalTime;
        timerState.warningThreshold = DEFAULT_SETTINGS.timer.warningThreshold;
        timerState.isRunning = false;
        
        timerState.title = DEFAULT_SETTINGS.display.title;
        timerState.displaySettings = { ...DEFAULT_SETTINGS.display };
        timerState.soundSettings = { ...DEFAULT_SETTINGS.sound };
        timerState.timelineSettings = { ...DEFAULT_SETTINGS.timeline };
        
        timerState.message = DEFAULT_SETTINGS.message;
        timerState.messageVisible = DEFAULT_SETTINGS.messageVisible;
        
        // Σταμάτημα του timer αν τρέχει
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        
        console.log('Electron Socket: Server state reset to defaults');
        
        // Αποστολή της νέας κατάστασης σε όλους τους clients
        io.emit('fullStateUpdate', {
            timeLeft: timerState.timeLeft,
            originalTime: timerState.originalTime,
            isRunning: timerState.isRunning,
            warningThreshold: timerState.warningThreshold,
            title: timerState.title,
            displaySettings: timerState.displaySettings,
            soundSettings: timerState.soundSettings,
            timelineSettings: timerState.timelineSettings,
            message: timerState.message,
            messageVisible: timerState.messageVisible,
            serverTime: Date.now()
        });
        
        console.log('Electron Socket: Default state broadcast to all clients');
        
    } catch (error) {
        console.error('Electron Socket: Error resetting to defaults:', error);
    }
});
// =============================================================================
    // Questions-specific events (ELECTRON)
    // =============================================================================
    
    socket.on('requestQuestionsList', () => {
        const questions = questionsAPI.getQuestions();
        const stats = questionsAPI.getQuestionStats();
        
        socket.emit('questionsListUpdate', {
            questions: questions,
            stats: stats,
            source: 'electron_embedded'
        });
    });
    
    socket.on('requestSpeakersList', () => {
        const speakers = questionsAPI.extractSpeakersFromTimeline(timerState.eventMarkers || []);
        socket.emit('speakersListUpdate', {
            speakers: ['Γενική Ερώτηση (Όλοι)', ...speakers],
            source: 'electron_embedded'
        });
    });
    
    // Question management events (Electron)
    socket.on('questionAction', (data) => {
        const { action, questionId, updates } = data;
        
        console.log(`📝 [Electron] Question action: ${action} for ${questionId}`);
        
        switch (action) {
            case 'approve':
                questionsAPI.updateQuestion(questionId, { status: 'approved' });
                break;
            case 'reject':
                questionsAPI.updateQuestion(questionId, { status: 'rejected' });
                break;
            case 'setPriority':
                questionsAPI.updateQuestion(questionId, { priority: updates.priority });
                break;
            case 'markAddressed':
                questionsAPI.updateQuestion(questionId, { 
                    status: 'addressed',
                    isCurrentlyDisplayed: false
                });
                break;
        }
        
        // Broadcast updates
        const updatedStats = questionsAPI.getQuestionStats();
        io.emit('questionStatsUpdate', {
            stats: updatedStats,
            source: 'electron_embedded'
        });
    });
    
    // Sync με timeline updates
    socket.on('timelineUpdated', (data) => {
        console.log('📝 [Electron] Timeline updated - speakers may have changed');
        
        // Αποστολή ενημερωμένης λίστας ομιλητών
        const speakers = questionsAPI.extractSpeakersFromTimeline(data.eventMarkers || []);
        io.emit('speakersListUpdate', {
            speakers: ['Γενική Ερώτηση (Όλοι)', ...speakers],
            source: 'electron_embedded',
            trigger: 'timeline_update'
        });
    });

    // Language change broadcast to remote admin pages
    socket.on('languageChange', (data) => {
        console.log('📡 Broadcasting language change to all clients:', data.language);
        // Broadcast to all OTHER clients (not the sender)
        socket.broadcast.emit('languageChange', data);
    });


}); // ← ΕΔΩ ΚΛΕΙΝΕΙ το io.on('connection')
    
    
   // Εκκίνηση server
   server.listen(PORT, '0.0.0.0', () => {
       console.log(`🚀 Conference Timer Server running on port ${PORT}`);
       console.log(`📅 Server started at: ${new Date().toLocaleString('el-GR')}`);
       
       const interfaces = os.networkInterfaces();
       console.log('\n📡 Available network addresses:');
       console.log(`   Local: http://localhost:${PORT}`);
       
       Object.keys(interfaces).forEach(name => {
           interfaces[name].forEach(interface => {
               if (interface.family === 'IPv4' && !interface.internal) {
                   console.log(`   Network: http://${interface.address}:${PORT}`);
               }
           });
       });
       
       console.log('\n🎯 Admin Panel: /admin.html');
       console.log('📺 Timer Display: /timer.html');
       console.log('\n✅ Server is ready for connections!\n');
   }).on('error', (err) => {
       if (err.code === 'EADDRINUSE') {
           console.error(`❌ Port ${PORT} is already in use!`);
           console.log('💡 Try closing other instances or restart your computer');
       } else {
           console.error('❌ Server error:', err);
       }
   });

   // Store server reference
   serverProcess = server;
   
   // Save PID for zombie cleanup
   const fs = require('fs');
   const pidFile = path.join(__dirname, 'server-pid.txt');
   try {
       fs.writeFileSync(pidFile, process.pid.toString());
       console.log('📝 Server PID saved:', process.pid);
   } catch (error) {
       console.log('Warning: Could not save PID file:', error.message);
   }
   
   // Setup Questions API routes αν φορτώθηκε επιτυχώς
   if (questionsAPI) {
       try {
           // Ορισμός των timer functions που χρειάζεται το Questions API
           const timerFunctions = {
               startAutoTimer: startAutoTimer,
               cancelAutoTimer: cancelAutoTimer,
               timerState: timerState
           };
           questionsAPI.setupRoutes(app, io, serverEventMarkers, timerFunctions);
           console.log('✅ Questions API routes setup complete');
       } catch (error) {
           console.error('❌ Failed to setup Questions API routes:', error.message);
       }
   }

   console.log('✅ FULL embedded server started with ALL functionality');
   return { server, port: PORT };
}

// Create splash screen
function createSplashWindow() {
    splashWindow = new BrowserWindow({
        width: 400,
        height: 500,
        frame: false,
        alwaysOnTop: true,
        transparent: true,
        resizable: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    splashWindow.loadFile('splash.html');
    
    // Center splash window
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const x = Math.round((width - 400) / 2);
    const y = Math.round((height - 500) / 2);
    splashWindow.setPosition(x, y);

    splashWindow.on('closed', () => {
        splashWindow = null;
    });

    console.log('🎨 Splash screen created');
    
    // Auto-close splash after 10 seconds as failsafe
    setTimeout(() => {
        if (splashWindow) {
            console.log('⏰ Splash screen timeout - auto-closing');
            splashWindow.close();
        }
    }, 10000);
}

async function createWindow() {
    // Show splash screen first
    createSplashWindow();

        // === DEBUG LOGGING ===
    // console.log('=== CREATEWINDOW DEBUG START ==='); // Disabled for performance
    // console.log('__dirname:', __dirname); // Disabled for performance
    // console.log('process.resourcesPath:', process.resourcesPath || 'undefined'); // Disabled for performance
    // console.log('app.isPackaged:', app.isPackaged); // Disabled for performance
    console.log('app.getAppPath():', app.getAppPath());
    console.log('process.cwd():', process.cwd());
    
    // Έλεγχος αν υπάρχουν τα αρχεία
    const fs = require('fs');
    const adminPath1 = path.join(__dirname, 'admin.html');
    const adminPath2 = process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'admin.html') : 'N/A';
    const serverPath1 = path.join(__dirname, 'server.js');
    
    // console.log('=== FILE EXISTENCE CHECK ==='); // Disabled for performance
    //console.log('adminPath1:', adminPath1, '- exists:', fs.existsSync(adminPath1));
    //console.log('adminPath2:', adminPath2, '- exists:', adminPath2 !== 'N/A' ? fs.existsSync(adminPath2) : 'N/A');
    console.log('serverPath1:', serverPath1, '- exists:', fs.existsSync(serverPath1));
    // console.log('=== DEBUG END ==='); // Disabled for performance
    
    // Start server first με error handling
    console.log('🚀 About to start embedded server...');
    try {
        const serverInfo = await startEmbeddedServer();
        serverProcess = serverInfo.server;
        console.log('✅ Embedded server started successfully');
    } catch (error) {
        console.error('❌ CRITICAL: Failed to start embedded server:', error);
        console.error('Stack trace:', error.stack);
        
        // Show error dialog and exit gracefully
        const { dialog } = require('electron');
        dialog.showErrorBox(
            'Server Startup Error', 
            `Failed to start embedded server:\n${error.message}\n\nApplication will exit.`
        );
        app.quit();
        return;
    }
    
    // Create window
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    enableRemoteModule: false,
    webSecurity: true,
    preload: path.join(__dirname, 'preload.js'),
    // ✨ ΚΡΙΤΙΚΕΣ ΠΡΟΣΘΗΚΕΣ ΓΙΑ INPUT STABILITY:
    backgroundThrottling: false,
    offscreen: false,
    spellcheck: false,
    autoplayPolicy: 'no-user-gesture-required',
    allowRunningInsecureContent: false,
    experimentalFeatures: true,
    sandbox: false,
    webgl: false,
    plugins: false
},
        show: false,
        
        title: 'TimeCast® Pro Conference Timer - Admin Panel',
// ✨ ΠΡΟΣΘΗΚΗ ΓΙΑ INPUT STABILITY:
acceptFirstMouse: true,
disableAutoHideCursor: true,
focusable: true,
skipTaskbar: false,
thickFrame: true
    });

    // Load app after server startup delay
    setTimeout(() => {
        const adminURL = `http://localhost:3000/admin.html`;
        // console.log('=== QUICK DEBUG ==='); // Disabled for performance
        // console.log('__dirname:', __dirname); // Disabled for performance
        // console.log('app.isPackaged:', app.isPackaged); // Disabled for performance
        console.log('=== END DEBUG ===');
        console.log('🖥️ Loading admin at:', adminURL);
        mainWindow.loadURL(adminURL).catch(err => {
            console.error('Failed to load URL:', err);
            // Retry after 2 more seconds
            setTimeout(() => {
                mainWindow.loadURL(adminURL);
            }, 2000);
        });
        
        // Close splash screen when main window is ready
        mainWindow.once('ready-to-show', () => {
            if (splashWindow) {
                splashWindow.close();
            }
            mainWindow.show();
            console.log('🎭 Splash screen closed, main window shown');
        });
    }, 4000);

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        require('electron').shell.openExternal(url);
        return { action: 'deny' };
    });
// ELECTRON FOCUS FIX για inputs
    mainWindow.on('blur', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
                    mainWindow.webContents.focus();
                }
            }, 100);
        }
    });
    
    mainWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
                mainWindow.webContents.focus();
            }
        }, 100);
    }
});
    
    // Επιπλέον fix για alerts και confirms
mainWindow.webContents.on('did-finish-load', () => {
    // Απλό focus fix χωρίς override
    mainWindow.focus();
    // Reset reload flag after successful load
    if (global.isReloading) {
        console.log('🔄 Reload completed, resetting flag');
        global.isReloading = false;
    }
    
    // Restore Always on Top setting from localStorage
    mainWindow.webContents.executeJavaScript(`
        const alwaysOnTop = localStorage.getItem('alwaysOnTop') === 'true';
        if (alwaysOnTop) {
            console.log('🔝 Restoring Always on Top setting: enabled');
        }
        alwaysOnTop; // Return value to main process
    `).then((shouldBeOnTop) => {
        if (shouldBeOnTop) {
            mainWindow.setAlwaysOnTop(true);
            // Update menu item to reflect the restored state
            const menu = Menu.getApplicationMenu();
            const viewMenu = menu.items.find(item => item.label === 'Προβολή');
            if (viewMenu) {
                const alwaysOnTopItem = viewMenu.submenu.items.find(item => item.label === 'Πάντα στην Κορυφή');
                if (alwaysOnTopItem) {
                    alwaysOnTopItem.checked = true;
                }
            }
            console.log('🔝 Always on Top restored: enabled');
        }
    }).catch(err => {
        console.log('⚠️ Could not restore Always on Top setting:', err.message);
    });
});
// Δημιουργία Application Menu με saved γλώσσα
    loadSavedLanguage(); // Load saved language first
    createApplicationMenu();

    // Handle window close event with confirmation
    mainWindow.on('close', async (event) => {
        // Check if this is a reload - allow without confirmation
        if (global.isReloading) {
            console.log('🔄 Reload in progress, allowing close...');
            return;
        }
        
        // Check if shutdown already confirmed
        if (isShuttingDown) {
            console.log('⏳ Shutdown already in progress, allowing close...');
            return;
        }
        
        // Prevent multiple dialogs
        if (isShowingExitDialog) {
            console.log('⚠️ Exit dialog already showing, ignoring close event');
            event.preventDefault();
            return;
        }
        
        // Prevent immediate close for user-initiated exit (X button)
        event.preventDefault();
        isShowingExitDialog = true;
        
        try {
            // Use custom exit dialog instead of native dialog
            const result = await showCustomExitDialog();
            isShowingExitDialog = false;
            
            // If user confirmed exit, proceed with shutdown
            if (result) {
                console.log('✅ User confirmed shutdown via window close');
                await performCleanShutdown();
            } else {
                console.log('👤 User cancelled shutdown via window close');
            }
        } catch (error) {
            console.error('❌ Error showing close confirmation dialog:', error);
            isShowingExitDialog = false;
            // If dialog fails, proceed with close
            await performCleanShutdown();
        }
    });

    // Clean up on close
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}


function createTimerWindow() {
    console.log('=== TIMER WINDOW CREATION DEBUG ===');
    
    try {
        const displays = screen.getAllDisplays();
        console.log('Total displays found:', displays.length);
        
        if (!displays || displays.length === 0) {
            console.log('❌ Δεν βρέθηκαν οθόνες');
            return false;
        }
        
        // ΕΚΤΥΠΩΣΗ ΛΕΠΤΟΜΕΡΕΙΩΝ ΟΘΟΝΩΝ
        displays.forEach((display, index) => {
            console.log(`=== DISPLAY ${index + 1} ===`);
            console.log('Primary:', display.primary);
            console.log('Bounds:', display.bounds);
            console.log('ID:', display.id);
            console.log('Scale:', display.scaleFactor);
        });
        
        if (displays.length < 2) {
            console.log('⚠️ Μόνο μία οθόνη διαθέσιμη - θα ανοίξει σε windowed mode');
            // Θα χρησιμοποιήσει την κύρια οθόνη
        }
        
        // ΕΛΕΓΧΟΣ ΓΙΑ DUPLICATE MODE
        const allSameX = displays.every(d => d.bounds.x === displays[0].bounds.x);
        const allSameY = displays.every(d => d.bounds.y === displays[0].bounds.y);
        
        if (allSameX && allSameY && displays.length > 1) {
            console.log('⚠️ DUPLICATE MODE DETECTED - All displays have same bounds');
            // Θα ανοίξει σε όλες τις οθόνες ταυτόχρονα
        }
        
        // ΝΕΟΣ ΤΡΟΠΟΣ: Βρίσκω τη δεξιότερη οθόνη (μεγαλύτερο X)
        let targetDisplay = null;
        let maxX = -Infinity;
        
        // Βρες την οθόνη με το μεγαλύτερο X coordinate (η πιο δεξιά)
        for (let i = 0; i < displays.length; i++) {
            const display = displays[i];
            console.log(`Display ${i + 1} X position: ${display.bounds.x}`);
            
            if (display.bounds.x > maxX) {
                maxX = display.bounds.x;
                targetDisplay = display;
                console.log(`New rightmost display found: Display ${i + 1}`);
            }
        }
        
        // Αν όλες οι οθόνες έχουν ίδιο X, πάρε την τελευταία
        if (!targetDisplay && displays.length >= 3) {
            targetDisplay = displays[2]; // Οθόνη 3
            console.log('Fallback: Using display 3 (index 2)');
        } else if (!targetDisplay && displays.length >= 2) {
            targetDisplay = displays[1]; // Οθόνη 2
            console.log('Fallback: Using display 2 (index 1)');
        }
        
        if (!targetDisplay) {
            console.log('❌ Δεν βρέθηκε κατάλληλη οθόνη');
            return false;
        }
        
        console.log('✅ SELECTED TARGET DISPLAY:');
        console.log('Bounds:', targetDisplay.bounds);
        console.log('Primary:', targetDisplay.primary);
        
        // Κλείσιμο προηγούμενου timer window
        if (timerWindow) {
            console.log('Closing existing timer window...');
            timerWindow.close();
            timerWindow = null;
        }
        
        // ΥΠΟΛΟΓΙΣΜΟΣ DPI-AWARE DIMENSIONS
const scaleFactor = targetDisplay.scaleFactor || 1;
const actualWidth = Math.round(targetDisplay.bounds.width / scaleFactor);
const actualHeight = Math.round(targetDisplay.bounds.height / scaleFactor);

console.log(`DPI Fix: Scale=${scaleFactor}, Logical size: ${actualWidth}x${actualHeight}`);

// ΔΗΜΙΟΥΡΓΙΑ ΠΑΡΑΘΥΡΟΥ ΜΕ DPI CORRECTION
timerWindow = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: actualWidth,
    height: actualHeight,
    webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        webSecurity: true,
        preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    frame: false,           // ΑΛΛΑΓΗ: Χωρίς frame για fullscreen
    titleBarStyle: 'hidden',
    alwaysOnTop: false,
    skipTaskbar: false,
    title: 'TimeCast® Pro Conference Timer - HDMI Display',
    minimizable: true,
    maximizable: true,
    closable: true,
    resizable: true,
    fullscreenable: true
    
});
        
        // Φόρτωση timer.html
        const localIP = getLocalIP();
        const timerURL = `http://${localIP}:3000/timer.html`;
        
        console.log('📺 Loading timer at:', timerURL);
        console.log('📍 Target position:', { 
            x: targetDisplay.bounds.x + 50, 
            y: targetDisplay.bounds.y + 50 
        });
        
        timerWindow.loadURL(timerURL).then(() => {
            console.log('✅ Timer URL loaded successfully');
            timerWindow.show();
            
            // Μετά από 1 δευτερόλεπτο, κάνε fullscreen ΚΑΙ double-click emulation
            setTimeout(() => {
                // Cross-platform fullscreen handling
                if (process.platform === 'darwin') {
                    // macOS: Use native fullscreen
                    timerWindow.setFullScreen(true);
                    console.log('✅ macOS: Set native fullscreen');
                } else if (process.platform === 'win32') {
                    // Windows: Use fullscreen + double-click emulation for better compatibility
                    timerWindow.setFullScreen(true);
                    console.log('✅ Windows: Set fullscreen');
                    
                    // Emulate double-click for true fullscreen on Windows (after 500ms)
                    setTimeout(() => {
                        timerWindow.webContents.executeJavaScript(`
                            // Emulate double-click on the window for Windows fullscreen
                            const event = new MouseEvent('dblclick', {
                                view: window,
                                bubbles: true,
                                cancelable: true,
                                clientX: window.innerWidth / 2,
                                clientY: window.innerHeight / 2
                            });
                            document.dispatchEvent(event);
                            console.log('Windows: Double-click event dispatched for fullscreen');
                        `);
                        console.log('✅ Windows: Double-click emulation completed');
                    }, 500);
                } else {
                    // Linux and other platforms: Use simple fullscreen
                    timerWindow.setFullScreen(true);
                    console.log('✅ Linux/Other: Set simple fullscreen');
                }
                
                // Βήμα 3: Έλεγχος αποτελέσματος μετά από ακόμη 500ms
                setTimeout(() => {
                    // SAFE CHECK για timerWindow
                    if (timerWindow && !timerWindow.isDestroyed()) {
                        try {
                            const actualBounds = timerWindow.getBounds();
                            const isFullScreen = timerWindow.isFullScreen();
                            console.log('📊 FINAL FULLSCREEN STATUS:');
                            console.log('  - Is FullScreen:', isFullScreen);
                            console.log('  - Actual bounds:', actualBounds);
                            console.log('🎉 TRUE FULLSCREEN SEQUENCE COMPLETE!');
                        } catch (error) {
                            console.log('⚠️ Could not read window bounds:', error.message);
                        }
                    } else {
                        console.log('⚠️ Timer window no longer exists');
                    }
                }, 500);
                
            }, 1000);
            
        }).catch(error => {
            console.error('❌ Error loading timer URL:', error);
        });
        
        // Event handlers
        timerWindow.on('closed', () => {
            timerWindow = null;
            console.log('Timer window closed by user');
        });
        
        // Προσθήκη shortcut για έξοδο από fullscreen (ESC ή F11)
        timerWindow.webContents.on('before-input-event', (event, input) => {
            if (input.key === 'Escape' || input.key === 'F11') {
                const isFullScreen = timerWindow.isFullScreen();
                timerWindow.setFullScreen(!isFullScreen);
                console.log(`Fullscreen toggled: ${!isFullScreen}`);
            }
        });
        
        return true;
        
    } catch (error) {
        console.error('❌ Error in createTimerWindow:', error);
        return false;
    }
}

function closeTimerWindow() {
    if (timerWindow) {
        timerWindow.close();
        timerWindow = null;
        console.log('Timer window closed manually');
        return true;
    }
    return false;
}

// IPC handlers για timer window
ipcMain.handle('open-timer-window', async () => {
    console.log('IPC: Opening timer window requested');
    const success = createTimerWindow();
    return { success: success, message: success ? 'Timer ανοίχτηκε στη δεύτερη οθόνη' : 'Δεν βρέθηκε δεύτερη οθόνη' };
});

ipcMain.handle('close-timer-window', async () => {
    console.log('IPC: Closing timer window requested');
    const success = closeTimerWindow();
    return { success: success, message: success ? 'Timer έκλεισε' : 'Δεν υπήρχε ανοιχτό timer' };
});

ipcMain.handle('get-displays-count', async () => {
    const displays = screen.getAllDisplays();
    const count = displays.length;
    console.log('IPC: Display count requested:', count);
    return { 
        count: count, 
        displays: displays.map((d, i) => ({
            index: i,
            primary: d.primary,
            bounds: d.bounds,
            scaleFactor: d.scaleFactor
        }))
    };
});
// main.js

// ----> ΠΡΟΣΘΕΣΤΕ ΑΥΤΟ ΤΟ ΚΟΜΜΑΤΙ <----
// Handler για ασφαλή παράθυρα επιβεβαίωσης που επαναφέρουν το focus
ipcMain.handle('showConfirmDialog', async (event, options) => {
    // Use our custom simple confirm dialog instead of native dialog
    const result = await showSimpleConfirmDialog(
        options.title || 'Επιβεβαίωση',
        options.message || 'Είστε σίγουροι;'
    );

    // Επαναφέρουμε το focus αμέσως μετά το κλείσιμο του διαλόγου
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
        mainWindow.webContents.focus();
    }

    return result;
});

// IPC Handlers for custom dialogs
ipcMain.handle('get-app-version', async () => {
    const packageJson = require('./package.json');
    return packageJson.version;
});

ipcMain.on('close-about-dialog', () => {
    if (aboutDialog) {
        aboutDialog.close();
    }
});

// Handler to evaluate code in main window (for About dialog to open settings)
ipcMain.on('eval-main-window', (event, code) => {
    // Execute code in the main window context
    if (mainWindow) {
        mainWindow.webContents.executeJavaScript(code).catch(err => {
            console.error('Error executing code in main window:', err);
        });
    }
});

ipcMain.on('close-gdpr-dialog', () => {
    if (gdprDialog) {
        gdprDialog.close();
    }
});

// Grace Period Dialog IPC Handlers
ipcMain.handle('get-grace-period-status', async () => {
    try {
        if (!trialManager) {
            return { timeRemaining: 0, expired: true };
        }

        const graceStatus = trialManager.checkGracePeriod();
        return graceStatus || { timeRemaining: 0, expired: true };
    } catch (error) {
        console.error('❌ Error getting grace period status:', error);
        return { timeRemaining: 0, expired: true };
    }
});

// Complete License Amnesia - IPC Handler
ipcMain.handle('complete-license-amnesia', async () => {
    try {
        console.log('🧹🧹 COMPLETE LICENSE AMNESIA - IPC Handler called');

        // Clear license manager data
        if (licenseManager) {
            licenseManager.clearAllLicenseData();
        }

        // Clear trial manager cache
        if (trialManager) {
            trialManager.clearTrialCache();
        }

        // Clear any remaining global variables
        if (typeof global !== 'undefined') {
            delete global.licenseKey;
            delete global.currentLicenseData;
            delete global.appLicenseStatus;
        }

        console.log('✅ COMPLETE LICENSE AMNESIA completed via IPC');
        return { success: true };
    } catch (error) {
        console.error('❌ Error in complete license amnesia IPC:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.on('grace-period-license', async () => {
    try {
        console.log('🔑 User wants to enter license key from Grace Period dialog...');
        // Close grace period dialog first
        if (gracePeriodDialog && !gracePeriodDialog.isDestroyed()) {
            gracePeriodDialog.close();
            gracePeriodDialog = null;
        }
        // Open settings modal and scroll to license section
        if (mainWindow && !mainWindow.isDestroyed()) {
            await mainWindow.webContents.executeJavaScript(`
                if (typeof openSettings === 'function') {
                    openSettings();
                    // Scroll to License Management section after modal opens
                    setTimeout(() => {
                        const licenseSection = document.getElementById('license-management-section');
                        if (licenseSection) {
                            licenseSection.scrollIntoView({
                                behavior: 'smooth',
                                block: 'start'
                            });
                        }
                    }, 500);
                }
            `);
        }
    } catch (error) {
        console.error('❌ Error opening licensing settings:', error);
    }
});

ipcMain.on('grace-period-purchase', async () => {
    try {
        console.log('🌐 Opening license purchase URL from Grace Period dialog...');
        await shell.openExternal(trialManager.getLicensePurchaseURL());

        // Clear dialog flag και συνεχίζει με grace countdown
        trialManager.clearGracePeriodDialogFlag();

        // Close the dialog window
        if (gracePeriodDialog && !gracePeriodDialog.isDestroyed()) {
            gracePeriodDialog.close();
            gracePeriodDialog = null;
        }
    } catch (error) {
        console.error('❌ Error opening purchase URL:', error);
    }
});

ipcMain.on('grace-period-exit', async () => {
    console.log('🚪 User selected exit from Grace Period dialog - starting clean shutdown με zombie cleanup');
    await performCleanShutdown();
});

// HDMI Warning Dialog Handlers
ipcMain.handle('show-hdmi-electron-warning', async () => {
    console.log('IPC: Showing HDMI Electron warning');
    const result = await showHdmiWarningDialog(
        'warning',
        'Προειδοποίηση HDMI',
        'Η λειτουργία HDMI δουλεύει μόνο στην Electron εφαρμογή!',
        'Τρέξτε το timer.exe για να χρησιμοποιήσετε την HDMI λειτουργία.',
        { okText: 'Εντάξει' }
    );
    return result;
});

ipcMain.handle('show-hdmi-display-warning', async () => {
    console.log('IPC: Showing HDMI display count warning');
    const result = await showHdmiWarningDialog(
        'warning',
        'Μη Διαθέσιμη Δεύτερη Οθόνη',
        'Δεν έχει συνδεθεί δεύτερη οθόνη!',
        'Συνδέστε μια δεύτερη οθόνη (HDMI/DisplayPort/USB-C) και δοκιμάστε ξανά.',
        { okText: 'Εντάξει' }
    );
    return result;
});

ipcMain.on('open-website', (event, url) => {
    const { shell } = require('electron');
    shell.openExternal(url);
});

// License System IPC Handlers με improved error handling
ipcMain.handle('getMachineInfo', async () => {
    console.log('🔍 getMachineInfo IPC handler called');
    try {
        if (!licenseManager) {
            console.log('🔧 Creating new licenseManager instance');
            licenseManager = new TimeCastLicenseManager();
        }
        
        // Generate machine fingerprint if not already created
        if (!licenseManager.machineId) {
            console.log('🚀 Generating machine fingerprint...');
            await licenseManager.generateMachineFingerprint();
        } else {
            console.log('✅ Machine ID already exists:', licenseManager.machineId);
        }
        
        const machineInfo = licenseManager.getMachineInfo();
        console.log('📤 Returning machine info:', machineInfo);
        return machineInfo;
        
    } catch (error) {
        console.error('❌ Error getting machine info:', error.message);
        console.error('🔧 Stack trace:', error.stack);
        
        // Create immediate fallback fingerprint
        const os = require('os');
        const crypto = require('crypto');
        const fallbackData = `${os.hostname()}-${os.platform()}-${os.arch()}-${Date.now()}`;
        const fallbackHash = crypto.createHash('md5').update(fallbackData).digest('hex');
        const fallbackMachineId = `TC-EMERGENCY-${fallbackHash.substring(0, 8).toUpperCase()}`;
        
        console.log('🆘 Emergency fallback Machine ID:', fallbackMachineId);
        
        return {
            machineId: fallbackMachineId,
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            totalMemory: Math.floor(os.totalmem() / (1024 * 1024 * 1024)) + ' GB'
        };
    }
});

ipcMain.handle('activateLicense', async (event, licenseKey, machineFingerprint) => {
    try {
        if (!licenseManager) {
            licenseManager = new TimeCastLicenseManager();
        }
        
        console.log('🔑 Attempting license activation:', licenseKey);
        
        // Try to activate the machine first
        const activationResult = await licenseManager.activateMachine(licenseKey);
        
        if (activationResult.success) {
            console.log('✅ License activation successful');
            return {
                success: true,
                message: activationResult.message,
                validation: activationResult.validation
            };
        } else {
            console.log('❌ License activation failed:', activationResult.error);
            
            // Check if it's already activated on this machine
            const validationResult = await licenseManager.validateLicense(licenseKey);
            if (validationResult.valid) {
                return {
                    success: true,
                    message: 'License already active on this machine',
                    validation: validationResult
                };
            }
            
            return {
                success: false,
                error: activationResult.error
            };
        }
    } catch (error) {
        console.error('❌ License activation error:', error.message);
        return {
            success: false,
            error: 'Network error during activation: ' + error.message
        };
    }
});

// Handle machine deactivation
ipcMain.handle('deactivateMachine', async (event, licenseKey) => {
    try {
        if (!licenseManager) {
            licenseManager = new TimeCastLicenseManager();
        }

        console.log('🔓 Attempting machine deactivation for license:', licenseKey);

        const deactivationResult = await licenseManager.deactivateMachine(licenseKey);

        if (deactivationResult.success) {
            console.log('✅ Machine deactivation successful');

            // CRITICAL: Mark this as a manual deactivation (not network loss)
            // This tells trial-manager to use trial grace period, not offline grace period
            if (!trialManager) {
                const { TrialManager } = require('./trial-manager');
                trialManager = new TrialManager();
            }

            // CRITICAL: Clear license key from application memory/cache
            console.log('🧹 Clearing ALL license data from application memory after deactivation...');

            // Clear from license manager
            licenseManager.clearAllLicenseData();

            // CRITICAL: Clear UI license fields (input fields, localStorage)
            if (mainWindow && !mainWindow.isDestroyed()) {
                console.log('🧹 Clearing UI license fields after deactivation...');
                await mainWindow.webContents.executeJavaScript(`
                    try {
                        // Clear license input field
                        const licenseInput = document.getElementById('license-key-input');
                        if (licenseInput) {
                            licenseInput.value = '';
                            console.log('✅ License input field cleared');
                        }

                        // Clear localStorage
                        localStorage.removeItem('timecast_license_key');
                        localStorage.removeItem('license_cache');
                        localStorage.removeItem('licenseData');
                        console.log('✅ localStorage license data cleared');

                        // Clear global variables
                        if (window.currentLicenseData) {
                            delete window.currentLicenseData;
                            console.log('✅ window.currentLicenseData cleared');
                        }
                        if (window.licenseKey) {
                            delete window.licenseKey;
                            console.log('✅ window.licenseKey cleared');
                        }

                        console.log('✅ UI license amnesia completed');
                    } catch (e) {
                        console.error('❌ Error clearing UI license data:', e);
                    }
                `);
            }

            // CRITICAL: Clear trial manager cache (removes offline grace period)
            trialManager.clearTrialCache();

            // Clear from any other app state variables
            if (typeof appLicenseStatus !== 'undefined') {
                appLicenseStatus = null;
            }

            // Set flag for manual deactivation
            console.log('🏷️ Setting manual deactivation flag for trial-manager...');
            trialManager.setManualDeactivation(true);

            // Stop the license deactivation monitor since we manually deactivated
            if (licenseDeactivationInterval) {
                clearInterval(licenseDeactivationInterval);
                licenseDeactivationInterval = null;
                console.log('⏹️ Stopped license deactivation monitor after manual deactivation');
            }

            // Force transition to trial grace period
            console.log('⚡ Forcing transition to trial grace period after manual deactivation...');
            const trialStatus = await trialManager.checkTrialStatus();

            if (trialStatus.phase === 'grace') {
                console.log('✅ Successfully transitioned to trial grace period');

                // Start trial countdown for grace period
                startTrialCountdown(trialStatus);

                // Show grace period dialog
                if (trialStatus.showGracePeriodDialog) {
                    console.log('🚨 Showing Grace Period dialog after manual deactivation');
                    showGracePeriodDialog(trialStatus);
                }

                // Update title bar immediately
                if (mainWindow && !mainWindow.isDestroyed()) {
                    const timeRemaining = trialManager.formatTimeRemaining(trialStatus.timeRemaining, 'grace');
                    mainWindow.setTitle(`TimeCast™ Pro v${app.getVersion()} - Grace Period (${timeRemaining})`);
                }
            }

            return {
                success: true,
                message: deactivationResult.message || 'Machine deactivated successfully - Entering trial grace period'
            };
        } else {
            console.log('❌ Machine deactivation failed:', deactivationResult.error);
            return {
                success: false,
                error: deactivationResult.error || 'Unknown deactivation error'
            };
        }
    } catch (error) {
        console.error('❌ Machine deactivation error:', error.message);
        return {
            success: false,
            error: 'Network error during deactivation: ' + error.message
        };
    }
});

ipcMain.handle('validateCurrentLicense', async () => {
    try {
        if (!licenseManager) {
            licenseManager = new TimeCastLicenseManager();
        }
        
        const status = await licenseManager.getLicenseStatus();
        return status;
    } catch (error) {
        console.error('❌ License validation error:', error.message);
        return {
            valid: false,
            error: 'Error validating license: ' + error.message
        };
    }
});

ipcMain.handle('validateCurrentLicenseOnline', async () => {
    try {
        if (!licenseManager) {
            licenseManager = new TimeCastLicenseManager();
        }

        // Check cached license key first
        const cached = licenseManager.getCacheStatus();
        if (!cached || !cached.licenseKey) {
            return {
                valid: false,
                error: 'No license found to validate'
            };
        }

        console.log('🌐 Forcing online license validation...');
        const status = await licenseManager.validateLicense(cached.licenseKey, true); // Force online
        return status;
    } catch (error) {
        console.error('❌ Online license validation error:', error.message);
        return {
            valid: false,
            error: 'Error validating license online: ' + error.message
        };
    }
});

// New combined handler for about dialog - checks both license AND trial status
ipcMain.handle('getCompleteAppStatus', async () => {
    try {
        // Initialize managers if needed
        if (!licenseManager) {
            licenseManager = new TimeCastLicenseManager();
        }
        if (!trialManager) {
            trialManager = new TrialManager();
        }

        // First check if we have an active license
        const licenseStatus = await licenseManager.getLicenseStatus();

        if (licenseStatus.valid) {
            // We have an active license - enhanced details
            const details = [];

            // Customer info
            if (licenseStatus.license?.customer) {
                details.push(`Owner: ${licenseStatus.license.customer}`);
            }

            // Skip machine count display - users can use license on unlimited machines but only 1 active at a time

            // Expiry info
            if (licenseStatus.license?.expires_at) {
                const expiryDate = new Date(licenseStatus.license.expires_at);
                const daysUntilExpiry = Math.ceil((expiryDate - new Date()) / (24 * 60 * 60 * 1000));
                if (daysUntilExpiry > 0) {
                    details.push(`Expires in ${daysUntilExpiry} days`);
                } else {
                    details.push(`Expired ${Math.abs(daysUntilExpiry)} days ago`);
                }
            }

            // Online/Offline status
            if (licenseStatus.cached) {
                details.push('Offline mode (cached validation)');
            } else {
                details.push('Online validation successful');
            }

            return {
                phase: 'active',
                valid: true,
                license: licenseStatus,
                displayText: `✅ Licensed Product`,
                detailedStatus: details.join(' • ')
            };
        }

        // No active license - check trial status
        const trialStatus = await trialManager.checkTrialStatus();

        let displayText = '';
        let phase = 'unlicensed';

        if (trialStatus) {
            if (trialStatus.phase === 'trial') {
                const daysLeft = Math.ceil(trialStatus.timeRemaining / (24 * 60 * 60 * 1000));
                displayText = `🔄 Trial Active`;
                phase = 'trial';
            } else if (trialStatus.phase === 'grace') {
                const minutesLeft = Math.ceil(trialStatus.timeRemaining / (60 * 1000));
                displayText = `⏰ Grace Period`;
                phase = 'grace';
            } else if (trialStatus.phase === 'expired') {
                displayText = '❌ Trial Expired';
                phase = 'expired';
            } else {
                displayText = '🆕 Trial Available';
                phase = 'trial-available';
            }
        } else {
            displayText = '⚠️ Unlicensed Product';
        }

        return {
            phase: phase,
            valid: false,
            trialStatus: trialStatus,
            displayText: displayText
        };

    } catch (error) {
        console.error('❌ Complete app status check error:', error.message);
        return {
            phase: 'error',
            valid: false,
            error: 'Error checking app status: ' + error.message,
            displayText: 'Status Check Failed'
        };
    }
});

ipcMain.on('licenseActivated', (event, result) => {
    console.log('🎉 License activated successfully, closing dialog');
    // Close license dialog (if open) and continue with app startup
    if (result && result.success) {
        console.log('License info:', result.validation?.license);
    }
});

ipcMain.on('cancelLicense', () => {
    console.log('❌ User cancelled license activation');
    // Could implement trial mode or app exit here
});

ipcMain.on('show-license-dialog', () => {
    console.log('🔑 Opening license dialog from menu/about');
    showLicenseDialog();
});

// IPC Handler for exit dialog system info
// Auto-save file-based persistence IPC handlers
ipcMain.handle('save-auto-backup-file', async (event, data) => {
    try {
        const userDataPath = app.getPath('userData');
        const autoSaveFile = path.join(userDataPath, 'timer-auto-save.json');
        
        const saveData = {
            timestamp: new Date().toISOString(),
            version: 'TimeCast Pro Auto-Save v2.0 (File-Based)',
            data: data,
            platform: process.platform,
            nodeVersion: process.version
        };
        
        fs.writeFileSync(autoSaveFile, JSON.stringify(saveData, null, 2));
        console.log('✅ Auto-save file created:', autoSaveFile);
        return { success: true, filePath: autoSaveFile };
        
    } catch (error) {
        console.error('❌ Auto-save file creation failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('load-auto-backup-file', async () => {
    try {
        const userDataPath = app.getPath('userData');
        const autoSaveFile = path.join(userDataPath, 'timer-auto-save.json');
        
        if (!fs.existsSync(autoSaveFile)) {
            console.log('⚠️ Auto-save file does not exist yet');
            return { success: false, error: 'No auto-save file found' };
        }
        
        const fileContent = fs.readFileSync(autoSaveFile, 'utf8');
        const saveData = JSON.parse(fileContent);
        
        console.log('✅ Auto-save file loaded from:', autoSaveFile);
        console.log('📅 Save timestamp:', saveData.timestamp);
        
        return { 
            success: true, 
            data: saveData.data,
            timestamp: saveData.timestamp,
            version: saveData.version
        };
        
    } catch (error) {
        console.error('❌ Auto-save file loading failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-exit-dialog-info', async () => {
    try {
        let connectedClients = 0;
        let timerRunning = false;
        let vmixConnected = false;

        // Get connected clients count
        if (io && io.sockets) {
            connectedClients = io.sockets.sockets.size || 0;
        }

        // Check timer status
        if (timerState) {
            timerRunning = timerState.isRunning || false;
        }

        // Check vMix connection status
        if (vmixAPI) {
            try {
                const status = await vmixAPI.getStatus();
                vmixConnected = status && status.connected === true;
            } catch (error) {
                vmixConnected = false;
            }
        }

        return {
            connectedClients,
            timerRunning,
            vmixConnected
        };
    } catch (error) {
        console.error('Error getting exit dialog info:', error);
        return {
            connectedClients: 0,
            timerRunning: false,
            vmixConnected: false
        };
    }
});

// Single instance protection
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    console.log('Another instance is already running');
    app.quit();
} else {
    app.on('second-instance', () => {
        // Εστίαση στο υπάρχον παράθυρο
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}



function createAutoBackup() {
    try {
        console.log('💾 Starting backup creation...');
        console.log('📊 Current state check:', {
            timerStateExists: !!timerState,
            serverEventMarkersExists: !!serverEventMarkers,
            timerStateKeys: timerState ? Object.keys(timerState).length : 0,
            markersCount: Array.isArray(serverEventMarkers) ? serverEventMarkers.length : 0
        });
        
        if (!timerState) {
            throw new Error('timerState is null or undefined');
        }
        
        const backupData = {
            timestamp: Date.now(),
            dateString: new Date().toISOString(),
            version: "TimeCast Pro Auto-Backup v1.0",
            
            // Current timer state - MORE COMPLETE CAPTURE
            timerState: {
                timeLeft: timerState.timeLeft || 300,
                originalTime: timerState.originalTime || 300,
                isRunning: timerState.isRunning || false,
                title: timerState.title || "TimeCast™ Pro Conference Timer",
                message: timerState.message || '',
                messageVisible: timerState.messageVisible || false,
                warningThreshold: timerState.warningThreshold || 60,
                backgroundColor: timerState.backgroundColor || '#1a1a1a',
                logoDataUrl: timerState.logoDataUrl || null,
                logoSize: timerState.logoSize || 120,
                logoPositions: timerState.logoPositions || {},
                soundEnabled: timerState.soundEnabled || false,
                soundVolume: timerState.soundVolume || 50,
                timerFont: timerState.timerFont || 'Arial',
                vmixSettings: timerState.vmixSettings || {},
                clockMode: timerState.clockMode || false,
                timelineSettings: timerState.timelineSettings || {
                    startTime: '09:00',
                    endTime: '17:00'
                },
                savedMessages: timerState.savedMessages || {
                    message1: '',
                    message2: ''
                }
            },
            
            // Event markers - ensure we have them
            eventMarkers: Array.isArray(serverEventMarkers) ? [...serverEventMarkers] : [],
            
            // Google Sheets connection if active
            googleSheets: {
                connected: googleSheetsMonitor ? (typeof googleSheetsMonitor.isConnected === 'function' ? googleSheetsMonitor.isConnected() : false) : false,
                lastUrl: googleSheetsMonitor ? (typeof googleSheetsMonitor.getLastUrl === 'function' ? googleSheetsMonitor.getLastUrl() : null) : null
            },
            
            // Backup source info
            backupSource: 'Electron Main Process',
            processUptime: process.uptime(),
            nodeVersion: process.version,
            platform: process.platform
        };
        
        const backupPath = path.join(__dirname, 'Last_Timecast_auto_backup.json');
        console.log('📁 Writing backup to:', backupPath);
        
        const jsonString = JSON.stringify(backupData, null, 2);
        fs.writeFileSync(backupPath, jsonString);
        
        // Verify file was created
        if (fs.existsSync(backupPath)) {
            const stats = fs.statSync(backupPath);
            console.log(`✅ Auto-backup created successfully!`);
            console.log(`📊 File size: ${Math.round(stats.size / 1024)}KB`);
            console.log(`📊 Data: Timer(${!!backupData.timerState}), Markers(${backupData.eventMarkers.length}), GSheets(${backupData.googleSheets.connected})`);
            console.log(`📁 Location: ${backupPath}`);
        } else {
            throw new Error('Backup file was not created successfully');
        }
        
    } catch (error) {
        console.error('❌ Auto-backup failed:', error.message);
        console.error('❌ Error stack:', error.stack);
        console.error('📊 Debug info:', {
            timerStateExists: !!timerState,
            timerStateType: typeof timerState,
            serverEventMarkersExists: !!serverEventMarkers,
            serverEventMarkersType: typeof serverEventMarkers,
            googleSheetsMonitorExists: !!googleSheetsMonitor,
            currentDir: __dirname,
            pathModule: !!path,
            fsModule: !!fs
        });
    }
}

// Trial-Grace-Active Licensing System Startup Logic
async function checkLicenseOnStartup() {
    try {
        console.log('🚀 TimeCast Pro - Starting Trial-Grace-Active Licensing System...');

        // Initialize managers
        if (!licenseManager) {
            licenseManager = new TimeCastLicenseManager();
        }
        if (!trialManager) {
            trialManager = new TrialManager();
        }

        // **PRIORITY ORDER** (Βάσει TRIAL_LICENSING_SYSTEM.md):
        // 1. License Check FIRST → Skip όλα τα υπόλοιπα
        // 2. Trial Status Check → Εάν ενεργό, συνεχίζει trial
        // 3. Grace Period Check → Εάν ενεργό, εμφανίζει dialog
        // 4. Default → Ξεκινάει νέο trial

        console.log('1️⃣ Checking for valid license key...');

        // First check if cached license key exists (to avoid trial system when license exists)
        const cachedLicenseInfo = licenseManager.getCacheStatus();

        if (cachedLicenseInfo && cachedLicenseInfo.licenseKey) {
            console.log('🔑 Found cached license key - attempting robust validation...');
            const licenseStatus = await licenseManager.getLicenseStatus();

            if (licenseStatus.valid) {
                console.log('✅ ACTIVE LICENSE MODE - License validated');
                console.log(`🔑 License Key: ${licenseStatus.license?.key}`);
                if (licenseStatus.cached) {
                    console.log(`📱 Offline grace period: ${licenseStatus.graceDaysRemaining} days remaining`);
                }
                return {
                    phase: 'licensed',
                    hasLicense: true,
                    trialStatus: null,
                    licenseStatus: licenseStatus
                };
            } else {
                console.log('⚠️ Cached license exists but validation failed');

                // CRITICAL: Check if license was deactivated remotely
                if (licenseStatus.deactivated && licenseStatus.phase === 'grace') {
                    console.log('🚨 DEACTIVATION DETECTED: License was deactivated remotely');
                    console.log('🔄 Switching to Grace Period immediately...');

                    // Execute complete license amnesia
                    console.log('🧹🧹 COMPLETE LICENSE AMNESIA after remote deactivation...');
                    licenseManager.clearAllLicenseData();
                    trialManager.clearTrialCache();

                    // Force into grace period
                    const gracePeriodStatus = await trialManager.startGracePeriod();

                    return {
                        phase: 'grace',
                        hasLicense: false,
                        trialStatus: gracePeriodStatus,
                        deactivated: true
                    };
                }

                // NEW: Check if failure is due to network connectivity (offline startup with valid cached license)
                if (licenseStatus.error && licenseStatus.error.includes('fetch failed') && cachedLicenseInfo.licenseKey) {
                    console.log('🌐 Network failure detected with valid cached license - entering offline grace period');
                    console.log('📱 Using offline mode instead of trial grace period');

                    // Return as offline licensed mode με grace period info
                    return {
                        phase: 'licensed',
                        hasLicense: true,
                        trialStatus: null,
                        licenseStatus: {
                            valid: true,
                            cached: true,
                            offline: true,
                            graceDaysRemaining: licenseManager.gracePeriodDays,
                            license: { key: cachedLicenseInfo.licenseKey }
                        }
                    };
                }
            }
        } else {
            console.log('📋 No cached license key found');
        }

        console.log('2️⃣ No valid license found - checking trial-grace system...');
        const trialStatus = await trialManager.checkTrialStatus();

        console.log(`🔍 Trial system status: Phase ${trialStatus.phase}`);

        switch (trialStatus.phase) {
            case 'trial':
                console.log('⏱️ TRIAL MODE - Active trial period');
                console.log(`⏰ Time remaining: ${trialManager.formatTimeRemaining(trialStatus.timeRemaining, 'trial')}`);
                return {
                    phase: 'trial',
                    hasLicense: false,
                    trialStatus: trialStatus
                };

            case 'grace':
                console.log('🚨 GRACE PERIOD MODE - Trial expired, grace period active');
                console.log(`⏰ Grace time remaining: ${trialManager.formatTimeRemaining(trialStatus.timeRemaining, 'grace')}`);

                // ΥΠΟΧΡΕΩΤΙΚΟ: Show dialog ΚΑΘΕ startup
                if (trialStatus.showGracePeriodDialog) {
                    await showGracePeriodDialog(true);
                }

                return {
                    phase: 'grace',
                    hasLicense: false,
                    trialStatus: trialStatus,
                    showDialog: trialStatus.showGracePeriodDialog
                };

            case 'expired':
                console.log('❌ EXPIRED MODE - Trial and grace period both expired');
                await showTrialExpiredDialog();
                return {
                    phase: 'expired',
                    hasLicense: false,
                    trialStatus: trialStatus,
                    forceExit: true
                };

            case 'eligible':
            default:
                console.log('🆕 ELIGIBLE MODE - Starting new trial');
                await trialManager.startTrial();
                const newTrialStatus = await trialManager.checkTrialStatus();
                console.log(`🚀 New trial started: ${trialManager.formatTimeRemaining(newTrialStatus.timeRemaining, 'trial')}`);
                return {
                    phase: 'trial',
                    hasLicense: false,
                    trialStatus: newTrialStatus,
                    newTrial: true
                };
        }

    } catch (error) {
        console.error('❌ Critical startup error:', error.message);
        console.error('Stack:', error.stack);

        // Emergency fallback - allow app to start με warning
        console.log('🚨 EMERGENCY FALLBACK - Starting with limited functionality');
        return {
            phase: 'error',
            hasLicense: false,
            trialStatus: null,
            error: error.message,
            emergencyMode: true
        };
    }
}

// Grace Period Dialog (ΚΑΘΕ startup μετά trial expiry) - Custom HTML Dialog
async function showGracePeriodDialog(trialStatusOrFlag = false) {
    try {
        console.log('💬 Showing custom Grace Period dialog...');

        if (!trialManager) {
            console.error('❌ Trial manager not initialized');
            return;
        }

        // Handle both boolean and trialStatus object parameters for compatibility
        let isGracePeriodActive = false;
        if (typeof trialStatusOrFlag === 'boolean') {
            isGracePeriodActive = trialStatusOrFlag;
            console.log('📋 Grace dialog called with boolean flag:', trialStatusOrFlag);
        } else if (trialStatusOrFlag && typeof trialStatusOrFlag === 'object') {
            // trialStatus object passed
            isGracePeriodActive = trialStatusOrFlag.phase === 'grace';
            console.log('📋 Grace dialog called with trialStatus object, phase:', trialStatusOrFlag.phase);
        } else {
            console.log('📋 Grace dialog called with default parameter');
        }

        // Prevent multiple instances
        if (gracePeriodDialog && !gracePeriodDialog.isDestroyed()) {
            gracePeriodDialog.focus();
            return;
        }

        gracePeriodDialog = new BrowserWindow({
            width: 520,
            height: 400,
            modal: false,
            parent: null,
            resizable: false,
            minimizable: false,
            maximizable: false,
            autoHideMenuBar: true,
            frame: false,
            alwaysOnTop: true,
            center: true,
            show: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: true
            }
        });

        gracePeriodDialog.loadFile('grace-period-dialog.html');

        gracePeriodDialog.once('ready-to-show', () => {
            gracePeriodDialog.show();
            gracePeriodDialog.focus();
        });

        gracePeriodDialog.on('closed', () => {
            gracePeriodDialog = null;
        });

        // Clear dialog flag after showing
        trialManager.clearGracePeriodDialogFlag();

        console.log('✅ Custom Grace Period dialog shown');

    } catch (error) {
        console.error('❌ Error showing Grace Period dialog:', error);
    }
}

// Function to show trial expired dialog (completely expired)
let trialExpiredDialog = null;

async function showTrialExpiredDialog() {
    return new Promise((resolve, reject) => {
        try {
            console.log('🚨 Showing Trial Expired dialog');

            trialExpiredDialog = new BrowserWindow({
                width: 600,
                height: 500,
                modal: true,
                parent: mainWindow,
                show: false,
                frame: false,
                transparent: true,
                resizable: false,
                alwaysOnTop: true,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false
                }
            });

            trialExpiredDialog.loadFile('trial-expired-dialog.html');

            trialExpiredDialog.once('ready-to-show', () => {
                trialExpiredDialog.show();
                trialExpiredDialog.focus();
                console.log('🎭 Trial Expired dialog shown');
            });

            // Handle response from dialog
            const responseHandler = (event, response) => {
                console.log('📝 Trial Expired dialog response:', response);

                if (trialExpiredDialog && !trialExpiredDialog.isDestroyed()) {
                    trialExpiredDialog.close();
                    trialExpiredDialog = null;
                }

                if (response === 'license') {
                    // Open settings modal and scroll to license section
                    console.log('🔑 Opening settings modal for license entry...');
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.executeJavaScript(`
                            if (typeof openSettings === 'function') {
                                openSettings();
                                // Scroll to License Management section after modal opens
                                setTimeout(() => {
                                    const licenseSection = document.getElementById('license-management-section');
                                    if (licenseSection) {
                                        licenseSection.scrollIntoView({
                                            behavior: 'smooth',
                                            block: 'start'
                                        });
                                    }
                                }, 500);
                            }
                        `).catch(error => console.error('❌ Error opening settings:', error));
                    }
                    // Keep app running για license entry
                    resolve(false);
                } else if (response === 'purchase') {
                    // Open purchase page
                    shell.openExternal('https://timecast.eu/pricing');
                    // Keep app running για potential license activation
                    resolve(false);
                } else {
                    // Exit application
                    app.quit();
                    resolve(true);
                }

                // Remove listener
                ipcMain.removeListener('trial-expired-response', responseHandler);
            };

            // Listen for response
            ipcMain.on('trial-expired-response', responseHandler);

            // Handle dialog close
            trialExpiredDialog.on('closed', () => {
                console.log('🚪 Trial Expired dialog closed');
                if (trialExpiredDialog) {
                    trialExpiredDialog = null;
                    ipcMain.removeListener('trial-expired-response', responseHandler);
                    // If dialog was closed without response, exit app
                    app.quit();
                    resolve(true);
                }
            });

        } catch (error) {
            console.error('❌ Error showing Trial Expired dialog:', error);
            // Fallback to app exit
            app.quit();
            resolve(true);
        }
    });
}

// Trial countdown in title bar
let trialCountdownInterval = null;

// License deactivation monitor for active licenses
let licenseDeactivationInterval = null;

function startTrialCountdown(trialStatus) {
    if (trialCountdownInterval) {
        clearInterval(trialCountdownInterval);
    }

    console.log('⏰ Starting trial/grace countdown in title bar');

    trialCountdownInterval = setInterval(async () => {
        console.log('⏰ Trial countdown tick running...');

        if (!trialManager || !mainWindow) {
            console.log('❌ Trial countdown stopped - missing trialManager or mainWindow');
            clearInterval(trialCountdownInterval);
            return;
        }

        try {
            const currentTrialStatus = await trialManager.checkTrialStatus();
            console.log(`⏱️ Current trial status: phase=${currentTrialStatus.phase}, timeRemaining=${currentTrialStatus.timeRemaining}`);

            // Handle different phases
            if (currentTrialStatus.phase === 'expired') {
                console.log('❌ Trial and grace period both expired - terminating app');
                clearInterval(trialCountdownInterval);
                console.log('🚪 Automatic application termination after grace period');
                process.exit(0);
                return;
            }

            // Handle license activation during grace period
            if (currentTrialStatus.phase === 'active' && currentTrialStatus.licenseActivated) {
                console.log('🎉 License activated during grace period - clearing countdown and switching to normal mode');
                clearInterval(trialCountdownInterval);

                // Update title bar to show normal app title
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.setTitle('TimeCast™ Pro - Conference Timer');
                }

                // Start license deactivation monitor for the new active license
                console.log('🔓 License activated - starting deactivation monitor');
                startLicenseDeactivationMonitor();

                return;  // Stop the countdown timer
            }

            if (currentTrialStatus.phase === 'grace' && currentTrialStatus.timeRemaining <= 0) {
                console.log('❌ Grace period expired - terminating app');
                clearInterval(trialCountdownInterval);
                console.log('🚪 Automatic application termination after grace period');
                process.exit(0);
                return;
            }

            // Update window title based on phase
            let timeStr, titleMode;
            if (currentTrialStatus.phase === 'grace') {
                timeStr = trialManager.formatTimeRemaining(currentTrialStatus.timeRemaining, 'grace');
                titleMode = 'GRACE';
            } else {
                timeStr = trialManager.formatTimeRemaining(currentTrialStatus.timeRemaining, 'trial');
                titleMode = 'TRIAL';
            }

            const baseTitle = timerState.title || "TimeCast™ Pro Conference Timer";
            mainWindow.setTitle(`${baseTitle} - ${titleMode}: ${timeStr}`);

        } catch (error) {
            console.error('❌ Trial countdown error:', error);
            clearInterval(trialCountdownInterval);
        }

    }, 1000); // Update every second
}

// Network connectivity monitoring for license validation
function initNetworkConnectivityMonitoring() {
    if (!mainWindow) return;

    console.log('🌐 Initializing network connectivity monitoring for license validation...');

    // Monitor network connectivity changes in the renderer process
    mainWindow.webContents.on('dom-ready', () => {
        mainWindow.webContents.executeJavaScript(`
            let wasOffline = false;

            // Monitor online/offline events
            window.addEventListener('online', async () => {
                if (wasOffline) {
                    console.log('🌐 MAIN PROCESS: Network restored - triggering license revalidation...');
                    wasOffline = false;

                    // Trigger a fresh license check to potentially return to ACTIVE LICENSE mode
                    try {
                        if (window.electronAPI && window.electronAPI.validateCurrentLicense) {
                            const licenseStatus = await window.electronAPI.validateCurrentLicense();

                            if (licenseStatus.valid && !licenseStatus.cached) {
                                console.log('✅ MAIN PROCESS: Successfully returned to ACTIVE LICENSE mode');
                                // Could trigger a UI refresh or notification here
                            }
                        }
                    } catch (error) {
                        console.error('❌ MAIN PROCESS: License revalidation failed:', error);
                    }
                }
            });

            window.addEventListener('offline', () => {
                console.log('📱 MAIN PROCESS: Network connectivity lost');
                wasOffline = true;
            });

            // Initial state check
            if (!navigator.onLine) {
                wasOffline = true;
            }
        `);
    });
}

// License deactivation monitor for active license mode
function startLicenseDeactivationMonitor() {
    // Clear any existing monitor
    if (licenseDeactivationInterval) {
        clearInterval(licenseDeactivationInterval);
    }

    console.log('🔓 Starting license deactivation monitor for active license mode');

    licenseDeactivationInterval = setInterval(async () => {
        console.log('🔍 Enhanced license validation check...');

        if (!trialManager || !mainWindow || !licenseManager) {
            console.log('❌ License validation monitor stopped - missing components');
            clearInterval(licenseDeactivationInterval);
            return;
        }

        try {
            // Get current license and trial status
            const cacheData = licenseManager && licenseManager.getCacheStatus();
            const hasValidLicense = cacheData && cacheData.licenseKey;

            if (hasValidLicense) {
                // Get the cached license data to extract key
                const currentLicenseKey = cacheData.licenseKey;
                if (!currentLicenseKey) {
                    console.log('⚠️ No cached license key found');
                    return;
                }
                console.log('🔍 Validating active license online:', currentLicenseKey);

                // Validate license online to check if it was remotely deactivated
                const validationResult = await licenseManager.validateLicense(currentLicenseKey, true); // Force online

                if (!validationResult.valid) {
                    console.log('🚨🚨🚨 LICENSE INVALIDATED REMOTELY - License was deactivated from admin panel!');
                    console.log('🔍 Validation error:', validationResult.error);
                    console.log('⚡ REMOTE DEACTIVATION DETECTED - STARTING IMMEDIATE UI UPDATES...');

                    // CRITICAL: Complete License Amnesia - Clear ALL license data everywhere
                    console.log('🧹🧹 COMPLETE LICENSE AMNESIA after remote deactivation...');

                    // Clear backend data first
                    licenseManager.clearAllLicenseData();
                    trialManager.clearTrialCache();

                    // Clear UI license fields via JavaScript execution
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        console.log('🧹 Clearing UI license fields after remote deactivation...');
                        await mainWindow.webContents.executeJavaScript(`
                            try {
                                // Clear license input field
                                const licenseInput = document.getElementById('license-key-input');
                                if (licenseInput) {
                                    licenseInput.value = '';
                                    licenseInput.placeholder = 'TC-2025-XXXXXXXX';
                                    console.log('✅ License input field cleared and reset');
                                }

                                // Clear localStorage completely
                                localStorage.removeItem('timecast_license_key');
                                localStorage.removeItem('license_cache');
                                localStorage.removeItem('licenseData');
                                localStorage.removeItem('license_status');
                                localStorage.removeItem('cached_license');
                                console.log('✅ localStorage license data cleared');

                                // Clear sessionStorage too
                                sessionStorage.removeItem('timecast_license_key');
                                sessionStorage.removeItem('license_cache');
                                sessionStorage.removeItem('licenseData');
                                console.log('✅ sessionStorage license data cleared');

                                // Clear global variables
                                if (window.currentLicenseData) {
                                    delete window.currentLicenseData;
                                    console.log('✅ window.currentLicenseData cleared');
                                }
                                if (window.licenseKey) {
                                    delete window.licenseKey;
                                    console.log('✅ window.licenseKey cleared');
                                }
                                if (window.appLicenseStatus) {
                                    delete window.appLicenseStatus;
                                    console.log('✅ window.appLicenseStatus cleared');
                                }

                                // Force refresh license status display
                                if (typeof updateLicenseStatus === 'function') {
                                    updateLicenseStatus();
                                    console.log('✅ License status display refreshed');
                                }

                                console.log('✅✅ COMPLETE UI LICENSE AMNESIA completed');
                            } catch (e) {
                                console.error('❌ Error clearing UI license data:', e);
                            }
                        `);
                    }

                    // Clear from any app state variables
                    if (typeof appLicenseStatus !== 'undefined') {
                        appLicenseStatus = null;
                    }

                    // Stop the deactivation monitor
                    clearInterval(licenseDeactivationInterval);
                    licenseDeactivationInterval = null;

                    // Set manual deactivation flag (since it was deactivated by admin)
                    trialManager.setManualDeactivation(true);

                    // Force transition to trial grace period
                    console.log('⚡ Starting Grace Period due to remote license deactivation...');

                    const trialStatus = await trialManager.checkTrialStatus();
                    console.log('📋 Post-remote-deactivation status:', trialStatus);

                    if (trialStatus.phase === 'grace') {
                        // Start trial countdown for grace period
                        startTrialCountdown(trialStatus);

                        // FORCE show grace period dialog for remote deactivation (ignore showGracePeriodDialog flag)
                        console.log('🚨 FORCE showing Grace Period dialog due to remote deactivation');
                        console.log('🔍 DEBUG: trialStatus.showGracePeriodDialog =', trialStatus.showGracePeriodDialog);

                        // FORCE the flag to true for remote deactivation
                        trialStatus.showGracePeriodDialog = true;
                        console.log('🚨 CALLING showGracePeriodDialog() FOR REMOTE DEACTIVATION...');
                        await showGracePeriodDialog(trialStatus);
                        console.log('✅ showGracePeriodDialog() completed');

                        // Update title bar immediately
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            const timeRemaining = trialManager.formatTimeRemaining(trialStatus.timeRemaining, 'grace');
                            const newTitle = `TimeCast™ Pro v${app.getVersion()} - Grace Period (${timeRemaining})`;
                            console.log('🏷️ UPDATING TITLE BAR TO:', newTitle);
                            mainWindow.setTitle(newTitle);
                            console.log('✅ Title bar updated');
                        }

                        console.log('✅ Successfully switched to Grace Period due to remote deactivation');
                    }

                    return;
                } else {
                    console.log('✅ License validation successful - still active');
                }
            }

            // Fallback: Check file-based deactivation (offline scenarios)
            const wasDeactivated = trialManager.detectLicenseDeactivation();

            if (wasDeactivated) {
                console.log('🚨 LICENSE DEACTIVATED DETECTED (file-based) - switching to appropriate period!');

                // Stop the deactivation monitor
                clearInterval(licenseDeactivationInterval);
                licenseDeactivationInterval = null;

                // Check current trial status
                const currentTrialStatus = await trialManager.checkTrialStatus();
                console.log('📋 Post-deactivation status:', currentTrialStatus);

                // Start trial countdown
                startTrialCountdown(currentTrialStatus);

                // Show grace period dialog
                if (currentTrialStatus.phase === 'grace' && currentTrialStatus.showGracePeriodDialog) {
                    console.log('🚨 Showing Grace Period dialog due to file-based deactivation');
                    showGracePeriodDialog(currentTrialStatus);
                }

                // Update title bar immediately
                if (mainWindow && !mainWindow.isDestroyed()) {
                    const timeRemaining = trialManager.formatTimeRemaining(currentTrialStatus.timeRemaining, currentTrialStatus.phase);
                    let titlePrefix = currentTrialStatus.phase === 'grace' ? 'Grace Period' : 'Offline Grace';
                    mainWindow.setTitle(`TimeCast™ Pro v${app.getVersion()} - ${titlePrefix} (${timeRemaining})`);
                }

                console.log('✅ Successfully switched due to file-based deactivation');
                return;
            }

        } catch (error) {
            console.error('❌ License validation monitor error:', error);
            // Continue monitoring despite errors
        }

    }, 60000); // Check every 60 seconds for license deactivation
}

// DEPRECATED: License management now integrated in Settings modal
// Function to show license dialog με aggressive focus management
// function showLicenseDialog() {
//     // Removed - License management available in Settings → License Management section
//     console.log('⚠️ showLicenseDialog() deprecated - use Settings → License Management instead');
// }

// Εκδήλωση app ready
app.whenReady().then(async () => {
    // Initialize license manager
    console.log('🔑 Initializing license system...');
    
    let appLicenseStatus = null;
    try {
        // Check license/trial status on startup
        appLicenseStatus = await checkLicenseOnStartup();
        console.log('🔍 App License Status:', appLicenseStatus);
        
        // If trial expired and user chose to exit, don't create window
        if (appLicenseStatus?.trialExpired) {
            console.log('🚪 Trial expired - user may have chosen to exit');
            // App might have quit already, but continue if still running
        }

        // CRITICAL: Handle remote deactivation detected on startup
        if (appLicenseStatus?.deactivated && appLicenseStatus?.phase === 'grace') {
            console.log('🚨 STARTUP: Remote deactivation detected - showing Grace Period dialog');

            setTimeout(async () => {
                if (appLicenseStatus.trialStatus) {
                    // Start countdown and show dialog
                    startTrialCountdown(appLicenseStatus.trialStatus);
                    await showGracePeriodDialog(appLicenseStatus.trialStatus);

                    // Update title bar
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        const timeRemaining = trialManager.formatTimeRemaining(appLicenseStatus.trialStatus.timeRemaining, 'grace');
                        mainWindow.setTitle(`TimeCast™ Pro v${app.getVersion()} - Grace Period (${timeRemaining})`);
                    }
                }
            }, 2000); // Delay για να ολοκληρωθεί το window creation
        }
        
        // License management now integrated in Settings modal
        if (!appLicenseStatus?.hasLicense) {
            console.log('🔑 No valid license found - license management available in Settings modal');
            // Send notification to renderer
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.executeJavaScript(`
                        console.log('🔑 MAIN PROCESS: License management available in Settings → License Management');
                        // Could show a notification here if needed
                    `);
                }
            }, 2000);
        }
        
    } catch (error) {
        console.error('❌ License/Trial check failed:', error.message);
        // Continue with app startup even if license check fails
    }
    
    createWindow();

    // Initialize Auto-Update Checker
    console.log('🔄 Initializing auto-update checker...');
    updateChecker = new UpdateChecker();
    updateChecker.startAutoCheck();

    // Listen for update checks and refresh menu
    setInterval(async () => {
        if (updateChecker && !updateInfo) {
            const status = updateChecker.getStatus();
            if (status.updateAvailable && status.latestRelease) {
                updateInfo = {
                    updateAvailable: true,
                    latestVersion: status.latestRelease.tag_name.replace(/^v/, ''),
                    currentVersion: updateChecker.currentVersion,
                    changelog: status.latestRelease.body,
                    downloadUrl: status.latestRelease.assets.find(a => a.name.endsWith('.exe'))?.browser_download_url || status.latestRelease.html_url
                };
                // Refresh menu με update badge
                createApplicationMenu();
                console.log(`✅ Update badge added to menu: v${updateInfo.latestVersion}`);
            }
        }
    }, 60000); // Check every minute αν υπάρχει update info

    // Initialize network connectivity monitoring for license validation
    initNetworkConnectivityMonitoring();

    // Start appropriate monitoring based on license status
    if (appLicenseStatus && appLicenseStatus.hasLicense) {
        // App has valid license - start deactivation monitoring
        console.log('🔓 Valid license detected - starting license deactivation monitor');
        startLicenseDeactivationMonitor();
    } else if (appLicenseStatus && !appLicenseStatus.hasLicense && appLicenseStatus.trialStatus) {
        // Start countdown for trial or grace period mode
        const phase = appLicenseStatus.trialStatus.phase || appLicenseStatus.phase;
        if (phase === 'trial' || phase === 'grace') {
            console.log(`🕰️ Starting ${phase} countdown in title bar`);
            startTrialCountdown(appLicenseStatus.trialStatus);
        }
    }
    

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Quit όταν όλα τα παράθυρα κλείσουν
app.on('window-all-closed', () => {
    
    closeTimerWindow(); // Κλείσιμο timer window αν είναι ανοιχτό
    // Let performCleanShutdown handle the quit process
    console.log('🔄 All windows closed - shutdown handled by close event');
});

// 🔥 CRITICAL: Auto-save before quit για τέλεια session continuity
app.on('before-quit', async (event) => {
    if (!isShuttingDown) {
        event.preventDefault(); // Σταματά το quit μέχρι να τελειώσει το auto-save
        console.log('🔥 before-quit: Triggering final auto-save...');
        
        if (mainWindow && !mainWindow.isDestroyed()) {
            try {
                const result = await mainWindow.webContents.executeJavaScript(`
                    (async () => {
                        try {
                            if (typeof performSilentAutoSave === 'function') {
                                await performSilentAutoSave();
                                console.log('Final auto-save completed successfully');
                                return { success: true, message: 'Auto-save completed' };
                            } else {
                                console.log('performSilentAutoSave function not available');
                                return { success: false, message: 'Function not available' };
                            }
                        } catch (err) {
                            console.error('Auto-save error:', err.message);
                            return { success: false, message: err.message };
                        }
                    })();
                `);

                if (result.success) {
                    console.log('Auto-save before quit: SUCCESS');
                } else {
                    console.log('Auto-save before quit: FAILED -', result.message);
                }
            } catch (error) {
                console.log('Final auto-save failed: Script failed to execute, this normally means an error was thrown. Check the renderer console for the error.');
            }
        }

        // Τώρα μπορεί να κλείσει η εφαρμογή
        isShuttingDown = true; // Set flag πριν το quit για να μην ξανά-trigger το before-quit
        app.quit();
    }
});

// Για macOS - επαναφορά παραθύρου
app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// ============ ENHANCED ZOMBIE DETECTION & CLEANUP ============

/**
 * Smart zombie server detection
 * Checks for actual zombie processes on our ports
 */
async function checkForZombieServers() {
    try {
        console.log('🔍 Checking for zombie servers...');
        
        // Check if our expected ports are occupied by other processes
        const checkPorts = [3000, 3001, 3002]; // Common ports our app uses
        let zombiesFound = false;
        
        for (const port of checkPorts) {
            try {
                const { exec } = require('child_process');
                const netstatResult = await new Promise((resolve, reject) => {
                    exec(`netstat -ano | findstr :${port}`, (error, stdout, stderr) => {
                        if (error) resolve(''); // Port might be free
                        else resolve(stdout);
                    });
                });
                
                if (netstatResult.includes('LISTENING')) {
                    // Extract PID from netstat output
                    const lines = netstatResult.split('\n');
                    for (const line of lines) {
                        if (line.includes('LISTENING')) {
                            const parts = line.trim().split(/\s+/);
                            const pid = parts[parts.length - 1];
                            
                            if (pid && pid !== '0' && !isNaN(pid)) {
                                // Check if this PID is NOT our current serverProcess
                                if (!serverProcess || serverProcess.pid !== parseInt(pid)) {
                                    console.log(`🧟‍♂️ Zombie server detected on port ${port}, PID: ${pid}`);
                                    zombiesFound = true;
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.log(`Port ${port} check failed:`, error.message);
            }
        }
        
        console.log(zombiesFound ? '⚠️ Zombies detected!' : '✅ No zombies found');
        return zombiesFound;
        
    } catch (error) {
        console.error('🚨 Error checking for zombies:', error);
        return false; // Assume no zombies if check fails
    }
}

/**
 * Enhanced zombie cleanup with verification
 */
async function cleanupZombiesAndVerify() {
    try {
        console.log('🧹 Starting verified zombie cleanup...');
        
        const checkPorts = [3000, 3001, 3002];
        let cleanupSuccess = true;
        
        for (const port of checkPorts) {
            try {
                const { exec } = require('child_process');
                
                // Get processes on this port
                const netstatResult = await new Promise((resolve) => {
                    exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
                        resolve(stdout || '');
                    });
                });
                
                if (netstatResult.includes('LISTENING')) {
                    const lines = netstatResult.split('\n');
                    for (const line of lines) {
                        if (line.includes('LISTENING')) {
                            const parts = line.trim().split(/\s+/);
                            const pid = parts[parts.length - 1];
                            
                            if (pid && pid !== '0' && !isNaN(pid)) {
                                // Skip our own server process
                                if (serverProcess && serverProcess.pid === parseInt(pid)) {
                                    continue;
                                }
                                
                                console.log(`🗡️  Terminating zombie PID ${pid} on port ${port}`);
                                
                                // Kill the zombie
                                await new Promise((resolve) => {
                                    exec(`taskkill /F /PID ${pid}`, (error) => {
                                        if (error) {
                                            console.log(`Failed to kill PID ${pid}:`, error.message);
                                            cleanupSuccess = false;
                                        } else {
                                            console.log(`✅ Successfully killed PID ${pid}`);
                                        }
                                        resolve();
                                    });
                                });
                            }
                        }
                    }
                }
            } catch (error) {
                console.error(`Error cleaning port ${port}:`, error);
                cleanupSuccess = false;
            }
        }
        
        // Wait a moment for processes to actually die
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verify cleanup succeeded
        const zombiesStillExist = await checkForZombieServers();
        const finalSuccess = cleanupSuccess && !zombiesStillExist;
        
        console.log(finalSuccess ? '🎉 Zombie cleanup verified successful!' : '❌ Zombie cleanup failed or incomplete');
        return finalSuccess;
        
    } catch (error) {
        console.error('🚨 Critical error in zombie cleanup:', error);
        return false;
    }
}


// ============ END ZOMBIE DETECTION & CLEANUP ============

// ============ CLEAN SHUTDOWN SYSTEM ============

let isShuttingDown = false;
let isShowingExitDialog = false;

// Single clean shutdown function
async function performCleanShutdown() {
    if (isShuttingDown) {
        console.log('🔄 Shutdown already in progress, ignoring...');
        return;
    }
    
    isShuttingDown = true;
    console.log('🛑 Starting clean shutdown...');
    
    try {
        // 0. 🔥 CRITICAL: Final auto-save before shutdown
        console.log('💾 Final auto-save before shutdown...');
        if (mainWindow && !mainWindow.isDestroyed()) {
            try {
                const result = await mainWindow.webContents.executeJavaScript(`
                    (async () => {
                        try {
                            if (typeof performSilentAutoSave === 'function') {
                                await performSilentAutoSave();
                                console.log('Final auto-save completed before shutdown');
                                return { success: true, message: 'Auto-save completed' };
                            } else {
                                console.log('performSilentAutoSave function not available');
                                return { success: false, message: 'Function not available' };
                            }
                        } catch (err) {
                            console.error('Auto-save shutdown error:', err.message);
                            return { success: false, message: err.message };
                        }
                    })();
                `);

                if (result.success) {
                    console.log('Auto-save before shutdown: SUCCESS');
                } else {
                    console.log('Auto-save before shutdown: FAILED -', result.message);
                }
            } catch (error) {
                console.log('Final auto-save failed: Script failed to execute, this normally means an error was thrown. Check the renderer console for the error.');
            }
        } else {
            console.log('⚠️ Main window not available for final auto-save');
        }
        
        // 1. Close timer window first
        if (timerWindow) {
            timerWindow.close();
            timerWindow = null;
            console.log('✅ Timer window closed');
        }
        
        // 2. Run zombie cleanup
        console.log('🧹 Running zombie cleanup...');
        const cleanupSuccess = await cleanupZombiesAndVerify();
        console.log(cleanupSuccess ? '✅ Zombie cleanup completed' : '⚠️ Zombie cleanup completed with warnings');
        
        // 3. Close server gracefully
        if (serverProcess && typeof serverProcess.close === 'function') {
            console.log('🔄 Closing server...');
            
            await new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    console.log('⏰ Server close timeout, forcing...');
                    resolve();
                }, 3000);
                
                try {
                    serverProcess.close(() => {
                        clearTimeout(timeout);
                        console.log('✅ Server closed gracefully');
                        resolve();
                    });
                } catch (error) {
                    clearTimeout(timeout);
                    console.log('❌ Server close error:', error.message);
                    resolve();
                }
            });
        }
        
        // 4. Clean PID file
        const fs = require('fs');
        const pidFile = path.join(__dirname, 'server-pid.txt');
        try {
            if (fs.existsSync(pidFile)) {
                fs.unlinkSync(pidFile);
                console.log('🗑️ PID file cleaned');
            }
        } catch (error) {
            console.log('⚠️ Could not clean PID file:', error.message);
        }
        
        // 5. Final cleanup and exit
        serverProcess = null;
        console.log('✅ Clean shutdown completed');
        process.exit(0);
        
    } catch (error) {
        console.error('🚨 Error during shutdown:', error);
        process.exit(1);
    }
}

function showAboutDialog() {
    // Prevent multiple instances
    if (aboutDialog) {
        aboutDialog.focus();
        return;
    }

    aboutDialog = new BrowserWindow({
        width: 500,
        height: 650,
        modal: true,
        parent: mainWindow,
        resizable: false,
        minimizable: false,
        maximizable: false,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: false
        },
        icon: path.join(__dirname, 'assets/icon.ico'),
        show: false
    });

    aboutDialog.loadFile('about-dialog.html');

    aboutDialog.once('ready-to-show', () => {
        // Update title based on current language
        const dialogTitle = currentLanguage === 'en' ? 'About TimeCast™ Pro' : 'Σχετικά με το TimeCast™ Pro';
        aboutDialog.setTitle(dialogTitle);
        aboutDialog.show();
        aboutDialog.focus();
    });

    aboutDialog.on('closed', () => {
        aboutDialog = null;
    });
}

// GDPR Dialog Function
function showGDPRDialog() {
    // Prevent multiple instances
    if (gdprDialog) {
        gdprDialog.focus();
        return;
    }

    gdprDialog = new BrowserWindow({
        width: 600,
        height: 750,
        modal: true,
        parent: mainWindow,
        resizable: false,
        minimizable: false,
        maximizable: false,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: false
        },
        icon: path.join(__dirname, 'assets/icon.ico'),
        show: false
    });

    gdprDialog.loadFile('gdpr-dialog.html');

    gdprDialog.once('ready-to-show', () => {
        // Update title based on current language
        const dialogTitle = currentLanguage === 'en' ? 'Data Protection (GDPR)' : 'Προστασία Δεδομένων (GDPR)';
        gdprDialog.setTitle(dialogTitle);
        gdprDialog.show();
        gdprDialog.focus();
    });

    gdprDialog.on('closed', () => {
        gdprDialog = null;
    });
}

// ============================================
// AUTO-UPDATE SYSTEM
// ============================================

/**
 * Check for updates manually (από menu click)
 */
async function checkForUpdatesManually() {
    try {
        console.log('🔍 Manual update check triggered...');

        const result = await updateChecker.checkForUpdates();

        if (result.updateAvailable) {
            updateInfo = result;
            // Recreate menu με update badge
            createApplicationMenu();
            // Show update dialog
            showUpdateDialog(result);
        } else {
            // No update available - show custom dialog (NOT Windows native)
            const currentVer = result.currentVersion || app.getVersion();
            const message = currentLanguage === 'en'
                ? `You are running the latest version (v${currentVer})`
                : `Έχετε την πιο πρόσφατη έκδοση (v${currentVer})`;

            showCustomDialog(
                currentLanguage === 'en' ? 'Up to Date' : 'Ενημερωμένη Έκδοση',
                message,
                'info'
            );
        }
    } catch (error) {
        console.error('❌ Update check failed:', error);
        showCustomDialog(
            currentLanguage === 'en' ? 'Update Check Failed' : 'Αποτυχία Ελέγχου',
            currentLanguage === 'en'
                ? 'Could not check for updates. Please try again later.'
                : 'Αδυναμία ελέγχου ενημερώσεων. Δοκιμάστε ξανά αργότερα.',
            'error'
        );
    }
}

/**
 * Show update available dialog με changelog
 */
async function showUpdateDialog(updateInfo) {
    const isGreek = currentLanguage === 'el';

    return new Promise((resolve) => {
        // Create update dialog window
        const updateDialog = new BrowserWindow({
            width: 600,
            height: 650,
            modal: true,
            parent: mainWindow,
            show: false,
            frame: false,
            transparent: false,
            resizable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        updateDialog.loadFile('update-dialog.html');

        updateDialog.once('ready-to-show', () => {
            updateDialog.show();

            // Send dialog data
            const dialogData = {
                title: isGreek ? 'Νέα Έκδοση Διαθέσιμη!' : 'New Version Available!',
                currentLabel: isGreek ? 'Τρέχουσα έκδοση:' : 'Current version:',
                latestLabel: isGreek ? 'Νέα έκδοση:' : 'New version:',
                currentVersion: updateInfo.currentVersion,
                latestVersion: updateInfo.latestVersion,
                licenseNote: isGreek
                    ? '💡 Η άδεια χρήσης σας θα παραμείνει ενεργή στη νέα έκδοση.'
                    : '💡 Your license will remain active in the new version.',
                changelogTitle: isGreek ? 'Αλλαγές:' : 'Changes:',
                changelog: updateInfo.changelog || (isGreek ? 'Δεν υπάρχουν αλλαγές' : 'No changes available'),
                downloadBtn: isGreek ? 'Κατέβασμα Ενημέρωσης' : 'Download Update',
                laterBtn: isGreek ? 'Αργότερα' : 'Later'
            };

            updateDialog.webContents.send('update-dialog-data', dialogData);
        });

        // Handle response
        ipcMain.once('update-dialog-response', (event, shouldDownload) => {
            updateDialog.close();
            resolve(shouldDownload);
        });

        updateDialog.on('closed', () => {
            resolve(false);
        });
    }).then(shouldDownload => {
        if (!shouldDownload) return;

        // Start download process
        // Silent background download με https module
        const https = require('https');
        const downloadsPath = app.getPath('downloads');
        const fileName = `TimeCast-Pro-v${updateInfo.latestVersion}.exe`;
        const savePath = path.join(downloadsPath, fileName);

        console.log('📥 Starting silent download...');
        console.log(`   URL: ${updateInfo.downloadUrl}`);
        console.log(`   Save to: ${savePath}`);

        // Show downloading message
        const downloadingMsg = isGreek
            ? `Κατέβασμα ενημέρωσης v${updateInfo.latestVersion}...\n\nΠαρακαλώ περιμένετε...`
            : `Downloading update v${updateInfo.latestVersion}...\n\nPlease wait...`;

        showCustomDialog(
            isGreek ? 'Λήψη σε εξέλιξη...' : 'Downloading...',
            downloadingMsg,
            'info'
        );

        // Parse download URL
        const url = new URL(updateInfo.downloadUrl);

        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            headers: {
                'User-Agent': 'TimeCast-Pro-Updater',
                'Authorization': 'token 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',
                'Accept': 'application/octet-stream'
            }
        };

        const file = fs.createWriteStream(savePath);
        let downloadedBytes = 0;
        let totalBytes = 0;

        https.get(options, (response) => {
            // Handle redirects
            if (response.statusCode === 302 || response.statusCode === 301) {
                console.log('🔄 Following redirect...');
                const redirectUrl = new URL(response.headers.location);
                const redirectOptions = {
                    hostname: redirectUrl.hostname,
                    path: redirectUrl.pathname + redirectUrl.search,
                    headers: {
                        'User-Agent': 'TimeCast-Pro-Updater',
                        'Authorization': 'token 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',
                        'Accept': 'application/octet-stream'
                    }
                };
                https.get(redirectOptions, (redirectResponse) => {
                    totalBytes = parseInt(redirectResponse.headers['content-length'], 10);

                    redirectResponse.on('data', (chunk) => {
                        downloadedBytes += chunk.length;
                        const percent = Math.round((downloadedBytes / totalBytes) * 100);
                        console.log(`📥 Downloading: ${percent}%`);
                    });

                    redirectResponse.pipe(file);

                    file.on('finish', () => {
                        file.close();
                        console.log('✅ Download completed!');

                        const successMsg = isGreek
                            ? `Η ενημέρωση κατέβηκε επιτυχώς!\n\nΑρχείο: ${fileName}\n\nΤοποθεσία: ${downloadsPath}\n\nΚλείστε την εφαρμογή και εκτελέστε το νέο αρχείο.`
                            : `Update downloaded successfully!\n\nFile: ${fileName}\n\nLocation: ${downloadsPath}\n\nClose the app and run the new file.`;

                        showCustomDialog(
                            isGreek ? 'Λήψη Ολοκληρώθηκε' : 'Download Complete',
                            successMsg,
                            'info'
                        );

                        // Open downloads folder
                        shell.showItemInFolder(savePath);
                    });
                }).on('error', (err) => {
                    fs.unlink(savePath, () => {});
                    console.error('❌ Download error:', err);
                    const errorMsg = isGreek
                        ? 'Η λήψη απέτυχε. Δοκιμάστε ξανά αργότερα.'
                        : 'Download failed. Please try again later.';
                    showCustomDialog(
                        isGreek ? 'Σφάλμα Λήψης' : 'Download Error',
                        errorMsg,
                        'info'
                    );
                });
            } else {
                totalBytes = parseInt(response.headers['content-length'], 10);

                response.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    const percent = Math.round((downloadedBytes / totalBytes) * 100);
                    console.log(`📥 Downloading: ${percent}%`);
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    console.log('✅ Download completed!');

                    const successMsg = isGreek
                        ? `Η ενημέρωση κατέβηκε επιτυχώς!\n\nΑρχείο: ${fileName}\n\nΤοποθεσία: ${downloadsPath}\n\nΚλείστε την εφαρμογή και εκτελέστε το νέο αρχείο.`
                        : `Update downloaded successfully!\n\nFile: ${fileName}\n\nLocation: ${downloadsPath}\n\nClose the app and run the new file.`;

                    showCustomDialog(
                        isGreek ? 'Λήψη Ολοκληρώθηκε' : 'Download Complete',
                        successMsg,
                        'info'
                    );

                    // Open downloads folder
                    shell.showItemInFolder(savePath);
                });
            }
        }).on('error', (err) => {
            fs.unlink(savePath, () => {});
            console.error('❌ Download error:', err);
            const errorMsg = isGreek
                ? 'Η λήψη απέτυχε. Δοκιμάστε ξανά αργότερα.'
                : 'Download failed. Please try again later.';
            showCustomDialog(
                isGreek ? 'Σφάλμα Λήψης' : 'Download Error',
                errorMsg,
                'info'
            );
        });
    });
}

// Simple Custom Info Dialog (OK button only)
function showCustomDialog(title, message, type = 'info') {
    const confirmText = currentLanguage === 'en' ? 'OK' : 'OK';
    // No cancel button - pass empty string to hide it
    return showSimpleConfirmDialog(title, message, confirmText, '');
}

// Simple Custom Confirm Dialog Function
function showSimpleConfirmDialog(title = 'TimeCast™ Pro', message = null, confirmText = 'OK', cancelText = null) {
    // Set defaults based on current language
    if (!message) {
        message = currentLanguage === 'en' ? 'Are you sure?' : 'Είστε σίγουροι;';
    }
    if (!cancelText) {
        cancelText = currentLanguage === 'en' ? 'Cancel' : 'Άκυρο';
    }
    return new Promise((resolve) => {
        // Prevent multiple instances
        if (exitDialog) {
            exitDialog.focus();
            resolve(false); // Default to cancel if already showing
            return;
        }

        exitDialog = new BrowserWindow({
            width: 420,
            height: 220,
            modal: false, // Change to non-modal
            parent: null, // Remove parent to allow independent focus
            resizable: false,
            minimizable: false,
            maximizable: false,
            autoHideMenuBar: true,
            frame: false,
            alwaysOnTop: true,
            focusable: true,
            skipTaskbar: true,
            center: true, // Center on screen
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: false
            },
            show: false
        });

        // Add native keyboard shortcuts for the dialog
        exitDialog.webContents.on('before-input-event', (event, input) => {
            console.log(`[EXIT DIALOG] Native input event: ${input.key}, type: ${input.type}`);
            if (input.type === 'keyDown') {
                if (input.key === 'Escape') {
                    console.log('[EXIT DIALOG] Native ESC detected - canceling');
                    exitDialog.webContents.send('force-cancel');
                } else if (input.key === 'Enter') {
                    console.log('[EXIT DIALOG] Native ENTER detected - confirming');
                    exitDialog.webContents.send('force-confirm');
                }
            }
        });

        exitDialog.loadFile('simple-confirm-dialog.html');

        exitDialog.once('ready-to-show', () => {
            // Send message data to dialog
            exitDialog.webContents.send('set-dialog-message', { title, message, confirmText, cancelText });
            exitDialog.show();
            exitDialog.focus();
            
            // Register global shortcut for ESC while dialog is open
            const { globalShortcut } = require('electron');
            globalShortcut.register('Escape', () => {
                console.log('[EXIT DIALOG] Global ESC shortcut triggered');
                if (exitDialog) {
                    exitDialog.webContents.send('force-cancel');
                }
            });
            
            // Additional focus after a short delay
            setTimeout(() => {
                if (exitDialog) {
                    exitDialog.focus();
                    exitDialog.webContents.focus();
                }
            }, 100);
        });

        // Handle debug logs from dialog
        const debugHandler = (event, message) => {
            console.log(`[EXIT DIALOG] ${message}`);
        };
        ipcMain.on('dialog-debug-log', debugHandler);

        // Handle response from dialog
        const responseHandler = (event, shouldConfirm) => {
            // Unregister global shortcut
            const { globalShortcut } = require('electron');
            globalShortcut.unregister('Escape');
            
            if (exitDialog) {
                exitDialog.close();
            }
            ipcMain.removeListener('simple-confirm-response', responseHandler);
            ipcMain.removeListener('dialog-debug-log', debugHandler);
            resolve(shouldConfirm);
        };

        ipcMain.on('simple-confirm-response', responseHandler);

        exitDialog.on('closed', () => {
            // Unregister global shortcut if dialog closed unexpectedly
            const { globalShortcut } = require('electron');
            globalShortcut.unregister('Escape');
            
            exitDialog = null;
            // If dialog closed without response, default to cancel
            ipcMain.removeListener('simple-confirm-response', responseHandler);
            ipcMain.removeListener('dialog-debug-log', debugHandler);
            resolve(false);
        });
    });
}

// Wrapper for exit confirmation
function showCustomExitDialog() {
    const title = currentLanguage === 'en' ? 'Close TimeCast™ Pro' : 'Κλείσιμο TimeCast™ Pro';
    const message = currentLanguage === 'en' ? 'Are you sure you want to close the application?' : 'Είστε σίγουροι ότι θέλετε να κλείσετε την εφαρμογή;';
    const confirmText = currentLanguage === 'en' ? 'Close' : 'Κλείσιμο';
    const cancelText = currentLanguage === 'en' ? 'Cancel' : 'Άκυρο';
    
    return showSimpleConfirmDialog(title, message, confirmText, cancelText);
}

// Custom HDMI Warning Dialog System
let hdmiWarningDialog = null;

function showHdmiWarningDialog(type, title, message, detail, options = {}) {
    return new Promise((resolve, reject) => {
        console.log(`[HDMI DIALOG] Creating ${type} dialog: ${title}`);

        // Κλείσιμο υπάρχοντος dialog αν υπάρχει
        if (hdmiWarningDialog) {
            hdmiWarningDialog.destroy();
            hdmiWarningDialog = null;
        }

        hdmiWarningDialog = new BrowserWindow({
            width: 500,
            height: 350,
            resizable: false,
            modal: false,
            parent: null,
            autoHideMenuBar: true,
            frame: false,
            alwaysOnTop: true,
            focusable: true,
            skipTaskbar: true,
            center: true,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: false
            },
            show: false
        });

        // Global shortcut για ESC
        const { globalShortcut } = require('electron');
        
        hdmiWarningDialog.loadFile('hdmi-warning-dialog.html');

        hdmiWarningDialog.once('ready-to-show', () => {
            // Στείλε δεδομένα στο dialog
            hdmiWarningDialog.webContents.send('dialog-data', {
                type: type,
                title: title,
                message: message,
                detail: detail,
                okText: options.okText || 'Εντάξει',
                cancelText: options.cancelText || 'Ακύρωση',
                autoCloseTimeout: 3000 // Auto-close μετά από 3 δευτερόλεπτα
            });

            hdmiWarningDialog.show();
            hdmiWarningDialog.focus();

            // Register global ESC shortcut
            globalShortcut.register('Escape', () => {
                console.log('[HDMI DIALOG] Global ESC triggered');
                if (hdmiWarningDialog) {
                    hdmiWarningDialog.webContents.send('force-cancel');
                }
            });

            // Auto-close timeout (3 seconds)
            setTimeout(() => {
                console.log('[HDMI DIALOG] Auto-closing after 3 seconds');
                if (hdmiWarningDialog && !hdmiWarningDialog.isDestroyed()) {
                    hdmiWarningDialog.webContents.send('force-cancel');
                }
            }, 3000);
        });

        // Handle dialog result
        ipcMain.once('dialog-result', (event, result) => {
            console.log(`[HDMI DIALOG] Result: ${result}`);
            
            // Cleanup
            globalShortcut.unregister('Escape');
            
            if (hdmiWarningDialog) {
                hdmiWarningDialog.destroy();
                hdmiWarningDialog = null;
            }

            resolve(result === 'ok');
        });

        // Handle dialog close
        hdmiWarningDialog.on('closed', () => {
            console.log('[HDMI DIALOG] Dialog closed');
            globalShortcut.unregister('Escape');
            hdmiWarningDialog = null;
            resolve(false); // Default to cancel/false
        });
    });
}