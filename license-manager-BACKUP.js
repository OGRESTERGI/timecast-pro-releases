/**
 * TimeCast™ Pro License Manager
 * Hardware fingerprinting and license validation for desktop app
 */

const crypto = require('crypto');
const os = require('os');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class TimeCastLicenseManager {
    constructor() {
        this.licenseServerURL = 'https://timecast.eu/licensing/api.php';
        this.licenseFilePath = path.join(__dirname, 'license.json');
        this.machineId = null;
        this.licenseInfo = null;
        this.gracePeriodDays = 7;
    }

    /**
     * Generate Hardware Fingerprint
     * Creates stable unique ID από hardware characteristics
     */
    async generateMachineFingerprint() {
        console.log('🔍 Starting machine fingerprint generation...');
        try {
            const fingerprints = [];
            
            // 1. CPU Information
            const cpus = os.cpus();
            if (cpus && cpus.length > 0) {
                const cpuModel = cpus[0].model.replace(/\s+/g, '').toLowerCase();
                fingerprints.push(`cpu:${cpuModel}`);
                console.log('✅ CPU fingerprint added:', cpuModel);
            }

            // 2. System Architecture & Platform
            fingerprints.push(`arch:${os.arch()}`);
            fingerprints.push(`platform:${os.platform()}`);
            console.log('✅ System info added:', `${os.platform()}-${os.arch()}`);

            // 3. Total Memory (stable characteristic)
            const totalMem = Math.floor(os.totalmem() / (1024 * 1024 * 1024)); // GB
            fingerprints.push(`mem:${totalMem}gb`);
            console.log('✅ Memory fingerprint added:', `${totalMem}gb`);

            // 4. Windows-specific fingerprints
            if (os.platform() === 'win32') {
                console.log('🪟 Getting Windows-specific fingerprints...');
                const windowsFingerprints = await this.getWindowsFingerprints();
                fingerprints.push(...windowsFingerprints);
                console.log('✅ Windows fingerprints added:', windowsFingerprints.length);
            }

            // 5. Network Interface MAC Address (stable hardware ID)
            console.log('🌐 Getting network fingerprints...');
            const networkFingerprints = this.getNetworkFingerprints();
            fingerprints.push(...networkFingerprints);
            console.log('✅ Network fingerprints added:', networkFingerprints.length);

            // 6. Machine GUID (Windows) or unique system identifiers
            console.log('🖥️  Getting system fingerprints...');
            const systemFingerprints = await this.getSystemFingerprints();
            fingerprints.push(...systemFingerprints);
            console.log('✅ System fingerprints added:', systemFingerprints.length);

            // Create stable hash από all fingerprints
            const fingerprintString = fingerprints.sort().join('|');
            const machineHash = crypto.createHash('sha256')
                .update(fingerprintString)
                .digest('hex');

            // Create human-readable machine ID
            this.machineId = `TC-${machineHash.substring(0, 8).toUpperCase()}-${machineHash.substring(8, 16).toUpperCase()}`;
            
            console.log('🔍 Machine Fingerprint Generated:', this.machineId);
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
            return this.machineId;
        }
    }

    /**
     * Windows-specific hardware fingerprints
     */
    async getWindowsFingerprints() {
        return new Promise((resolve) => {
            const fingerprints = [];
            let completedCommands = 0;
            const totalCommands = 2;
            
            const checkComplete = () => {
                completedCommands++;
                if (completedCommands >= totalCommands) {
                    resolve(fingerprints);
                }
            };
            
            // Get Windows Machine GUID με timeout
            exec('wmic csproduct get uuid /format:list', { timeout: 5000 }, (error, stdout) => {
                if (!error && stdout) {
                    const uuidMatch = stdout.match(/UUID=(.+)/);
                    if (uuidMatch && uuidMatch[1] && uuidMatch[1].trim() !== '' && uuidMatch[1].trim() !== 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF') {
                        fingerprints.push(`uuid:${uuidMatch[1].trim()}`);
                    }
                }
                checkComplete();
            });
            
            // Get Motherboard Serial με timeout
            exec('wmic baseboard get serialnumber /format:list', { timeout: 5000 }, (error, stdout) => {
                if (!error && stdout) {
                    const serialMatch = stdout.match(/SerialNumber=(.+)/);
                    if (serialMatch && serialMatch[1] && serialMatch[1].trim() !== '' && serialMatch[1].trim() !== 'None') {
                        fingerprints.push(`mobo:${serialMatch[1].trim()}`);
                    }
                }
                checkComplete();
            });
            
            // Fallback timeout - αν δεν πάρουμε response σε 6 seconds
            setTimeout(() => {
                if (completedCommands < totalCommands) {
                    console.warn('⚠️  Windows fingerprint commands timed out');
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
            networkInterfaces[interfaceName].forEach(networkInterface => {
                // Skip loopback and virtual interfaces
                if (!networkInterface.internal && networkInterface.mac && networkInterface.mac !== '00:00:00:00:00:00') {
                    fingerprints.push(`mac:${networkInterface.mac}`);
                }
            });
        });
        
        return fingerprints.slice(0, 2); // Use first 2 physical MACs για stability
    }

    /**
     * System-specific fingerprints
     */
    async getSystemFingerprints() {
        return new Promise((resolve) => {
            const fingerprints = [];
            
            // System hostname (can change, but useful)
            fingerprints.push(`host:${os.hostname()}`);
            
            // OS Release info
            fingerprints.push(`release:${os.release()}`);
            
            resolve(fingerprints);
        });
    }

    /**
     * Validate License με Server
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
                // Save to cache για offline usage
                this.saveLicenseCache(licenseKey, response);
                
                console.log('✅ License validation successful');
                return {
                    valid: true,
                    online: true,
                    license: response.license,
                    message: 'License validated online'
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
            console.error('🔌 Online validation failed:', error.message);
            
            // Try offline cache as fallback
            const cachedResult = this.checkOfflineCache(licenseKey);
            if (cachedResult) {
                cachedResult.online = false;
                cachedResult.message = 'Using offline cache (network unavailable)';
                return cachedResult;
            }

            return {
                valid: false,
                online: false,
                error: 'Cannot validate license: No network και no valid cache'
            };
        }
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
            const dashboardApiUrl = `${this.baseUrl.replace('/licensing/', '/account/')}/machines-api.php?action=activate`;
            
            console.log('🔗 Dashboard API URL:', dashboardApiUrl);
            
            const payload = {
                license_key: licenseKey,
                machine_id: this.machineId,
                machine_name: hardwareDetails.pc_name || `${hardwareDetails.platform || 'unknown'}-${Date.now()}`,
                hardware_details: hardwareDetails
            };
            
            console.log('📤 Sending dashboard sync payload:', JSON.stringify(payload, null, 2));
            
            const response = await fetch(dashboardApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'TimeCast-Pro-Client/1.0'
                },
                body: JSON.stringify(payload),
                timeout: 10000 // 10 second timeout
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
                try {
                    const dashboardSync = await this.syncWithDashboard(licenseKey, hardwareDetails);
                    if (dashboardSync.success) {
                        console.log('✅ Dashboard sync successful');
                    } else {
                        console.warn('⚠️  Dashboard sync failed:', dashboardSync.error);
                        // Continue anyway - main activation succeeded
                    }
                } catch (dashboardError) {
                    console.warn('⚠️  Dashboard sync error:', dashboardError.message);
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
                error: 'Network error during activation'
            };
        }
    }

    /**
     * Check Offline License Cache
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
                console.log(`📱 Using offline cache (${Math.floor(daysDiff)} days old)`);
                return {
                    valid: true,
                    online: false,
                    license: cacheData.license,
                    cached: true,
                    graceDaysRemaining: Math.max(0, this.gracePeriodDays - Math.floor(daysDiff))
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
     * Make API Call to License Server
     */
    async makeAPICall(action, data) {
        const fetch = require('node-fetch');
        
        const response = await fetch(`${this.licenseServerURL}?action=${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': `TimeCast-Pro/1.0 (${os.platform()}; ${os.arch()})`
            },
            body: JSON.stringify(data),
            timeout: 10000 // 10 second timeout
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Get Current License Status
     */
    async getLicenseStatus(licenseKey = null) {
        // Load από cache if no license key provided
        if (!licenseKey && fs.existsSync(this.licenseFilePath)) {
            try {
                const cacheData = JSON.parse(fs.readFileSync(this.licenseFilePath, 'utf8'));
                licenseKey = cacheData.license_key;
            } catch (error) {
                return { valid: false, error: 'No license configured' };
            }
        }

        if (!licenseKey) {
            return { valid: false, error: 'No license key provided' };
        }

        return await this.validateLicense(licenseKey);
    }

    /**
     * Clear License Cache
     */
    clearLicenseCache() {
        try {
            if (fs.existsSync(this.licenseFilePath)) {
                fs.unlinkSync(this.licenseFilePath);
                console.log('🗑️ License cache cleared');
            }
        } catch (error) {
            console.error('❌ Error clearing license cache:', error.message);
        }
    }

    /**
     * Get Machine Information για Display
     */
    getMachineInfo() {
        return {
            machineId: this.machineId,
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            totalMemory: Math.floor(os.totalmem() / (1024 * 1024 * 1024)) + ' GB'
        };
    }
}

// Export για use στο main.js
module.exports = TimeCastLicenseManager;