// companion-api.js - Corrected API endpoints that work like admin panel
const express = require('express');

function createCompanionAPI(timerState, serverSavedMessages, serverEventMarkers, io, serverFunctions) {
    const router = express.Router();
    // Helper function για μετατροπή time σε λεπτά (ίδια με admin panel)
function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

// Function για εύρεση timeline events (ίδια λογική με admin panel)
function findTimelineEvents(markers) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    // Ταξινόμηση markers
    const sortedMarkers = markers.sort((a, b) => a.time.localeCompare(b.time));
    
    let current = null;
    let next = null;
    let afterNext = null;
    
    // Εύρεση τρέχοντος event (το τελευταίο που έχει περάσει)
    for (let i = 0; i < sortedMarkers.length; i++) {
        const markerMinutes = timeToMinutes(sortedMarkers[i].time);
        if (markerMinutes <= currentMinutes) {
            current = sortedMarkers[i];
        } else {
            break;
        }
    }
    
    // Εύρεση επόμενου event
    for (let i = 0; i < sortedMarkers.length; i++) {
        const markerMinutes = timeToMinutes(sortedMarkers[i].time);
        if (markerMinutes > currentMinutes) {
            next = sortedMarkers[i];
            // Εύρεση μεθεπόμενου
            if (i + 1 < sortedMarkers.length) {
                afterNext = sortedMarkers[i + 1];
            }
            break;
        }
    }
    
    return { current, next, afterNext };
}
    
    // ===== TIMER CONTROL - ΑΚΡΙΒΩΣ ΟΠΩΣ ΣΤΟ ADMIN =====
    
    router.post('/timer/start', (req, res) => {
        console.log('Companion: Start timer');
        // Καλούμε άμεσα την server function (όπως κάνει το WebSocket handler)
        serverFunctions.startTimer();
        res.json({ success: true, action: 'start' });
    });
    
    router.post('/timer/pause', (req, res) => {
        console.log('Companion: Pause timer');
        serverFunctions.pauseTimer();
        res.json({ success: true, action: 'pause' });
    });
    
    router.post('/timer/reset', (req, res) => {
        console.log('Companion: Reset timer');
        serverFunctions.resetTimer();
        res.json({ success: true, action: 'reset' });
    });
    
    // Timer adjustment - ΑΚΡΙΒΩΣ ΟΠΩΣ ΣΤΟ ADMIN
    router.post('/timer/adjust/:seconds', (req, res) => {
        const seconds = parseInt(req.params.seconds);
        if (isNaN(seconds)) {
            return res.status(400).json({ error: 'Invalid seconds parameter' });
        }
        
        console.log(`Companion: Adjust time by ${seconds} seconds`);
        serverFunctions.adjustTime(seconds);
        res.json({ success: true, adjustment: seconds, newTime: timerState.timeLeft });
    });
    
    // ===== TIMER DISPLAY ENDPOINTS =====
    
    router.get('/timer/text', (req, res) => {
        const absTime = Math.abs(timerState.timeLeft);
        const hours = Math.floor(absTime / 3600);
        const minutes = Math.floor((absTime % 3600) / 60);
        const seconds = absTime % 60;

        let timeString;
        if (hours > 0) {
            timeString = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
            timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }

        if (timerState.timeLeft < 0) {
            timeString = '+' + timeString;
        }

        res.set('Content-Type', 'text/plain');
        res.send(timeString);
    });
    
    router.get('/timer/hours', (req, res) => {
        const absTime = Math.abs(timerState.timeLeft);
        const hours = Math.floor(absTime / 3600);
        const hoursString = hours.toString().padStart(2, '0');
        
        // Προσθήκη "+" για αρνητικό χρόνο (overtime) - consistency με main app
        const finalString = timerState.timeLeft < 0 ? `+${hoursString}` : hoursString;
        
        res.set('Content-Type', 'text/plain');
        res.send(finalString);
    });
    
    router.get('/timer/minutes', (req, res) => {
        const absTime = Math.abs(timerState.timeLeft);
        const minutes = Math.floor((absTime % 3600) / 60);
        res.set('Content-Type', 'text/plain');
        res.send(minutes.toString().padStart(2, '0'));
    });
    
    router.get('/timer/seconds', (req, res) => {
        const absTime = Math.abs(timerState.timeLeft);
        const seconds = absTime % 60;
        res.set('Content-Type', 'text/plain');
        res.send(seconds.toString().padStart(2, '0'));
    });
    // ===== TIMER BACKGROUND COLOR FOR OVERTIME =====

router.get('/timer/bg-color', (req, res) => {
    let backgroundColor;
    
    if (timerState.timeLeft < 0) {
        backgroundColor = '#ff0000'; // Κόκκινο για overtime
    } else if (timerState.timeLeft <= timerState.criticalThreshold) {
        backgroundColor = '#ff6600'; // Πορτοκαλί για critical
    } else if (timerState.timeLeft <= timerState.warningThreshold) {
        backgroundColor = '#ffaa00'; // Κίτρινο για warning
    } else {
        backgroundColor = '#333333'; // Γκρι για normal
    }
    
    res.set('Content-Type', 'text/plain');
    res.send(backgroundColor);
});
    
    // ===== FLASH ALERT =====
    
    router.post('/flash', (req, res) => {
        console.log('Companion: Trigger flash alert');
        
        io.emit('flashAlert', { active: true, isAutomatic: false });
        
        // Auto-stop flash after 6 seconds (3 cycles)
        setTimeout(() => {
            io.emit('flashAlert', { active: false });
        }, 6000);
        
        res.json({ success: true, action: 'flash' });
    });
    
    // ===== MESSAGE ENDPOINTS =====
    
    router.get('/companion/messages', (req, res) => {
    console.log('Companion variables requested');
    
    const companionVars = {};
    
    // Create variables for first 10 saved messages - ΔΙΟΡΘΩΜΕΝΟ
    for (let i = 1; i <= 6; i++) {
        const message = serverSavedMessages[i - 1];
        // ΣΩΣΤΟ: Παίρνουμε μόνο το .content string
        const content = message && message.content ? String(message.content) : '';
        companionVars[`saved_message_${i}`] = content;
        
        console.log(`Variable saved_message_${i}: "${content}"`);
    }
    
    res.json(companionVars);
});
    
    router.post('/message/load-saved/:index', (req, res) => {
        const index = parseInt(req.params.index) - 1;
        
        if (index < 0 || index >= serverSavedMessages.length) {
            return res.status(404).json({ 
                error: 'Message not found', 
                index: index + 1,
                available: serverSavedMessages.length 
            });
        }
        
        const message = serverSavedMessages[index];
        
        // Send to admin panel textarea via WebSocket
        io.emit('loadMessageToTextarea', {
            message: message.content,
            index: index + 1
        });
        
        res.json({ 
            success: true, 
            message: message.content,
            loadedToTextarea: true 
        });
    });
    
    // ===== STATUS =====
    
    router.get('/status', (req, res) => {
        res.json({
            timeLeft: timerState.timeLeft,
            originalTime: timerState.originalTime,
            isRunning: timerState.isRunning,
            warningThreshold: timerState.warningThreshold,
            message: timerState.message,
            messageVisible: timerState.messageVisible,
            status: timerState.timeLeft <= 0 ? 'danger' : 
                   timerState.timeLeft <= timerState.warningThreshold ? 'warning' : 'normal'
        });
    });
    
    router.get('/connection/status', (req, res) => {
        res.json('connected');
    });

    // ===== HDMI SCREEN CONTROL =====

router.post('/hdmi/toggle', (req, res) => {
    console.log('Companion: Toggle HDMI timer');
    
    try {
        // Καλούμε απευθείας την function που περάσαμε από το server
        if (serverFunctions.toggleHDMI) {
            const result = serverFunctions.toggleHDMI();
            res.json({ success: true, action: 'hdmi_toggle', result: result });
        } else {
            // Fallback: στέλνουμε WebSocket event στο admin panel
            io.emit('companionHDMIToggle');
            res.json({ success: true, action: 'hdmi_toggle', method: 'websocket' });
        }
    } catch (error) {
        console.error('HDMI toggle error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== MESSAGE TOGGLE με Custom Variable Update =====

router.post('/message/toggle', (req, res) => {
    console.log('Companion: Request message toggle from admin panel');
    
    // Στέλνουμε WebSocket event στο admin panel
    io.emit('companionMessageToggle', { 
        action: 'toggle_with_textarea_update',
        source: 'companion',
        timestamp: Date.now()
    });
    
    // Ενημέρωση custom variable για το Companion tally
    const status = timerState.messageVisible ? 'OFF AIR' : 'ON AIR'; // Αντίστροφο γιατί το toggle δεν έχει γίνει ακόμα
    
    // HTTP request στο Companion API για ενημέρωση custom variable
    const companionHost = 'localhost:8000'; // Ή η IP του Companion
    const updateURL = `http://${companionHost}/api/custom-variable/message_status/value`;
    
    // Στέλνουμε POST request στο Companion
    fetch(updateURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: status })
    }).catch(err => console.log('Companion variable update failed:', err));
    
    res.json({ 
        success: true, 
        action: 'message_toggle_requested',
        companionStatus: status
    });
});

// ===== MESSAGE UPDATE ONLY (no toggle) =====
    
router.post('/message/update', (req, res) => {
    console.log('Companion: Request message update from admin panel');
    
    // Στέλνουμε WebSocket event στο admin panel να κάνει μόνο update
    io.emit('companionMessageUpdate', { 
        action: 'update_from_textarea',
        source: 'companion',
        timestamp: Date.now()
    });
    
    res.json({ 
        success: true, 
        action: 'message_update_requested',
        message: 'Update request sent to admin panel'
    });
});
// ===== MESSAGE VISIBILITY STATUS =====

router.get('/message/visibility-status', (req, res) => {
    const isVisible = timerState.messageVisible;
    console.log(`Companion: Message visibility status: ${isVisible}`);
    
    res.json({
        visible: isVisible,
        status: isVisible ? 'visible' : 'hidden',
        color: isVisible ? 'red' : 'green',
        text: isVisible ? 'HIDE\nMSG' : 'SHOW\nMSG'
    });
});

// Text-only endpoint για Companion variable
router.get('/message/visibility-text', (req, res) => {
    const text = timerState.messageVisible ? 'HIDE\nMSG' : 'SHOW\nMSG';
    res.set('Content-Type', 'text/plain');
    res.send(text);
});

// Color-only endpoint για Companion styling
router.get('/message/visibility-color', (req, res) => {
    const color = timerState.messageVisible ? '16711680' : '65280'; // Red : Green σε decimal
    res.set('Content-Type', 'text/plain');
    res.send(color);
});


// ===== SAVED MESSAGES API =====
    
    // Λήψη κειμένου saved message για display στο Stream Deck
    router.get('/saved-message/1', (req, res) => {
        if (serverSavedMessages.length === 0) {
            //console.log('Companion: Saved message 1 requested: No messages available');
            res.set('Content-Type', 'text/plain');
            res.send('(empty)');
            return;
        }
        const message = serverSavedMessages[0]?.content || '(empty)';
        console.log(`Companion: Saved message 1 requested: "${message}"`);
        res.set('Content-Type', 'text/plain');
        res.send(message);
    });

    router.get('/saved-message/2', (req, res) => {
        if (serverSavedMessages.length < 2) {
            //console.log('Companion: Saved message 2 requested: Not available');
            res.set('Content-Type', 'text/plain');
            res.send('(empty)');
            return;
        }
        const message = serverSavedMessages[1]?.content || '(empty)';
        //console.log(`Companion: Saved message 2 requested: "${message}"`);
        res.set('Content-Type', 'text/plain');
        res.send(message);
    });

    router.get('/saved-message/3', (req, res) => {
        if (serverSavedMessages.length < 3) {
            //console.log('Companion: Saved message 3 requested: Not available');
            res.set('Content-Type', 'text/plain');
            res.send('(empty)');
            return;
        }
        const message = serverSavedMessages[2]?.content || '(empty)';
        //console.log(`Companion: Saved message 3 requested: "${message}"`);
        res.set('Content-Type', 'text/plain');
        res.send(message);
    });
    router.get('/saved-message/4', (req, res) => {
        if (serverSavedMessages.length < 4) {
            //console.log('Companion: Saved message 4 requested: Not available');
            res.set('Content-Type', 'text/plain');
            res.send('(empty)');
            return;
        }
        const message = serverSavedMessages[3]?.content || '(empty)';
        //console.log(`Companion: Saved message 4 requested: "${message}"`);
        res.set('Content-Type', 'text/plain');
        res.send(message);
    });

    router.get('/saved-message/5', (req, res) => {
        if (serverSavedMessages.length < 5) {
            //console.log('Companion: Saved message 5 requested: Not available');
            res.set('Content-Type', 'text/plain');
            res.send('(empty)');
            return;
        }
        const message = serverSavedMessages[4]?.content || '(empty)';
        //console.log(`Companion: Saved message 5 requested: "${message}"`);
        res.set('Content-Type', 'text/plain');
        res.send(message);
    });

    router.get('/saved-message/6', (req, res) => {
        if (serverSavedMessages.length < 6) {
            //console.log('Companion: Saved message 6 requested: Not available');
            res.set('Content-Type', 'text/plain');
            res.send('(empty)');
            return;
        }
        const message = serverSavedMessages[5]?.content || '(empty)';
        //console.log(`Companion: Saved message 6 requested: "${message}"`);
        res.set('Content-Type', 'text/plain');
        res.send(message);
    });
    

    // Λήψη JSON με όλα τα saved messages για companion
    router.get('/companion/messages', (req, res) => {
        console.log('Companion: Requesting first 6 saved messages');  // ΑΛΛΑΓΗ
        
        const first6Messages = serverSavedMessages.slice(0, 6);        // ΑΛΛΑΓΗ

        const buttonTexts = ['', '', '', '', '', ''];                 // ΑΛΛΑΓΗ
        
        first6Messages.forEach((msg, index) => {
            if (index < 6) {                                           // ΑΛΛΑΓΗ
                let displayText = msg.content.trim();
                if (displayText.length > 32) {
                    displayText = displayText.substring(0, 29) + '...';
                }
                buttonTexts[index] = displayText;
            }
        });
        
        res.json({ 
            button1: buttonTexts[0],
            button2: buttonTexts[1], 
            button3: buttonTexts[2],
            button4: buttonTexts[3],                                   // ΠΡΟΣΘΗΚΗ
            button5: buttonTexts[4],                                   // ΠΡΟΣΘΗΚΗ
            button6: buttonTexts[5],                                   // ΠΡΟΣΘΗΚΗ
            buttons: buttonTexts,
            count: first6Messages.length,
            timestamp: Date.now()
        });
    });

    // Αποστολή saved message (buttons)
    router.post('/companion/send-message/:buttonNumber', (req, res) => {
        const buttonNumber = parseInt(req.params.buttonNumber);
        
        if (isNaN(buttonNumber) || buttonNumber < 1 || buttonNumber > 6) {  // ΑΛΛΑΓΗ
            return res.status(400).json({ 
                error: 'Invalid button number. Use 1, 2, 3, 4, 5, or 6.'    // ΑΛΛΑΓΗ
            });
        }
        
        // Υπόλοιπος κώδικας μένει ίδιος...
        const messageIndex = buttonNumber - 1;
        
        if (messageIndex >= serverSavedMessages.length) {
            return res.status(404).json({ 
                error: `Button ${buttonNumber} has no saved message`,
                availableButtons: Math.min(serverSavedMessages.length, 6)    // ΑΛΛΑΓΗ
            });
        }
        
        const savedMessage = serverSavedMessages[messageIndex];
        const messageContent = savedMessage.content;
        
        console.log(`Companion: Button ${buttonNumber} pressed - Sending: "${messageContent}"`);
        
        // Ενημέρωση timer state (όπως στο admin)
        timerState.message = messageContent;
        timerState.messageVisible = true;
        
        // Αποστολή στους clients μέσω WebSocket
        io.emit('messageUpdate', { message: messageContent });
        io.emit('messageVisibilityUpdate', { visible: true });
        
        res.json({ 
            success: true, 
            buttonNumber: buttonNumber,
            message: messageContent,
            sent: true 
        });
    });

    // Φόρτωση saved message στο admin textarea (load buttons)
     router.post('/message/load-saved/:buttonNumber', (req, res) => {
        const buttonNumber = parseInt(req.params.buttonNumber);
        
        if (isNaN(buttonNumber) || buttonNumber < 1 || buttonNumber > 6) {  // ΑΛΛΑΓΗ
            return res.status(400).json({ error: 'Invalid button number' });
        }
        
        const messageIndex = buttonNumber - 1;
        const message = serverSavedMessages[messageIndex]?.content || '';
        
        console.log(`Companion: Loading saved message ${buttonNumber} to admin textarea: "${message}"`);
        
        // Στέλνουμε στα admin panels να φορτώσουν το μήνυμα στο textarea
        io.emit('loadMessageToTextarea', { 
            message: message,
            source: `companion_button_${buttonNumber}`
        });
        
        res.json({ success: true, message: message, loaded: true });
    });

    // Background color endpoints για saved messages
router.get('/saved-message/1/bg-color', (req, res) => {
    const message = serverSavedMessages[0];
    const isActive = message && timerState.message === message.content && timerState.messageVisible;
    
    res.set('Content-Type', 'text/plain');
    res.send(isActive ? '#ff0000' : '#333333'); // Κόκκινο ή γκρι
});

router.get('/saved-message/2/bg-color', (req, res) => {
    const message = serverSavedMessages[1];
    const isActive = message && timerState.message === message.content && timerState.messageVisible;
    
    res.set('Content-Type', 'text/plain');
    res.send(isActive ? '#ff0000' : '#333333');
});

router.get('/saved-message/3/bg-color', (req, res) => {
    const message = serverSavedMessages[2];
    const isActive = message && timerState.message === message.content && timerState.messageVisible;
    
    res.set('Content-Type', 'text/plain');
    res.send(isActive ? '#ff0000' : '#333333');
});

router.get('/saved-message/4/bg-color', (req, res) => {
    const message = serverSavedMessages[3];
    const isActive = message && timerState.message === message.content && timerState.messageVisible;
    
    res.set('Content-Type', 'text/plain');
    res.send(isActive ? '#ff0000' : '#333333');
});

router.get('/saved-message/5/bg-color', (req, res) => {
    const message = serverSavedMessages[4];
    const isActive = message && timerState.message === message.content && timerState.messageVisible;
    
    res.set('Content-Type', 'text/plain');
    res.send(isActive ? '#ff0000' : '#333333');
});

router.get('/saved-message/6/bg-color', (req, res) => {
    const message = serverSavedMessages[5];
    const isActive = message && timerState.message === message.content && timerState.messageVisible;
    
    res.set('Content-Type', 'text/plain');
    res.send(isActive ? '#ff0000' : '#333333');
});



// Enhanced background color endpoints με υποστήριξη για textarea status
router.get('/saved-message/1/bg-color-enhanced', (req, res) => {
    const message = serverSavedMessages[0];
    let color = '#333333'; // Default γκρι
    
    if (message) {
        const isVisible = timerState.message === message.content && timerState.messageVisible;
        const isInTextarea = timerState.currentTextareaContent === message.content;
        
        if (isVisible) {
            color = '#ff0000'; // Κόκκινο - εμφανίζεται στην οθόνη
        } else if (isInTextarea) {
            color = '#ff8800'; // Πορτοκαλί - στο textarea
        }
    }
    
    res.set('Content-Type', 'text/plain');
    res.send(color);
});

router.get('/saved-message/2/bg-color-enhanced', (req, res) => {
    const message = serverSavedMessages[1];
    let color = '#333333';
    
    if (message) {
        const isVisible = timerState.message === message.content && timerState.messageVisible;
        const isInTextarea = timerState.currentTextareaContent === message.content;
        
        if (isVisible) {
            color = '#ff0000';
        } else if (isInTextarea) {
            color = '#ff8800';
        }
    }
    
    res.set('Content-Type', 'text/plain');
    res.send(color);
});

router.get('/saved-message/3/bg-color-enhanced', (req, res) => {
    const message = serverSavedMessages[2];
    let color = '#333333';
    
    if (message) {
        const isVisible = timerState.message === message.content && timerState.messageVisible;
        const isInTextarea = timerState.currentTextareaContent === message.content;
        
        if (isVisible) {
            color = '#ff0000';
        } else if (isInTextarea) {
            color = '#ff8800';
        }
    }
    
    res.set('Content-Type', 'text/plain');
    res.send(color);
});

router.get('/saved-message/4/bg-color-enhanced', (req, res) => {
    const message = serverSavedMessages[3];
    let color = '#333333';
    
    if (message) {
        const isVisible = timerState.message === message.content && timerState.messageVisible;
        const isInTextarea = timerState.currentTextareaContent === message.content;
        
        if (isVisible) {
            color = '#ff0000';
        } else if (isInTextarea) {
            color = '#ff8800';
        }
    }
    
    res.set('Content-Type', 'text/plain');
    res.send(color);
});

router.get('/saved-message/5/bg-color-enhanced', (req, res) => {
    const message = serverSavedMessages[4];
    let color = '#333333';
    
    if (message) {
        const isVisible = timerState.message === message.content && timerState.messageVisible;
        const isInTextarea = timerState.currentTextareaContent === message.content;
        
        if (isVisible) {
            color = '#ff0000';
        } else if (isInTextarea) {
            color = '#ff8800';
        }
    }
    
    res.set('Content-Type', 'text/plain');
    res.send(color);
});

router.get('/saved-message/6/bg-color-enhanced', (req, res) => {
    const message = serverSavedMessages[5];
    let color = '#333333';
    
    if (message) {
        const isVisible = timerState.message === message.content && timerState.messageVisible;
        const isInTextarea = timerState.currentTextareaContent === message.content;
        
        if (isVisible) {
            color = '#ff0000';
        } else if (isInTextarea) {
            color = '#ff8800';
        }
    }
    
    res.set('Content-Type', 'text/plain');
    res.send(color);
});

// ===== EVENT MARKERS API =====

router.get('/marker/1', (req, res) => {
    if (!serverEventMarkers || serverEventMarkers.length === 0) {
        res.set('Content-Type', 'text/plain');
        res.send('(empty)');
        return;
    }
    
    // Χρήση της timeline λογικής - Marker 1 = ΤΡΕΧΟΝ ΓΕΓΟΝΟΣ
    const { current, next, afterNext } = findTimelineEvents(serverEventMarkers);
    
    if (current) {
        res.set('Content-Type', 'text/plain');
        res.send(current.title);
    } else {
        res.set('Content-Type', 'text/plain');
        res.send('(empty)');
    }
});

// Marker 2 display
router.get('/marker/2', (req, res) => {
    if (!serverEventMarkers || serverEventMarkers.length === 0) {
        res.set('Content-Type', 'text/plain');
        res.send('(empty)');
        return;
    }
    
    // Χρήση της timeline λογικής - Marker 2 = ΕΠΟΜΕΝΟ ΓΕΓΟΝΟΣ
    const { current, next, afterNext } = findTimelineEvents(serverEventMarkers);
    
    if (next) {
        res.set('Content-Type', 'text/plain');
        res.send(next.title);
    } else {
        res.set('Content-Type', 'text/plain');
        res.send('(empty)');
    }
});

// Marker 3 display
router.get('/marker/3', (req, res) => {
    if (!serverEventMarkers || serverEventMarkers.length === 0) {
        res.set('Content-Type', 'text/plain');
        res.send('(empty)');
        return;
    }
    
    // Χρήση της timeline λογικής - Marker 3 = ΚΑΙ ΜΕΤΑ
    const { current, next, afterNext } = findTimelineEvents(serverEventMarkers);
    
    if (afterNext) {
        res.set('Content-Type', 'text/plain');
        res.send(afterNext.title);
    } else {
        res.set('Content-Type', 'text/plain');
        res.send('(empty)');
    }
});


    
    // ===== QUESTIONS API FOR COMPANION MODULE =====
    
    router.get('/companion/questions', async (req, res) => {
        try {
            console.log('🎯 Companion Questions API called');
            
            // Fetch questions from the questions API
            const questionsResponse = await fetch('http://localhost:3000/api/questions/list');
            if (!questionsResponse.ok) {
                throw new Error(`Questions API returned ${questionsResponse.status}`);
            }
            
            const questionsData = await questionsResponse.json();
            const questions = questionsData.questions || [];
            
            console.log(`📊 Total questions: ${questions.length}`);
            console.log(`📊 Questions by status:`, questions.reduce((acc, q) => {
                acc[q.status] = (acc[q.status] || 0) + 1;
                return acc;
            }, {}));
            
            // 🎆 SMART QUEUE: Ερωτήσεις που δεν έχουν τελειώσει (pending + approved)  
            const activeQuestions = questions.filter(q => 
                q.status === 'pending' || q.status === 'approved'
            );
            
            console.log(`🔄 Smart Queue: Showing ${Math.min(activeQuestions.length, 16)} active questions (pending + approved) out of ${activeQuestions.length} total active`);
            
            const companionVars = {};
            
            // Statistics
            companionVars.questions_total = questions.length;
            companionVars.questions_pending = questions.filter(q => q.status === 'pending').length;
            companionVars.questions_approved = questions.filter(q => q.status === 'approved').length;
            companionVars.questions_addressed = questions.filter(q => q.status === 'addressed').length;
            companionVars.questions_rejected = questions.filter(q => q.status === 'rejected').length;
            companionVars.questions_active = activeQuestions.length; // pending + approved
            companionVars.questions_remaining = activeQuestions.length; // Same as active
            
            // Create individual question variables (first 16 ACTIVE questions)
            for (let i = 1; i <= 16; i++) {
                const question = activeQuestions[i - 1]; // 🚀 Show pending + approved questions
                if (question) {
                    const display = `Από: ${question.submitter?.name || 'N/A'} | Προς: ${question.question?.targetSpeaker || 'N/A'} | Θέμα: ${question.question?.subject || 'N/A'} | Κείμενο: ${(question.question?.text || '').substring(0, 50)}${question.question?.text?.length > 50 ? '...' : ''}`;
                    companionVars[`question_${i}_display`] = display;
                    companionVars[`question_${i}_status`] = question.status || 'pending';
                    companionVars[`question_${i}_id`] = question.id;
                    
                    console.log(`🎯 Q${i}: ${display.substring(0, 80)}...`);
                } else {
                    companionVars[`question_${i}_display`] = `Q${i}: Empty`;
                    companionVars[`question_${i}_status`] = 'empty';
                    companionVars[`question_${i}_id`] = '';
                    
                    console.log(`🎯 Q${i}: Empty`);
                }
            }
            
            res.json(companionVars);
            
        } catch (error) {
            console.error('❌ Companion Questions API error:', error);
            res.status(500).json({ 
                error: 'Failed to fetch questions',
                message: error.message
            });
        }
    });
    
    return router;
}

module.exports = createCompanionAPI;