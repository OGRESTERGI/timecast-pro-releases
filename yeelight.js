/**
 * Yeelight Integration Module for TimeCast Pro
 * Handles RGB bulb control with timer color synchronization
 * Author: Claude Code Assistant
 * Date: 2025-09-21
 */

class YeelightManager {
    constructor() {
        this.isEnabled = false;
        this.connectedBulbs = [];
        this.selectedBulbs = []; // Λάμπες που συμμετέχουν στο timer sync
        this.currentTimerState = 'idle'; // idle, running, warning, expired
        this.lastTimerUpdate = 0;
        this.colorSettings = {
            idle: { r: 128, g: 128, b: 128 },      // Gray - timer not running
            running: { r: 0, g: 255, b: 0 },      // Green - timer running normally
            warning: { r: 255, g: 80, b: 0 },     // Orange - warning time (last 2 mins)
            expired: { r: 255, g: 0, b: 0 },      // Red - timer expired
            break: { r: 0, g: 100, b: 255 }       // Blue - break time
        };
        this.brightness = 100;
        this.transitionDuration = 0; // 0ms για άμεσες αλλαγές
        this.transitionMode = "sudden"; // sudden για άμεσες αλλαγές, smooth για fade
        this.warningThreshold = 60; // Default 60 seconds, will be read from settings
        this.lastDiscoveryTime = 0;
        this.discoveryCache = [];
        this.commandQueue = [];
        this.isProcessingQueue = false;
        this.connectionTimeout = 10000; // 10 second timeout
        this.retryAttempts = 3;
        this.pulseInterval = null; // Για warning pulse effect
        this.isPulsing = false;
    }

    /**
     * Initialize Yeelight integration με auto-discovery και selection
     */
    async init() {
        console.log('🔄 Initializing Yeelight Manager...');
        try {
            // Discover bulbs first
            await this.discoverBulbs();

            // ΔΕΝ κάνουμε auto-select - ο χρήστης επιλέγει manually
            console.log(`💡 Found ${this.connectedBulbs.length} bulbs - waiting for manual selection`);

            await this.setupTimerListeners();
            this.isEnabled = true;
            console.log('✅ Yeelight Manager initialized successfully');
            console.log(`📊 Status: ${this.selectedBulbs.length}/${this.connectedBulbs.length} bulbs selected for timer sync`);
            return true;
        } catch (error) {
            console.error('❌ Yeelight Manager initialization failed:', error);
            return false;
        }
    }

    /**
     * Discover available Yeelight bulbs με caching
     */
    async discoverBulbs(force = false) {
        try {
            // Use cache if recent (< 60 seconds) and not forced
            const now = Date.now();
            if (!force && now - this.lastDiscoveryTime < 60000 && this.discoveryCache.length > 0) {
                console.log('📦 Using cached bulb discovery');
                this.connectedBulbs = this.discoveryCache;
                return this.connectedBulbs;
            }

            console.log(force ? '🔄 Force discovery (bypassing cache)' : '🔍 Fresh discovery');
            const response = await fetch('/api/yeelight/discover');
            const data = await response.json();

            if (data.success) {
                this.connectedBulbs = data.bulbs || [];
                this.discoveryCache = [...this.connectedBulbs];
                this.lastDiscoveryTime = now;
                console.log(`💡 Found ${this.connectedBulbs.length} Yeelight bulbs:`, this.connectedBulbs);

                // Auto-update settings UI
                this.updateSettingsUI();

                return this.connectedBulbs;
            } else {
                console.warn('⚠️ No Yeelight bulbs discovered');
                return [];
            }
        } catch (error) {
            console.error('❌ Bulb discovery failed:', error);
            // Return cached bulbs as fallback
            if (this.discoveryCache.length > 0) {
                console.log('🔄 Using cached bulbs as fallback');
                this.connectedBulbs = this.discoveryCache;
                return this.connectedBulbs;
            }
            return [];
        }
    }

    /**
     * Setup timer event listeners for color synchronization
     */
    setupTimerListeners() {
        // Listen to existing timer updates from TimeCast Pro
        if (typeof socket !== 'undefined') {
            socket.on('timerUpdate', (data) => {
                this.handleTimerUpdate(data);
            });

            socket.on('timerStateChange', (data) => {
                this.handleTimerStateChange(data);
            });

            console.log('🔗 Timer event listeners registered');
        }

        // Also listen to DOM events as backup
        document.addEventListener('timerUpdate', (event) => {
            this.handleTimerUpdate(event.detail);
        });

        // Watch for global timer variables
        setInterval(() => {
            this.checkTimerState();
        }, 1000); // Check every second
    }

    /**
     * Handle timer updates from TimeCast Pro
     */
    handleTimerUpdate(data) {
        if (!this.isEnabled || this.connectedBulbs.length === 0) return;

        // Read current warning threshold from admin settings
        this.updateWarningThreshold();

        const timeLeft = data.timeLeft || data.remainingTime || 0;
        const isRunning = data.isRunning || data.running || false;
        const totalTime = data.totalTime || data.originalTime || 0;

        let newState = 'idle';

        if (isRunning) {
            if (timeLeft <= 0) {
                newState = 'expired';
            } else if (timeLeft <= this.warningThreshold) {
                newState = 'warning';
            } else {
                newState = 'running';
            }
        } else {
            newState = 'idle';
        }

        if (newState !== this.currentTimerState) {
            this.currentTimerState = newState;

            // Stop any existing pulse για clean transition
            this.stopPulse();

            if (newState === 'warning') {
                // Start pulsing για warning state
                this.startPulse();
            } else {
                // Update colors normally για other states
                this.updateBulbColors();
            }

            console.log(`🎨 Timer state changed to: ${newState} (${timeLeft}s remaining, warning at ${this.warningThreshold}s)`);
        }
    }

    /**
     * Read warning threshold from admin settings
     */
    updateWarningThreshold() {
        const warningInput = document.getElementById('main-warning-threshold');
        if (warningInput) {
            const newThreshold = parseInt(warningInput.value) || 60;
            if (newThreshold !== this.warningThreshold) {
                this.warningThreshold = newThreshold;
                console.log(`⚠️ Warning threshold updated to: ${this.warningThreshold} seconds`);
            }
        }
    }

    /**
     * Handle timer state changes (start/stop/pause)
     */
    handleTimerStateChange(data) {
        if (!this.isEnabled) return;

        const state = data.state || data.status;
        console.log(`⏰ Timer state change: ${state}`);

        switch (state) {
            case 'started':
            case 'running':
                // Color will be set by handleTimerUpdate
                break;
            case 'paused':
                this.currentTimerState = 'idle';
                this.updateBulbColors();
                break;
            case 'stopped':
            case 'reset':
                this.currentTimerState = 'idle';
                this.updateBulbColors();
                break;
            case 'break':
                this.currentTimerState = 'break';
                this.updateBulbColors();
                break;
        }
    }

    /**
     * Check current timer state by reading global variables
     */
    checkTimerState() {
        if (!this.isEnabled || this.connectedBulbs.length === 0) return;

        // Try to read from global timer variables
        let timeLeft = 0;
        let isRunning = false;

        // Check various possible global variable names used in TimeCast Pro
        if (typeof window.timerState !== 'undefined') {
            timeLeft = window.timerState.timeLeft || 0;
            isRunning = window.timerState.isRunning || false;
        } else if (typeof window.remainingTime !== 'undefined') {
            timeLeft = window.remainingTime;
            isRunning = window.timerRunning || false;
        }

        if (isRunning && timeLeft !== this.lastTimerUpdate) {
            this.lastTimerUpdate = timeLeft;
            this.handleTimerUpdate({ timeLeft, isRunning });
        }
    }

    /**
     * Update only SELECTED bulbs with current state color (PARALLEL για timer sync)
     */
    async updateBulbColors() {
        if (!this.isEnabled || this.selectedBulbs.length === 0) {
            if (this.connectedBulbs.length > 0 && this.selectedBulbs.length === 0) {
                console.warn('⚠️ No bulbs selected for timer sync! Use setBulbSelection() to choose bulbs.');
            }
            return;
        }

        const color = this.colorSettings[this.currentTimerState];
        if (!color) return;

        console.log(`🎯 Timer sync: Updating ${this.selectedBulbs.length}/${this.connectedBulbs.length} SELECTED bulbs to ${this.currentTimerState} color:`, color);

        // Sequential execution για timer sync - μόνο επιλεγμένες λάμπες
        for (const bulb of this.selectedBulbs) {
            try {
                const response = await fetch('/api/yeelight/set-color', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ip: bulb.ip,
                        red: color.r,
                        green: color.g,
                        blue: color.b,
                        brightness: this.brightness,
                        duration: this.transitionDuration
                    })
                });

                const result = await response.json();
                if (result.success) {
                    console.log(`✅ Timer sync: ${bulb.ip} updated`);
                } else {
                    console.warn(`⚠️ Timer sync: ${bulb.ip} failed`);
                }
            } catch (error) {
                console.error(`❌ Timer sync failed for ${bulb.ip}:`, error);
            }
        }

        console.log(`🎯 Timer sync completed for ${this.selectedBulbs.length} selected bulbs`);
    }

    /**
     * Set which bulbs participate in timer sync
     */
    setBulbSelection(selectedIps) {
        this.selectedBulbs = this.connectedBulbs.filter(bulb => selectedIps.includes(bulb.ip));
        console.log(`🎯 Timer sync selection updated: ${this.selectedBulbs.length}/${this.connectedBulbs.length} bulbs selected`);
        console.log('Selected IPs:', this.selectedBulbs.map(b => b.ip));
    }

    /**
     * Add bulb to timer sync selection - ΧΡΗΣΗ MAC ΩΣ UNIQUE ID
     */
    addBulbToSelection(bulbIdentifier) {
        // Accept either IP or MAC
        const bulb = this.connectedBulbs.find(b =>
            b.ip === bulbIdentifier || b.mac === bulbIdentifier
        );

        if (bulb && !this.selectedBulbs.find(b => b.mac === bulb.mac)) {
            this.selectedBulbs.push(bulb);
            console.log(`➕ Added ${bulb.name || bulb.ip} (MAC: ${bulb.mac}) to timer sync selection`);
        }
    }

    /**
     * Remove bulb from timer sync selection - ΧΡΗΣΗ MAC ΩΣ UNIQUE ID
     */
    removeBulbFromSelection(bulbIdentifier) {
        // Accept either IP or MAC
        const index = this.selectedBulbs.findIndex(b =>
            b.ip === bulbIdentifier || b.mac === bulbIdentifier
        );

        if (index >= 0) {
            const bulb = this.selectedBulbs[index];
            this.selectedBulbs.splice(index, 1);
            console.log(`➖ Removed ${bulb.name || bulb.ip} (MAC: ${bulb.mac}) from timer sync selection`);
        }
    }

    /**
     * Get current selection status - ΧΡΗΣΗ MAC ΩΣ UNIQUE ID
     */
    getBulbSelectionStatus() {
        return {
            total: this.connectedBulbs.length,
            selected: this.selectedBulbs.length,
            selectedMacs: this.selectedBulbs.map(b => b.mac), // MAC-based για persistence
            selectedIps: this.selectedBulbs.map(b => b.ip),   // IP για display
            unselectedBulbs: this.connectedBulbs.filter(bulb =>
                !this.selectedBulbs.find(s => s.mac === bulb.mac) // Compare με MAC
            )
        };
    }

    /**
     * Select all discovered bulbs for timer sync
     */
    selectAllBulbs() {
        this.selectedBulbs = [...this.connectedBulbs];
        console.log(`✅ All ${this.selectedBulbs.length} bulbs selected for timer sync`);
    }

    /**
     * Deselect all bulbs from timer sync
     */
    deselectAllBulbs() {
        this.selectedBulbs = [];
        console.log(`❌ All bulbs deselected from timer sync`);
    }

    /**
     * Quick setup method για manual configuration στο admin console
     */
    async quickSetup() {
        console.log('🚀 Quick Yeelight Setup για admin.html...');
        try {
            // Re-discover bulbs
            await this.discoverBulbs();

            if (this.connectedBulbs.length === 0) {
                console.warn('⚠️ No bulbs found! Make sure bulbs are on same network and LAN mode is enabled.');
                return false;
            }

            // Auto-select all for timer sync
            this.selectAllBulbs();

            console.log('✅ Quick setup completed!');
            console.log(`📊 Found: ${this.connectedBulbs.length} bulbs`);
            console.log(`🎯 Selected: ${this.selectedBulbs.length} bulbs for timer sync`);
            console.log('💡 Test με: yeelightManager.testBulb(ip, "running")');

            return true;
        } catch (error) {
            console.error('❌ Quick setup failed:', error);
            return false;
        }
    }

    /**
     * Add command to queue για sequential processing
     */
    addToCommandQueue(command) {
        this.commandQueue.push(command);
        if (!this.isProcessingQueue) {
            this.processCommandQueue();
        }
    }

    /**
     * Process command queue sequentially
     */
    async processCommandQueue() {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;

        while (this.commandQueue.length > 0) {
            const command = this.commandQueue.shift();
            try {
                await this.executeCommand(command);
                // Wait between commands for stability
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (error) {
                console.error('❌ Command queue error:', error);
            }
        }

        this.isProcessingQueue = false;
    }

    /**
     * Execute a single command με retry logic
     */
    async executeCommand(command) {
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const response = await fetch('/api/yeelight/set-color', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(command),
                    signal: AbortSignal.timeout(this.connectionTimeout)
                });

                const result = await response.json();
                if (result.success) {
                    console.log(`✅ Command successful for ${command.ip} (attempt ${attempt})`);
                    return true;
                }
            } catch (error) {
                console.warn(`⚠️ Command attempt ${attempt} failed for ${command.ip}:`, error);
                if (attempt < this.retryAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }
        console.error(`❌ All attempts failed for ${command.ip}`);
        return false;
    }

    /**
     * Set specific bulb color με queueing
     */
    async setBulbColor(bulbIp, red, green, blue) {
        const command = {
            ip: bulbIp,
            red: red,
            green: green,
            blue: blue,
            brightness: this.brightness,
            duration: this.transitionDuration
        };

        this.addToCommandQueue(command);
        return true; // Queue acceptance, not command success
    }

    /**
     * Set brightness only for SELECTED bulbs (ticked checkboxes)
     */
    async setBrightness(brightness) {
        this.brightness = Math.max(1, Math.min(100, brightness));

        // ΚΡΙΣΙΜΟ: Επηρεάζουμε ΜΟΝΟ τις επιλεγμένες λάμπες
        for (const bulb of this.selectedBulbs) {
            try {
                await fetch('/api/yeelight/set-brightness', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        ip: bulb.ip,
                        brightness: this.brightness,
                        duration: this.transitionDuration
                    })
                });
            } catch (error) {
                console.error(`❌ Failed to set brightness for bulb ${bulb.ip}:`, error);
            }
        }
    }

    /**
     * Test bulb with specific color
     */
    async testBulb(bulbIp, colorName) {
        const color = this.colorSettings[colorName];
        if (!color) {
            console.error(`❌ Unknown color: ${colorName}`);
            return false;
        }

        console.log(`🧪 Testing bulb ${bulbIp} with ${colorName} color`);
        return await this.setBulbColor(bulbIp, color.r, color.g, color.b);
    }

    /**
     * Manual color override (for testing)
     */
    async setManualColor(red, green, blue) {
        console.log(`🎨 Manual color override: RGB(${red}, ${green}, ${blue})`);

        for (const bulb of this.connectedBulbs) {
            await this.setBulbColor(bulb.ip, red, green, blue);
        }
    }

    /**
     * Enable/disable Yeelight integration
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
        console.log(`💡 Yeelight integration ${enabled ? 'enabled' : 'disabled'}`);

        if (!enabled) {
            // Turn off all bulbs when disabled
            this.setManualColor(128, 128, 128); // Gray
        }
    }

    /**
     * Update color settings
     */
    updateColorSettings(settings) {
        this.colorSettings = { ...this.colorSettings, ...settings };
        console.log('🎨 Color settings updated:', this.colorSettings);
    }

    /**
     * Get current status for UI
     */
    getStatus() {
        return {
            enabled: this.isEnabled,
            bulbCount: this.connectedBulbs.length,
            selectedCount: this.selectedBulbs.length,
            currentState: this.currentTimerState,
            brightness: this.brightness,
            bulbs: this.connectedBulbs.map(bulb => ({
                ip: bulb.ip,
                name: bulb.name || `Bulb ${bulb.ip}`,
                model: bulb.model,
                selected: this.selectedBulbs.some(s => s.ip === bulb.ip)
            })),
            selection: this.getBulbSelectionStatus()
        };
    }

    /**
     * Start pulse effect για warning state
     */
    startPulse() {
        if (this.isPulsing) return;

        this.isPulsing = true;
        let isPulseHigh = true; // Start με high brightness

        // Set initial color με full brightness
        this.updateBulbColors();

        // Pulse μεταξύ 70% και 100% της επιλεγμένης φωτεινότητας
        this.pulseInterval = setInterval(async () => {
            if (!this.isEnabled || this.currentTimerState !== 'warning') {
                this.stopPulse();
                return;
            }

            const targetBrightness = isPulseHigh ? this.brightness : Math.floor(this.brightness * 0.7);
            isPulseHigh = !isPulseHigh;

            // Apply pulse brightness σε όλες τις επιλεγμένες λάμπες
            for (const bulb of this.selectedBulbs) {
                try {
                    await fetch('/api/yeelight/set-brightness', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            ip: bulb.ip,
                            brightness: targetBrightness,
                            duration: 800 // 0.8s smooth transition
                        })
                    });
                } catch (error) {
                    console.error(`❌ Pulse error for bulb ${bulb.ip}:`, error);
                }
            }
        }, 1200); // Pulse κάθε 1.2 δευτερόλεπτα

        console.log('💓 Started warning pulse effect (70-100% brightness)');
    }

    /**
     * Stop pulse effect
     */
    stopPulse() {
        if (this.pulseInterval) {
            clearInterval(this.pulseInterval);
            this.pulseInterval = null;
        }
        this.isPulsing = false;

        // Restore normal brightness
        if (this.isEnabled && this.selectedBulbs.length > 0) {
            setTimeout(() => {
                this.setBrightness(this.brightness);
            }, 100);
        }

        console.log('💓 Stopped pulse effect');
    }

    /**
     * Flash effect για manual flash alerts
     */
    async triggerFlash(flashCount = 3) {
        if (!this.isEnabled || this.selectedBulbs.length === 0) return;

        console.log(`⚡ Starting flash effect (${flashCount} times)`);

        // Save current state
        const originalState = this.currentTimerState;
        const originalIsPulsing = this.isPulsing;

        // Stop pulse if running
        if (this.isPulsing) {
            this.stopPulse();
        }

        // Flash sequence: White → Original Color → White → Original Color...
        for (let i = 0; i < flashCount; i++) {
            // Flash white (bright)
            await this.setFlashColor(255, 255, 255, 100);
            await this.sleep(200); // 200ms white

            // Return to current timer color
            await this.updateBulbColors();
            await this.sleep(200); // 200ms normal color

            // Short pause between flashes
            if (i < flashCount - 1) {
                await this.sleep(100);
            }
        }

        // Restore pulse if it was running
        if (originalIsPulsing && originalState === 'warning') {
            setTimeout(() => {
                this.startPulse();
            }, 300);
        }

        console.log('⚡ Flash effect completed');
    }

    /**
     * Set flash color για όλες τις επιλεγμένες λάμπες
     */
    async setFlashColor(red, green, blue, brightness) {
        const promises = this.selectedBulbs.map(async (bulb) => {
            try {
                // Set color
                await fetch('/api/yeelight/set-color', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        ip: bulb.ip,
                        red: red,
                        green: green,
                        blue: blue,
                        brightness: brightness,
                        duration: 0, // Instant change
                        flashMode: true // Reduce logging για flash
                    })
                });
            } catch (error) {
                console.error(`❌ Flash error for bulb ${bulb.ip}:`, error);
            }
        });

        await Promise.all(promises);
    }

    /**
     * Sleep utility για flash timing
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Force re-selection of bulbs (για restore επαναφορά)
     */
    async forceReSelectBulbs(bulbIps) {
        if (!Array.isArray(bulbIps)) return;

        console.log(`🔄 Force re-selecting ${bulbIps.length} bulbs for proper connection...`);

        // Clear current selections first
        this.selectedBulbs = [];

        // Re-select each bulb με proper connection
        for (const ip of bulbIps) {
            const bulb = this.connectedBulbs.find(b => b.ip === ip);
            if (bulb) {
                // Remove first (to ensure clean state)
                this.removeBulbFromSelection(ip);
                await this.sleep(50); // Small delay

                // Then add back (this ensures proper connection)
                this.addBulbToSelection(ip);
                console.log(`🎯 Re-selected bulb: ${ip}`);
            } else {
                console.warn(`⚠️ Bulb ${ip} not found in connected bulbs`);
            }
        }

        console.log(`✅ Force re-selection completed: ${this.selectedBulbs.length} bulbs active`);
    }

    /**
     * Update Settings UI when bulbs change (auto-sync)
     */
    updateSettingsUI() {
        if (typeof yeelightUpdateBulbTable === 'function') {
            yeelightUpdateBulbTable();
        }

        // Update status in settings modal
        const statusDiv = document.getElementById('yeelight-status');
        if (statusDiv) {
            if (this.connectedBulbs.length > 0) {
                statusDiv.textContent = `✅ ${this.connectedBulbs.length} λάμπες`;
                statusDiv.style.color = '#22c55e';
            } else {
                statusDiv.textContent = '❌ Δεν βρέθηκαν λάμπες';
                statusDiv.style.color = '#ef4444';
            }
        }

        console.log(`🎮 Settings UI updated: ${this.connectedBulbs.length} bulbs, ${this.selectedBulbs.length} selected`);
    }
}

// Global instance
window.yeelightManager = new YeelightManager();

// Auto-initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure TimeCast Pro is loaded
    setTimeout(() => {
        if (window.yeelightManager) {
            window.yeelightManager.init();

            // Periodic re-discovery κάθε 5 λεπτά για auto-discovery νέων λαμπών
            setInterval(async () => {
                try {
                    const oldCount = window.yeelightManager.connectedBulbs.length;
                    await window.yeelightManager.discoverBulbs();
                    const newCount = window.yeelightManager.connectedBulbs.length;

                    if (newCount > oldCount) {
                        console.log(`📡 Auto-discovery: Found ${newCount - oldCount} new bulbs`);
                        // Δεν κάνουμε auto-select νέων λαμπών - μόνο log
                    }
                } catch (error) {
                    console.warn('⚠️ Periodic discovery error:', error);
                }
            }, 300000); // 5 minutes
        }
    }, 2000);
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = YeelightManager;
}