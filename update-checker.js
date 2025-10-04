/**
 * TimeCast Pro - Auto-Update Checker
 * Checks GitHub Releases for new versions
 * No auto-download - just notification με manual download option
 */

const https = require('https');
const { app } = require('electron');

class UpdateChecker {
    constructor() {
        this.currentVersion = app.getVersion(); // από package.json
        this.githubRepo = 'OGRESTERGI/timecast-pro';
        this.checkInterval = 6 * 60 * 60 * 1000; // Check κάθε 6 ώρες
        this.lastCheck = null;
        this.updateAvailable = false;
        this.latestRelease = null;
    }

    /**
     * Check for updates from GitHub Releases API
     * @returns {Promise<Object>} Update info object
     */
    async checkForUpdates() {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.github.com',
                path: `/repos/${this.githubRepo}/releases/latest`,
                method: 'GET',
                headers: {
                    'User-Agent': `TimeCast-Pro/${this.currentVersion}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            };

            console.log('🔍 Checking for updates...');
            console.log(`   Current version: ${this.currentVersion}`);

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        if (res.statusCode === 404) {
                            console.log('ℹ️  No releases found on GitHub');
                            resolve({
                                updateAvailable: false,
                                message: 'No releases available yet'
                            });
                            return;
                        }

                        if (res.statusCode !== 200) {
                            throw new Error(`GitHub API returned ${res.statusCode}`);
                        }

                        const release = JSON.parse(data);
                        this.latestRelease = release;
                        this.lastCheck = Date.now();

                        // Parse versions (remove 'v' prefix if exists)
                        const latestVersion = release.tag_name.replace(/^v/, '');
                        const currentVersion = this.currentVersion.replace(/^v/, '');

                        console.log(`   Latest version: ${latestVersion}`);

                        // Compare versions
                        const updateAvailable = this.isNewerVersion(latestVersion, currentVersion);
                        this.updateAvailable = updateAvailable;

                        if (updateAvailable) {
                            console.log('✅ Update available!');

                            // Find .exe download URL
                            const exeAsset = release.assets.find(asset =>
                                asset.name.endsWith('.exe')
                            );

                            resolve({
                                updateAvailable: true,
                                currentVersion: currentVersion,
                                latestVersion: latestVersion,
                                releaseDate: release.published_at,
                                changelog: release.body || 'No changelog available',
                                downloadUrl: exeAsset ? exeAsset.browser_download_url : release.html_url,
                                releasePage: release.html_url
                            });
                        } else {
                            console.log('ℹ️  Already up to date');
                            resolve({
                                updateAvailable: false,
                                currentVersion: currentVersion,
                                latestVersion: latestVersion
                            });
                        }

                    } catch (error) {
                        console.error('❌ Error parsing GitHub response:', error);
                        reject(error);
                    }
                });
            });

            req.on('error', (error) => {
                console.error('❌ Error checking for updates:', error);
                reject(error);
            });

            req.end();
        });
    }

    /**
     * Compare two semantic versions
     * @param {string} latest - Latest version (e.g., "6.7.0")
     * @param {string} current - Current version (e.g., "6.6.0")
     * @returns {boolean} True if latest > current
     */
    isNewerVersion(latest, current) {
        const latestParts = latest.split('.').map(Number);
        const currentParts = current.split('.').map(Number);

        for (let i = 0; i < 3; i++) {
            const l = latestParts[i] || 0;
            const c = currentParts[i] || 0;

            if (l > c) return true;
            if (l < c) return false;
        }

        return false; // Versions are equal
    }

    /**
     * Start automatic update checking (every 6 hours)
     */
    startAutoCheck() {
        console.log('🔄 Auto-update checker started (checks every 6 hours)');

        // Check immediately on startup (after 30 seconds)
        setTimeout(() => {
            this.checkForUpdates().catch(err => {
                console.error('Update check failed:', err);
            });
        }, 30000);

        // Then check every 6 hours
        setInterval(() => {
            this.checkForUpdates().catch(err => {
                console.error('Update check failed:', err);
            });
        }, this.checkInterval);
    }

    /**
     * Get current update status
     */
    getStatus() {
        return {
            updateAvailable: this.updateAvailable,
            latestRelease: this.latestRelease,
            lastCheck: this.lastCheck,
            currentVersion: this.currentVersion
        };
    }
}

module.exports = UpdateChecker;
