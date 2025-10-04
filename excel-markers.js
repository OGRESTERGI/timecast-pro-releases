const fs = require('fs');
const XLSX = require('xlsx');
const path = require('path');

// Dynamic Excel file configuration
let CURRENT_EXCEL_FILE = null; // Δυναμικό αρχείο
const EXCEL_SHEET_NAME = 'Timeline';
let lastExcelModified = 0;
let serverEventMarkers = null;
let io = null;
let monitoringInterval = null;

// Set current Excel file to monitor
function setCurrentExcelFile(filePath) {
    CURRENT_EXCEL_FILE = filePath;
    lastExcelModified = 0; // Reset για άμεση φόρτωση
    console.log(`📊 Now monitoring: ${filePath}`);
}

// Excel file monitoring
function checkExcelFile() {
    try {
        if (!CURRENT_EXCEL_FILE) {
            // Δεν έχει οριστεί αρχείο - δεν κάνουμε τίποτα
            return;
        }

        if (!fs.existsSync(CURRENT_EXCEL_FILE)) {
            console.log(`📊 Excel file not found: ${CURRENT_EXCEL_FILE}`);
            return;
        }

        const stats = fs.statSync(CURRENT_EXCEL_FILE);
        const currentModified = stats.mtime.getTime();

        if (currentModified > lastExcelModified) {
            console.log(`📊 Excel file changed: ${path.basename(CURRENT_EXCEL_FILE)}`);
            lastExcelModified = currentModified;
            loadMarkersFromExcel();
        }
    } catch (error) {
        console.error('❌ Error checking Excel file:', error);
    }
}

// Load markers from current Excel file
function loadMarkersFromExcel() {
    try {
        if (!CURRENT_EXCEL_FILE || !fs.existsSync(CURRENT_EXCEL_FILE)) {
            console.log('⚠️ No Excel file to load from');
            return;
        }

        const workbook = XLSX.readFile(CURRENT_EXCEL_FILE);
        const worksheet = workbook.Sheets[EXCEL_SHEET_NAME] || workbook.Sheets[workbook.SheetNames[0]];
        
        if (!worksheet) {
            console.log('⚠️ No valid worksheet found');
            return;
        }

        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // Raw array format
        
        // 🔥 CLEAR ALL MARKERS (not just Excel markers)
console.log(`📊 Clearing ALL ${serverEventMarkers.length} existing markers before Excel import`);
serverEventMarkers.length = 0; // Καθαρίζει ΟΛΟΥΣ τους markers
let loadedCount = 0;

        // Process data (skip header row)
        let projectTitle = null;
        let timelineStart = null;
        let timelineEnd = null;
        
        data.slice(1).forEach((row, index) => {
            const timeCol = row[0];
            const titleCol = row[1]; 
            const noteCol = row[2];
            
            // Handle system rows - EXTRACT the data instead of skipping
if (noteCol === '[System]') {
    if (timeCol === 'Title') {
        projectTitle = titleCol;
        console.log(`📊 Project title extracted: "${projectTitle}"`);
    } else if (titleCol === 'Timeline Start') {
        timelineStart = parseTimeFromExcel(timeCol);  // ← ΠΡΟΣΘΗΚΗ parseTimeFromExcel!
        console.log(`📊 Timeline start extracted: ${timelineStart}`);
    } else if (titleCol === 'Timeline End') {
        timelineEnd = parseTimeFromExcel(timeCol);    // ← ΠΡΟΣΘΗΚΗ parseTimeFromExcel!
        console.log(`📊 Timeline end extracted: ${timelineEnd}`);
    }
    return;
}
            
            // Regular marker processing
            if (timeCol && titleCol) {
                const parsedTime = parseTimeFromExcel(timeCol);
                
                if (parsedTime) {
                    const markerObj = {
                        id: `excel-marker-${Date.now()}-${index}`,
                        time: parsedTime,
                        title: titleCol.toString().trim(),
                        note: noteCol ? noteCol.toString().trim() : '',
                        type: determineMarkerType(titleCol),
                        source: 'excel',
                        timestamp: Date.now()
                    };
                    
                    serverEventMarkers.push(markerObj);
                    loadedCount++;
                    
                    console.log(`📊 Loaded marker: "${markerObj.title}" at ${markerObj.time}`);
                } else {
                    console.warn(`⚠️ Invalid time format in row ${index + 1}: ${timeCol}`);
                }
            }
        });

        // ΝΕΟΣ ΚΩΔΙΚΑΣ: Send timeline data via WebSocket (χρησιμοποιεί το υπάρχον σύστημα)
        if (timelineStart && timelineEnd) {
            console.log(`📊 Updating timeline via WebSocket: ${timelineStart} - ${timelineEnd}`);
            
            // Χρησιμοποιούμε το υπάρχον WebSocket system
            if (io) {
                // Ενημέρωση του timerState directly (αφού είμαστε στον server)
                if (global.timerState) {
                    global.timerState.timelineSettings.startTime = timelineStart;
                    global.timerState.timelineSettings.endTime = timelineEnd;
                    if (projectTitle) {
                        global.timerState.title = projectTitle;
                    }
                    
            }
                
                // Broadcast via WebSocket στο υπάρχον σύστημα
                io.emit('settingsUpdate', {
                    timeline: {
                        startTime: timelineStart,
                        endTime: timelineEnd
                    },
                    display: projectTitle ? {
                        title: projectTitle
                    } : undefined,
                    source: 'excel_import',
                    timestamp: Date.now()
                });
                
                console.log(`✅ Timeline updated via WebSocket: ${timelineStart} - ${timelineEnd}`);
            } else {
                console.log(`⚠️ WebSocket not available for timeline update`);
            }
        } else {
            console.log(`⚠️ No timeline data found in Excel file`);
        }

        console.log(`📊 Loaded ${loadedCount} markers from ${path.basename(CURRENT_EXCEL_FILE)}`);

        // Broadcast update to all clients
        if (io) {
            io.emit('eventMarkersUpdate', {
                action: 'excel_reload',
                allMarkers: [...serverEventMarkers],
                timestamp: Date.now(),
                sourceFile: path.basename(CURRENT_EXCEL_FILE)
            });
        }
        
} catch (error) {
        console.error('❌ Error loading Excel file:', error);
    }
}

// Σωστή επεξεργασία χρόνου από Excel
function parseTimeFromExcel(rawTime) {
    // Αν είναι ήδη string με μορφή ΩΩ:ΛΛ
    if (typeof rawTime === 'string' && /^\d{1,2}[:.,\/]\d{2}$/.test(rawTime)) {

        return rawTime.replace(/[.,\/]/, ':');
    }
    
    // Αν είναι Excel serial number (δεκαδικός αριθμός)
    if (typeof rawTime === 'number') {
        // Excel stores time as fraction of day
        const totalMinutes = Math.round(rawTime * 24 * 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    
    // Αν είναι Date object
    if (rawTime instanceof Date) {
        const hours = rawTime.getHours();
        const minutes = rawTime.getMinutes();
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    
    // Προσπάθεια parsing string
    if (typeof rawTime === 'string') {
        // Αφαίρεση AM/PM και άλλων χαρακτήρων
        const cleanTime = rawTime.replace(/[^\d:]/g, '');
        if (/^\d{1,2}:\d{2}$/.test(cleanTime)) {
            return cleanTime;
        }
    }
    
    console.warn(`⚠️ Could not parse time: ${rawTime} (type: ${typeof rawTime})`);
    return null;
}

// Smart Sample Creation με Dynamic Filename - ΔΙΟΡΘΩΜΕΝΗ
function createSmartSampleExcel(currentMarkers = [], projectTitle = 'Timer') {
    console.log(`📊 Creating Excel with title: "${projectTitle}"`);
    
    // 1. Δημιουργία smart filename
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).replace(/\s/g, '-').toUpperCase();
    
    console.log(`📅 Date string: ${dateStr}`);
    
    // ΔΙΟΡΘΩΣΗ: Καλύτερος καθαρισμός τίτλου που διατηρεί ελληνικά
    let cleanTitle = projectTitle || 'Timer';
    
    // Αντικατάσταση μόνο επικίνδυνων χαρακτήρων για filenames
    cleanTitle = cleanTitle
        .replace(/[<>:"/\\|?*]/g, '') // Μόνο επικίνδυνοι χαρακτήρες για αρχεία
        .replace(/\s+/g, '-')         // Κενά -> παύλες
        .trim();                      // Καθαρισμός αρχής/τέλους
    
    // Αν είναι πολύ μεγάλος, κόψε το στα 40 χαρακτήρες
    if (cleanTitle.length > 40) {
        cleanTitle = cleanTitle.slice(0, 40).trim();
    }
    
    console.log(`🧹 Clean title: "${cleanTitle}"`);
    
    // Δημιουργία τελικού filename με timestamp για μοναδικότητα
    const timestamp = now.toLocaleTimeString('el-GR', {hour: '2-digit', minute: '2-digit'}).replace(':', '');
    const filename = `Timeline-${dateStr}-${timestamp}-${cleanTitle}.xlsx`;
    const filePath = path.join(__dirname, filename);
    
    console.log(`📁 Final filename: ${filename}`);
    console.log(`📂 Full path: ${filePath}`);
    
    // 2. Λήψη τρεχουσών ωρών timeline (αν διαθέσιμες)
    let timelineStart = '09:00';
    let timelineEnd = '17:00';
    
    // Προσπάθεια λήψης από global timerState
    if (global.timerState && global.timerState.timelineSettings) {
        timelineStart = global.timerState.timelineSettings.startTime || '09:00';
        timelineEnd = global.timerState.timelineSettings.endTime || '17:00';
        console.log(`📅 Using current timeline: ${timelineStart} - ${timelineEnd}`);
    } else {
        console.log(`📅 Using default timeline: ${timelineStart} - ${timelineEnd}`);
    }
    
    // 3. Δημιουργία δεδομένων Excel
    let excelData = [
        ['Time', 'Title', 'Note'],
        ['Title', projectTitle, '[System]'],
        [timelineStart, 'Timeline Start', '[System]'],
        [timelineEnd, 'Timeline End', '[System]']
    ];
    
    if (currentMarkers && currentMarkers.length > 0) {
        // Χρήση τρέχουσας χρονοσειράς
        console.log(`📊 Using current timeline with ${currentMarkers.length} markers`);
        
        // Ταξινόμηση markers κατά ώρα
        const sortedMarkers = [...currentMarkers].sort((a, b) => {
            const timeA = timeToMinutes(a.time);
            const timeB = timeToMinutes(b.time);
            return timeA - timeB;
        });
        
        sortedMarkers.forEach(marker => {
            excelData.push([marker.time, marker.title, marker.note || '']); // Note στήλη από marker
        });
        
    } else {
        // Χρήση δείγματος
        console.log('📊 No current markers, using sample data');
        const sampleData = [
            ['09:30', 'Έναρξη Συνεδρίου', ''],
            ['10:15', 'Διάλειμμα Καφέ', ''],
            ['11:00', 'Παρουσίαση Α', ''],
            ['12:30', 'Μεσημεριανό Διάλειμμα', ''],
            ['14:00', 'Παρουσίαση Β', ''],
            ['15:30', 'Συζήτηση', ''],
            ['16:30', 'Λήξη', '']
        ];
        
        excelData = excelData.concat(sampleData);
    }
    
    // 4. Δημιουργία Excel αρχείου
    try {
        const worksheet = XLSX.utils.aoa_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Timeline');
        XLSX.writeFile(workbook, filePath);
        
        console.log(`✅ Smart sample Excel created: ${filename}`);
        console.log(`📊 Contains ${excelData.length - 4} data rows + 4 system rows`);
        
        return {
            success: true,
            filename: filename,
            path: filePath,
            markersCount: excelData.length - 4 // Minus header + system rows
        };
        
    } catch (error) {
        console.error('❌ Error creating smart sample:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Mirror της admin.html determineMarkerType function
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
        lowerTitle.includes('κοκτέιλ') || lowerTitle.includes('κοκτειλ')) {
        return 'dinner';
    }
    
    // 🎤 ΟΜΙΛΙΕΣ
    if (lowerTitle.includes('ομιλία') || lowerTitle.includes('ομιλια') ||
        lowerTitle.includes('speech') || lowerTitle.includes('λόγος') ||
        lowerTitle.includes('λογος') || lowerTitle.includes('keynote')) {
        return 'speech';
    }
    
    // 📈 ΠΑΡΟΥΣΙΑΣΕΙΣ
    if (lowerTitle.includes('παρουσίαση') || lowerTitle.includes('παρουσιαση') ||
        lowerTitle.includes('presentation') || lowerTitle.includes('demo') ||
        lowerTitle.includes('showcase') || lowerTitle.includes('exhibit')) {
        return 'presentation';
    }
    
    // ❓ ΕΡΩΤΗΣΕΙΣ & ΣΥΖΗΤΗΣΕΙΣ
    if (lowerTitle.includes('ερωτήσεις') || lowerTitle.includes('ερωτησεις') ||
        lowerTitle.includes('questions') || lowerTitle.includes('q&a') ||
        lowerTitle.includes('συζήτηση') || lowerTitle.includes('συζητηση') ||
        lowerTitle.includes('discussion') || lowerTitle.includes('debate')) {
        return 'questions';
    }
    
    // 🗳️ ΨΗΦΟΦΟΡΙΕΣ
    if (lowerTitle.includes('ψηφοφορία') || lowerTitle.includes('ψηφοφορια') ||
        lowerTitle.includes('voting') || lowerTitle.includes('poll') ||
        lowerTitle.includes('election') || lowerTitle.includes('ballot')) {
        return 'voting';
    }
    
    // 🧠 ΚΟΥΙΖ & ΠΑΙΧΝΙΔΙΑ
    if (lowerTitle.includes('κουίζ') || lowerTitle.includes('κουιζ') ||
        lowerTitle.includes('quiz') || lowerTitle.includes('παιχνίδι') ||
        lowerTitle.includes('παιχνιδι') || lowerTitle.includes('game') ||
        lowerTitle.includes('τεστ') || lowerTitle.includes('test')) {
        return 'quiz';
    }
    
    // 🎵 ΜΟΥΣΙΚΗ & ΨΥΧΑΓΩΓΙΑ
    if (lowerTitle.includes('μουσική') || lowerTitle.includes('μουσικη') ||
        lowerTitle.includes('music') || lowerTitle.includes('ψυχαγωγία') ||
        lowerTitle.includes('ψυχαγωγια') || lowerTitle.includes('entertainment') ||
        lowerTitle.includes('show') || lowerTitle.includes('performance')) {
        return 'music';
    }
    
    // 👥 NETWORKING
    if (lowerTitle.includes('networking') || lowerTitle.includes('δικτύωση') ||
        lowerTitle.includes('δικτυωση') || lowerTitle.includes('social') ||
        lowerTitle.includes('mixer') || lowerTitle.includes('meetup')) {
        return 'networking';
    }
    
    // 🏆 ΒΡΑΒΕΙΑ & ΤΕΛΕΤΕΣ
    if (lowerTitle.includes('βραβεία') || lowerTitle.includes('βραβεια') ||
        lowerTitle.includes('awards') || lowerTitle.includes('ceremony') ||
        lowerTitle.includes('τελετή') || lowerTitle.includes('τελετη') ||
        lowerTitle.includes('recognition') || lowerTitle.includes('honor')) {
        return 'awards';
    }
    
    // 📊 WORKSHOP & ΕΡΓΑΣΤΗΡΙΑ
    if (lowerTitle.includes('workshop') || lowerTitle.includes('εργαστήριο') ||
        lowerTitle.includes('εργαστηριο') || lowerTitle.includes('masterclass') ||
        lowerTitle.includes('hands-on') || lowerTitle.includes('tutorial')) {
        return 'workshop';
    }
    
    // 🚀 ΕΝΑΡΞΗ & ΚΑΛΩΣΟΡΙΣΜΑ
    if (lowerTitle.includes('έναρξη') || lowerTitle.includes('εναρξη') ||
        lowerTitle.includes('opening') || lowerTitle.includes('καλωσόρισμα') ||
        lowerTitle.includes('καλωσορισμα') || lowerTitle.includes('welcome') ||
        lowerTitle.includes('kickoff') || lowerTitle.includes('αρχή') ||
        lowerTitle.includes('αρχη') || lowerTitle.includes('start')) {
        return 'opening';
    }
    
    // 🎯 ΚΛΕΙΣΙΜΟ & ΛΗΞΗ
    if (lowerTitle.includes('λήξη') || lowerTitle.includes('ληξη') ||
        lowerTitle.includes('closing') || lowerTitle.includes('κλείσιμο') ||
        lowerTitle.includes('κλεισιμο') || lowerTitle.includes('τέλος') ||
        lowerTitle.includes('τελος') || lowerTitle.includes('end') ||
        lowerTitle.includes('finale') || lowerTitle.includes('wrap-up')) {
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

// Start Excel monitoring
function startExcelMonitoring(markersArray, socketIO) {
    serverEventMarkers = markersArray;
    io = socketIO;
    
    console.log('📊 Starting dynamic Excel monitoring...');
    
    // Start monitoring (every 3 seconds - όχι πολύ συχνά για σταθερότητα)
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
    }
    monitoringInterval = setInterval(checkExcelFile, 3000);
    
    return {
        setFile: setCurrentExcelFile,
        refresh: loadMarkersFromExcel,
        getCurrentFile: () => CURRENT_EXCEL_FILE,
        stop: () => {
            if (monitoringInterval) {
                clearInterval(monitoringInterval);
                monitoringInterval = null;
                console.log('📊 Excel monitoring stopped');
            }
        }
    };
}

// Manual refresh function
function refreshFromExcel() {
    console.log('📊 Manual Excel refresh triggered');
    loadMarkersFromExcel();
}

// Helper function για μετατροπή ώρας σε λεπτά
function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

module.exports = {
    startExcelMonitoring,
    refreshFromExcel,
    createSmartSampleExcel,
    setCurrentExcelFile  // Νέα export
};