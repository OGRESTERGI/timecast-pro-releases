/**
 * TimeCast™ Pro Trial Manager
 * Complete trial-grace-active licensing system
 * Hardware fingerprint-based security to prevent abuse
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { exec } = require('child_process');

class TrialManager {
    constructor() {
        // File paths - use userData directory για packaged apps
        const userDataPath = process.env.APPDATA || process.env.HOME || __dirname;
        const appDataPath = path.join(userDataPath, 'sovereign-event-timer');

        // Ensure directory exists
        if (!fs.existsSync(appDataPath)) {
            fs.mkdirSync(appDataPath, { recursive: true });
        }

        this.trialFile = path.join(appDataPath, 'trial.json');
        this.gracePeriodFile = path.join(appDataPath, 'grace-period.json');

        // Debug logging για paths
        console.log('🗂️ TrialManager paths:');
        console.log('   userDataPath:', userDataPath);
        console.log('   appDataPath:', appDataPath);
        console.log('   trialFile:', this.trialFile);
        console.log('   gracePeriodFile:', this.gracePeriodFile);

        // Durations (1 minute trial, 5 minute grace για testing - 10 days, 5 minutes για production)
        this.trialDuration = 1 * 60 * 1000; // 1 minute για testing
        this.gracePeriodDuration = 5 * 60 * 1000; // 5 minutes (σταθερό)

        // Hardware fingerprint
        this.motherboardId = null;

        // Server URLs
        this.serverURL = 'https://timecast.eu/licensing/trial-api.php';
        this.purchaseURL = 'https://timecast.eu/purchase';

        // State flags
        this.showGracePeriodDialog = false;
        this.trialExpiredDialogShown = false;
        this.manualDeactivation = false; // Flag για manual license deactivation
        this.forceNewTrial = false; // Flag για force new trial after license deactivation
    }

    /**
     * Generate IMMUTABLE Hardware Fingerprint
     * Uses ΣΚΛΗΡΑ ΔΕΔΟΜΕΝΑ that can't be easily changed to prevent trial abuse
     */
    async generateMotherboardFingerprint() {
        try {
            console.log('🔍 Generating hardware fingerprint με ΣΚΛΗΡΑ ΔΕΔΟΜΕΝΑ...');

            const fingerprints = [];

            // Windows σκληρά δεδομένα fingerprinting
            if (os.platform() === 'win32') {
                const hardwareData = await this.getImmutableHardwareData();
                fingerprints.push(...hardwareData);
            }

            // Fallback hierarchy for non-Windows or failure cases
            if (fingerprints.length === 0) {
                console.log('⚠️ Primary hardware detection failed, using fallback...');
                const fallbackData = await this.getFallbackFingerprint();
                fingerprints.push(...fallbackData);
            }

            // Create stable hash from ΣΚΛΗΡΑ ΔΕΔΟΜΕΝΑ
            const fingerprintString = fingerprints.sort().join('|');
            const hash = crypto.createHash('sha256').update(fingerprintString).digest('hex');

            this.motherboardId = `MB-${hash.substring(0, 16).toUpperCase()}`;

            console.log('✅ Hardware Fingerprint Created:', this.motherboardId);
            console.log('🔒 Immutable Components:', fingerprints);

            return this.motherboardId;

        } catch (error) {
            console.error('❌ Error generating hardware fingerprint:', error);

            // Emergency fallback (less secure but functional)
            const emergency = `EMERGENCY-${os.hostname()}-${os.arch()}-${Date.now()}`;
            const hash = crypto.createHash('md5').update(emergency).digest('hex');
            this.motherboardId = `MB-EMERGENCY-${hash.substring(0, 12).toUpperCase()}`;

            console.log('🚨 Using emergency fingerprint:', this.motherboardId);
            return this.motherboardId;
        }
    }
    
    /**
     * Get IMMUTABLE Hardware Data (ΣΚΛΗΡΑ ΔΕΔΟΜΕΝΑ)
     * Priority: Motherboard Serial → UUID → BIOS Serial → CPU ID combo
     */
    async getImmutableHardwareData() {
        return new Promise((resolve) => {
            const fingerprints = [];

            console.log('🔍 Scanning ΣΚΛΗΡΑ ΔΕΔΟΜΕΝΑ...');

            // 1η Προτεραιότητα: Motherboard Serial Number (αδύνατο να αλλάξει)
            exec('wmic baseboard get serialnumber /format:list', (error, stdout) => {
                if (!error && stdout) {
                    const serialMatch = stdout.match(/SerialNumber=(.+)/);
                    if (serialMatch && serialMatch[1] && serialMatch[1].trim() !== '' && serialMatch[1].trim().toLowerCase() !== 'to be filled by o.e.m.') {
                        fingerprints.push(`mobo_serial:${serialMatch[1].trim()}`);
                        console.log('✅ Motherboard Serial found');
                    }
                }

                // 2η Προτεραιότητα: Motherboard UUID (hardware-based)
                exec('wmic csproduct get uuid /format:list', (error, stdout) => {
                    if (!error && stdout) {
                        const uuidMatch = stdout.match(/UUID=(.+)/);
                        if (uuidMatch && uuidMatch[1] && uuidMatch[1].trim() !== '' && uuidMatch[1].trim().toLowerCase() !== 'to be filled by o.e.m.') {
                            fingerprints.push(`mobo_uuid:${uuidMatch[1].trim()}`);
                            console.log('✅ Motherboard UUID found');
                        }
                    }

                    // 3η Προτεραιότητα: BIOS Serial Number (firmware-level)
                    exec('wmic bios get serialnumber /format:list', (error, stdout) => {
                        if (!error && stdout) {
                            const biosMatch = stdout.match(/SerialNumber=(.+)/);
                            if (biosMatch && biosMatch[1] && biosMatch[1].trim() !== '' && biosMatch[1].trim().toLowerCase() !== 'to be filled by o.e.m.') {
                                fingerprints.push(`bios_serial:${biosMatch[1].trim()}`);
                                console.log('✅ BIOS Serial found');
                            }
                        }

                        // Final step: resolve με τα ΣΚΛΗΡΑ ΔΕΔΟΜΕΝΑ που βρήκαμε
                        console.log(`🔒 Found ${fingerprints.length} ΣΚΛΗΡΑ ΔΕΔΟΜΕΝΑ components`);
                        resolve(fingerprints);
                    });
                });
            });
        });
    }

    /**
     * Fallback Fingerprint (εάν τα ΣΚΛΗΡΑ ΔΕΔΟΜΕΝΑ αποτύχουν)
     */
    async getFallbackFingerprint() {
        const fingerprints = [];

        console.log('⚠️ Using fallback fingerprinting...');

        // CPU ID + Motherboard Product combo
        try {
            const cpus = os.cpus();
            if (cpus && cpus.length > 0) {
                fingerprints.push(`cpu_model:${cpus[0].model.replace(/\s+/g, '').toLowerCase()}`);
            }

            fingerprints.push(`platform:${os.platform()}`);
            fingerprints.push(`arch:${os.arch()}`);

            console.log('⚠️ Fallback fingerprinting complete');
        } catch (error) {
            console.error('❌ Fallback fingerprinting failed:', error);
        }

        return fingerprints;
    }

    /**
     * Check if a valid license file exists (enhanced check με deactivation detection)
     */
    hasValidLicenseFile() {
        try {
            const licensePaths = [
                path.join(__dirname, 'license.json'),
                path.join(process.env.APPDATA || process.env.HOME, 'sovereign-event-timer', '.license_cache.json')
            ];

            for (const licensePath of licensePaths) {
                if (fs.existsSync(licensePath)) {
                    try {
                        const licenseData = JSON.parse(fs.readFileSync(licensePath, 'utf8'));

                        // Enhanced validation - check both old και new license format
                        let hasValidKey = false;

                        // Old format check
                        if (licenseData.license_key && licenseData.license_key.trim().length > 0) {
                            hasValidKey = true;
                        }

                        // New format check
                        if (licenseData.license && licenseData.license.key &&
                            licenseData.license.key.trim().length > 0) {
                            hasValidKey = true;

                            // Additional validation για new format
                            const now = new Date();
                            const expiresAt = new Date(licenseData.license.expires_at);

                            if (expiresAt <= now) {
                                console.log('🚫 License found but expired:', expiresAt);
                                hasValidKey = false;
                            }

                            if (licenseData.license.current_machine_active === false) {
                                console.log('🚫 License found but machine not active');
                                hasValidKey = false;
                            }

                            if (licenseData.deactivated === true) {
                                console.log('🚫 License found but explicitly deactivated');
                                hasValidKey = false;
                            }
                        }

                        if (hasValidKey) {
                            console.log('🔑 Valid license file detected');
                            return true;
                        }
                    } catch (parseError) {
                        console.log('⚠️ Error parsing license file:', licensePath, parseError.message);
                    }
                }
            }
            return false;
        } catch (error) {
            console.error('❌ Error checking license files:', error);
            return false;
        }
    }

    /**
     * Detect if active license became invalid/deactivated in real-time
     * Returns true if license was deactivated, false if still valid
     */
    detectLicenseDeactivation() {
        try {
            const licensePaths = [
                path.join(__dirname, 'license.json'),
                path.join(process.env.APPDATA || process.env.HOME, 'sovereign-event-timer', '.license_cache.json')
            ];

            // Check if license files still exist and contain valid data
            let hasValidLicense = false;

            for (const licensePath of licensePaths) {
                if (fs.existsSync(licensePath)) {
                    try {
                        const licenseData = JSON.parse(fs.readFileSync(licensePath, 'utf8'));

                        // Check if license exists and has valid status
                        if (licenseData.license && licenseData.license.key &&
                            licenseData.license.key.trim().length > 0) {

                            // Additional validation: check if license is not expired or deactivated
                            const now = new Date();
                            const expiresAt = new Date(licenseData.license.expires_at);

                            if (expiresAt > now &&
                                licenseData.license.current_machine_active !== false &&
                                !licenseData.deactivated) {
                                hasValidLicense = true;
                                break;
                            } else {
                                console.log('🚫 License found but invalid/expired/deactivated:', {
                                    expired: expiresAt <= now,
                                    machine_active: licenseData.license.current_machine_active,
                                    deactivated: licenseData.deactivated
                                });
                            }
                        }
                    } catch (parseError) {
                        console.log('⚠️ Error parsing license file:', licensePath, parseError.message);
                    }
                }
            }

            if (!hasValidLicense) {
                console.log('⚠️ No valid license found in files - determining deactivation type...');

                // CRITICAL: Check if this is a manual deactivation
                if (this.manualDeactivation) {
                    console.log('🏷️ MANUAL DEACTIVATION detected - will trigger TRIAL GRACE PERIOD (5 minutes)');
                    this.manualDeactivation = false; // Reset flag after use
                    return true; // License was manually deactivated
                }

                // Otherwise, check if this is a false positive due to network issues
                // (offline grace period scenario)
                try {
                    const TimeCastLicenseManager = require('./license-manager');
                    const licenseManager = new TimeCastLicenseManager();
                    const cacheStatus = licenseManager.getCacheStatus();

                    if (cacheStatus && cacheStatus.licenseKey && cacheStatus.isValid &&
                        cacheStatus.graceDaysRemaining !== undefined && cacheStatus.graceDaysRemaining > 0) {
                        console.log('✅ Found valid license in license manager cache (within grace period) - NOT triggering deactivation');
                        console.log(`🔑 Cached license: ${cacheStatus.licenseKey}, Grace remaining: ${cacheStatus.graceDaysRemaining} days`);
                        return false; // Do not trigger deactivation - we have valid cached license within grace period
                    } else if (cacheStatus && cacheStatus.licenseKey) {
                        console.log('⚠️ Found cached license but outside grace period or invalid - triggering OFFLINE GRACE PERIOD');
                        console.log(`🔑 Cached license: ${cacheStatus.licenseKey}, Valid: ${cacheStatus.isValid}, Grace: ${cacheStatus.graceDaysRemaining}`);
                    }
                } catch (cacheCheckError) {
                    console.log('⚠️ Could not check license manager cache:', cacheCheckError.message);
                }

                console.log('🌐 LICENSE DEACTIVATED (Network/Offline) - No valid license found, triggering offline detection');
                return true; // License was deactivated (likely network issue)
            }

            return false; // License still valid

        } catch (error) {
            console.error('❌ Error detecting license deactivation:', error);
            // On error, assume deactivation για safety
            return true;
        }
    }

    /**
     * Check grace period status - with real-time license validation
     * Called after trial expiration
     */
    checkGracePeriod() {
        try {
            // 🎯 ΠΡΟΤΕΡΑΙΟΤΗΤΑ: Έλεγχος για valid license key πρώτα
            if (this.hasValidLicenseFile()) {
                console.log('✅ Valid license detected during Grace Period - terminating grace period immediately');
                // Διαγραφή grace period file γιατί έχουμε valid license
                try {
                    if (fs.existsSync(this.gracePeriodFile)) {
                        fs.unlinkSync(this.gracePeriodFile);
                        console.log('🗑️ Grace period file deleted - license activated');
                    }
                } catch (deleteError) {
                    console.error('❌ Error deleting grace period file:', deleteError);
                }
                return {
                    expired: true,
                    timeRemaining: 0,
                    startTime: new Date(),
                    elapsedTime: 0,
                    duration: this.gracePeriodDuration,
                    licenseActivated: true  // Σηματοδότηση για license activation
                };
            }

            if (!fs.existsSync(this.gracePeriodFile)) {
                return null;
            }

            const graceData = JSON.parse(fs.readFileSync(this.gracePeriodFile, 'utf8'));

            // Verify motherboard ID matches
            if (graceData.motherboard_id !== this.motherboardId) {
                console.log('⚠️ Grace period motherboard mismatch - different hardware detected');
                return null;
            }

            const startTime = new Date(graceData.start_time);
            const currentTime = new Date();
            const elapsedTime = currentTime - startTime;
            const remainingTime = this.gracePeriodDuration - elapsedTime;

            const expired = remainingTime <= 0;

            console.log(`⏰ Grace period: ${expired ? 'EXPIRED' : 'ACTIVE'}, remaining: ${Math.max(0, remainingTime)}ms`);

            return {
                expired: expired,
                timeRemaining: Math.max(0, remainingTime),
                startTime: startTime,
                elapsedTime: elapsedTime,
                duration: this.gracePeriodDuration
            };

        } catch (error) {
            console.error('❌ Error checking grace period:', error);
            return null;
        }
    }

    /**
     * Create new grace period after trial expiration
     */
    async createGracePeriod() {
        try {
            console.log('🚀 Creating grace period...');

            if (!this.motherboardId) {
                await this.generateMotherboardFingerprint();
            }

            const startTime = new Date();
            const graceData = {
                motherboard_id: this.motherboardId,
                start_time: startTime.toISOString(),
                duration: this.gracePeriodDuration,
                created_at: startTime.toISOString()
            };

            fs.writeFileSync(this.gracePeriodFile, JSON.stringify(graceData, null, 2));

            console.log('✅ Grace period created successfully');
            console.log(`⏰ Duration: ${this.gracePeriodDuration / 1000 / 60} minutes`);

            // Set flag to show dialog
            this.showGracePeriodDialog = true;

            return {
                success: true,
                startTime: startTime,
                duration: this.gracePeriodDuration,
                timeRemaining: this.gracePeriodDuration
            };

        } catch (error) {
            console.error('❌ Error creating grace period:', error);
            throw error;
        }
    }

    /**
     * Clear grace period (when license is activated)
     */
    clearGracePeriod() {
        try {
            console.log('🧹 Clearing grace period...');

            if (fs.existsSync(this.gracePeriodFile)) {
                fs.unlinkSync(this.gracePeriodFile);
                console.log('🗑️ Grace period file deleted');
            }

            this.showGracePeriodDialog = false;
            console.log('✅ Grace period cleared successfully');

        } catch (error) {
            console.error('❌ Error clearing grace period:', error);
        }
    }

    /**
     * Set manual deactivation flag
     * Used to distinguish manual license deactivation from offline license detection
     */
    setManualDeactivation(isManual) {
        this.manualDeactivation = isManual;
        console.log(`🏷️ Manual deactivation flag set to: ${isManual}`);
    }

    /**
     * Clear Trial Manager Cache (called after license deactivation)
     * CRITICAL: Only clears grace period, NOT trial history (prevents trial reuse abuse)
     */
    clearTrialCache() {
        try {
            console.log('🧹 Clearing trial manager cache after license deactivation...');

            // CRITICAL: DO NOT DELETE trial.json - we need to remember this machine used its trial!
            // Only check if trial was used, not clear it
            if (fs.existsSync(this.trialFile)) {
                console.log('✅ Trial history preserved - machine cannot reuse trial period');
            }

            // Clear grace period cache file (this can be cleared)
            if (fs.existsSync(this.gracePeriodFile)) {
                fs.unlinkSync(this.gracePeriodFile);
                console.log('🗑️ Deleted grace period cache file');
            }

            // Reset internal state
            this.manualDeactivation = false;
            this.showGracePeriodDialog = false;
            this.trialExpiredDialogShown = false;

            // CRITICAL: Do NOT set forceNewTrial if trial already exists
            // This prevents trial abuse after license deactivation
            if (fs.existsSync(this.trialFile)) {
                console.log('🚫 Trial already used on this machine - no new trial allowed');
                this.forceNewTrial = false;
            } else {
                console.log('✅ Machine has not used trial yet - allowing fresh trial');
                this.forceNewTrial = true;
            }

            console.log('✅ Trial manager cache partially cleared - trial history preserved for security');

        } catch (error) {
            console.error('❌ Error clearing trial manager cache:', error);
        }
    }

    /**
     * Check complete trial-grace system status
     * Returns current phase: trial, grace, or expired
     */
    async checkTrialStatus() {
        try {
            console.log('🔍 Checking trial-grace system status...');

            if (!this.motherboardId) {
                await this.generateMotherboardFingerprint();
            }

            // CRITICAL: Check if we need to force a new trial after license deactivation
            // BUT only if this machine has never used trial before
            if (this.forceNewTrial) {
                console.log('🚨 Force new trial flag detected - checking if machine can get new trial...');

                // Security check: Has this machine already used its trial?
                const existingTrial = this.checkLocalTrial();
                if (existingTrial) {
                    console.log('🚫 SECURITY: Machine has already used trial period - no new trial allowed');
                    console.log('⚖️ Transitioning directly to grace period instead');
                    this.forceNewTrial = false; // Reset flag

                    // Since trial was already used, go directly to grace period
                    const graceStatus = this.checkGracePeriod();
                    if (!graceStatus || graceStatus.expired) {
                        // Start new grace period
                        const graceResult = this.startGracePeriod();
                        if (graceResult.success) {
                            return {
                                phase: 'grace',
                                available: true,
                                expired: false,
                                timeRemaining: this.gracePeriodDuration,
                                showGracePeriodDialog: true,
                                trialAlreadyUsed: true
                            };
                        }
                    } else {
                        return {
                            phase: 'grace',
                            available: true,
                            expired: false,
                            timeRemaining: graceStatus.timeRemaining,
                            showGracePeriodDialog: true,
                            trialAlreadyUsed: true
                        };
                    }
                } else {
                    console.log('✅ Machine has not used trial yet - allowing fresh trial');
                    this.forceNewTrial = false; // Reset flag

                    // Clear any existing grace data to ensure fresh start
                    this.clearGracePeriod();

                    // Start new trial immediately
                    const newTrialResult = await this.startTrial();

                    if (newTrialResult.success) {
                        console.log('✅ Fresh trial started successfully after license deactivation');
                        return {
                            phase: 'trial',
                            available: true,
                            expired: false,
                            timeRemaining: this.trialDuration,
                            startTime: Date.now(),
                            showGracePeriodDialog: false,
                            freshStart: true
                        };
                    } else {
                        console.log('❌ Failed to start fresh trial, falling back to grace period');
                        // Will fall through to grace period logic
                    }
                }
            }

            // Phase 1: Check for active trial (normal flow)
            const trialStatus = this.checkLocalTrial();
            if (trialStatus && !trialStatus.expired && !this.forceNewTrial) {
                console.log('✅ Active trial found');
                return {
                    phase: 'trial',
                    available: true,
                    expired: false,
                    timeRemaining: trialStatus.timeRemaining,
                    startTime: trialStatus.startTime,
                    showGracePeriodDialog: false
                };
            }

            // Phase 1b: If trial exists but expired, create grace period
            if (trialStatus && trialStatus.expired) {
                console.log('⚠️ Trial expired - checking for grace period...');

                // Check if grace period already exists
                const graceStatus = this.checkGracePeriod();

                // Handle license activation during grace period
                if (graceStatus && graceStatus.licenseActivated) {
                    console.log('🎉 License activated during grace period - switching to active license mode');
                    return {
                        phase: 'active',  // License activated!
                        available: true,
                        expired: false,
                        timeRemaining: Infinity,
                        licenseActivated: true,
                        showGracePeriodDialog: false
                    };
                }

                if (graceStatus && !graceStatus.expired) {
                    console.log('⏰ Grace period active');
                    return {
                        phase: 'grace',
                        available: true,
                        expired: false,
                        timeRemaining: graceStatus.timeRemaining,
                        startTime: graceStatus.startTime,
                        showGracePeriodDialog: true
                    };
                }

                // Check if grace period exists but expired
                if (graceStatus && graceStatus.expired) {
                    // Calculate when the grace period expired
                    const graceEndTime = new Date(graceStatus.startTime).getTime() + graceStatus.duration;
                    const timeSinceExpiration = Date.now() - graceEndTime;

                    console.log(`⏰ Grace period expired ${Math.round(timeSinceExpiration/1000)}s ago`);

                    // If expired recently (within last 30 seconds), terminate app (same session)
                    if (timeSinceExpiration < 30000) {
                        console.log('💀 Grace period expired RECENTLY - same session - app should terminate');
                        return {
                            phase: 'expired',
                            available: false,
                            expired: true,
                            timeRemaining: 0,
                            showGracePeriodDialog: false
                        };
                    }

                    // If expired longer ago, allow new grace period (new session)
                    console.log('🔄 Grace period expired in PREVIOUS session - creating new grace period');
                    // Continue to create new grace period below
                }

                // Grace period doesn't exist - create new one (only once per trial expiration)
                console.log('🚀 Creating new grace period...');
                const newGracePeriod = await this.createGracePeriod();

                return {
                    phase: 'grace',
                    available: true,
                    expired: false,
                    timeRemaining: newGracePeriod.timeRemaining,
                    startTime: newGracePeriod.startTime,
                    showGracePeriodDialog: true
                };
            }

            // Phase 2: Check for grace period (if no trial file exists)
            const graceStatus = this.checkGracePeriod();
            if (graceStatus && !graceStatus.expired) {
                console.log('⏰ Grace period active');
                return {
                    phase: 'grace',
                    available: true,
                    expired: false,
                    timeRemaining: graceStatus.timeRemaining,
                    startTime: graceStatus.startTime,
                    showGracePeriodDialog: true
                };
            } else if (graceStatus && graceStatus.expired) {
                // Calculate when the grace period expired
                const graceEndTime = new Date(graceStatus.startTime).getTime() + graceStatus.duration;
                const timeSinceExpiration = Date.now() - graceEndTime;

                console.log(`⏰ Phase 2: Grace period expired ${Math.round(timeSinceExpiration/1000)}s ago`);

                // If expired recently (within last 30 seconds), terminate app (same session)
                if (timeSinceExpiration < 30000) {
                    console.log('💀 Phase 2: Grace period expired RECENTLY - same session - app should terminate');
                    return {
                        phase: 'expired',
                        available: false,
                        expired: true,
                        timeRemaining: 0,
                        showGracePeriodDialog: false
                    };
                }

                // If expired longer ago, continue to Phase 3 for server check (new session)
                console.log('🔄 Phase 2: Grace period expired in PREVIOUS session - continuing to server check');
            }

            // Phase 3: Check server-side trial database
            const serverTrial = await this.checkServerTrial();
            if (serverTrial && serverTrial.expired) {
                console.log('🚫 Server confirms trial expired');
                return {
                    phase: 'expired',
                    available: false,
                    expired: true,
                    timeRemaining: 0,
                    showGracePeriodDialog: false
                };
            }

            // Phase 4: No trial found - can start new trial
            console.log('🆕 No trial found - eligible for new trial');
            return {
                phase: 'eligible',
                available: true,
                expired: false,
                timeRemaining: this.trialDuration,
                isNewTrial: true,
                showGracePeriodDialog: false
            };

        } catch (error) {
            console.error('❌ Error checking trial status:', error);

            // Fallback to local checks only
            const localTrial = this.checkLocalTrial();
            return localTrial || {
                phase: 'eligible',
                available: true,
                expired: false,
                timeRemaining: this.trialDuration,
                isNewTrial: true,
                showGracePeriodDialog: false
            };
        }
    }
    
    /**
     * Check local trial file
     */
    checkLocalTrial() {
        try {
            if (!fs.existsSync(this.trialFile)) {
                return null;
            }
            
            const trialData = JSON.parse(fs.readFileSync(this.trialFile, 'utf8'));
            
            // Verify motherboard ID matches
            if (trialData.motherboard_id !== this.motherboardId) {
                console.log('⚠️ Motherboard ID mismatch - different hardware detected');
                return null;
            }
            
            const startTime = new Date(trialData.start_time);
            const currentTime = new Date();
            const elapsedTime = currentTime - startTime;
            const remainingTime = this.trialDuration - elapsedTime;
            
            const expired = remainingTime <= 0;
            
            return {
                available: !expired,
                expired: expired,
                timeRemaining: Math.max(0, remainingTime),
                startTime: startTime,
                elapsedTime: elapsedTime
            };
            
        } catch (error) {
            console.error('❌ Error reading local trial:', error);
            return null;
        }
    }
    
    /**
     * Check server-side trial database
     */
    async checkServerTrial() {
        try {
            const response = await fetch(`${this.serverURL}?action=check&motherboard_id=${this.motherboardId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.trial_exists) {
                const startTime = new Date(data.start_time);
                const currentTime = new Date();
                const elapsedTime = currentTime - startTime;
                const remainingTime = this.trialDuration - elapsedTime;
                
                const expired = remainingTime <= 0;
                
                return {
                    available: !expired,
                    expired: expired,
                    timeRemaining: Math.max(0, remainingTime),
                    startTime: startTime,
                    elapsedTime: elapsedTime,
                    serverRecorded: true
                };
            }
            
            return null;
            
        } catch (error) {
            // console.error('❌ Server trial check failed:', error); // Commented to reduce console spam
            return null;
        }
    }
    
    /**
     * Start new trial
     */
    async startTrial() {
        try {
            if (!this.motherboardId) {
                await this.generateMotherboardFingerprint();
            }
            
            const startTime = new Date();
            
            // Save local trial file
            const trialData = {
                motherboard_id: this.motherboardId,
                start_time: startTime.toISOString(),
                trial_duration: this.trialDuration,
                version: '1.0'
            };
            
            fs.writeFileSync(this.trialFile, JSON.stringify(trialData, null, 2));
            
            // Record on server
            await this.recordServerTrial(startTime);
            
            console.log('🚀 Trial started successfully');
            
            return {
                success: true,
                startTime: startTime,
                duration: this.trialDuration,
                timeRemaining: this.trialDuration
            };
            
        } catch (error) {
            console.error('❌ Error starting trial:', error);
            throw error;
        }
    }
    
    /**
     * Record trial on server
     */
    async recordServerTrial(startTime) {
        try {
            const response = await fetch(this.serverURL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'start',
                    motherboard_id: this.motherboardId,
                    start_time: startTime.toISOString(),
                    trial_duration: this.trialDuration,
                    user_agent: `TimeCast Pro ${process.platform}`,
                    app_version: '4.6.0'
                })
            });
            
            if (response.ok) {
                console.log('📡 Trial recorded on server');
            } else {
                console.log('⚠️ Server recording failed, continuing with local trial');
            }
            
        } catch (error) {
            console.error('❌ Server trial recording failed:', error);
            // Continue with local trial even if server fails
        }
    }
    
    /**
     * Dialog message για grace period termination warning
     */
    getTrialTerminationMessage() {
        return {
            title: 'Trial Περίοδος Έληξε',
            message: '⚠️ Η trial περίοδος έχει λήξει. Η εφαρμογή θα τερματιστεί αυτόματα σε 5 λεπτά.\n\nΓια συνεχή χρήση, παρακαλώ αγοράστε κλειδί άδειας.',
            buttons: ['Αγορά Κλειδιού Άδειας', 'Έξοδος'],
            defaultId: 0
        };
    }

    /**
     * Get license purchase URL
     */
    getLicensePurchaseURL() {
        return this.purchaseURL;
    }

    /**
     * Clear grace period dialog flag
     */
    clearGracePeriodDialogFlag() {
        this.showGracePeriodDialog = false;
        this.trialExpiredDialogShown = true;
    }

    /**
     * Format remaining time για display in title bar
     */
    formatTimeRemaining(milliseconds, phase = 'trial') {
        if (milliseconds <= 0) {
            return phase === 'grace' ? 'Grace Expired' : 'Trial Expired';
        }

        const totalSeconds = Math.floor(milliseconds / 1000);
        const days = Math.floor(totalSeconds / (24 * 60 * 60));
        const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
        const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
        const seconds = totalSeconds % 60;

        if (phase === 'grace') {
            // Grace period: show minutes and seconds only
            if (minutes > 0) {
                return `${minutes}:${seconds.toString().padStart(2, '0')} remaining`;
            } else {
                return `${seconds}s remaining`;
            }
        } else {
            // Trial period: show full format
            if (days > 0) {
                return `${days} days ${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} remaining`;
            } else if (hours > 0) {
                return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} remaining`;
            } else if (minutes > 0) {
                return `${minutes}:${seconds.toString().padStart(2, '0')} remaining`;
            } else {
                return `${seconds}s remaining`;
            }
        }
    }

    /**
     * Force start grace period (για remote deactivation)
     * CRITICAL: Για license deactivation scenarios
     */
    async startGracePeriod() {
        try {
            console.log('🚨 FORCE STARTING Grace Period due to license deactivation...');

            if (!this.motherboardId) {
                await this.generateMotherboardFingerprint();
            }

            const startTime = new Date();
            const graceData = {
                motherboard_id: this.motherboardId,
                start_time: startTime.toISOString(),
                duration: this.gracePeriodDuration,
                expired: false,
                created_for: 'license_deactivation'
            };

            // Save grace period file
            fs.writeFileSync(this.gracePeriodFile, JSON.stringify(graceData, null, 2));
            console.log('✅ Grace period file created για license deactivation');

            return {
                phase: 'grace',
                available: true,
                expired: false,
                timeRemaining: this.gracePeriodDuration,
                startTime: startTime.toISOString(),
                showGracePeriodDialog: true,
                reason: 'license_deactivation'
            };

        } catch (error) {
            console.error('❌ Error starting grace period:', error);
            return {
                phase: 'error',
                available: false,
                expired: true,
                timeRemaining: 0,
                error: error.message
            };
        }
    }
}

module.exports = TrialManager;