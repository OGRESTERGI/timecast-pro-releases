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
        this.githubRepo = 'OGRESTERGI/timecast-pro-releases'; // Public releases repo
        this.checkInterval = 6 * 60 * 60 * 1000; // Check κάθε 6 ώρες
        this.lastCheck = null;
        this.updateAvailable = false;
        this.latestRelease = null;
        // No token needed for public repo!
    }

    /**
     * Check for updates from GitHub Releases API
     * @returns {Promise<Object>} Update info object
     */
    async checkForUpdates() {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.github.com',
                path: `/repos/${this.githubRepo}/releases`,
                method: 'GET',
                headers: {
                    'User-Agent': `TimeCast-Pro/${this.currentVersion}`,
                    'Accept': 'application/vnd.github.v3+json'
                    // No Authorization needed for public repos!
                },
                timeout: 10000 // 10 second timeout
            };

            console.log('🔍 Checking for updates...');
            console.log(`   Current version: ${this.currentVersion}`);
            console.log(`   GitHub API: https://api.github.com/repos/${this.githubRepo}/releases`);

            const req = https.request(options, (res) => {
                let data = '';

                console.log(`   Response status: ${res.statusCode}`);
                console.log(`   Response headers:`, res.headers);

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        // Handle rate limiting
                        if (res.statusCode === 403) {
                            const rateLimitRemaining = res.headers['x-ratelimit-remaining'];
                            const rateLimitReset = res.headers['x-ratelimit-reset'];
                            console.error(`❌ GitHub API rate limit exceeded!`);
                            console.error(`   Remaining: ${rateLimitRemaining}`);
                            console.error(`   Reset at: ${new Date(rateLimitReset * 1000).toLocaleString()}`);
                            resolve({
                                updateAvailable: false,
                                currentVersion: this.currentVersion,
                                error: 'Rate limit exceeded. Try again later.'
                            });
                            return;
                        }

                        if (res.statusCode === 404) {
                            console.log('ℹ️  No releases found on GitHub');
                            console.log(`   Response body: ${data.substring(0, 200)}`);
                            resolve({
                                updateAvailable: false,
                                currentVersion: this.currentVersion,
                                message: 'No releases available yet'
                            });
                            return;
                        }

                        if (res.statusCode !== 200) {
                            console.error(`❌ GitHub API error: ${res.statusCode}`);
                            console.error(`   Response body: ${data.substring(0, 500)}`);
                            resolve({
                                updateAvailable: false,
                                currentVersion: this.currentVersion,
                                error: `API error: ${res.statusCode}`
                            });
                            return;
                        }

                        const releases = JSON.parse(data);
                        console.log(`   ✅ Found ${releases.length} total releases`);

                        // Filter for non-prerelease, non-draft releases
                        const stableReleases = releases.filter(r => !r.prerelease && !r.draft);
                        console.log(`   📦 Stable releases: ${stableReleases.length}`);

                        if (stableReleases.length === 0) {
                            console.log('ℹ️  No stable releases found');
                            resolve({
                                updateAvailable: false,
                                currentVersion: this.currentVersion,
                                message: 'No stable releases available yet'
                            });
                            return;
                        }

                        // Get the first stable release (latest)
                        const release = stableReleases[0];
                        this.latestRelease = release;
                        this.lastCheck = Date.now();

                        console.log(`   ✅ Latest stable release: ${release.tag_name}`);
                        console.log(`   Published: ${release.published_at}`);
                        console.log(`   Prerelease: ${release.prerelease}`);
                        console.log(`   Draft: ${release.draft}`);

                        // Parse versions (remove 'v' prefix if exists)
                        const latestVersion = release.tag_name.replace(/^v/, '');
                        const currentVersion = this.currentVersion.replace(/^v/, '');

                        console.log(`   Latest version: ${latestVersion}`);
                        console.log(`   Comparing: ${currentVersion} vs ${latestVersion}`);

                        // Compare versions
                        const updateAvailable = this.isNewerVersion(latestVersion, currentVersion);
                        this.updateAvailable = updateAvailable;

                        if (updateAvailable) {
                            console.log('🎉 Update available!');

                            // Find .exe download URL
                            const exeAsset = release.assets.find(asset =>
                                asset.name.endsWith('.exe')
                            );

                            // Use browser_download_url for public repos (fast CDN download!)
                            const downloadUrl = exeAsset ? exeAsset.browser_download_url : release.html_url;
                            console.log(`   Download URL (CDN): ${downloadUrl}`);

                            resolve({
                                updateAvailable: true,
                                currentVersion: currentVersion,
                                latestVersion: latestVersion,
                                releaseDate: release.published_at,
                                changelog: release.body || 'No changelog available',
                                downloadUrl: downloadUrl,
                                releasePage: release.html_url
                            });
                        } else {
                            console.log('ℹ️  Already up to date (no newer version found)');
                            resolve({
                                updateAvailable: false,
                                currentVersion: currentVersion,
                                latestVersion: latestVersion
                            });
                        }

                    } catch (error) {
                        console.error('❌ Error parsing GitHub response:', error);
                        console.error(`   Raw data: ${data.substring(0, 500)}`);
                        resolve({
                            updateAvailable: false,
                            currentVersion: this.currentVersion,
                            error: error.message
                        });
                    }
                });
            });

            req.on('error', (error) => {
                console.error('❌ Network error checking for updates:', error.message);
                console.error('   Code:', error.code);
                console.error('   Syscall:', error.syscall);
                resolve({
                    updateAvailable: false,
                    currentVersion: this.currentVersion,
                    error: `Network error: ${error.message}`
                });
            });

            req.on('timeout', () => {
                console.error('❌ Update check timeout (10s exceeded)');
                req.destroy();
                resolve({
                    updateAvailable: false,
                    currentVersion: this.currentVersion,
                    error: 'Request timeout'
                });
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
