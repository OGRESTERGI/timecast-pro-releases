const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const { Server } = require('socket.io');

const os = require('os');
const fs = require('fs');

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
let PORT = 3000;
// ΟΡΙΑ ΓΙΑ ΠΡΟΣΤΑΣΙΑ ΑΠΟ MEMORY LEAK
const MAX_SAVED_MESSAGES = 100;
const MAX_EVENT_MARKERS = 500;
const MAX_MESSAGE_LENGTH = 1000;
//google sheets
const GoogleSheetsMonitor = require('./google-sheets-monitor');
const googleSheetsMonitor = new GoogleSheetsMonitor();
// Questions API
const questionsAPI = require('./questions-api');
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

const timerState = {
    timeLeft: 900,
    originalTime: 900,
    isRunning: false,
    warningThreshold: 60,
    lastUpdate: Date.now(),
    title: "TimeCast® Pro Conference Timer",
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
    timelineSettings: {  // ΠΡΟΣΘΗΚΗ ΑΥΤΟΥ
        startTime: '09:00',
        endTime: '17:00'
    },
    clockMode: false, // false = timer display, true = current time display
    message: '',
    messageVisible: false,
    currentTextareaContent: '',
    
    // vMix Video Timer για video duration
    secondaryTimer: {
        active: false,
        title: '',
        remaining: 0,
        total: 0,
        state: 'stopped'
    },
    
    // vMix Settings
    vmixSettings: {
        enabled: true,
        host: '192.168.5.123',
        port: '8088',
        manualTimerInput: '' // Empty = auto-detect, otherwise input key for manual selection
    }
};

// Αρχική ενημέρωση vMix display
vmixDisplay.initialize(timerState);

// vMix API callbacks setup
if (vmixAPI) {
    vmixAPI.onVideoProgress((videoData) => {
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

    // Εκκίνηση vMix monitoring
    vmixAPI.testConnection();
}

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

// vMix DataSource API - Timer Data
app.get('/api/timer/current', (req, res) => {
    try {
        const currentStatus = getTimerStatus();
        res.json({
            timeLeft: timerState.timeLeft,
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

// Additional Timer API endpoints for Companion compatibility
app.get('/api/timer/hours', (req, res) => {
    const hours = Math.floor(timerState.timeLeft / 3600);
    res.send(hours.toString().padStart(2, '0'));
});

app.get('/api/timer/minutes', (req, res) => {
    const minutes = Math.floor((timerState.timeLeft % 3600) / 60);
    res.send(minutes.toString().padStart(2, '0'));
});

app.get('/api/timer/seconds', (req, res) => {
    const seconds = timerState.timeLeft % 60;
    res.send(seconds.toString().padStart(2, '0'));
});

// Translation endpoint για i18next browser support
app.get('/api/translations/:lang/:namespace', (req, res) => {
    const { lang, namespace } = req.params;
    const filePath = path.join(__dirname, 'locales', lang, `${namespace}.json`);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Translation file not found' });
    }
    
    try {
        const translations = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        res.json(translations);
    } catch (error) {
        console.error(`❌ Error loading translation file ${filePath}:`, error);
        res.status(500).json({ error: 'Failed to load translations' });
    }
});

app.get('/api/timer/bg-color', (req, res) => {
    const currentStatus = getTimerStatus();
    let bgColor = '#333333'; // default
    
    if (timerState.isRunning) {
        bgColor = '#004400'; // green when running
    } else if (currentStatus === 'stopped') {
        bgColor = '#440000'; // red when stopped  
    } else if (currentStatus === 'paused') {
        bgColor = '#444400'; // yellow when paused
    } else if (currentStatus === 'warning') {
        bgColor = '#ffaa00'; // orange when warning
    } else if (currentStatus === 'expired') {
        bgColor = '#ff0000'; // bright red when expired
    }
    
    res.send(bgColor);
});

// Flash API endpoint
app.post('/api/flash', (req, res) => {
    console.log('🔆 Flash triggered from Companion');
    // Broadcast flash event to all connected clients
    io.emit('flashTrigger', { 
        timestamp: Date.now(),
        source: 'companion' 
    });
    res.json({ success: true, message: 'Flash triggered' });
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

// vMix Discovery endpoint - scan LAN for vMix instances (Node Server)
app.get('/api/vmix/discover', async (req, res) => {
    console.log('🔍 vMix Discovery requested (Server)');
    
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
        logoDataUrl: '', // ΣΙΓΟΥΡΑ κενό string
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

// Διαχειριστής χρονομέτρου - ΜΟΝΟ ο server τον ελέγχει
let timerInterval = null;
let lastMessageVisibilityState = false;
let eventMarkers = []; // Array για αποθήκευση timeline events

// Debouncing για connected devices list
let devicesListTimeout = null;
const DEVICES_LIST_DEBOUNCE_MS = 500; // 500ms debounce

// Debounced function για αποστολή devices list
function emitConnectedDevicesList() {
    if (devicesListTimeout) {
        clearTimeout(devicesListTimeout);
    }
    
    devicesListTimeout = setTimeout(() => {
        const connectedDevices = [];
        io.sockets.sockets.forEach((connectedSocket) => {
            if (connectedSocket.connected && connectedSocket.data.clientInfo) {
                const info = {
                    id: connectedSocket.id,
                    role: (() => {
                        if (isLocalConnection(connectedSocket) && connectedSocket.data.clientType === 'admin') {
                            return '🖥️ Server PC (Admin)';
                        }
                        return connectedSocket.data.clientType === 'admin' ? '👤 Admin' : '📺 Timer Display';
                    })(),
                    deviceType: getDeviceInfo(connectedSocket.handshake.headers['user-agent'] || '').deviceType,
                    browser: getDeviceInfo(connectedSocket.handshake.headers['user-agent'] || '').browser,
                    connectedAt: new Date().toLocaleString('el-GR'),
                    isServerPC: isLocalConnection(connectedSocket) && connectedSocket.data.clientType === 'admin',
                    computerName: isLocalConnection(connectedSocket) ? os.hostname() : 'N/A',
                    ipAddress: (connectedSocket.handshake.address || 'Unknown').replace('::ffff:', '')
                };
                connectedDevices.push(info);
            }
        });
        
        io.emit('connectedDevicesList', connectedDevices);
        devicesListTimeout = null;
    }, DEVICES_LIST_DEBOUNCE_MS);
}

// Σερβίρισμα στατικών αρχείων
app.use(express.static(path.join(__dirname)));

// Διαδρομές
app.get('/', (req, res) => {
  res.redirect('/admin.html');
});

app.get('/companion', (req, res) => {
  res.sendFile(path.join(__dirname, 'companion.html'));
});

app.get('/companion.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'companion.html'));
});

// Middleware για parsing JSON bodies
app.use(express.json());

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

// companion  API endpoints
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
        service: 'Conference Timer',
        version: '1.0.0',
        ips: ips,
        port: PORT
    });
});

// Συνάρτηση ενημέρωσης χρονομέτρου - ΜΟΝΟ ο server την τρέχει
function updateTimer() {
    if (timerState.isRunning) {
        // Μείωση χρόνου ΜΟΝΟ στον server
        timerState.timeLeft--;
        timerState.lastUpdate = Date.now();
        
        // Προσδιορισμός κατάστασης
        let status = 'normal';
        if (timerState.timeLeft <= timerState.warningThreshold && timerState.timeLeft > 0) {
            status = 'warning';
        } else if (timerState.timeLeft === 0) {
            status = 'danger';
            
            // ΔΙΟΡΘΩΣΗ: Στέλνουμε μήνυμα και flash ΜΟΝΟ την πρώτη φορά
            if (!timerState.flashSentForEnd) {
                // Αυτόματο μήνυμα "ΤΕΛΟΣ ΧΡΟΝΟΥ" όταν ο χρόνος φτάνει στο 0
                timerState.message = 'ΤΕΛΟΣ ΧΡΟΝΟΥ';
                timerState.messageVisible = true;
                timerState.flashSentForEnd = true; // Σημαδεύουμε ότι στάλθηκε
                
                // Στέλνουμε το μήνυμα σε όλους τους clients
                io.emit('messageUpdate', {
                    message: timerState.message
                });
                
                // Στέλνουμε την ορατότητα μηνύματος
                io.emit('messageVisibilityUpdate', {
                    visible: true
                });
                
                // Ενεργοποίηση Flash Alert ΜΟΝΟ μία φορά
                io.emit('flashAlert', { 
                    active: true, 
                    isAutomatic: true 
                });
                
                // Αυτόματο σταμάτημα του flash μετά από 5 δευτερόλεπτα
                setTimeout(() => {
                    io.emit('flashAlert', { active: false });
                    console.log('⏹️ Αυτόματο flash σταμάτησε μετά από 5 δευτερόλεπτα');
                }, 5000);
                
                console.log('✅ Αυτόματο μήνυμα "ΤΕΛΟΣ ΧΡΟΝΟΥ" στάλθηκε (μία φορά)');
            }
            
        } else if (timerState.timeLeft < 0) {
            status = 'overtime';
        }
        
        // Αποστολή ενημέρωσης σε ΟΛΟΥΣ τους clients (admin και viewers)
        io.emit('timerUpdate', {
            timeLeft: timerState.timeLeft,
            status: status,
            isRunning: timerState.isRunning
        });
        
        vmixDisplay.updateDisplay(timerState);
        
    }
}

// Έναρξη χρονομέτρου - ΜΟΝΟ ο server
function startTimer() {
    if (!timerState.isRunning) {
        timerState.isRunning = true;
        timerState.lastUpdate = Date.now();
        
        // Καθαρισμός τυχόν προηγούμενου interval
        if (timerInterval) {
            clearInterval(timerInterval);
        }
        
        // Νέο interval ΜΟΝΟ στον server
        timerInterval = setInterval(updateTimer, 1000);
        
        console.log('Timer started by server');
        
        // Ενημέρωση όλων των clients ότι ξεκίνησε
        io.emit('command', { 
            type: 'timer', 
            action: 'start',
            serverTime: Date.now()
        });
        vmixDisplay.updateDisplay(timerState);
        
        // Άμεση αποστολή της τρέχουσας κατάστασης
        updateTimer();
    }
}

// Auto-timer με priority system - ΜΟΝΟ ο server  
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

// Παύση χρονομέτρου - ΜΟΝΟ ο server
function pauseTimer() {
    if (timerState.isRunning) {
        timerState.isRunning = false;
        
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        
        console.log('Timer paused by server');
        
        // Ενημέρωση όλων των clients ότι έκανε παύση
        io.emit('command', { 
            type: 'timer', 
            action: 'pause',
            serverTime: Date.now()
        });
        
        // Αποστολή της τρέχουσας κατάστασης
        io.emit('timerUpdate', {
            timeLeft: timerState.timeLeft,
            status: getTimerStatus(),
            isRunning: false
        });
        
        vmixDisplay.updateDisplay(timerState);
    }
}

// Επαναφορά χρονομέτρου - ΜΟΝΟ ο server
function resetTimer() {
    // Παύση πρώτα
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    timerState.isRunning = false;
    timerState.timeLeft = timerState.originalTime;
    timerState.lastUpdate = Date.now();
    
    // Καθαρισμός μηνύματος και flash κατά το reset
    timerState.message = '';
    timerState.messageVisible = false; // ΔΙΟΡΘΩΣΗ: κρυφό μετά το reset
    timerState.flashSentForEnd = false; // ΕΠΑΝΑΦΟΡΑ: Επιτρέπουμε νέο flash
    
    // Στέλνουμε καθαρό μήνυμα σε όλους
    io.emit('messageUpdate', { message: '' });
    console.log('🔄 RESET: Sending messageVisibilityUpdate with visible: false');
    io.emit('messageVisibilityUpdate', { visible: false }); // ΔΙΟΡΘΩΣΗ: κρυφό
    io.emit('flashAlert', { active: false });
    
    // 🔧 FIX: Reset όλων των ερωτήσεων isCurrentlyDisplayed κατά το reset
    const questions = questionsAPI.getAllQuestions();
    questions.forEach(q => {
        q.isCurrentlyDisplayed = false;
    });
    console.log('🔄 RESET: All questions isCurrentlyDisplayed set to false');
    
    console.log('Timer reset by server - resetTime:', timerState.originalTime);
    
    // Ενημέρωση όλων των clients ότι έκανε reset
    io.emit('command', { 
        type: 'timer', 
        action: 'reset',
        serverTime: Date.now()
    });
    
    // Στέλνουμε και άμεσα την ενημέρωση του χρόνου
    io.emit('timerUpdate', {
        timeLeft: timerState.timeLeft,
        status: 'normal',
        isRunning: false
    });
    
    vmixDisplay.updateDisplay(timerState);
}

// Προσαρμογή χρόνου - ΜΟΝΟ ο server
function adjustTime(seconds) {
    const oldTime = timerState.timeLeft;
    timerState.timeLeft = Math.max(-999, timerState.timeLeft + seconds); // Επιτρέπουμε αρνητικό μέχρι -999
    timerState.lastUpdate = Date.now();
    
    // ΠΡΟΣΘΗΚΗ: Αν ο χρόνος ήταν 0 ή αρνητικός και τώρα γίνεται θετικός, καθαρίζουμε το μήνυμα
    if (oldTime <= 0 && timerState.timeLeft > 0) {
        console.log('Server: Επιπλέον χρόνος δόθηκε - καθαρισμός μηνύματος "ΤΕΛΟΣ ΧΡΟΝΟΥ"');
        timerState.message = '';
        timerState.messageVisible = false; // ΔΙΟΡΘΩΣΗ: κρυφό
        timerState.flashSentForEnd = false; // ΕΠΑΝΑΦΟΡΑ: Επιτρέπουμε νέο flash στο επόμενο τέλος
        
        // Στέλνουμε καθαρό μήνυμα σε όλους
        io.emit('messageUpdate', { message: '' });
        io.emit('messageVisibilityUpdate', { visible: false }); // ΔΙΟΡΘΩΣΗ: κρυφό
        
        // 🔧 FIX: Reset όλων των ερωτήσεων isCurrentlyDisplayed όταν καθαρίζεται το μήνυμα
        const questions = questionsAPI.getAllQuestions();
        questions.forEach(q => {
            q.isCurrentlyDisplayed = false;
        });
        console.log('🔄 MESSAGE CLEAR: All questions isCurrentlyDisplayed set to false');
        
        // Σταματάμε το Flash Alert
        io.emit('flashAlert', { active: false });
    }
    
    console.log(`Time adjusted by server: ${oldTime} -> ${timerState.timeLeft} (${seconds >= 0 ? '+' : ''}${seconds}s)`);
    
    // Άμεση ενημέρωση όλων των clients
    io.emit('timerUpdate', {
        timeLeft: timerState.timeLeft,
        status: getTimerStatus(),
        isRunning: timerState.isRunning
    });
}

// Βοηθητική συνάρτηση για κατάσταση χρονομέτρου
function getTimerStatus() {
    if (timerState.timeLeft < 0) return 'overtime';
    if (timerState.timeLeft === 0) return 'danger';
    if (timerState.timeLeft <= timerState.warningThreshold) return 'warning';
    return 'normal';
}

// Βοηθητική συνάρτηση για ανάλυση User Agent
function getDeviceInfo(userAgent) {
    const ua = userAgent.toLowerCase();
    let deviceType = 'Unknown Device';
    let browser = 'Unknown Browser';
    
    // Device Type
    if (ua.includes('mobile') || ua.includes('android')) deviceType = '📱 Mobile';
    else if (ua.includes('ipad')) deviceType = '📱 iPad';
    else if (ua.includes('iphone')) deviceType = '📱 iPhone';
    else if (ua.includes('tablet')) deviceType = '📱 Tablet';
    else deviceType = '💻 Desktop';
    
    // Browser
    if (ua.includes('chrome')) browser = 'Chrome';
    else if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
    else if (ua.includes('edge')) browser = 'Edge';
    
    return { deviceType, browser };
}

// Αποστολή πλήρους κατάστασης σε νέο client
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
        clockMode: timerState.clockMode,
        message: timerState.message,
        messageVisible: lastMessageVisibilityState,
        secondaryTimer: timerState.secondaryTimer,
        vmixSettings: timerState.vmixSettings,
        serverTime: Date.now()
    };
    
    socket.emit('fullStateUpdate', currentState);
}

// Καλύτερος έλεγχος αν είναι ο Server PC
function isLocalConnection(socket) {
  // Καλύτερη εξαγωγή IP διεύθυνσης
  const clientIP = socket.handshake.address || 
                  socket.request.connection.remoteAddress || 
                  socket.conn.remoteAddress || 
                  'Unknown';
  
  // Καθαρισμός IPv6 mapping (::ffff:192.168.1.100 -> 192.168.1.100)
  const cleanIP = clientIP.replace('::ffff:', '');
  
  // console.log('Client connected from IP:', cleanIP); // Disabled for performance
  
  // Όλες οι πιθανές localhost διευθύνσεις
  const localAddresses = [
    '127.0.0.1',
    '::1', 
    '::ffff:127.0.0.1',
    'localhost'
  ];
  
  // Ελέγχουμε και τις τοπικές IP διευθύνσεις του server
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
                 clientIP === undefined; // Μερικές φορές είναι undefined για localhost
  
  console.log('Is local connection:', isLocal, 'for IP:', clientIP);
  return isLocal;
}

// Διαχείριση συνδέσεων Socket.IO
io.on('connection', (socket) => {
  const clientIP = socket.handshake.address?.replace('::ffff:', '') || 'unknown';

  // Enhanced connection logging με page info
  const referer = socket.handshake.headers.referer || socket.handshake.headers.origin || 'Unknown';
  const pageName = referer.split('/').pop() || referer;
  const userAgent = socket.handshake.headers['user-agent'] || '';
  const browser = userAgent.includes('Chrome') ? 'Chrome' :
                 userAgent.includes('Firefox') ? 'Firefox' :
                 userAgent.includes('Safari') ? 'Safari' :
                 userAgent.includes('Edge') ? 'Edge' : 'Browser';

  // Only log if not localhost to reduce spam
  if (clientIP !== '127.0.0.1' && clientIP !== 'localhost') {
    console.log(`🌐 Connection: ${clientIP} → ${pageName} (${browser})`);
  }

  // Άμεσος καθαρισμός ghost clients κατά τη σύνδεση
  const connectedIds = new Set();
  io.sockets.sockets.forEach((s) => {
    if (s.connected) {
      connectedIds.add(s.id);
    }
  });
  console.log(`🧹 Active clients after cleanup: ${connectedIds.size}`);
  
  // Κρατάμε πληροφορίες για κάθε συνδεδεμένη συσκευή
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
  clientInfo.isServerPC = isLocalConnection(socket);

  // Προσθήκη ονόματος υπολογιστή αν είναι local connection
  if (isLocalConnection(socket)) {
    clientInfo.computerName = os.hostname();
    console.log('Local PC hostname:', clientInfo.computerName);
  }
  
  // Αποστολή μηνύματος επιβεβαίωσης σύνδεσης
  socket.emit('confirmation', {
    message: 'Συνδεθήκατε με επιτυχία στον server',
    socketId: socket.id,
    serverTime: Date.now()
  });
  
  // Ενημέρωση όλων για το σύνολο των συνδεδεμένων clients
  io.emit('clientsCount', io.engine.clientsCount);
  
  // Εγγραφή client
  socket.on('registerClient', (data) => {
    // Enhanced logging με page URL
    const referer = socket.handshake.headers.referer || 'Unknown';
    const pageName = referer.split('/').pop() || 'Unknown';
    const clientIP = socket.handshake.address?.replace('::ffff:', '') || 'Unknown';

    console.log(`📋 Client καταχωρήθηκε: ${socket.id} → Type: ${data.type}, Role: ${data.role}, Page: ${pageName}, IP: ${clientIP}`);
    socket.data.clientType = data.type;
    socket.data.clientInfo = data;
    
    // Ενημέρωση των πληροφοριών της συσκευής
    if (isLocalConnection(socket) && data.type === 'admin') {
        clientInfo.role = '🖥️ Server PC (Admin)';
        console.log('SERVER PC DETECTED!');
    } else {
        clientInfo.role = data.type === 'admin' ? '👤 Admin' : '📺 Timer Display';
    }
    clientInfo.page = data.role || 'unknown';
    
    // Χρησιμοποιούμε το hostname από το client αν υπάρχει
    console.log('🔍 Received hostname from client:', data.hostname);
    if (data.hostname && data.hostname !== 'Unknown') {
        clientInfo.name = data.hostname;
        console.log('✅ Using client hostname:', data.hostname);
    } else {
        // Fallback στην IP
        const clientIP = socket.handshake.address || 'Unknown';
        const cleanIP = clientIP.replace('::ffff:', '');
        clientInfo.name = cleanIP !== 'Unknown' ? `PC ${cleanIP}` : 'Windows PC';
        console.log('🔄 Using IP fallback:', clientInfo.name);
    }
    
    // Στέλνουμε τη λίστα συσκευών σε όλους (debounced)
    emitConnectedDevicesList();
  });
  
  // Update hostname event
  socket.on('updateHostname', (data) => {
    console.log('🔄 Updating hostname for client:', socket.id, 'to:', data.hostname);
    
    // Ενημέρωση του clientInfo
    if (data.hostname && data.hostname.trim()) {
      clientInfo.name = data.hostname.trim();
      console.log('✅ Hostname updated to:', clientInfo.name);
      
      // Στέλνουμε ενημερωμένη λίστα συσκευών
      emitConnectedDevicesList();
    }
    
    // Αποστολή της τρέχουσας κατάστασης στον νέο client
    sendCurrentState(socket);
  });
  
  socket.on('disconnect', () => {
    console.log('Αποσύνδεση:', socket.id);
    
    // Ενημερωμένη λίστα συσκευών μετά την αποσύνδεση (debounced)
    emitConnectedDevicesList();
    io.emit('clientsCount', io.engine.clientsCount);
  });
  
  // Χειρισμός εντολών χρονομέτρου - Ο ADMIN στέλνει, ο SERVER εκτελεί
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
        default:
          console.log('Unknown timer action:', data.action);
      }
    }
  });
  
  // Χειρισμός προσαρμογής χρόνου - Ο ADMIN στέλνει, ο SERVER εκτελεί
  socket.on('adjustTime', (data) => {
    console.log('Προσαρμογή χρόνου ελήφθη από admin:', socket.id, data);
    
    if (data.seconds !== undefined) {
      adjustTime(data.seconds);
    }
  });
  
  // Χειρισμός ενημερώσεων μηνύματος
  socket.on('messageUpdate', (data) => {
    console.log('Ενημέρωση μηνύματος ελήφθη:', socket.id, data.message);
    
    // Ενημέρωση της κατάστασης του server
    if (data.message !== undefined) {
      timerState.message = data.message;
    }
    
    // Μετάδοση του μηνύματος σε ΌΛΟΥΣ τους clients (συμπεριλαμβανομένου του sender)
    io.emit('messageUpdate', data);
  });
  
  // Χειρισμός ορατότητας μηνύματος
  socket.on('messageVisibilityUpdate', (data) => {
    console.log('Ενημέρωση ορατότητας μηνύματος ελήφθη:', data);
    
    // Ενημέρωση της κατάστασης του server
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
    
    // Μετάδοση της ενημέρωσης σε όλους τους clients
    io.emit('messageVisibilityUpdate', data);
  });
  
  // ΝΕΟ EVENT: Tracking textarea content
  socket.on('textareaContentChanged', (data) => {
      timerState.currentTextareaContent = data.content || '';
      console.log(`Textarea content updated: "${timerState.currentTextareaContent}"`);
      
      // Ενημέρωση όλων των clients για το νέο περιεχόμενο textarea
      io.emit('textareaContentUpdate', { content: timerState.currentTextareaContent });
  });
  
  // Χειρισμός ενημερώσεων ρυθμίσεων
  socket.on('settingsUpdate', (data) => {
    console.log('Ενημέρωση ρυθμίσεων ελήφθη:', data);
    
    // Ενημέρωση ρυθμίσεων χρονομέτρου
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
    
    // Ενημέρωση ρυθμίσεων εμφάνισης
    if (data.display) {
        console.log('🎨 SERVER: Received display settings:', data.display);
        
        if (data.display.title !== undefined) {
            timerState.title = data.display.title;
            console.log('📝 Server state title updated:', timerState.title);
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
    
    // Ενημέρωση ρυθμίσεων ήχου
    if (data.sound) {
      if (data.sound.enabled !== undefined) timerState.soundSettings.enabled = data.sound.enabled;
      if (data.sound.volume !== undefined) timerState.soundSettings.volume = data.sound.volume;
    }

    // Ενημέρωση timeline settings
    if (data.timeline) {
        if (data.timeline.startTime !== undefined) timerState.timelineSettings.startTime = data.timeline.startTime;
        if (data.timeline.endTime !== undefined) timerState.timelineSettings.endTime = data.timeline.endTime;
        console.log('Timeline settings updated:', timerState.timelineSettings);
    }
    
    // Μετάδοση των ρυθμίσεων σε όλους τους άλλους clients
    io.sockets.sockets.forEach((connectedSocket) => {
        // Στέλνουμε μόνο σε clients που ΔΕΝ είναι admin
        if (connectedSocket.connected && connectedSocket.data.clientType !== 'admin') {
            connectedSocket.emit('settingsUpdate', data);
        }
    });
    
    // Αν άλλαξε ο χρόνος, στέλνουμε ενημέρωση
    if (data.timer && (data.timer.timeLeft !== undefined || data.timer.originalTime !== undefined)) {
      io.emit('timerUpdate', {
        timeLeft: timerState.timeLeft,
        status: getTimerStatus(),
        isRunning: timerState.isRunning
      });
    }
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

  // Production-grade vMix connection management (Node Server)
  socket.on('applyVmixConnection', async (config) => {
    console.log('📡 [Server] Applying vMix connection:', config);
    
    try {
      // Stop current monitoring
      if (vmixAPI) {
        vmixAPI.stopMonitoring();
        vmixAPI.destroy();
        console.log('⏹️ [Server] Stopped current vMix monitoring');
        
        // Wait 500ms for cleanup to complete
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Create new vMix API with new host/port
      const VmixAPI = require('./vmix-api');
      vmixAPI = new VmixAPI(config.host, config.port);
      
      // Set up callbacks
      vmixAPI.onVideoProgress((videoData) => {
        timerState.secondaryTimer = {
          active: true,
          title: videoData.title,
          remaining: videoData.remainingSeconds,
          total: Math.floor(videoData.duration / 1000),
          state: videoData.state.toLowerCase(),
          progressPercent: videoData.progressPercent
        };
        
        io.emit('secondaryTimerUpdate', timerState.secondaryTimer);
      });

      vmixAPI.onVideoChange((videoData) => {
        if (videoData) {
          console.log(`🎬 [Server] vMix video changed: ${videoData.title}`);
        } else {
          timerState.secondaryTimer = { active: false, title: '', remaining: 0, total: 0, state: 'stopped' };
          io.emit('secondaryTimerUpdate', timerState.secondaryTimer);
        }
      });

      vmixAPI.onConnectionChange((isConnected) => {
        console.log(`📡 [Server] vMix connection status: ${isConnected ? 'Connected' : 'Disconnected'}`);
        io.emit('vmixConnectionStatus', { connected: isConnected });
      });
      
      // Set manual timer input if provided
      if (config.manualTimerInput) {
        vmixAPI.setManualTimerInput(config.manualTimerInput);
        console.log(`🎯 [Server] Manual timer input set: "${config.manualTimerInput}"`);
      } else {
        vmixAPI.setManualTimerInput(null); // Clear manual selection, use auto-detect
        console.log(`🔍 [Server] Manual timer input cleared - using auto-detect`);
      }
      
      // Start monitoring
      const connected = await vmixAPI.testConnection();
      if (connected) {
        vmixAPI.startMonitoring(1000);
        console.log(`✅ [Server] vMix monitoring started: ${config.host}:${config.port}`);
        
        // Restart tally monitoring with new connection
        console.log('🚨 [Server] Restarting tally monitoring with new vMix connection...');
        io.emit('restartTallyMonitoring');
        
      } else {
        console.log(`❌ [Server] Failed to connect to vMix: ${config.host}:${config.port}`);
      }
      
    } catch (error) {
      console.error('❌ [Server] Error applying vMix connection:', error);
    }
  });

  // Tally Monitoring Events
  socket.on('setTimerInputKeys', (keys) => {
    console.log('🚨 Setting timer input keys:', keys);
    if (vmixAPI) {
      vmixAPI.setTimerInputKeys(keys);
    }
  });

  socket.on('startTallyMonitoring', async () => {
    console.log('🚨 Starting tally monitoring...');
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
      vmixAPI.startTallyMonitoring(2000); // Check every 2 seconds
      
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
  
  // Αίτημα για πλήρη κατάσταση
  socket.on('requestFullState', () => {
    // console.log('Full state requested by:', socket.id); // Disabled for performance
    sendCurrentState(socket);
  });
  
  // ΠΡΟΣΘΗΚΗ: Socket handler για fullResetToDefaults
  socket.on('fullResetToDefaults', () => {
    console.log('=== SOCKET: FULL RESET TO DEFAULTS ===');
    
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
        
        console.log('Socket: Server state reset to defaults');
        
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
        
        console.log('Socket: Default state broadcast to all clients');
        
    } catch (error) {
        console.error('Socket: Error resetting to defaults:', error);
    }
  });
  
  // Timeline sync - ΜΟΝΟ αυτό
  socket.on('timelineSync', (data) => {
    console.log('📅 Timeline sync:', data);
    socket.broadcast.emit('timelineUpdate', data);
  });
});

// ------ SAVED MESSAGES MANAGEMENT (SERVER-BASED) ------
let serverSavedMessages = [];
let serverEventMarkers = [];

// Initialize Google Sheets Monitor
googleSheetsMonitor.init(serverEventMarkers, (eventType, data) => {
    console.log(`📊 Google Sheets Event received: ${eventType}`, data);
    
    if (io) {
        if (eventType === 'settings_update') {
            io.emit('settingsUpdate', data);
        } else if (eventType === 'auto_update' || eventType === 'reload') {
            // Auto-update από Google Sheets monitoring
            io.emit('eventMarkersUpdate', {
                action: 'google_sheets_auto_update',
                allMarkers: [...serverEventMarkers],
                timestamp: Date.now(),
                sourceType: 'Google Sheets',
                isAutoUpdate: true
            });
            console.log(`📊 Broadcasted eventMarkersUpdate to ${io.sockets.sockets.size} clients`);
        } else {
            io.emit('eventMarkersUpdate', data);
        }
    }
});

// Import Excel markers functionality
const { startExcelMonitoring, refreshFromExcel, createSmartSampleExcel, setCurrentExcelFile } = require('./excel-markers');

// Start Excel monitoring
let excelMonitor = null;

// API endpoint για εξαγωγή τρέχουσας χρονοσειράς
app.post('/api/markers/export-current-timeline', express.json(), (req, res) => {
    console.log('📤 Export current timeline requested');
    
    try {
        // Λήψη τρέχοντος τίτλου από το request body (UI) ή fallback στο timerState
        const currentTitle = req.body.title || timerState.title || 'Timer';
        
        console.log('📊 Using title from UI:', currentTitle);
        
        // Καλούμε την υπάρχουσα function από το excel-markers.js
        const result = createSmartSampleExcel(serverEventMarkers, currentTitle);
        
        if (result.success) {
            console.log(`✅ Timeline exported: ${result.filename}`);
            res.json({
                success: true,
                filename: result.filename,
                path: result.path,
                markersCount: result.markersCount
            });
        } else {
            console.error('❌ Export failed:', result.error);
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('❌ Export error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API endpoint για δημιουργία smart sample Excel (πανομοιότυπο με το export)
app.post('/api/markers/create-smart-sample', express.json(), (req, res) => {
    console.log('📊 Create smart sample Excel requested');
    
    try {
        // Λήψη τίτλου από το request body
        const title = req.body.title || 'Timer';
        
        console.log('📊 Creating smart sample with title:', title);
        
        // Καλούμε την ίδια function από το excel-markers.js
        const result = createSmartSampleExcel(serverEventMarkers, title);
        
        if (result.success) {
            console.log(`✅ Smart sample created: ${result.filename}`);
            res.json({
                success: true,
                filename: result.filename,
                path: result.path,
                markersCount: result.markersCount
            });
        } else {
            console.error('❌ Smart sample creation failed:', result.error);
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('❌ Smart sample creation error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Multer configuration for Excel file uploads
const multer = require('multer');
const uploadExcel = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.includes('spreadsheet') || file.originalname.match(/\.(xlsx|xls)$/)) {
            cb(null, true);
        } else {
            cb(new Error('Μόνο Excel αρχεία (.xlsx, .xls) επιτρέπονται'), false);
        }
    }
});

// Import and setup companion API
const createCompanionAPI = require('./companion-api');

// Create server functions object for companion API
const serverFunctions = {
    startTimer: startTimer,
    pauseTimer: pauseTimer,
    resetTimer: resetTimer,
    adjustTime: adjustTime,
    toggleHDMI: () => {
        io.emit('companionHDMIToggle', { 
            action: 'toggle',
            source: 'companion',
            timestamp: Date.now()
        });
        return { success: true, message: 'HDMI toggle command sent to admin panel' };
    }
};

// Setup Companion API routes
app.use('/api', createCompanionAPI(timerState, serverSavedMessages, serverEventMarkers, io, serverFunctions));

// API endpoint για λήψη saved messages
app.get('/api/saved-messages', (req, res) => {
    console.log('Saved messages requested');
    res.json({ 
        messages: serverSavedMessages,
        count: serverSavedMessages.length,
        timestamp: Date.now()
    });
});

// API endpoint για προσθήκη νέου saved message
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
        serverSavedMessages.shift(); // Αφαίρεση παλαιότερου
        console.log('⚠️ Maximum messages reached, removed oldest message');
    }
    
    const messageObj = {
        id: `msg-${Date.now()}`,
        content: sanitizedMessage,
        timestamp: Date.now()
    };
    
    serverSavedMessages.push(messageObj);
    
    console.log(`Saved message added: "${messageObj.content}"`);
    
    // Real-time ενημέρωση όλων των clients
    console.log('Sending savedMessagesUpdate to all clients. Total clients:', io.engine.clientsCount);
    io.emit('savedMessagesUpdate', {
        action: 'add',
        message: messageObj,
        allMessages: [...serverSavedMessages],
        timestamp: Date.now()
    });
    console.log('savedMessagesUpdate event sent');
    
    res.json({ 
        success: true, 
        message: messageObj,
        totalCount: serverSavedMessages.length
    });
});

// API endpoint για επεξεργασία saved message
app.post('/api/saved-messages/edit', express.json(), (req, res) => {
    const { id, newContent } = req.body;
    
    const messageIndex = serverSavedMessages.findIndex(msg => msg.id === id);
    
    if (messageIndex === -1) {
        return res.status(404).json({ error: 'Message not found' });
    }
    
    if (!newContent || newContent.trim() === '') {
        return res.status(400).json({ error: 'Message cannot be empty' });
    }
    
    const oldContent = serverSavedMessages[messageIndex].content;
    serverSavedMessages[messageIndex].content = newContent.trim();
    serverSavedMessages[messageIndex].timestamp = Date.now();
    
    console.log(`Saved message edited: "${oldContent}" -> "${newContent}"`);
    
    // Real-time ενημέρωση όλων των clients
    io.emit('savedMessagesUpdate', {
        action: 'edit',
        messageId: id,
        oldContent: oldContent,
        newContent: newContent.trim(),
        allMessages: [...serverSavedMessages],
        timestamp: Date.now()
    });
    
    res.json({ 
        success: true,
        message: serverSavedMessages[messageIndex]
    });
});

// API endpoint για διαγραφή saved message
app.delete('/api/saved-messages/:id', (req, res) => {
    const { id } = req.params;
    
    const messageIndex = serverSavedMessages.findIndex(msg => msg.id === id);
    
    if (messageIndex === -1) {
        return res.status(404).json({ error: 'Message not found' });
    }
    
    const deletedMessage = serverSavedMessages.splice(messageIndex, 1)[0];
    
    console.log(`Saved message deleted: "${deletedMessage.content}"`);

     // Real-time ενημέρωση όλων των clients
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

// =================== COMPANION API ENDPOINTS ===================
// Load saved message endpoints for Companion buttons
app.post('/api/message/load-saved/1', (req, res) => {
    if (serverSavedMessages.length >= 1) {
        timerState.currentTextareaContent = serverSavedMessages[0].content; // ΠΡΟΣΘΗΚΗ: για companion feedback
        timerState.message = serverSavedMessages[0].content;
        timerState.messageVisible = false; // ΔΙΟΡΘΩΣΗ: Μόνο load, όχι show
        io.emit('messageUpdate', { message: timerState.message, visible: false });
        io.emit('textareaContentUpdate', { content: timerState.currentTextareaContent }); // ΠΡΟΣΘΗΚΗ
        res.json({ success: true, message: serverSavedMessages[0].content, loadedToTextarea: true });
    } else {
        res.json({ success: false, error: 'No message in slot 1' });
    }
});

app.post('/api/message/load-saved/2', (req, res) => {
    if (serverSavedMessages.length >= 2) {
        timerState.currentTextareaContent = serverSavedMessages[1].content; // ΠΡΟΣΘΗΚΗ: για companion feedback
        timerState.message = serverSavedMessages[1].content;
        timerState.messageVisible = false; // ΔΙΟΡΘΩΣΗ: Μόνο load, όχι show
        io.emit('messageUpdate', { message: timerState.message, visible: false });
        io.emit('textareaContentUpdate', { content: timerState.currentTextareaContent }); // ΠΡΟΣΘΗΚΗ
        res.json({ success: true, message: serverSavedMessages[1].content, loadedToTextarea: true });
    } else {
        res.json({ success: false, error: 'No message in slot 2' });
    }
});

app.post('/api/message/load-saved/3', (req, res) => {
    if (serverSavedMessages.length >= 3) {
        timerState.currentTextareaContent = serverSavedMessages[2].content; // ΠΡΟΣΘΗΚΗ: για companion feedback
        timerState.message = serverSavedMessages[2].content;
        timerState.messageVisible = false; // ΔΙΟΡΘΩΣΗ: Μόνο load, όχι show
        io.emit('messageUpdate', { message: timerState.message, visible: false });
        io.emit('textareaContentUpdate', { content: timerState.currentTextareaContent }); // ΠΡΟΣΘΗΚΗ
        res.json({ success: true, message: serverSavedMessages[2].content, loadedToTextarea: true });
    } else {
        res.json({ success: false, error: 'No message in slot 3' });
    }
});

app.post('/api/message/load-saved/4', (req, res) => {
    if (serverSavedMessages.length >= 4) {
        timerState.currentTextareaContent = serverSavedMessages[3].content; // ΠΡΟΣΘΗΚΗ: για companion feedback
        timerState.message = serverSavedMessages[3].content;
        timerState.messageVisible = false; // ΔΙΟΡΘΩΣΗ: Μόνο load, όχι show
        io.emit('messageUpdate', { message: timerState.message, visible: false });
        io.emit('textareaContentUpdate', { content: timerState.currentTextareaContent }); // ΠΡΟΣΘΗΚΗ
        res.json({ success: true, message: serverSavedMessages[3].content, loadedToTextarea: true });
    } else {
        res.json({ success: false, error: 'No message in slot 4' });
    }
});

app.post('/api/message/load-saved/5', (req, res) => {
    if (serverSavedMessages.length >= 5) {
        timerState.currentTextareaContent = serverSavedMessages[4].content; // ΠΡΟΣΘΗΚΗ: για companion feedback
        timerState.message = serverSavedMessages[4].content;
        timerState.messageVisible = false; // ΔΙΟΡΘΩΣΗ: Μόνο load, όχι show
        io.emit('messageUpdate', { message: timerState.message, visible: false });
        io.emit('textareaContentUpdate', { content: timerState.currentTextareaContent }); // ΠΡΟΣΘΗΚΗ
        res.json({ success: true, message: serverSavedMessages[4].content, loadedToTextarea: true });
    } else {
        res.json({ success: false, error: 'No message in slot 5' });
    }
});

app.post('/api/message/load-saved/6', (req, res) => {
    if (serverSavedMessages.length >= 6) {
        timerState.currentTextareaContent = serverSavedMessages[5].content; // ΠΡΟΣΘΗΚΗ: για companion feedback
        timerState.message = serverSavedMessages[5].content;
        timerState.messageVisible = false; // ΔΙΟΡΘΩΣΗ: Μόνο load, όχι show
        io.emit('messageUpdate', { message: timerState.message, visible: false });
        io.emit('textareaContentUpdate', { content: timerState.currentTextareaContent }); // ΠΡΟΣΘΗΚΗ
        res.json({ success: true, message: serverSavedMessages[5].content, loadedToTextarea: true });
    } else {
        res.json({ success: false, error: 'No message in slot 6' });
    }
});

// Message toggle endpoint
app.post('/api/message/toggle', (req, res) => {
    timerState.messageVisible = !timerState.messageVisible;
    io.emit('messageUpdate', { message: timerState.message, visible: timerState.messageVisible });
    res.json({ success: true, visible: timerState.messageVisible });
});

// Get currently loaded message in text area (for Companion feedback)
app.get('/api/message/loaded', (req, res) => {
    res.json({ 
        message: timerState.message || '', 
        visible: timerState.messageVisible || false,
        timestamp: Date.now()
    });
});

// Marker endpoints for quick access to first 3 markers
app.get('/api/marker/1', (req, res) => {
    console.log(`🔍 [MARKER DEBUG] Called /api/marker/1`);
    console.log(`🔍 [MARKER DEBUG] serverEventMarkers.length: ${serverEventMarkers.length}`);
    if (serverEventMarkers.length > 0) {
        console.log('🔍 [MARKER DEBUG] First marker:', serverEventMarkers[0]);
    }
    if (serverEventMarkers.length >= 1) {
        const title = serverEventMarkers[0].title || '(empty)';
        console.log(`🔍 [MARKER DEBUG] Returning marker 1 title: "${title}"`);
        res.send(title);
    } else {
        console.log('🔍 [MARKER DEBUG] No marker 1, returning (empty)');
        res.send('(empty)');
    }
});

app.get('/api/marker/2', (req, res) => {
    if (serverEventMarkers.length >= 2) {
        res.send(serverEventMarkers[1].title || '(empty)');
    } else {
        res.send('(empty)');
    }
});

app.get('/api/marker/3', (req, res) => {
    if (serverEventMarkers.length >= 3) {
        res.send(serverEventMarkers[2].title || '(empty)');
    } else {
        res.send('(empty)');
    }
});

// HDMI Toggle endpoint (placeholder - you may need to implement actual HDMI logic)
app.post('/api/hdmi/toggle', (req, res) => {
    console.log('🔌 HDMI Toggle triggered from Companion');
    // Implement your HDMI toggle logic here
    // This could control display output, capture card settings, etc.
    
    // For now, just broadcast an event
    io.emit('hdmiToggle', { 
        timestamp: Date.now(),
        source: 'companion' 
    });
    
    res.json({ success: true, message: 'HDMI toggled' });
});

// Saved message bg-color endpoints for dynamic button colors
app.get('/api/saved-message/1/bg-color', (req, res) => {
    const color = serverSavedMessages.length >= 1 ? '#004400' : '#444444';
    res.send(color);
});

app.get('/api/saved-message/2/bg-color', (req, res) => {
    const color = serverSavedMessages.length >= 2 ? '#004400' : '#444444';
    res.send(color);
});

app.get('/api/saved-message/3/bg-color', (req, res) => {
    const color = serverSavedMessages.length >= 3 ? '#004400' : '#444444';
    res.send(color);
});

app.get('/api/saved-message/4/bg-color', (req, res) => {
    const color = serverSavedMessages.length >= 4 ? '#004400' : '#444444';
    res.send(color);
});

app.get('/api/saved-message/5/bg-color', (req, res) => {
    const color = serverSavedMessages.length >= 5 ? '#004400' : '#444444';
    res.send(color);
});

app.get('/api/saved-message/6/bg-color', (req, res) => {
    const color = serverSavedMessages.length >= 6 ? '#004400' : '#444444';
    res.send(color);
});

// =================== COMPANION MODULE DOWNLOAD ENDPOINT ===================

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

// =================== QUESTIONS API ENDPOINTS ===================
// Import routes από questions-api.js  
// Σημείωση: Πρέπει να καλεστεί μετά τη δήλωση του eventMarkers
// Timer functions για questions API
const timerFunctions = {
    startAutoTimer: startAutoTimer,
    cancelAutoTimer: cancelAutoTimer,
    timerState: timerState
};

questionsAPI.setupRoutes(app, io, eventMarkers, timerFunctions);

// =================== ΓΕΜΗ API PROXY ENDPOINT ===================
// Rate limiting για ΓΕΜΗ API (8 calls/min)
const gemiRateLimit = {
    calls: [],
    maxCalls: 8,
    windowMs: 60000 // 1 minute
};

function checkGemiRateLimit() {
    const now = Date.now();
    // Καθαρισμός παλιών calls
    gemiRateLimit.calls = gemiRateLimit.calls.filter(callTime => 
        now - callTime < gemiRateLimit.windowMs
    );
    
    if (gemiRateLimit.calls.length >= gemiRateLimit.maxCalls) {
        return false; // Rate limit exceeded
    }
    
    gemiRateLimit.calls.push(now);
    return true;
}

// ΓΕΜΗ API proxy endpoint για αναζήτηση εταιρειών (CORS bypass)
app.get('/api/gemi/search-companies', async (req, res) => {
    try {
        const { name } = req.query;
        
        if (!name || name.length < 3) {
            return res.status(400).json({
                success: false,
                error: 'Company name must be at least 3 characters'
            });
        }

        // Έλεγχος rate limit (8 calls/min)
        if (!checkGemiRateLimit()) {
            console.log(`⚠️ ΓΕΜΗ API rate limit exceeded for: "${name}"`);
            return res.status(429).json({
                success: false,
                error: 'Πολλές αναζητήσεις - περιμένετε λίγο και δοκιμάστε ξανά'
            });
        }

        console.log(`🏢 ΓΕΜΗ API search requested for: "${name}" (${gemiRateLimit.calls.length}/8 calls)`);
        
        const https = require('https');
        const url = `https://opendata-api.businessportal.gr/api/opendata/v1/companies?name=${encodeURIComponent(name)}&resultsSize=10`;
        
        // Auto-retry logic - up to 2 retries for failed requests
        let lastError = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                if (attempt > 1) {
                    console.log(`🔄 ΓΕΜΗ API retry attempt ${attempt}/3 για: "${name}"`);
                    // Wait 2 seconds between retries
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
                const data = await makeGemiRequest(url);
                console.log(`✅ ΓΕΜΗ API returned ${data.searchResults?.length || 0} companies (attempt ${attempt})`);
                
                res.json({
                    success: true,
                    companies: data.searchResults || [],
                    totalCount: data.searchMetadata?.totalCount || 0
                });
                return; // Success - exit function
                
            } catch (error) {
                lastError = error;
                console.log(`❌ ΓΕΜΗ API attempt ${attempt}/3 failed: ${error.message}`);
                
                if (attempt === 3) {
                    // Final attempt failed
                    break;
                }
            }
        }
        
        // All retries failed
        throw lastError;

    } catch (error) {
        const errorDetails = {
            message: error.message,
            timestamp: new Date().toISOString(),
            url: `https://opendata-api.businessportal.gr/api/opendata/v1/companies?name=${encodeURIComponent(name)}&resultsSize=10`,
            rateLimitStatus: `${gemiRateLimit.calls.length}/${gemiRateLimit.maxCalls} calls used`,
            retriesAttempted: 3
        };
        
        console.error('❌ ΓΕΜΗ API Error Details:', errorDetails);
        res.status(500).json({
            success: false,
            error: 'Σφάλμα επικοινωνίας με το ΓΕΜΗ API',
            debug: errorDetails  // Include debug info για troubleshooting
        });
    }
});

// Helper function για ΓΕΜΗ API requests
async function makeGemiRequest(url) {
    const https = require('https');
    return new Promise((resolve, reject) => {
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
}

// =================== DIAGNOSTIC ENDPOINT ===================
// Test ΓΕΜΗ API health και troubleshooting
app.get('/api/gemi/health', async (req, res) => {
    try {
        const testQuery = 'test';
        const https = require('https');
        const startTime = Date.now();
        
        const diagnostics = {
            timestamp: new Date().toISOString(),
            apiKey: 'pxIOODz6Zex3fFOLcrXcr0FwIx75wQxE',
            testUrl: `https://opendata-api.businessportal.gr/api/opendata/v1/companies?name=${testQuery}&resultsSize=1`,
            rateLimit: {
                currentCalls: gemiRateLimit.calls.length,
                maxCalls: gemiRateLimit.maxCalls,
                windowMs: gemiRateLimit.windowMs,
                available: gemiRateLimit.maxCalls - gemiRateLimit.calls.length
            }
        };

        const testData = await new Promise((resolve, reject) => {
            const options = {
                headers: {
                    'api_key': 'pxIOODz6Zex3fFOLcrXcr0FwIx75wQxE',
                    'User-Agent': 'TimeCast-Pro/4.3.3'
                }
            };
            
            const req = https.get(diagnostics.testUrl, options, (response) => {
                let responseData = '';
                
                response.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                response.on('end', () => {
                    const responseTime = Date.now() - startTime;
                    try {
                        const jsonData = JSON.parse(responseData);
                        resolve({
                            statusCode: response.statusCode,
                            responseTime: `${responseTime}ms`,
                            headers: {
                                'content-type': response.headers['content-type'],
                                'ratelimit-remaining': response.headers['x-ratelimit-remaining-minute'],
                                'ratelimit-limit': response.headers['x-ratelimit-limit-minute']
                            },
                            dataReceived: !!jsonData.searchResults,
                            companyCount: jsonData.searchResults?.length || 0,
                            success: response.statusCode === 200
                        });
                    } catch (error) {
                        reject(new Error(`JSON parse error: ${error.message}`));
                    }
                });
            });
            
            req.on('error', (error) => {
                reject(new Error(`Network error: ${error.message}`));
            });
            
            req.setTimeout(10000, () => {
                req.abort();
                reject(new Error('Request timeout (10s)'));
            });
        });

        diagnostics.testResult = testData;
        diagnostics.overallStatus = testData.success ? 'HEALTHY' : 'UNHEALTHY';
        
        console.log('🔍 ΓΕΜΗ Health Check:', diagnostics.overallStatus);
        res.json(diagnostics);

    } catch (error) {
        console.error('❌ ΓΕΜΗ Health Check Failed:', error.message);
        res.status(500).json({
            timestamp: new Date().toISOString(),
            overallStatus: 'UNHEALTHY',
            error: error.message,
            suggestion: 'Check network connectivity and API key validity'
        });
    }
});

// INSEE Rate limiting για γαλλικές εταιρείες (30 queries/minute)
let inseeRateLimit = {
    calls: [],
    maxCallsPerMinute: 30  // INSEE API limit: 30 queries/minute
};

function checkInseeRateLimit() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Remove calls older than 1 minute
    inseeRateLimit.calls = inseeRateLimit.calls.filter(timestamp => timestamp > oneMinuteAgo);
    
    if (inseeRateLimit.calls.length >= inseeRateLimit.maxCallsPerMinute) {
        console.log(`⚠️ INSEE API rate limit reached: ${inseeRateLimit.calls.length}/${inseeRateLimit.maxCallsPerMinute}`);
        return false;
    }
    
    inseeRateLimit.calls.push(now);
    return true;
}

// INSEE API OAuth2 Token Management
let inseeTokenData = {
    accessToken: null,
    expiresAt: 0
};

async function getInseeAccessToken() {
    try {
        const https = require('https');
        const querystring = require('querystring');
        
        const clientId = 'D_CZFbNUEfzHaHGGDVLwV2y6N0Ma';
        const clientSecret = 'R6xnd9SkzFxTQTiqbYmmyZQTapga';
        
        const tokenData = querystring.stringify({
            grant_type: 'client_credentials'
        });
        
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        
        const options = {
            hostname: 'api.insee.fr',
            path: '/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${auth}`,
                'Content-Length': Buffer.byteLength(tokenData)
            }
        };
        
        return new Promise((resolve, reject) => {
            const req = https.request(options, (response) => {
                let responseData = '';
                
                response.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                response.on('end', () => {
                    try {
                        if (response.statusCode !== 200) {
                            reject(new Error(`Token request failed: ${response.statusCode}`));
                            return;
                        }
                        
                        const tokenResponse = JSON.parse(responseData);
                        inseeTokenData.accessToken = tokenResponse.access_token;
                        inseeTokenData.expiresAt = Date.now() + (tokenResponse.expires_in * 1000);
                        
                        console.log('✅ INSEE Access Token obtained successfully');
                        resolve(tokenResponse.access_token);
                    } catch (error) {
                        reject(new Error(`Token parse error: ${error.message}`));
                    }
                });
            });
            
            req.on('error', (error) => {
                reject(new Error(`Token request error: ${error.message}`));
            });
            
            req.write(tokenData);
            req.end();
        });
    } catch (error) {
        console.error('❌ INSEE Token Error:', error.message);
        throw error;
    }
}

async function ensureInseeToken() {
    const now = Date.now();
    
    // Check if token exists and is not expired (with 5 min buffer)
    if (inseeTokenData.accessToken && inseeTokenData.expiresAt > (now + 300000)) {
        return inseeTokenData.accessToken;
    }
    
    // Get new token
    return await getInseeAccessToken();
}

// INSEE API proxy endpoint για αναζήτηση γαλλικών εταιρειών (CORS bypass)
app.get('/api/insee/search-companies', async (req, res) => {
    try {
        const { name } = req.query;
        
        if (!name || name.length < 3) {
            return res.status(400).json({
                success: false,
                error: 'Company name must be at least 3 characters'
            });
        }

        // Έλεγχος rate limit
        if (!checkInseeRateLimit()) {
            console.log(`⚠️ INSEE API rate limit exceeded for: "${name}"`);
            return res.status(429).json({
                success: false,
                error: 'Πολλές αναζητήσεις - περιμένετε λίγο και δοκιμάστε ξανά'
            });
        }

        console.log(`🏢 INSEE API search requested for: "${name}" (${inseeRateLimit.calls.length}/${inseeRateLimit.maxCallsPerMinute} calls)`);
        
        // Ensure we have valid access token
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

// Finnish YTJ API proxy endpoint για αναζήτηση φινλανδικών εταιρειών (CORS bypass)
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
        
        const data = await new Promise((resolve, reject) => {
            const options = {
                headers: {
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
                            reject(new Error(`YTJ API error: ${response.statusCode} ${response.statusMessage}`));
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
                reject(error);
            });
            
            req.setTimeout(5000, () => {
                req.destroy();
                reject(new Error('YTJ API timeout'));
            });
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

        console.log(`✅ YTJ API Response: ${companies.length} companies found`);

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

// Danish CVR API proxy endpoint για αναζήτηση δανέζικων εταιρειών (CORS bypass)
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

// Google Sheets import endpoint με Auto-Monitoring
app.post('/api/import-google-sheets', express.json(), async (req, res) => {
    const { sheetsUrl } = req.body;
    
    console.log('📊 Google Sheets import με Auto-Monitoring requested');
    
    try {
        const result = await googleSheetsMonitor.initialImport(sheetsUrl);
        // Update server timerState after successful import
        timerState.timelineSettings.startTime = result.timelineStart;
        timerState.timelineSettings.endTime = result.timelineEnd;
        timerState.title = result.projectTitle;

        console.log('📊 Server timerState updated:', {
            title: timerState.title,
            timeline: timerState.timelineSettings
        });
        
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
            message: `Google Sheets εισήχθη με ${result.loadedCount} markers. Αυτόματη παρακολούθηση ενεργή.`
        });
        
    } catch (error) {
        console.error('❌ Google Sheets import error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ------ AUTO-TIMER SETTINGS API ------

// API endpoint για λήψη auto-timer settings
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

// API endpoint για ενημέρωση auto-timer settings
app.post('/api/auto-timer/settings', express.json(), (req, res) => {
    try {
        const { enabled, minutes } = req.body;
        
        // Validation
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ 
                success: false, 
                error: 'enabled must be boolean' 
            });
        }
        
        if (typeof minutes !== 'number' || minutes < 1 || minutes > 30) {
            return res.status(400).json({ 
                success: false, 
                error: 'minutes must be number between 1-30' 
            });
        }
        
        // Update settings
        timerState.autoTimer.enabled = enabled;
        timerState.autoTimer.minutes = minutes;
        
        console.log('⏱️ Auto-timer settings updated:', { enabled, minutes });
        
        // Broadcast settings update to all clients
        io.emit('autoTimerSettingsUpdate', {
            enabled: timerState.autoTimer.enabled,
            minutes: timerState.autoTimer.minutes,
            isActive: timerState.autoTimer.isActive,
            priority: timerState.autoTimer.priority,
            timestamp: Date.now()
        });
        
        res.json({
            success: true,
            enabled: timerState.autoTimer.enabled,
            minutes: timerState.autoTimer.minutes,
            message: 'Auto-timer settings updated successfully'
        });
        
    } catch (error) {
        console.error('❌ Auto-timer settings update error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ------ EVENT MARKERS MANAGEMENT (SERVER-BASED) ------

// API endpoint για λήψη event markers
app.get('/api/event-markers', (req, res) => {
    console.log('Event markers requested');
    res.json({ 
        markers: serverEventMarkers,
        count: serverEventMarkers.length,
        timestamp: Date.now()
    });
});

// API endpoint για αποθήκευση event marker
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
    
    // Real-time ενημέρωση όλων των clients
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

// API endpoint για διαγραφή event marker
app.delete('/api/event-markers/:id', (req, res) => {
    const { id } = req.params;
    
    const markerIndex = serverEventMarkers.findIndex(marker => marker.id === id);
    
    if (markerIndex === -1) {
        return res.status(404).json({ error: 'Marker not found' });
    }
    
    const deletedMarker = serverEventMarkers.splice(markerIndex, 1)[0];
    
    console.log(`Event marker deleted: "${deletedMarker.title}"`);
    
    // Real-time ενημέρωση όλων των clients
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

// API endpoint για ενημέρωση event marker
app.post('/api/event-markers/edit', express.json(), (req, res) => {
    const { id, newTitle, newTime, newNote, newType, oldTitle, oldTime } = req.body;
    
    const markerIndex = serverEventMarkers.findIndex(marker => marker.id === id);
    
    if (markerIndex === -1) {
        return res.status(404).json({ error: 'Marker not found' });
    }
    
    if (!newTitle || newTitle.trim() === '') {
        return res.status(400).json({ error: 'Title cannot be empty' });
    }
    
    // Update marker
    serverEventMarkers[markerIndex].title = newTitle.trim();
    if (newTime) {
        serverEventMarkers[markerIndex].time = newTime.trim();
    }
    if (newNote !== undefined) {
        serverEventMarkers[markerIndex].note = newNote.trim();
    }
    if (newType) {
        serverEventMarkers[markerIndex].type = newType;
    }
    serverEventMarkers[markerIndex].timestamp = Date.now();
    
    console.log(`Event marker edited: "${oldTitle}" -> "${newTitle}", ${oldTime} -> ${newTime}`);
    
    // Real-time ενημέρωση όλων των clients
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

// Bulk delete endpoint για event markers
app.delete('/api/event-markers/clear-all', (req, res) => {
    const count = serverEventMarkers.length;
    serverEventMarkers.length = 0;
    
    console.log(`All ${count} event markers cleared`);
    
    // Real-time ενημέρωση όλων των clients
    io.emit('eventMarkersUpdate', {
        action: 'clear_all',
        allMarkers: [],
        timestamp: Date.now()
    });
    
    res.json({ 
        success: true,
        clearedCount: count
    });
});

// Bulk delete endpoint για saved messages  
app.delete('/api/saved-messages/clear-all', (req, res) => {
    const count = serverSavedMessages.length;
    serverSavedMessages.length = 0;
    
    console.log(`All ${count} saved messages cleared`);
    
    // Real-time ενημέρωση όλων των clients
    io.emit('savedMessagesUpdate', {
        action: 'clear_all',
        allMessages: [],
        timestamp: Date.now()
    });
    
    res.json({ 
        success: true,
        clearedCount: count
    });
});

// Excel monitoring endpoints
app.post('/api/markers/clear-excel', (req, res) => {
    console.log('Excel markers clear requested');
    res.json({ success: true, message: 'Excel markers cleared' });
});

app.post('/api/markers/stop-monitoring', (req, res) => {
    console.log('Excel monitoring stop requested');
    res.json({ success: true, message: 'Excel monitoring stopped' });
});

// Stop Excel monitoring and clear file path
app.post('/api/markers/stop-excel-monitoring', (req, res) => {
    console.log('🛑 Excel monitoring stop requested');
    
    try {
        // Clear the current Excel file path
        setCurrentExcelFile(null);
        
        console.log('✅ Excel monitoring stopped and file path cleared');
        res.json({ 
            success: true, 
            message: 'Excel monitoring stopped successfully' 
        });
    } catch (error) {
        console.error('❌ Error stopping Excel monitoring:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Excel file upload endpoint for web mode
app.post('/api/markers/import-excel', uploadExcel.single('excelFile'), (req, res) => {
    console.log('📊 Excel file upload request (Web mode)');
    
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
                markersCount: eventMarkers.filter(m => m.id && m.id.startsWith('excel-marker-')).length,
                message: `Αρχείο ${req.file.originalname} φορτώθηκε επιτυχώς`
            });
        } else {
            throw new Error('Excel monitoring system δεν είναι διαθέσιμο');
        }
        
    } catch (error) {
        console.error('❌ Excel upload error (Web mode):', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Σφάλμα κατά το upload του Excel αρχείου'
        });
    }
});

// Google Sheets monitoring endpoints
// Google Sheets connect endpoint
app.post('/api/google-sheets/connect', express.json(), (req, res) => {
    console.log('🔗 Google Sheets connect requested (Node Server)');

    try {
        const { url } = req.body;

        if (!url || !url.includes('docs.google.com/spreadsheets')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid Google Sheets URL'
            });
        }

        // Ξεκινάμε το monitoring (το init έχει γίνει ήδη στην αρχή)
        googleSheetsMonitor.startMonitoring(url);

        res.json({
            success: true,
            message: 'Google Sheets monitoring started'
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
    console.log('📊 Google Sheets import requested (Node Server)');

    try {
        const { url } = req.body;

        if (!url || !url.includes('docs.google.com/spreadsheets')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid Google Sheets URL'
            });
        }

        // Ξεκινάμε το monitoring αν δεν είναι ήδη ενεργό
        if (!googleSheetsMonitor.state.isActive) {
            googleSheetsMonitor.startMonitoring(url);
        }

        // Καλούμε το initialImport που κάνει το αρχικό import
        googleSheetsMonitor.initialImport(url)
            .then(result => {
                // Ενημέρωση timerState όπως στο main.js
                if (result.timelineStart) {
                    timerState.timelineSettings.startTime = result.timelineStart;
                }
                if (result.timelineEnd) {
                    timerState.timelineSettings.endTime = result.timelineEnd;
                }
                if (result.projectTitle) {
                    timerState.title = result.projectTitle;
                }

                // Broadcast τις αλλαγές στα settings
                io.emit('settingsUpdate', {
                    display: {
                        title: timerState.title
                    }
                });

                // Broadcast τις αλλαγές στο timeline
                io.emit('timelineUpdate', {
                    startTime: timerState.timelineSettings.startTime,
                    endTime: timerState.timelineSettings.endTime
                });

                // Broadcast τα νέα markers
                io.emit('eventMarkersUpdate', {
                    action: 'google_sheets_import',
                    allMarkers: [...serverEventMarkers],
                    timestamp: Date.now()
                });

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
    console.log('🔄 Google Sheets refresh requested (Node Server)');
    
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

app.post('/api/google-sheets/stop-monitoring', (req, res) => {
    console.log('Google Sheets monitoring stop requested');
    if (googleSheetsMonitor) {
        googleSheetsMonitor.stopMonitoring();
    }
    res.json({ success: true, message: 'Google Sheets monitoring stopped' });
});

app.post('/api/google-sheets/clear', (req, res) => {
    console.log('Google Sheets clear requested');
    
    // Διαγραφή μόνο των Google Sheets markers
    const beforeCount = serverEventMarkers.length;
    serverEventMarkers = serverEventMarkers.filter(marker => 
        marker.type !== 'google_sheets' && marker.source !== 'google_sheets'
    );
    const afterCount = serverEventMarkers.length;
    const clearedCount = beforeCount - afterCount;
    
    // Ενημέρωση clients
    io.emit('eventMarkersUpdate', {
        action: 'google_sheets_clear',
        allMarkers: [...serverEventMarkers],
        timestamp: Date.now()
    });
    
    res.json({ 
        success: true, 
        message: 'Google Sheets markers cleared',
        clearedCount: clearedCount
    });
});

// Network info endpoint για QR code generation
app.get('/api/network-info', (req, res) => {
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

// API endpoint για full reset στα default settings
app.post('/api/reset-to-defaults', (req, res) => {
    console.log('=== FULL RESET TO DEFAULTS REQUESTED ===');
    
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
        
        console.log('Server state reset to defaults');
        
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


// Function για εύρεση διαθέσιμης πόρτας
function findAvailablePort(startPort) {
    return new Promise((resolve) => {
        const testServer = require('net').createServer();
        
        testServer.listen(startPort, '0.0.0.0', () => {
            const availablePort = testServer.address().port;
            testServer.close(() => {
                resolve(availablePort);
            });
        });
        
        testServer.on('error', () => {
            // Η πόρτα είναι σε χρήση, δοκιμάζουμε την επόμενη
            findAvailablePort(startPort + 1).then(resolve);
        });
    });
}

// Εκκίνηση server με διαθέσιμη πόρτα
findAvailablePort(PORT).then((availablePort) => {
    PORT = availablePort;
    
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Conference Timer Server running on port ${PORT}`);
        console.log(`Server started at: ${new Date().toLocaleString('el-GR')}`);
        
        // Περιοδικός καθαρισμός ghost clients κάθε 30 δευτερόλεπτα
        setInterval(() => {
            const currentCount = io.sockets.sockets.size;
            io.emit('clientsCount', currentCount);
            console.log(`🧹 Periodic cleanup - Active clients: ${currentCount}`);
        }, 30000);
        
        // Show available addresses
        const interfaces = os.networkInterfaces();
    console.log('Available network addresses:');
    console.log(`   Local: http://localhost:${PORT}`);
    
    Object.keys(interfaces).forEach(name => {
        interfaces[name].forEach(interface => {
            if (interface.family === 'IPv4' && !interface.internal) {
                console.log(`   Network: http://${interface.address}:${PORT}`);
            }
        });
    });
    
    console.log('Admin Panel: /admin.html');
    console.log('Timer Display: /timer.html');
    console.log('Server is ready for connections!');
    
    // Save port to file for .bat script
    fs.writeFileSync('server-port.txt', PORT.toString(), 'utf8');
    console.log(`📝 Port saved to server-port.txt: ${PORT}`);
    
    // =================== AUTOMATIC API HEALTH CHECK ===================
    // Wait 2 seconds για server startup, then test APIs
    setTimeout(async () => {
        console.log('🔍 Starting automatic API health checks...');
        await performStartupAPIChecks();
    }, 2000);
    });
});

// Start Excel monitoring after server setup
excelMonitor = startExcelMonitoring(serverEventMarkers, io, timerState);

// Graceful shutdown handlers
process.on('SIGINT', () => {
    console.log('\n🔄 Received SIGINT (Ctrl+C), shutting down gracefully...');
    gracefulShutdown();
});

process.on('SIGTERM', () => {
    console.log('\n🔄 Received SIGTERM, shutting down gracefully...');
    gracefulShutdown();
});

process.on('beforeExit', () => {
    console.log('🔄 Process about to exit, performing cleanup...');
    gracefulShutdown();
});

// =================== STARTUP API HEALTH CHECKS ===================
async function performStartupAPIChecks() {
    console.log('🏥 Performing startup health checks...');
    
    // Test ΓΕΜΗ API
    const gemiHealthy = await testGemiAPI();
    
    // Test INSEE API if configured
    const inseeHealthy = await testInseeAPI();
    
    // Report overall status
    const overallHealth = gemiHealthy && inseeHealthy;
    
    if (overallHealth) {
        console.log('✅ All APIs are healthy and ready!');
    } else {
        console.log('⚠️  Some APIs have issues - see details above');
        console.log('💡 APIs will auto-retry on first user request');
    }
    
    // Schedule periodic health checks (every 30 minutes)
    setInterval(async () => {
        console.log('🔄 Periodic API health check...');
        await performStartupAPIChecks();
    }, 30 * 60 * 1000); // 30 minutes
}

async function testGemiAPI() {
    try {
        console.log('🇬🇷 Testing ΓΕΜΗ API...');
        const https = require('https');
        const startTime = Date.now();
        
        const result = await new Promise((resolve, reject) => {
            const options = {
                headers: {
                    'api_key': 'pxIOODz6Zex3fFOLcrXcr0FwIx75wQxE',
                    'User-Agent': 'TimeCast-Pro/4.3.3'
                }
            };
            
            const req = https.get('https://opendata-api.businessportal.gr/api/opendata/v1/companies?name=test&resultsSize=1', options, (response) => {
                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    const responseTime = Date.now() - startTime;
                    try {
                        const json = JSON.parse(data);
                        resolve({
                            success: response.statusCode === 200,
                            responseTime,
                            companyCount: json.searchResults?.length || 0,
                            statusCode: response.statusCode
                        });
                    } catch (error) {
                        resolve({ success: false, error: 'JSON parse error', responseTime });
                    }
                });
            });
            
            req.on('error', error => resolve({ success: false, error: error.message }));
            req.setTimeout(8000, () => {
                req.abort();
                resolve({ success: false, error: 'Timeout (8s)' });
            });
        });
        
        if (result.success) {
            console.log(`✅ ΓΕΜΗ API: Healthy (${result.responseTime}ms, ${result.companyCount} companies)`);
            return true;
        } else {
            console.log(`❌ ΓΕΜΗ API: ${result.error || 'Failed'}`);
            return false;
        }
        
    } catch (error) {
        console.log(`❌ ΓΕΜΗ API: ${error.message}`);
        return false;
    }
}

async function testInseeAPI() {
    try {
        console.log('🇫🇷 Testing INSEE API...');
        
        // Quick token test (simplified)
        const tokenValid = await testInseeToken();
        
        if (tokenValid) {
            console.log('✅ INSEE API: Healthy (OAuth token valid)');
            return true;
        } else {
            console.log('❌ INSEE API: Token issue');
            return false;
        }
        
    } catch (error) {
        console.log(`❌ INSEE API: ${error.message}`);
        return false;
    }
}

async function testInseeToken() {
    try {
        // This will test if we can get an access token
        const token = await getInseeAccessToken();
        return !!token;
    } catch (error) {
        console.log(`⚠️  INSEE token test: ${error.message}`);
        return false; // Don't fail startup για INSEE issues
    }
}

process.on('exit', (code) => {
    console.log(`🔄 Process exiting with code ${code}`);
});

function gracefulShutdown() {
    console.log('🧹 Starting graceful shutdown...');
    
    // Stop timer interval
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        console.log('✅ Timer interval cleared');
    }
    
    // Stop vMix monitoring
    if (vmixAPI) {
        vmixAPI.stopMonitoring();
        vmixAPI.destroy();
        console.log('✅ vMix API stopped');
    }
    
    // Stop Google Sheets monitoring
    if (googleSheetsMonitor) {
        googleSheetsMonitor.stopMonitoring();
        console.log('✅ Google Sheets monitoring stopped');
    }
    
    // Stop Excel monitoring
    if (excelMonitor && excelMonitor.stop) {
        excelMonitor.stop();
        console.log('✅ Excel monitoring stopped');
    }
    
    // Close socket.io connections
    if (io) {
        io.close(() => {
            console.log('✅ Socket.io closed');
        });
    }
    
    // Close HTTP server
    if (server) {
        server.close(() => {
            console.log('✅ HTTP server closed');
            console.log('🔄 Graceful shutdown completed');
            process.exit(0);
        });
    } else {
        console.log('🔄 Graceful shutdown completed');
        process.exit(0);
    }
}