// vmix-api.js - vMix API Integration για Video Duration Monitoring
// Συνδέεται με vMix API και παρακολουθεί video duration

const http = require('http');
const xml2js = require('xml2js');
const net = require('net'); // For TCP API

class VmixAPI {
    constructor(host = 'localhost', port = 8088) {
        this.host = host;
        this.port = port;
        this.tcpPort = 8099; // vMix TCP API port
        this.tcpClient = null;
        this.useTcpTally = false; // Flag to enable/disable TCP tally - ROLLBACK: TCP disabled
        this.baseUrl = `http://${host}:${port}/api`;
        this.isConnected = false;
        this.monitoringInterval = null;
        this.currentVideoData = null;
        this.callbacks = {
            onVideoProgress: null,
            onVideoChange: null,
            onConnectionChange: null
        };
        
        // Initialize tally state
        this.currentTallyState = {
            timerInputOnProgram: false,
            timerInputOnPreview: false,
            currentProgramInput: null,
            currentPreviewInput: null
        };
        
        // Initialize timer input keys as empty array (will use auto-detection)
        this.timerInputKeys = [];
        this.manualTimerInput = null;
        
        // For reducing log spam - track last logged state
        this.lastLoggedTallyState = null;
        
        console.log(`🎥 vMix API initialized - ${this.baseUrl}`);
    }

    // Έλεγχος σύνδεσης με vMix
    async testConnection() {
        try {
            const response = await this.makeRequest('/');
            this.isConnected = true;
            console.log('✅ vMix API connection successful');
            if (this.callbacks.onConnectionChange) {
                this.callbacks.onConnectionChange(true);
            }
            return true;
        } catch (error) {
            this.isConnected = false;
            console.log('❌ vMix API connection failed:', error.message);
            if (this.callbacks.onConnectionChange) {
                this.callbacks.onConnectionChange(false);
            }
            return false;
        }
    }

    // HTTP request στο vMix API
    makeRequest(endpoint) {
        return new Promise((resolve, reject) => {
            const url = `${this.baseUrl}${endpoint}`;
            // console.log(`🔗 vMix API request: ${url}`); // Disabled for performance
            
            const request = http.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        // console.log(`✅ vMix API response: ${res.statusCode}`); // Disabled for performance
                        resolve(data);
                    } else {
                        console.log(`❌ vMix API error: ${res.statusCode}`);
                        reject(new Error(`HTTP ${res.statusCode}`));
                    }
                });
            });
            
            request.on('error', (error) => {
                // Only log connection errors occasionally to reduce spam
                if (!this.lastRequestErrorTime || Date.now() - this.lastRequestErrorTime > 30000) {
                    console.log(`❌ vMix API connection error: ${error.message}`);
                    this.lastRequestErrorTime = Date.now();
                }
                reject(error);
            });
            
            // Timeout after 5 seconds
            request.setTimeout(5000, () => {
                console.log('⏰ vMix API request timeout');
                request.destroy();
                reject(new Error('Request timeout'));
            });
        });
    }

    // Λήψη πλήρους κατάστασης vMix (XML)
    async getStatus() {
        try {
            const xmlData = await this.makeRequest('/');
            const parser = new xml2js.Parser();
            const result = await parser.parseStringPromise(xmlData);
            
            return result.vmix;
        } catch (error) {
            // Only log connection errors occasionally to reduce spam
            if (!this.lastConnectionErrorTime || Date.now() - this.lastConnectionErrorTime > 30000) {
                console.error('❌ Failed to get vMix status:', error.message);
                this.lastConnectionErrorTime = Date.now();
            }
            return null;
        }
    }

    // Λήψη πληροφοριών για συγκεκριμένο input
    async getInputInfo(inputKey) {
        try {
            const status = await this.getStatus();
            if (!status || !status.inputs || !status.inputs[0] || !status.inputs[0].input) {
                return null;
            }

            const inputs = status.inputs[0].input;
            const input = inputs.find(inp => 
                inp.$.key === inputKey || 
                inp.$.number === inputKey.toString()
            );

            return input || null;
        } catch (error) {
            console.error('❌ Failed to get input info:', error.message);
            return null;
        }
    }

    // Λήψη τρέχοντος PREVIEW input
    async getPreviewInput() {
        try {
            const status = await this.getStatus();
            if (!status || !status.preview) return null;
            
            const previewKey = status.preview[0];
            return await this.getInputInfo(previewKey);
        } catch (error) {
            console.error('❌ Failed to get preview input:', error.message);
            return null;
        }
    }

    // Λήψη τρέχοντος PROGRAM (OUTPUT) input
    async getProgramInput() {
        try {
            const status = await this.getStatus();
            if (!status || !status.active) return null;
            
            const programKey = status.active[0];
            return await this.getInputInfo(programKey);
        } catch (error) {
            console.error('❌ Failed to get program input:', error.message);
            return null;
        }
    }

    // Ανάλυση video duration data
    parseVideoData(input) {
        if (!input || !input.$) return null;

        const data = {
            key: input.$.key,
            number: input.$.number,
            type: input.$.type,
            title: input.$.title || 'Unknown',
            state: input.$.state || 'Stopped',
            position: parseInt(input.$.position) || 0,
            duration: parseInt(input.$.duration) || 0,
            loop: input.$.loop === 'True',
            muted: input.$.muted === 'True',
            volume: parseInt(input.$.volume) || 100
        };

        // Υπολογισμός remaining time
        data.remaining = Math.max(0, data.duration - data.position);
        data.remainingSeconds = Math.floor(data.remaining / 1000);
        data.progressPercent = data.duration > 0 ? (data.position / data.duration) * 100 : 0;

        return data;
    }

    // Μορφοποίηση χρόνου σε MM:SS
    formatTime(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // Έναρξη παρακολούθησης video
    startMonitoring(intervalMs = 1000) {
        if (this.monitoringInterval) {
            this.stopMonitoring();
        }

        console.log(`🔄 Starting vMix monitoring (${intervalMs}ms interval)`);
        
        this.monitoringInterval = setInterval(async () => {
            await this.checkVideoProgress();
        }, intervalMs);

        // Άμεσος έλεγχος
        this.checkVideoProgress();
    }

    // Στάση παρακολούθησης
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            console.log('⏹️ vMix monitoring stopped');
        }
    }

    // Έλεγχος προόδου video
    async checkVideoProgress() {
        try {
            if (!this.isConnected) {
                await this.testConnection();
                if (!this.isConnected) return;
            }

            // Λήψη program input (αυτό που εμφανίζεται live)
            const programInput = await this.getProgramInput();
            
            if (programInput && (programInput.$.type === 'VideoList' || programInput.$.type === 'Video')) {
                const videoData = this.parseVideoData(programInput);
                
                if (videoData) {
                    // Έλεγχος αν άλλαξε το video
                    const hasChanged = !this.currentVideoData || 
                                     this.currentVideoData.key !== videoData.key ||
                                     this.currentVideoData.title !== videoData.title;

                    if (hasChanged && this.callbacks.onVideoChange) {
                        console.log(`🎬 Video changed: ${videoData.title} (${this.formatTime(videoData.duration)})`);
                        this.callbacks.onVideoChange(videoData);
                    }

                    // Callback για progress
                    if (this.callbacks.onVideoProgress) {
                        this.callbacks.onVideoProgress(videoData);
                    }

                    this.currentVideoData = videoData;
                }
            } else {
                // Δεν παίζει video στο program
                if (this.currentVideoData) {
                    console.log('⏹️ No video playing in program');
                    this.currentVideoData = null;
                    
                    if (this.callbacks.onVideoChange) {
                        this.callbacks.onVideoChange(null);
                    }
                }
            }

        } catch (error) {
            console.error('❌ Error checking video progress:', error.message);
            this.isConnected = false;
        }
    }

    // Ρύθμιση callbacks
    onVideoProgress(callback) {
        this.callbacks.onVideoProgress = callback;
    }

    onVideoChange(callback) {
        this.callbacks.onVideoChange = callback;
    }

    onConnectionChange(callback) {
        this.callbacks.onConnectionChange = callback;
    }

    onTallyChange(callback) {
        this.callbacks.onTallyChange = callback;
    }

    // ============ TALLY LIGHT MONITORING ============
    
    // Set timer input keys to monitor (e.g. ["1", "2"] or ["GT1", "GT2"])
    setTimerInputKeys(keys) {
        this.timerInputKeys = Array.isArray(keys) ? keys : [keys];
        console.log(`🚨 Timer input keys set: ${this.timerInputKeys ? this.timerInputKeys.join(', ') : 'none'}`);
    }
    
    // Set manual timer input (overrides auto-detection)
    setManualTimerInput(inputKey) {
        this.manualTimerInput = inputKey;
        if (inputKey) {
            console.log(`🎯 Manual timer input set: "${inputKey}" (overrides auto-detect)`);
        } else {
            console.log(`🔍 Manual timer input cleared - using auto-detect`);
        }
    }
    
    // Start tally monitoring
    startTallyMonitoring(intervalMs = 1000) {
        if (this.tallyMonitorInterval) {
            console.log('⚠️ Tally monitoring already running');
            return;
        }
        
        console.log(`🚨 Starting tally monitoring (${intervalMs}ms interval) - TCP: ${this.useTcpTally ? 'ON' : 'OFF'}`);
        this.tallyMonitorInterval = setInterval(() => {
            if (this.useTcpTally) {
                this.checkTallyTCP();
            } else {
                this.checkTallyStatus();
            }
        }, intervalMs);
        
        // Initial check
        if (this.useTcpTally) {
            this.checkTallyTCP();
        } else {
            this.checkTallyStatus();
        }
    }
    
    // Stop tally monitoring
    stopTallyMonitoring() {
        if (this.tallyMonitorInterval) {
            clearInterval(this.tallyMonitorInterval);
            this.tallyMonitorInterval = null;
            console.log('🚨 Tally monitoring stopped');
        }
    }
    
    // Check current tally status
    async checkTallyStatus() {
        try {
            const [programInput, previewInput] = await Promise.all([
                this.getProgramInput(),
                this.getPreviewInput()
            ]);
            
            // Check direct input match AND overlay detection
            const timerOnProgram = this.isTimerInput(programInput) || await this.checkTimerInOverlays(programInput) || await this.checkTimerInGlobalOverlays();
            const timerOnPreview = this.isTimerInput(previewInput) || await this.checkTimerInOverlays(previewInput);
            
            // Create current state summary for comparison
            const currentLogState = {
                programTitle: programInput ? programInput.$.title : null,
                programKey: programInput ? programInput.$.key : null,
                previewTitle: previewInput ? previewInput.$.title : null,
                previewKey: previewInput ? previewInput.$.key : null,
                timerOnProgram,
                timerOnPreview
            };
            
            // Only log when something actually changed
            const logStateChanged = !this.lastLoggedTallyState || 
                JSON.stringify(currentLogState) !== JSON.stringify(this.lastLoggedTallyState);
            
            if (logStateChanged) {
                console.log('🚨 === TALLY STATE CHANGED ===');
                console.log('📺 Program input:', programInput ? `"${programInput.$.title}" (${programInput.$.key})` : 'None');
                console.log('🟡 Preview input:', previewInput ? `"${previewInput.$.title}" (${previewInput.$.key})` : 'None');
                console.log('🚨 Timer detection results:');
                console.log(`   📺 Program has timer: ${timerOnProgram}`);
                console.log(`   🟡 Preview has timer: ${timerOnPreview}`);
                
                this.lastLoggedTallyState = currentLogState;
            }

            // Find the actual timer input
            const timerInput = await this.findTimerInput();
            
            const newTallyState = {
                timerInputOnProgram: timerOnProgram,
                timerInputOnPreview: timerOnPreview,
                currentProgramInput: programInput ? {
                    key: programInput.$.key,
                    number: programInput.$.number,
                    title: programInput.$.title
                } : null,
                currentPreviewInput: previewInput ? {
                    key: previewInput.$.key,
                    number: previewInput.$.number,
                    title: previewInput.$.title
                } : null,
                timerInput: timerInput ? {
                    key: timerInput.key,
                    number: timerInput.number,
                    title: timerInput.title
                } : null
            };
            
            // Check if tally state changed (including timer input changes)
            const timerInputChanged = this.timerInputChanged(newTallyState.timerInput, this.currentTallyState.timerInput);
            
            const stateChanged = (
                newTallyState.timerInputOnProgram !== this.currentTallyState.timerInputOnProgram ||
                newTallyState.timerInputOnPreview !== this.currentTallyState.timerInputOnPreview ||
                this.programInputChanged(newTallyState.currentProgramInput, this.currentTallyState.currentProgramInput) ||
                this.previewInputChanged(newTallyState.currentPreviewInput, this.currentTallyState.currentPreviewInput) ||
                timerInputChanged
            );
            
            if (stateChanged) {
                // Log timer input changes
                if (timerInputChanged) {
                    const oldTimer = this.currentTallyState.timerInput;
                    const newTimer = newTallyState.timerInput;
                    console.log(`🎯 Timer input changed: ${oldTimer?.number || 'none'} → ${newTimer?.number || 'none'}`);
                }
                
                // Only log when timer tally actually changes
                if (newTallyState.timerInputOnProgram !== this.currentTallyState.timerInputOnProgram ||
                    newTallyState.timerInputOnPreview !== this.currentTallyState.timerInputOnPreview) {
                    console.log(`🚨 Tally changed: Program=${newTallyState.timerInputOnProgram}, Preview=${newTallyState.timerInputOnPreview}`);
                }
                
                this.currentTallyState = newTallyState;
                
                if (this.callbacks.onTallyChange) {
                    this.callbacks.onTallyChange(this.currentTallyState);
                }
            }
            
        } catch (error) {
            console.error('❌ Error checking tally status:', error.message);
            
            // Detect vMix offline and notify
            if (error.message && error.message.includes('ECONNREFUSED')) {
                this.isConnected = false;
                
                // Send offline notification to clients
                if (this.callbacks.onConnectionChange) {
                    this.callbacks.onConnectionChange(false);
                }
                
                // Clear current state when offline
                const offlineState = {
                    timerInputOnProgram: false,
                    timerInputOnPreview: false,
                    currentProgramInput: null,
                    currentPreviewInput: null
                };
                
                // Only notify if state actually changed
                const stateChanged = (
                    offlineState.timerInputOnProgram !== this.currentTallyState.timerInputOnProgram ||
                    offlineState.timerInputOnPreview !== this.currentTallyState.timerInputOnPreview ||
                    this.currentTallyState.currentProgramInput !== null ||
                    this.currentTallyState.currentPreviewInput !== null
                );
                
                if (stateChanged) {
                    this.currentTallyState = offlineState;
                    
                    if (this.callbacks.onTallyChange) {
                        this.callbacks.onTallyChange(this.currentTallyState);
                    }
                }
            }
        }
    }
    
    // Check if input is a timer input
    isTimerInput(input) {
        if (!input || !input.$) return false;
        
        // Check by key or number
        const inputKey = input.$.key;
        const inputNumber = input.$.number;
        const inputTitle = input.$.title || '';
        
        // PRIORITY 1: Manual timer input selection (highest priority)
        if (this.manualTimerInput) {
            const isMatch = inputKey === this.manualTimerInput || inputNumber === this.manualTimerInput;
            if (isMatch) {
                console.log(`✅ TIMER: "${inputTitle}" (manual selection)`);
            }
            return isMatch;
        }
        
        // PRIORITY 2: Explicit timer input keys  
        if (this.timerInputKeys && (this.timerInputKeys.includes(inputKey) || this.timerInputKeys.includes(inputNumber))) {
            console.log(`✅ TIMER: "${inputTitle}" (key match)`);
            return true;
        }
        
        // PRIORITY 3: Auto-detect timer by title if no specific keys configured
        if (!this.timerInputKeys || this.timerInputKeys.length === 0) {
            // Enhanced title matching patterns
            const lowerTitle = inputTitle.toLowerCase();
            
            // Primary patterns (high confidence)
            if (lowerTitle.includes('timerclock') || 
                lowerTitle.includes('timecast') ||
                lowerTitle === 'timer.xaml' ||
                lowerTitle === 'clock.xaml') {
                console.log(`✅ TIMER: "${inputTitle}" (primary pattern)`);
                return true;
            }
            
            // Secondary patterns (medium confidence - avoid false positives)
            if ((lowerTitle.includes('timer') && !lowerTitle.includes('camera') && !lowerTitle.includes('subtitle')) ||
                lowerTitle.includes('χρόνος') ||
                lowerTitle.includes('ρολόι')) {
                console.log(`✅ TIMER: "${inputTitle}" (secondary pattern)`);
                return true;
            }
        }
        
        return false;
    }

    // Check if timer exists as overlay/layer in the given input
    async checkTimerInOverlays(input) {
        if (!input || !input.$) return false;
        
        try {
            const inputKey = input.$.key;
            const inputTitle = input.$.title || '';
            
            // Only log overlay checks when we have overlays to check
            
            // Get full status to access overlay information
            const status = await this.getStatus();
            if (!status || !status.inputs || !status.inputs[0] || !status.inputs[0].input) {
                return false;
            }
            
            // Find the specific input in the full status
            const fullInput = status.inputs[0].input.find(inp => inp.$.key === inputKey);
            if (!fullInput) {
                return false;
            }
            
            // Check if this input has overlays (vMix structure: overlay is array)
            if (fullInput.overlay && Array.isArray(fullInput.overlay)) {
                
                for (const overlay of fullInput.overlay) {
                    if (overlay.$ && overlay.$.key) {
                        const overlayKey = overlay.$.key;
                        
                        // Find the input that corresponds to this overlay key
                        const overlayInput = status.inputs[0].input.find(inp => inp.$.key === overlayKey);
                        if (overlayInput) {
                            const overlayTitle = overlayInput.$.title || '';
                            
                            // Check if this overlay input is the timer
                            if ((this.timerInputKeys && (this.timerInputKeys.includes(overlayInput.$.number) || 
                                this.timerInputKeys.includes(overlayKey))) ||
                                this.isTimerInput(overlayInput)) {
                                console.log(`✅ TIMER OVERLAY: "${overlayTitle}" in "${inputTitle}"`);
                                return true;
                            }
                        }
                    }
                }
            }
            
            return false;
            
        } catch (error) {
            console.error('❌ Error checking overlays:', error.message);
            return false;
        }
    }

    // Check if timer exists in global overlays (overlay buttons 1,2,3,4)
    async checkTimerInGlobalOverlays() {
        try {
            // Only log when actually connected to vMix (reduce spam when offline)
            const status = await this.getStatus();
            if (!status) {
                // Silent fail when vMix is offline - user already knows from offline indicator
                return false;
            }
            
            // Only log overlay checking when we find something or on first check

            // Check for global overlays in the root of vMix XML
            if (status.overlays && status.overlays[0] && status.overlays[0].overlay) {
                const globalOverlays = status.overlays[0].overlay;
                
                for (let i = 0; i < globalOverlays.length; i++) {
                    const overlay = globalOverlays[i];
                    const overlayNumber = i + 1;
                    
                    // Check if this overlay slot has content
                    if (overlay && overlay._) {
                        const inputNumber = overlay._; // The input number in this overlay slot
                        
                        // Find the input by number
                        if (status.inputs && status.inputs[0] && status.inputs[0].input) {
                            const overlayInput = status.inputs[0].input.find(inp => inp.$.number === inputNumber);
                            if (overlayInput) {
                                const overlayTitle = overlayInput.$.title || '';
                                
                                // Check if this overlay input is the timer
                                if (this.isTimerInput(overlayInput)) {
                                    console.log(`✅ TIMER OVERLAY ${overlayNumber}: "${overlayTitle}"`);
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
            
            return false;
            
        } catch (error) {
            console.error('❌ Error checking global overlays:', error.message);
            return false;
        }
    }

    
    // Helper to check if program input changed
    programInputChanged(newInput, oldInput) {
        if (!newInput && !oldInput) return false;
        if (!newInput || !oldInput) return true;
        return newInput.key !== oldInput.key;
    }
    
    // Helper to check if preview input changed
    previewInputChanged(newInput, oldInput) {
        if (!newInput && !oldInput) return false;
        if (!newInput || !oldInput) return true;
        return newInput.key !== oldInput.key;
    }
    
    // Helper to check if timer input changed
    timerInputChanged(newInput, oldInput) {
        if (!newInput && !oldInput) return false;
        if (!newInput || !oldInput) return true;
        return newInput.key !== oldInput.key || newInput.number !== oldInput.number;
    }
    
    // Get current tally state
    getTallyState() {
        return { ...this.currentTallyState };
    }

    // Cleanup
    // ===== TCP API METHODS =====
    
    // Connect to vMix TCP API for tally information
    connectTCP() {
        if (this.tcpClient) {
            console.log('🔌 TCP client already exists, closing first');
            this.tcpClient.destroy();
        }

        return new Promise((resolve, reject) => {
            this.tcpClient = new net.Socket();
            
            this.tcpClient.connect(this.tcpPort, this.host, () => {
                console.log(`✅ Connected to vMix TCP API: ${this.host}:${this.tcpPort}`);
                resolve();
            });

            this.tcpClient.on('error', (error) => {
                console.error('❌ TCP connection error:', error.message);
                this.tcpClient = null;
                reject(error);
            });

            this.tcpClient.on('close', () => {
                console.log('🔌 TCP connection closed');
                this.tcpClient = null;
            });
        });
    }

    // Get tally states via TCP API
    async getTallyStatesTCP() {
        if (!this.tcpClient) {
            console.log('⚠️ No TCP connection, attempting to connect...');
            try {
                await this.connectTCP();
            } catch (error) {
                console.error('❌ Failed to connect TCP:', error.message);
                return null;
            }
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('TCP TALLY command timeout'));
            }, 5000);

            this.tcpClient.once('data', (data) => {
                clearTimeout(timeout);
                const response = data.toString().trim();
                console.log('📡 TCP TALLY response:', response);
                
                // Parse: "TALLY OK 0121000..." 
                if (response.startsWith('TALLY OK ')) {
                    const tallyStates = response.substring(9); // Remove "TALLY OK "
                    console.log(`🚨 TCP Tally States: ${tallyStates.length} inputs`);
                    resolve(tallyStates);
                } else {
                    reject(new Error(`Unexpected TCP response: ${response}`));
                }
            });

            this.tcpClient.write('TALLY\r\n');
        });
    }

    // Enhanced tally check using TCP API
    async checkTallyTCP() {
        try {
            if (!this.useTcpTally) {
                // Fallback to HTTP method
                return this.checkTally();
            }

            console.log('🚨 === TCP TALLY CHECK ===');
            const tallyStates = await this.getTallyStatesTCP();
            
            if (!tallyStates) {
                console.log('❌ No TCP tally data, falling back to HTTP');
                return this.checkTally();
            }

            // Find timer input position and check its tally state
            const timerInputFound = await this.findTimerInput();
            if (!timerInputFound) {
                console.log('❌ Timer input not found');
                return this.setTallyState('offline', null, null);
            }

            const timerInputNumber = parseInt(timerInputFound.number) - 1; // Convert to 0-based index
            if (timerInputNumber >= tallyStates.length) {
                console.log(`⚠️ Timer input ${timerInputNumber + 1} beyond tally data length ${tallyStates.length}`);
                return this.setTallyState('offline', null, null);
            }

            const tallyValue = tallyStates[timerInputNumber];
            console.log(`🎯 Timer input ${timerInputNumber + 1} tally state: "${tallyValue}"`);

            let newState;
            switch (tallyValue) {
                case '1':
                    newState = 'program';
                    console.log('🔴 Timer is ON PROGRAM (including overlays!)');
                    break;
                case '2':
                    newState = 'preview';
                    console.log('🟡 Timer is ON PREVIEW');
                    break;
                case '0':
                default:
                    newState = 'standby';
                    console.log('🔵 Timer is ON STANDBY');
                    break;
            }

            return this.setTallyState(newState, timerInputFound, null);

        } catch (error) {
            console.error('❌ TCP Tally check failed:', error.message);
            console.log('🔄 Falling back to HTTP API...');
            return this.checkTally();
        }
    }

    // Find timer input (reuse existing method)
    async findTimerInput() {
        try {
            const status = await this.getStatus();
            if (!status || !status.inputs || !status.inputs[0] || !status.inputs[0].input) {
                return null;
            }

            // Use existing timer detection logic
            for (const input of status.inputs[0].input) {
                if (this.isTimerInput(input)) {
                    console.log(`🎯 Timer input found: "${input.$.title}" (${input.$.number})`);
                    return {
                        number: input.$.number,
                        title: input.$.title,
                        key: input.$.key
                    };
                }
            }
            return null;
        } catch (error) {
            console.error('❌ Error finding timer input:', error.message);
            return null;
        }
    }

    destroy() {
        this.stopMonitoring();
        this.stopTallyMonitoring();
        
        // Close TCP connection
        if (this.tcpClient) {
            this.tcpClient.destroy();
            this.tcpClient = null;
        }
        
        this.callbacks = {};
        console.log('🧹 vMix API destroyed');
    }
}

module.exports = VmixAPI;