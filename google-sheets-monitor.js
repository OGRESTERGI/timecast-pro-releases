// ============================================================
// 📊 GOOGLE SHEETS MONITORING MODULE
// Κοινό module για server.js και main.js (standalone)
// ============================================================

const https = require('https');
const url = require('url');

class GoogleSheetsMonitor {
    constructor() {
        this.state = {
            url: null,
            csvUrl: null,
            lastHash: null,
            interval: null,
            isActive: false,
            checkFrequency: 30000, // 30 seconds
            errorCount: 0,
            maxErrors: 3
        };
        
        this.eventCallback = null; // For broadcasting updates
        this.serverEventMarkers = null; // Reference to markers array
    }
    
    // Initialize with markers array and event callback
    init(serverEventMarkers, eventCallback = null) {
        this.serverEventMarkers = serverEventMarkers;
        this.eventCallback = eventCallback;
        console.log('📊 Google Sheets Monitor initialized');
    }
    
    // Start monitoring
    startMonitoring(sheetsUrl) {
        this.stopMonitoring();
        
        let csvUrl = sheetsUrl;
        if (sheetsUrl.includes('docs.google.com/spreadsheets')) {
            const sheetIdMatch = sheetsUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
            if (sheetIdMatch) {
                csvUrl = `https://docs.google.com/spreadsheets/d/${sheetIdMatch[1]}/export?format=csv&gid=0`;
            }
        }
        
        this.state.url = sheetsUrl;
        this.state.csvUrl = csvUrl;
        this.state.isActive = true;
        this.state.errorCount = 0;
        
        console.log(`📊 Starting Google Sheets auto-monitoring every ${this.state.checkFrequency / 1000} seconds`);
        console.log(`📊 Monitoring URL: ${csvUrl}`);
        
        this.state.interval = setInterval(() => {
            this.checkForChanges();
        }, this.state.checkFrequency);
        
        // Initial check after 5 seconds
        setTimeout(() => {
            this.checkForChanges();
        }, 5000);
    }
    
    // Stop monitoring
    stopMonitoring() {
        if (this.state.interval) {
            clearInterval(this.state.interval);
            this.state.interval = null;
        }
        this.state.isActive = false;
        console.log('📊 Google Sheets monitoring stopped');
    }
    
    // Manual refresh function
    async manualRefresh() {
        if (!this.state.isActive || !this.state.csvUrl) {
            throw new Error('No active Google Sheets connection');
        }
        
        console.log('📊 Manual Google Sheets refresh requested...');
        return this.checkForChanges();
    }
    
    // Check for changes
    async checkForChanges() {
        if (!this.state.isActive || !this.state.csvUrl) {
            return;
        }
        
        try {
            console.log('📊 Checking Google Sheets for changes...');
            
            const currentContent = await this.fetchContent(this.state.csvUrl);
            const currentHash = this.generateHash(currentContent);
            
            if (this.state.lastHash && this.state.lastHash !== currentHash) {
                console.log('📊 ✨ Google Sheets content changed! Auto-reloading...');
                const result = await this.processContent(currentContent, true);
                
                // Broadcast update if callback provided
                if (this.eventCallback) {
                    this.eventCallback('auto_update', {
                        action: 'google_sheets_auto_update',
                        allMarkers: [...this.serverEventMarkers],
                        timestamp: Date.now(),
                        sourceType: 'Google Sheets',
                        isAutoUpdate: true,
                        markersCount: result.loadedCount
                    });
                }
            } else if (!this.state.lastHash) {
                console.log('📊 Initial Google Sheets content loaded for monitoring');
            } else {
                console.log('📊 ✅ Google Sheets unchanged');
            }
            
            this.state.lastHash = currentHash;
            this.state.errorCount = 0;
            
        } catch (error) {
            this.state.errorCount++;
            console.error(`📊 ❌ Error checking Google Sheets (${this.state.errorCount}/${this.state.maxErrors}):`, error.message);
            
            if (this.state.errorCount >= this.state.maxErrors) {
                console.error('📊 🛑 Too many errors, stopping monitoring');
                this.stopMonitoring();
                
                if (this.eventCallback) {
                    this.eventCallback('monitoring_stopped', {
                        action: 'monitoring_stopped',
                        timestamp: Date.now(),
                        error: 'Monitoring stopped due to repeated errors'
                    });
                }
            }
        }
    }
    
    // Fetch content with redirect handling
    async fetchContent(csvUrl, maxRedirects = 5) {
        return new Promise((resolve, reject) => {
            if (maxRedirects <= 0) {
                reject(new Error('Too many redirects'));
                return;
            }
            
            const parsedUrl = url.parse(csvUrl);
            
            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || 443,
                path: parsedUrl.path,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            };
            
            const request = https.request(options, (response) => {
                // Handle redirects
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    this.fetchContent(response.headers.location, maxRedirects - 1)
                        .then(resolve)
                        .catch(reject);
                    return;
                }
                
                if (response.statusCode === 200) {
                    let data = '';
                    response.on('data', chunk => data += chunk);
                    response.on('end', () => {
                        if (data.includes('<html') || data.includes('Google Docs')) {
                            reject(new Error('Sheet is not public'));
                            return;
                        }
                        resolve(data);
                    });
                } else {
                    reject(new Error(`HTTP ${response.statusCode}`));
                }
            });
            
            request.on('error', reject);
            request.setTimeout(10000, () => {
                request.destroy();
                reject(new Error('Request timeout'));
            });
            
            request.end();
        });
    }
    
    // Generate hash for change detection
    generateHash(content) {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString();
    }
    
// Process CSV content - ΠΛΗΡΗΣ ΣΥΝΑΡΤΗΣΗ ΜΕ TIMELINE UPDATES
async processContent(csvData, isAutoUpdate = false) {
    try {
       // 🔥 CLEAR ALL MARKERS (not just Google Sheets)
if (this.serverEventMarkers) {
    console.log(`📊 Clearing ALL ${this.serverEventMarkers.length} existing markers before Google Sheets import`);
    this.serverEventMarkers.length = 0; // Καθαρίζει ΟΛΟΥΣ τους markers
}
        
        // Parse CSV
        const lines = csvData.split('\n').filter(line => line.trim());
        let loadedCount = 0;
        let timelineStart = '09:00';
        let timelineEnd = '17:00';
        let projectTitle = 'Google Sheets Timeline';
        
        // Simple CSV parsing
        const parsedData = [];
        lines.forEach((line) => {
            if (!line.trim()) return;
            
            const cells = [];
            let currentCell = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    cells.push(currentCell.trim().replace(/^"|"$/g, ''));
                    currentCell = '';
                } else {
                    currentCell += char;
                }
            }
            cells.push(currentCell.trim().replace(/^"|"$/g, ''));
            
            if (cells.length > 0) {
                parsedData.push(cells);
            }
        });
        
        // Process data
        parsedData.forEach((row, index) => {
            if (!row || row.length < 2) return;
            
            const timeCol = row[0] ? row[0].toString().trim() : '';
            const titleCol = row[1] ? row[1].toString().trim() : '';
            const noteCol = row[2] ? row[2].toString().trim() : '';
            
            // Special configuration rows
            if (titleCol.toLowerCase().includes('title') && noteCol) {
                projectTitle = noteCol.replace(/[\[\]]/g, '').trim();
                console.log(`📝 Project title set: ${projectTitle}`);
                return;
            }
            if (titleCol.toLowerCase().includes('timeline start') && timeCol) {
                timelineStart = timeCol;
                console.log(`🕐 Timeline start set: ${timelineStart}`);
                return;
            }
            if (titleCol.toLowerCase().includes('timeline end') && timeCol) {
                timelineEnd = timeCol;
                console.log(`🕐 Timeline end set: ${timelineEnd}`);
                return;
            }
            
            // Skip headers
            if (timeCol.toLowerCase() === 'time' || 
                titleCol.toLowerCase().includes('οδηγίες') ||
                titleCol.toLowerCase().includes('events')) {
                return;
            }
            
            // Valid markers
            if (timeCol && /^\d{1,2}:\d{2}$/.test(timeCol) && titleCol) {
               const markerObj = {
    id: `gsheet-marker-${Date.now()}-${index}`,
    time: timeCol,
    title: titleCol,
    note: noteCol,
    type: determineMarkerType(titleCol),
    source: 'google_sheets',
    timestamp: Date.now()
};
                
                if (this.serverEventMarkers) {
                    this.serverEventMarkers.push(markerObj);
                }
                loadedCount++;
            }
        });
        
        console.log(`📊 ${isAutoUpdate ? '🔄 Auto-updated' : '📥 Loaded'} ${loadedCount} markers from Google Sheets`);
        console.log(`📊 Timeline: ${timelineStart} - ${timelineEnd}`);
        console.log(`📊 Project Title: ${projectTitle}`);
        
        // Update timeline settings globally
        if (global.timerState) {
            global.timerState.timelineSettings.startTime = timelineStart;
            global.timerState.timelineSettings.endTime = timelineEnd;
            global.timerState.title = projectTitle;
            console.log('📊 ✅ Global timerState updated');
        }
        
        // Broadcast timeline settings update
        if (this.eventCallback) {
            this.eventCallback('settings_update', {
                timeline: {
                    startTime: timelineStart,
                    endTime: timelineEnd
                },
                display: {
                    title: projectTitle
                },
                source: 'google_sheets',
                timestamp: Date.now()
            });
            console.log('📊 ✅ Timeline settings broadcasted');
        }
        // Broadcast markers update
if (this.eventCallback) {
    this.eventCallback('markers_update', {
        action: isAutoUpdate ? 'google_sheets_auto_update' : 'google_sheets_import',
        allMarkers: [...this.serverEventMarkers],
        timestamp: Date.now(),
        sourceType: 'Google Sheets',
        isAutoUpdate: isAutoUpdate,
        markersCount: loadedCount
    });
    console.log('📊 ✅ Markers update broadcasted');
}
        
        return { 
            loadedCount, 
            timelineStart, 
            timelineEnd, 
            projectTitle 
        };
        
    } catch (error) {
        console.error('📊 ❌ Error processing Google Sheets content:', error);
        throw error;
    }
}
    
    // Initial import (for first-time setup)
    async initialImport(sheetsUrl) {
        try {
            let csvUrl = sheetsUrl;
            let sheetId = null;
            if (sheetsUrl.includes('docs.google.com/spreadsheets')) {
                const sheetIdMatch = sheetsUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
                if (sheetIdMatch) {
                    sheetId = sheetIdMatch[1];
                    csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
                }
            }
            
            console.log('📊 Initial Google Sheets import...');
            
            // Try to get spreadsheet filename from HTML page title
            let spreadsheetTitle = null;
            if (sheetId) {
                try {
                    const htmlResponse = await fetch(sheetsUrl);
                    if (htmlResponse.ok) {
                        const htmlText = await htmlResponse.text();
                        const titleMatch = htmlText.match(/<title>([^<]+)<\/title>/);
                        
                        if (titleMatch && titleMatch[1]) {
                            // Clean the title: remove "- Google Sheets", "- Υπολογιστικά φύλλα Google", etc.
                            spreadsheetTitle = titleMatch[1]
                                .replace(/ - Google Sheets$/, '')
                                .replace(/ - Υπολογιστικά φύλλα Google$/, '')
                                .trim();
                            console.log('📊 ✅ Got spreadsheet filename:', spreadsheetTitle);
                        }
                    }
                } catch (error) {
                    console.warn('📊 Could not fetch spreadsheet filename:', error.message);
                }
            }
            
            const csvData = await this.fetchContent(csvUrl);
            const result = await this.processContent(csvData, false);
            
            // Add spreadsheet title to result
            if (spreadsheetTitle) {
                result.spreadsheetTitle = spreadsheetTitle;
            }
            
            // Start monitoring after successful import
            this.startMonitoring(sheetsUrl);
            
            return result;
            
        } catch (error) {
            console.error('📊 ❌ Initial import error:', error);
            throw error;
        }
    }
}
/// ΠΛΗΡΗΣ marker type detection για Google Sheets (από admin.html)
function determineMarkerType(title) {
    const lowerTitle = title.toLowerCase();
    
    // ☕ ΔΙΑΛΕΙΜΜΑΤΑ & ΚΑΦΕ
    if (lowerTitle.includes('διάλειμμα') || lowerTitle.includes('διαλειμμα') || 
        lowerTitle.includes('break') || lowerTitle.includes('καφέ') || 
        lowerTitle.includes('καφε') || lowerTitle.includes('coffee')) {
        return 'break';
    }
    
    // 🍽️ ΓΕΥΜΑΤΑ
    if (lowerTitle.includes('lunch') || lowerTitle.includes('φαγητό') ||
        lowerTitle.includes('φαγητο') || lowerTitle.includes('μεσημεριανό') ||
        lowerTitle.includes('μεσημεριανο') || lowerTitle.includes('γεύμα') ||
        lowerTitle.includes('γευμα')) {
        return 'lunch';
    }
    
    // 🍷 ΔΕΙΠΝΟ & COCKTAIL
    if (lowerTitle.includes('δείπνο') || lowerTitle.includes('δειπνο') ||
        lowerTitle.includes('dinner') || lowerTitle.includes('cocktail') ||
        lowerTitle.includes('κοκτέιλ') || lowerTitle.includes('κοκτειλ') ||
        lowerTitle.includes('reception')) {
        return 'dinner';
    }
    
    // 🎤 ΟΜΙΛΙΕΣ (μόνο λόγος)
    if (lowerTitle.includes('ομιλία') || lowerTitle.includes('ομιλια') ||
        lowerTitle.includes('speech') || lowerTitle.includes('keynote') || 
        lowerTitle.includes('talk')) {
        return 'speech';
    }
    
    // 📈 ΠΑΡΟΥΣΙΑΣΕΙΣ & POWERPOINT
    if (lowerTitle.includes('παρουσίαση') || lowerTitle.includes('παρουσιαση') ||
        lowerTitle.includes('presentation') || lowerTitle.includes('powerpoint') ||
        lowerTitle.includes('ppt') || lowerTitle.includes('demo') ||
        lowerTitle.includes('showcase')) {
        return 'presentation';
    }
    
    // ❓ ΕΡΩΤΗΣΕΙΣ & ΣΥΖΗΤΗΣΗ
    if (lowerTitle.includes('ερωτήσεις') || lowerTitle.includes('ερωτησεις') || 
        lowerTitle.includes('q&a') || lowerTitle.includes('questions') ||
        lowerTitle.includes('συζήτηση') || lowerTitle.includes('συζητηση') ||
        lowerTitle.includes('discussion')) {
        return 'questions';
    }
    
    // 🗳️ ΨΗΦΟΦΟΡΙΕΣ & ΕΚΛΟΓΕΣ  
    if (lowerTitle.includes('ψηφοφορία') || lowerTitle.includes('ψηφοφορια') ||
        lowerTitle.includes('εκλογή') || lowerTitle.includes('εκλογη') ||
        lowerTitle.includes('voting') || lowerTitle.includes('election') ||
        lowerTitle.includes('poll')) {
        return 'voting';
    }
    
    // 🧠 ΚΟΥΙΖ & ΠΑΙΧΝΙΔΙΑ
    if (lowerTitle.includes('κουίζ') || lowerTitle.includes('κουιζ') ||
        lowerTitle.includes('quiz') || lowerTitle.includes('παιχνίδι') ||
        lowerTitle.includes('παιχνιδι') || lowerTitle.includes('game') ||
        lowerTitle.includes('competition')) {
        return 'quiz';
    }
    
    // 🎵 ΜΟΥΣΙΚΗ & ENTERTAINMENT
    if (lowerTitle.includes('μουσική') || lowerTitle.includes('μουσικη') ||
        lowerTitle.includes('music') || lowerTitle.includes('entertainment') ||
        lowerTitle.includes('band') || lowerTitle.includes('performance')) {
        return 'music';
    }
    
    // 👥 NETWORKING & ΓΝΩΡΙΜΙΑ
    if (lowerTitle.includes('networking') || lowerTitle.includes('γνωριμία') ||
        lowerTitle.includes('γνωριμια') || lowerTitle.includes('socializing') ||
        lowerTitle.includes('κοινωνικό') || lowerTitle.includes('κοινωνικο')) {
        return 'networking';
    }
    
    // 🏆 ΒΡΑΒΕΙΑ & ΤΕΛΕΤΕΣ
    if (lowerTitle.includes('βραβείο') || lowerTitle.includes('βραβειο') ||
        lowerTitle.includes('award') || lowerTitle.includes('ceremony') ||
        lowerTitle.includes('τελετή') || lowerTitle.includes('τελετη')) {
        return 'awards';
    }
    
    // 📊 WORKSHOP & ΕΡΓΑΣΤΗΡΙΑ
    if (lowerTitle.includes('workshop') || lowerTitle.includes('εργαστήριο') ||
        lowerTitle.includes('εργαστηριο') || lowerTitle.includes('hands-on') ||
        lowerTitle.includes('training')) {
        return 'workshop';
    }
    
    // 🚀 ΕΝΑΡΞΗ & ΚΑΛΩΣΟΡΙΣΜΑ
    if (lowerTitle.includes('έναρξη') || lowerTitle.includes('εναρξη') ||
        lowerTitle.includes('καλωσόρισμα') || lowerTitle.includes('καλωσορισμα') ||
        lowerTitle.includes('opening') || lowerTitle.includes('welcome') ||
        lowerTitle.includes('kick-off')) {
        return 'opening';
    }
    
    // 🎯 ΚΛΕΙΣΙΜΟ & ΛΗΞΗ
    if (lowerTitle.includes('κλείσιμο') || lowerTitle.includes('κλεισιμο') ||
        lowerTitle.includes('λήξη') || lowerTitle.includes('ληξη') ||
        lowerTitle.includes('closing') || lowerTitle.includes('wrap-up') ||
        lowerTitle.includes('conclusion')) {
        return 'closing';
    }
    
    // ⚠️ ΣΗΜΑΝΤΙΚΟ & ΠΡΟΣΟΧΗ
    if (lowerTitle.includes('σημαντικό') || lowerTitle.includes('σημαντικο') || 
        lowerTitle.includes('important') || lowerTitle.includes('κρίσιμο') ||
        lowerTitle.includes('κρισιμο') || lowerTitle.includes('προσοχή') || 
        lowerTitle.includes('προσοχη') || lowerTitle.includes('urgent')) {
        return 'important';
    }
    
    return null; // Default (πορτοκαλί χρώμα)
}

// Export the class
module.exports = GoogleSheetsMonitor;