/**
 * TimeCast Pro - License Manager με Real-time Dashboard Sync
 * Updated version με dual API calls
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { app } = require('electron');
const { exec } = require('child_process');

class LicenseManager {
    constructor() {
        this.machineId = null;
        this.baseUrl = 'https://timecast.eu/licensing/api.php'; // Main licensing API
        this.dashboardApiUrl = 'https://timecast.eu/account/machines-api.php'; // Dashboard API
        this.gracePeriodDays = 7; // Grace period για offline usage (reduced from 14)
        this.licenseFilePath = path.join(app.getPath('userData'), '.license_cache.json');
    }

    /**
     * Convert grace period time to DD:HH:SS format
     * @param {number} totalDays - Total days remaining (can be fractional)
     * @returns {string} Formatted string in DD:HH:SS format
     */
    formatGracePeriod(totalDays) {
        const totalMilliseconds = totalDays * 24 * 60 * 60 * 1000;
        const totalSeconds = Math.floor(totalMilliseconds / 1000);

        const days = Math.floor(totalSeconds / (24 * 60 * 60));
        const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
        const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
        const seconds = totalSeconds % 60;

        // Format as DD:HH:MM:SS (include seconds for precise countdown)
        const DD = String(days).padStart(2, '0');
        const HH = String(hours).padStart(2, '0');
        const MM = String(minutes).padStart(2, '0');
        const SS = String(seconds).padStart(2, '0');

        return `${DD}:${HH}:${MM}:${SS}`;
    }

    /**
     * Generate machine fingerprint για licensing
     */
    async generateMachineFingerprint() {
        console.log('🔍 Generating hardware fingerprint με ΣΚΛΗΡΑ ΔΕΔΟΜΕΝΑ...');
        try {
            const fingerprints = [];

            // ΜΟΝΟ ΣΚΛΗΡΑ ΔΕΔΟΜΕΝΑ - ΑΜΕΤΑΒΛΗΤΑ HARDWARE ΣΤΟΙΧΕΙΑ
            if (os.platform() === 'win32') {
                console.log('🔍 Scanning ΣΚΛΗΡΑ ΔΕΔΟΜΕΝΑ...');
                const windowsFingerprints = await this.getWindowsFingerprints();
                fingerprints.push(...windowsFingerprints);
                console.log('🔒 Found', windowsFingerprints.length, 'ΣΚΛΗΡΑ ΔΕΔΟΜΕΝΑ components');
            }

            // ΑΦΑΙΡΕΘΗΚΑΝ ΟΛΑ ΤΑ ΜΕΤΑΒΛΗΤΑ ΣΤΟΙΧΕΙΑ:
            // ❌ CPU Model - δεν αλλάζει αλλά περιττό για hardware binding
            // ❌ Architecture/Platform - δεν αλλάζει αλλά περιττό
            // ❌ Memory - μπορεί να αλλάξει με προσθήκη RAM
            // ❌ Network interfaces - αλλάζουν με VPN/WiFi/virtual adapters
            // ❌ Hostname - μπορεί να αλλάξει ο χρήστης

            // Create stable hash από all fingerprints
            const fingerprintString = fingerprints.sort().join('|');
            const machineHash = crypto.createHash('sha256')
                .update(fingerprintString)
                .digest('hex');

            // Create human-readable machine ID (ORIGINAL FORMAT για backward compatibility)
            this.machineId = `TC-${machineHash.substring(0, 8).toUpperCase()}-${machineHash.substring(8, 16).toUpperCase()}`;

            console.log('🔒 Immutable Components:', JSON.stringify(fingerprints, null, 0));
            console.log('✅ Hardware Fingerprint Created:', this.machineId);
            console.log('📊 Total Fingerprint Components:', fingerprints.length);
            console.log('🔑 Fingerprint String:', fingerprintString);
            
            return this.machineId;

        } catch (error) {
            console.error('❌ Error generating machine fingerprint:', error.message);
            console.error('🔧 Using fallback fingerprint generation...');
            
            // Fallback fingerprint από basic system info
            const fallbackData = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.totalmem()}`;
            const fallbackHash = crypto.createHash('md5').update(fallbackData).digest('hex');
            this.machineId = `TC-FALLBACK-${fallbackHash.substring(0, 12).toUpperCase()}`;
            
            console.log('🆘 Fallback Machine ID:', this.machineId);
            console.log('🔧 Fallback Data Used:', fallbackData);
            return this.machineId;
        }
    }

    /**
     * Windows-specific hardware fingerprints (ORIGINAL για backward compatibility)
     * Reverted to original logic to maintain existing machine IDs
     */
    async getWindowsFingerprints() {
        return new Promise((resolve) => {
            const fingerprints = [];
            let completedCommands = 0;
            const totalCommands = 3; // Updated to 3 commands για ΣΚΛΗΡΑ ΔΕΔΟΜΕΝΑ

            const checkComplete = () => {
                completedCommands++;
                if (completedCommands >= totalCommands) {
                    resolve(fingerprints);
                }
            };

            // Get Windows Machine GUID με timeout (ΑΜΕΤΑΒΛΗΤΟ)
            exec('wmic csproduct get uuid /format:list', { timeout: 5000 }, (error, stdout) => {
                if (!error && stdout) {
                    const uuidMatch = stdout.match(/UUID=(.+)/);
                    if (uuidMatch && uuidMatch[1] && uuidMatch[1].trim() !== '' && uuidMatch[1].trim() !== 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF') {
                        fingerprints.push(`mobo_uuid:${uuidMatch[1].trim()}`);
                        console.log('✅ Motherboard UUID found');
                    }
                }
                checkComplete();
            });

            // Get Motherboard Serial με timeout (ΑΜΕΤΑΒΛΗΤΟ)
            exec('wmic baseboard get serialnumber /format:list', { timeout: 5000 }, (error, stdout) => {
                if (!error && stdout) {
                    const serialMatch = stdout.match(/SerialNumber=(.+)/);
                    if (serialMatch && serialMatch[1] && serialMatch[1].trim() !== '' && serialMatch[1].trim() !== 'None') {
                        fingerprints.push(`mobo_serial:${serialMatch[1].trim()}`);
                        console.log('✅ Motherboard Serial found');
                    }
                }
                checkComplete();
            });

            // Get BIOS Serial με timeout (ΠΟΛΥ ΑΜΕΤΑΒΛΗΤΟ - το πιο σταθερό)
            exec('wmic bios get serialnumber /format:list', { timeout: 5000 }, (error, stdout) => {
                if (!error && stdout) {
                    const biosMatch = stdout.match(/SerialNumber=(.+)/);
                    if (biosMatch && biosMatch[1] && biosMatch[1].trim() !== '' && biosMatch[1].trim() !== 'None') {
                        fingerprints.push(`bios_serial:${biosMatch[1].trim()}`);
                        console.log('✅ BIOS Serial found');
                    }
                }
                checkComplete();
            });

            // Fallback timeout - αν δεν πάρουμε response σε 6 seconds (consistent)
            setTimeout(() => {
                if (completedCommands < totalCommands) {
                    console.warn('⚠️  License Manager: Windows fingerprint commands timed out after 6s');
                    resolve(fingerprints);
                }
            }, 6000);
        });
    }

    /**
     * Network interface fingerprints (MAC addresses)
     */
    getNetworkFingerprints() {
        const fingerprints = [];
        const networkInterfaces = os.networkInterfaces();

        Object.keys(networkInterfaces).forEach(interfaceName => {
            networkInterfaces[interfaceName].forEach(iface => {
                // Skip loopback και virtual interfaces
                if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
                    fingerprints.push(`net:${iface.mac}`);
                }
            });
        });

        return fingerprints;
    }

    /**
     * System-specific fingerprints
     */
    async getSystemFingerprints() {
        const fingerprints = [];
        
        // Hostname fingerprint
        fingerprints.push(`host:${os.hostname()}`);
        
        return fingerprints;
    }

    /**
     * Get detailed hardware information για machine management
     */
    async getHardwareDetails() {
        try {
            const details = {
                pc_name: os.hostname(),
                platform: os.platform(),
                architecture: os.arch(),
                cpu_model: null,
                motherboard_model: null,
                motherboard_serial: null,
                total_memory: Math.floor(os.totalmem() / (1024 * 1024 * 1024)) + 'GB'
            };

            // CPU Information
            const cpus = os.cpus();
            if (cpus && cpus.length > 0) {
                details.cpu_model = cpus[0].model;
            }

            // Windows-specific hardware details
            if (os.platform() === 'win32') {
                const hardwareInfo = await this.getWindowsHardwareDetails();
                Object.assign(details, hardwareInfo);
            }

            return details;
        } catch (error) {
            console.error('❌ Error getting hardware details:', error.message);
            return {
                pc_name: os.hostname(),
                platform: os.platform(),
                architecture: os.arch(),
                cpu_model: 'Unknown',
                motherboard_model: 'Unknown',
                motherboard_serial: 'Unknown',
                total_memory: 'Unknown'
            };
        }
    }

    /**
     * Get Windows hardware details (motherboard model + serial)
     */
    async getWindowsHardwareDetails() {
        return new Promise((resolve) => {
            const details = {
                motherboard_model: null,
                motherboard_serial: null
            };
            let completedCommands = 0;
            const totalCommands = 2;
            
            const checkComplete = () => {
                completedCommands++;
                if (completedCommands >= totalCommands) {
                    resolve(details);
                }
            };
            
            // Get Motherboard Model
            exec('wmic baseboard get product /format:list', { timeout: 5000 }, (error, stdout) => {
                if (!error && stdout) {
                    const modelMatch = stdout.match(/Product=(.+)/);
                    if (modelMatch && modelMatch[1] && modelMatch[1].trim() !== '') {
                        details.motherboard_model = modelMatch[1].trim();
                    }
                }
                checkComplete();
            });
            
            // Get Motherboard Serial (reuse from fingerprint logic)
            exec('wmic baseboard get serialnumber /format:list', { timeout: 5000 }, (error, stdout) => {
                if (!error && stdout) {
                    const serialMatch = stdout.match(/SerialNumber=(.+)/);
                    if (serialMatch && serialMatch[1] && serialMatch[1].trim() !== '' && serialMatch[1].trim() !== 'None') {
                        details.motherboard_serial = serialMatch[1].trim();
                    }
                }
                checkComplete();
            });
            
            // Timeout fallback
            setTimeout(() => {
                if (completedCommands < totalCommands) {
                    console.warn('⚠️  Windows hardware commands timed out');
                    resolve(details);
                }
            }, 6000);
        });
    }

    /**
     * Sync machine activation με customer dashboard system
     */
    async syncWithDashboard(licenseKey, hardwareDetails) {
        try {
            console.log('🔗 Dashboard API URL:', this.dashboardApiUrl);
            
            const payload = {
                license_key: licenseKey,
                machine_id: this.machineId,
                machine_name: hardwareDetails.pc_name || `${hardwareDetails.platform || 'unknown'}-${Date.now()}`,
                hardware_details: hardwareDetails
            };
            
            console.log('📤 Sending dashboard sync payload:', JSON.stringify(payload, null, 2));
            
            const response = await fetch(`${this.dashboardApiUrl}?action=activate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'TimeCast-Pro-Client/1.0'
                },
                body: JSON.stringify(payload),
                timeout: 12000 // 12 second timeout (consistent)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                console.log('✅ Dashboard machine registration successful');
                return { success: true };
            } else {
                console.error('❌ Dashboard registration failed:', data.error);
                return { success: false, error: data.error };
            }
            
        } catch (error) {
            console.error('❌ Dashboard sync network error:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Activate Machine για License
     */
    async activateMachine(licenseKey, machineName = null) {
        try {
            if (!this.machineId) {
                await this.generateMachineFingerprint();
            }

            const defaultMachineName = `${os.hostname()} (${os.platform()})`;
            
            // Get detailed hardware information
            console.log('🔍 Collecting hardware details...');
            const hardwareDetails = await this.getHardwareDetails();
            
            // SECURITY CHECK: Verify license is not already active on another machine
            console.log('🔒 Security check: Verifying license not active on other machines...');

            try {
                // Use get_machines endpoint to check for active machines with this license
                const machinesResponse = await this.makeAPICall('get_machines', {
                    license_key: licenseKey
                });

                console.log('🔍 Machines check response:', machinesResponse);

                if (machinesResponse.success && machinesResponse.machines && Array.isArray(machinesResponse.machines)) {
                    // Look for active machines
                    const activeMachines = machinesResponse.machines.filter(machine =>
                        machine.status === 'active' && machine.machine_id !== this.machineId
                    );

                    if (activeMachines.length > 0) {
                        const activeMachine = activeMachines[0];
                        console.log('🚫 License already active on different machine:', activeMachine.machine_id);
                        return {
                            success: false,
                            error: `This license key is already active on another machine (${activeMachine.machine_name || 'Unknown'}). Please deactivate it first from the admin panel.`,
                            machine_conflict: {
                                current_machine: this.machineId,
                                active_machine: activeMachine.machine_id,
                                machine_name: activeMachine.machine_name || 'Unknown'
                            }
                        };
                    }

                    // Check if already active on THIS machine
                    const thisMachine = machinesResponse.machines.find(machine =>
                        machine.machine_id === this.machineId && machine.status === 'active'
                    );

                    if (thisMachine) {
                        console.log('✅ License already active on this machine');
                        return {
                            success: true,
                            message: 'License is already active on this machine',
                            already_active: true
                        };
                    }
                }

                console.log('✅ Security check passed - license not active on any other machine');

            } catch (securityError) {
                console.log('⚠️ Security check failed - continuing with activation attempt:', securityError.message);
                // Continue with activation - API might not support get_machines endpoint yet
            }

            console.log('⚡ Activating machine...');

            const response = await this.makeAPICall('activate', {
                license_key: licenseKey,
                machine_id: this.machineId,
                machine_name: machineName || defaultMachineName,
                hardware_details: hardwareDetails
            });

            if (response.success) {
                console.log('✅ Machine activation successful in main licensing system');
                
                // CRITICAL: Also register machine in dashboard system
                console.log('📊 Syncing machine με customer dashboard...');
                console.log('🔗 License Key για sync:', licenseKey);
                console.log('🖥️ Machine ID για sync:', this.machineId);
                console.log('📋 Hardware details για sync:', JSON.stringify(hardwareDetails, null, 2));
                
                try {
                    const dashboardSync = await this.syncWithDashboard(licenseKey, hardwareDetails);
                    if (dashboardSync.success) {
                        console.log('✅ Dashboard sync successful - Machine should appear in dashboard now!');
                    } else {
                        console.error('❌ Dashboard sync failed:', dashboardSync.error);
                        console.error('🔧 Manual fix needed: Visit dashboard και check API response');
                        // Continue anyway - main activation succeeded
                    }
                } catch (dashboardError) {
                    console.error('❌ Dashboard sync critical error:', dashboardError.message);
                    console.error('🔧 Network issue or API unavailable');
                    // Continue anyway - main activation succeeded
                }
                
                // Validate again to get updated info
                const validationResult = await this.validateLicense(licenseKey, true);
                
                return {
                    success: true,
                    message: response.message,
                    validation: validationResult,
                    dashboardSynced: true
                };
            } else {
                console.log('❌ Machine activation failed:', response.error);
                return {
                    success: false,
                    error: response.error || 'Machine activation failed'
                };
            }

        } catch (error) {
            console.error('❌ Machine activation error:', error.message);
            return {
                success: false,
                error: error.message || 'Machine activation failed'
            };
        }
    }

    /**
     * Validate License
     */
    async validateLicense(licenseKey, forceOnline = false) {
        try {
            if (!this.machineId) {
                await this.generateMachineFingerprint();
            }

            // Check offline cache first (unless forced online)
            if (!forceOnline) {
                const cachedResult = this.checkOfflineCache(licenseKey);
                if (cachedResult) {
                    return cachedResult;
                }
            }

            // Online validation
            console.log('🌐 Validating license online...');
            
            const response = await this.makeAPICall('validate', {
                license_key: licenseKey,
                machine_id: this.machineId
            });

            if (response.valid) {
                console.log('✅ License validation successful');

                // CRITICAL: Check if machine is still active on this specific machine
                if (response.license && response.license.current_machine_active === false) {
                    console.log('🚨 CRITICAL: Machine has been DEACTIVATED remotely - current_machine_active: false');
                    console.log('🔄 Machine must enter Grace Period immediately');

                    // Clear license cache since machine is deactivated
                    this.clearLicenseFromMemory();

                    return {
                        valid: false,
                        online: true,
                        deactivated: true,
                        phase: 'grace',
                        error: 'Machine has been deactivated remotely'
                    };
                }

                // Save to offline cache only if machine is active
                this.saveLicenseCache(licenseKey, response);

                return {
                    valid: true,
                    online: true,
                    license: response.license,
                    machineInfo: response.machine_info || {}
                };
            } else {
                console.log('❌ License validation failed:', response.error);
                return {
                    valid: false,
                    online: true,
                    error: response.error || 'License validation failed'
                };
            }

        } catch (error) {
            console.error('❌ License validation error:', error.message);
            
            // Try offline cache as fallback
            const cachedResult = this.checkOfflineCache(licenseKey);
            if (cachedResult) {
                console.log('📱 Falling back to offline cache');
                return cachedResult;
            }
            
            return {
                valid: false,
                online: false,
                error: error.message || 'License validation failed'
            };
        }
    }

    /**
     * Check offline license cache
     */
    checkOfflineCache(licenseKey) {
        try {
            if (!fs.existsSync(this.licenseFilePath)) {
                return null;
            }

            const cacheData = JSON.parse(fs.readFileSync(this.licenseFilePath, 'utf8'));
            
            if (cacheData.license_key !== licenseKey || cacheData.machine_id !== this.machineId) {
                return null;
            }

            // Check if cache is within grace period
            const cacheDate = new Date(cacheData.cached_at);
            const now = new Date();
            const daysDiff = (now - cacheDate) / (1000 * 60 * 60 * 24);

            if (daysDiff <= this.gracePeriodDays) {
                const daysRemaining = Math.max(0, this.gracePeriodDays - daysDiff);
                console.log(`📱 Using offline cache (${Math.floor(daysDiff)} days old)`);
                return {
                    valid: true,
                    online: false,
                    license: cacheData.license,
                    cached: true,
                    graceDaysRemaining: daysRemaining,
                    graceTimeFormatted: this.formatGracePeriod(daysRemaining)
                };
            } else {
                console.log('⏰ Offline cache expired');
                return null;
            }

        } catch (error) {
            console.error('❌ Error reading offline cache:', error.message);
            return null;
        }
    }

    /**
     * Save License Cache για Offline Usage
     */
    saveLicenseCache(licenseKey, licenseData) {
        try {
            const cacheData = {
                license_key: licenseKey,
                machine_id: this.machineId,
                license: licenseData.license,
                cached_at: new Date().toISOString(),
                cache_version: '1.0'
            };

            fs.writeFileSync(this.licenseFilePath, JSON.stringify(cacheData, null, 2));
            console.log('💾 License cached για offline usage');

        } catch (error) {
            console.error('❌ Error saving license cache:', error.message);
        }
    }

    /**
     * Make API Call με error handling
     */
    async makeAPICall(action, data) {
        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'TimeCast-Pro-Client/1.0'
                },
                body: JSON.stringify({
                    action: action,
                    ...data
                }),
                timeout: 12000 // 12 second timeout (consistent)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            return result;

        } catch (error) {
            console.error(`❌ API call failed (${action}):`, error.message);
            throw error;
        }
    }

    /**
     * Deactivate Machine
     */
    async deactivateMachine(licenseKey) {
        try {
            if (!this.machineId) {
                await this.generateMachineFingerprint();
            }

            const response = await this.makeAPICall('deactivate', {
                license_key: licenseKey,
                machine_id: this.machineId
            });

            if (response.success) {
                console.log('✅ Machine deactivation successful');
                
                // Also deactivate from dashboard system
                try {
                    const dashboardResponse = await fetch(`${this.dashboardApiUrl}?action=deactivate`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            license_key: licenseKey,
                            machine_id: this.machineId
                        })
                    });
                    
                    if (dashboardResponse.ok) {
                        console.log('✅ Dashboard deactivation successful');
                    }
                } catch (dashboardError) {
                    console.warn('⚠️  Dashboard deactivation failed:', dashboardError.message);
                }
                
                // Clear offline cache
                if (fs.existsSync(this.licenseFilePath)) {
                    fs.unlinkSync(this.licenseFilePath);
                    console.log('🗑️ Offline cache cleared');
                }
                
                return {
                    success: true,
                    message: response.message
                };
            } else {
                console.log('❌ Machine deactivation failed:', response.error);
                return {
                    success: false,
                    error: response.error || 'Machine deactivation failed'
                };
            }

        } catch (error) {
            console.error('❌ Machine deactivation error:', error.message);
            return {
                success: false,
                error: error.message || 'Machine deactivation failed'
            };
        }
    }

    /**
     * Clear License from Memory/Cache
     * Called after successful deactivation to ensure no license data remains
     */
    clearLicenseFromMemory() {
        try {
            console.log('🧹 Clearing all license data from memory and cache...');

            // Clear offline cache file
            if (fs.existsSync(this.licenseFilePath)) {
                fs.unlinkSync(this.licenseFilePath);
                console.log('🗑️ Deleted offline license cache file');
            }

            // Clear machine fingerprint cache if it exists
            const machineFilePath = path.join(path.dirname(this.licenseFilePath), '.machine_id');
            if (fs.existsSync(machineFilePath)) {
                fs.unlinkSync(machineFilePath);
                console.log('🗑️ Deleted machine fingerprint cache');
            }

            // Clear any other license-related cache files
            const licenseDir = path.dirname(this.licenseFilePath);
            const cacheFiles = [
                path.join(licenseDir, 'license.json'),
                path.join(licenseDir, '.license'),
                path.join(licenseDir, 'license_cache.json')
            ];

            cacheFiles.forEach(file => {
                if (fs.existsSync(file)) {
                    fs.unlinkSync(file);
                    console.log(`🗑️ Deleted license cache file: ${path.basename(file)}`);
                }
            });

            // Reset internal state variables
            this.cachedLicenseData = null;
            this.lastValidationTime = null;

            console.log('✅ License memory cleanup completed');

        } catch (error) {
            console.error('❌ Error clearing license from memory:', error);
        }
    }

    /**
     * Clear ALL License Data (including UI state)
     * Called after deactivation to ensure complete license amnesia
     */
    clearAllLicenseData() {
        try {
            console.log('🧹🧹 COMPLETE LICENSE AMNESIA - Clearing ALL license data...');

            // First clear file-based cache
            this.clearLicenseFromMemory();

            // Clear localStorage (browser-based storage)
            try {
                if (typeof window !== 'undefined' && window.localStorage) {
                    console.log('🗑️ Clearing localStorage license data...');
                    localStorage.removeItem('timecast_license_key');
                    localStorage.removeItem('license_cache');
                    localStorage.removeItem('licenseData');
                    console.log('✅ localStorage cleared');
                }
            } catch (e) {
                console.log('⚠️ localStorage not available (likely main process)');
            }

            // Clear global variables
            try {
                if (typeof window !== 'undefined') {
                    console.log('🗑️ Clearing global license variables...');
                    if (window.currentLicenseData) {
                        delete window.currentLicenseData;
                        console.log('✅ window.currentLicenseData cleared');
                    }
                    if (window.licenseKey) {
                        delete window.licenseKey;
                        console.log('✅ window.licenseKey cleared');
                    }
                }
            } catch (e) {
                console.log('⚠️ Global variables not available (likely main process)');
            }

            console.log('✅ COMPLETE LICENSE AMNESIA completed - no license data should remain');

        } catch (error) {
            console.error('❌ Error in complete license clearing:', error);
        }
    }

    /**
     * Get License Status (για UI display)
     */
    async getLicenseStatus() {
        try {
            // Generate machine ID if not already created
            if (!this.machineId) {
                await this.generateMachineFingerprint();
            }

            // Get cached license key first
            const cacheData = this.getCacheStatus();

            if (!cacheData || !cacheData.licenseKey) {
                return {
                    valid: false,
                    error: 'No license found'
                };
            }

            // Try online validation first with retry logic
            const maxRetries = 3;
            const retryDelay = 2000; // 2 seconds between retries

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`🌐 Attempting online license validation (attempt ${attempt}/${maxRetries})...`);
                    const onlineResult = await this.validateLicense(cacheData.licenseKey, true); // Force online
                    if (onlineResult.valid) {
                        console.log('✅ Online validation successful - returning to ACTIVE LICENSE mode');
                        return onlineResult;
                    }
                } catch (onlineError) {
                    console.log(`❌ Online validation attempt ${attempt} failed:`, onlineError.message);

                    if (attempt < maxRetries) {
                        console.log(`⏳ Retrying in ${retryDelay/1000} seconds...`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                    } else {
                        console.log('🚨 All online validation attempts failed - triggering offline grace period');
                    }
                }
            }

            // Online validation failed - check offline cache as fallback

            if (cacheData && cacheData.isValid) {
                // CRITICAL: Before triggering offline grace period, verify this isn't a deactivated license
                console.log('🔍 Checking if cached license is actually deactivated...');

                // Check if we have any indication this license was deactivated
                const licenseKey = cacheData.licenseKey;

                // Try one more online validation to be absolutely sure
                try {
                    console.log('🚨 Final online check before offline grace period...');
                    const finalCheck = await this.validateLicense(licenseKey, true);

                    if (finalCheck.valid) {
                        console.log('✅ Final check passed - license is still valid online');
                        return finalCheck;
                    } else {
                        console.log('❌ Final check failed - license appears to be deactivated');
                        console.log('🧹 Clearing deactivated license from cache...');

                        // Clear the cache since the license is no longer valid
                        this.clearLicenseFromMemory();

                        return {
                            valid: false,
                            error: 'License appears to have been deactivated remotely'
                        };
                    }
                } catch (finalError) {
                    console.log('⚠️ Final check failed due to network - proceeding with offline grace');
                }

                // Valid cached license - OFFLINE GRACE PERIOD TRIGGERED (only if network issues)
                console.log('🕒 OFFLINE GRACE PERIOD ACTIVE - using cached license (network issues detected)');
                return {
                    valid: true,
                    cached: true,
                    license: {
                        key: cacheData.licenseKey
                    },
                    graceDaysRemaining: cacheData.graceDaysRemaining,
                    graceTimeFormatted: this.formatGracePeriod(cacheData.graceDaysRemaining),
                    machineId: this.machineId
                };
            } else if (cacheData && !cacheData.isValid) {
                // Expired cached license
                return {
                    valid: false,
                    cached: true,
                    error: `License expired (${cacheData.daysOld} days old, grace period: ${this.gracePeriodDays} days)`,
                    machineId: this.machineId
                };
            } else {
                // No cached license found
                return {
                    valid: false,
                    cached: false,
                    error: 'No license found',
                    machineId: this.machineId
                };
            }
            
        } catch (error) {
            console.error('❌ Error getting license status:', error.message);
            return {
                valid: false,
                error: error.message,
                machineId: this.machineId || 'Error generating machine ID'
            };
        }
    }

    /**
     * Get cached license info για status display
     */
    getCacheStatus() {
        try {
            if (!fs.existsSync(this.licenseFilePath)) {
                return null;
            }

            const cacheData = JSON.parse(fs.readFileSync(this.licenseFilePath, 'utf8'));
            
            const cacheDate = new Date(cacheData.cached_at);
            const now = new Date();
            const daysDiff = (now - cacheDate) / (1000 * 60 * 60 * 24);
            const daysRemaining = Math.max(0, this.gracePeriodDays - daysDiff);

            return {
                licenseKey: cacheData.license_key,
                cached_at: cacheData.cached_at,
                daysOld: Math.floor(daysDiff),
                graceDaysRemaining: daysRemaining,
                graceTimeFormatted: this.formatGracePeriod(daysRemaining),
                isValid: daysDiff <= this.gracePeriodDays
            };
            
        } catch (error) {
            return null;
        }
    }

    /**
     * Get Machine Info για UI display
     */
    getMachineInfo() {
        const os = require('os');
        
        return {
            machineId: this.machineId || 'Not generated',
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            memory: Math.floor(os.totalmem() / (1024 * 1024 * 1024)) + 'GB'
        };
    }
}

module.exports = LicenseManager;