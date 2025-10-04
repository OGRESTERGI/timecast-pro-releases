# TimeCast Pro Companion Module - Complete Documentation

## Overview
Comprehensive documentation for the Bitfocus Companion Module for TimeCast Pro timer application.

---

## Module Information

### **Current Status**
- **Version**: `timecast-pro-1.0.0.tgz`
- **Status**: ✅ **Production Ready** - Fully functional
- **Architecture**: HTTP-only communication (όχι Socket.IO)
- **Integration**: Embedded download system στα Settings του TimeCast Pro

### **Development & Distribution Locations**
- **Development Folder**: `C:\Users\ogres\OneDrive\Υπολογιστής\timecast-pro-1.2.1\`
- **Embedded Distribution**: `C:\Users\ogres\OneDrive\Υπολογιστής\timer2\companion-modules\timecast-pro-1.0.0.tgz`
- **Customer Access**: Settings → Companion Module → "Download Module"

---

## Core Features & Functionality

### **🎯 Smart Toggle Buttons**

#### **Start/Pause Toggle**
- **Default State**: `"▶️ START"` (πράσινο `#085708ff`)
- **Running State**: `"⏸ PAUSE"` (πορτοκαλί `#FF8C00`)
- **Logic**: Ελέγχει `this.timerData.isRunning` για toggle μεταξύ start/pause
- **Action ID**: `toggle_play_pause`
- **Feedback**: `timer_running`

#### **Show/Hide Message Toggle**
- **Hidden State**: `"SHOW\nMESSAGE"` (πορτοκαλί `#FF8C00`)
- **Visible State**: `"HIDE\nMESSAGE"` (κόκκινο `#FF0000`)
- **Logic**: Ελέγχει `this.timerData.messageVisible` για toggle
- **Action ID**: `toggle_message`
- **Feedback**: `message_visible`

### **🎨 Button Styling**

#### **Timer Control Buttons**
- **RESTART**: Κόκκινο `#FF0000` με `"◀️◀️ RESTART"` (size 14)
- **FLASH**: Ανοιχτό γκρι `#C0C0C0` με `"⚡ FLASH ⚡"` (size 20)

#### **Message Buttons - Smart Color System**
```javascript
// Color Progression: Green → Orange → Red
// 🟢 Default: Green #004400
// 🟠 Loaded (Preview): Orange #FF8C00
// 🔴 On Air (Visible): Red #FF0000
```

**Logic**:
- **message_loaded_X**: Ελέγχει αν message είναι loaded στο textarea (preview)
- **message_on_air_X**: Ελέγχει αν message είναι ΚΑΙ loaded ΚΑΙ visible στην οθόνη

---

## Technical Architecture

### **Communication Protocol**
```javascript
// HTTP-only requests (NOT Socket.IO)
fetch(`http://${host}:${port}/api/timer/start`, { method: 'POST' })

// Real-time updates με polling
setInterval(() => this.updateVariables(), 1000)

// Dynamic button content
text: '$(timecast:saved_message_1)'  // Updates automatically
```

### **API Endpoints Used**
```javascript
// Timer Control
POST /api/timer/start
POST /api/timer/pause
POST /api/timer/stop
POST /api/timer/reset
POST /api/timer/adjust/:seconds

// Message System
POST /api/message/load-saved/[1-6]
POST /api/message/toggle
POST /api/message/show
POST /api/message/hide

// Special Effects
POST /api/flash
POST /api/hdmi/toggle

// Event Markers
POST /api/markers/show/[1-3]

// Data Endpoints
GET /api/timer/current
GET /api/timer/hours
GET /api/timer/minutes
GET /api/timer/seconds
GET /api/timer/bg-color
GET /api/saved-message/[1-6]
GET /api/marker/[1-3]
GET /api/questions/list
```

### **Key Data Fields**
```javascript
// Timer Status Detection
this.timerData = {
  timeLeft: 722,
  isRunning: true,           // ✅ Used for toggle logic
  status: "normal",          // ❌ NOT used for toggle (always "normal")
  messageVisible: false,     // ✅ Used for message toggle
  currentMessage: "",        // ✅ Used for "on air" detection
  loadedMessage: ""          // ✅ Used for "loaded" detection
}
```

---

## Critical Implementation Patterns

### **1. Timer Status Detection** ⚠️
**ΚΡΙΣΙΜΟ**: Ελέγχουμε `isRunning` ΟΧΙ `status`!

```javascript
// ✅ ΣΩΣΤΌ
if (this.timerData.isRunning) {
    return this.sendRequest('/api/timer/pause')
} else {
    return this.sendRequest('/api/timer/start')
}

// ❌ ΛΆΘΟΣ (status είναι πάντα "normal")
if (this.timerData.status === 'running') { ... }
```

### **2. Message State Logic** 🎯
```javascript
// Preview State (Orange)
const loadedText = this.timerData.loadedMessage.trim()
const isLoaded = loadedText === searchText || loadedText.startsWith(searchText)

// On Air State (Red)
const onAirText = this.timerData.currentMessage.trim()
const isOnAir = onAirText === searchText || onAirText.startsWith(searchText)
return isOnAir && this.timerData.messageVisible
```

### **3. Real-time Variable Updates**
```javascript
async updateVariables() {
  // Batch API requests για performance
  const [timerRes, msg1Res, msg2Res, ...] = await Promise.all([
    fetch(`${host}:${port}/api/timer/current`),
    fetch(`${host}:${port}/api/saved-message/1`),
    // ... more endpoints
  ])

  // Update variables για button display
  this.setVariableValues({ ... })
  this.checkFeedbacks() // ✅ ΚΡΙΣΙΜΟ για color updates
}
```

---

## Development Workflow

### **Build Process**
```bash
# Navigate to development folder
cd "C:\Users\ogres\OneDrive\Υπολογιστής\timecast-pro-1.2.1"

# Build module
npm run build
# Creates: timecast-pro-1.0.0.tgz

# Update embedded copy για customer distribution
cp timecast-pro-1.0.0.tgz "../timer2/companion-modules/"
```

### **🚨 ΚΡΙΣΙΜΗ ΔΙΑΔΙΚΑΣΙΑ** - Deployment με API Changes
**ΥΠΟΧΡΕΩΤΙΚΗ ΣΕΙΡΑ**:

1. **Διόρθωσε API endpoints** στο TimeCast server (companion-api.js)
2. **Restart TimeCast server** (Electron app)
3. **Επαληθευσε API endpoints** με curl testing
4. **Κλείσε Companion app** (να απελευθερωθεί το pkg directory)
5. **Rebuild companion module** με `npm run build`
6. **Update embedded copy** για customer distribution
7. **Άνοιξε Companion app ξανά**
8. **Έλεγξε Variables panel** για επιβεβαίωση

**⚠️ ΜΗΝ ΞΕΧΑΣΕΙΣ**: API changes στο TimeCast ≠ Αυτόματη ενημέρωση companion module!

---

## Legacy Code & Comments

### **Commented Out Features**
```javascript
// ===== LEGACY SEPARATE BUTTONS (Use toggle button instead) =====
/*start_timer: {
    // ... original separate start button
},
pause_timer: {
    // ... original separate pause button
},*/
```

**Rationale**: Χρήστης προτίμησε toggle button αντί για ξεχωριστά start/pause buttons.

---

## Troubleshooting Common Issues

### **Issue 1: Toggle Button Δεν Λειτουργεί**
**Symptoms**: Play button starts timer, αλλά pause δεν λειτουργεί.
**Root Cause**: Λάθος status detection logic.
**Solution**: Έλεγχε `isRunning` αντί για `status`.

### **Issue 2: Όλα τα Message Buttons Γίνονται Κόκκινα**
**Symptoms**: Όταν message είναι visible, όλα τα buttons γίνονται κόκκινα.
**Root Cause**: on_air feedback ελέγχει `loadedMessage` αντί για `currentMessage`.
**Solution**: Χρησιμοποίησε `currentMessage` για on_air detection.

### **Issue 3: Module Δεν Εμφανίζεται στο Companion**
**Checklist**:
- Verify complete file structure exists: `timecast-pro-1.x.x/companion/manifest.json`
- Clear Companion cache: Remove "Code Cache", "GPUCache" directories
- Restart Companion completely

### **Issue 4: Variables Δεν Ενημερώνονται**
**Solutions**:
- Implement polling με `setInterval(() => this.updateVariables(), 1000)`
- Call `this.checkFeedbacks()` after variable updates
- Verify endpoint responses με browser testing

---

## Performance Best Practices

### **1. Batch API Requests**
```javascript
// ✅ GOOD: Use Promise.all() για multiple endpoints
const [timerRes, msg1Res, msg2Res] = await Promise.all([...])

// ❌ BAD: Sequential requests
const timer = await fetch('/api/timer/current')
const msg1 = await fetch('/api/saved-message/1')
```

### **2. Error Handling**
```javascript
async sendRequest(endpoint, method = 'POST') {
  try {
    const response = await fetch(`http://${host}:${port}${endpoint}`, { method })
    if (response.ok) {
      await this.updateVariables() // Immediate refresh
    }
    return response.ok
  } catch (error) {
    this.log('error', `Request failed: ${error.message}`)
    return false
  }
}
```

### **3. Text Truncation**
```javascript
// Limit button text για readability
savedMessages[`saved_message_${i}`] = content.substring(0, 20) + (content.length > 20 ? '...' : '')
```

### **4. Polling Frequency**
- **1000ms interval** για real-time updates
- **Clear intervals** στο `destroy()` method για memory management

---

## Testing & Validation Checklist

### **Before Release**
- [ ] All actions functional (timer, messages, adjustments)
- [ ] Variables display current content (saved messages, timer status)
- [ ] Feedbacks change colors correctly (green → orange → red)
- [ ] Error handling implemented για network issues
- [ ] Module builds without errors (`npm run build`)
- [ ] Complete file structure deployed
- [ ] Companion recognizes module
- [ ] Real-time updates working
- [ ] Embedded copy updated για customer download

### **Production Testing**
```bash
# Development testing
npm run dev

# Production build testing
npm run build
tar -tf timecast-pro-1.0.0.tgz  # Verify contents

# API endpoint testing
curl -s http://localhost:3000/api/timer/current
curl -s -X POST http://localhost:3000/api/timer/start
```

---

## Customer Distribution

### **Download System Integration**
- **Location**: Settings modal → Companion Module section
- **File**: `companion-modules/timecast-pro-1.0.0.tgz`
- **API**: `/api/companion/download-module` (streams file)
- **Info**: `/api/companion/module-info` (metadata)

### **Installation Instructions**
Bilingual step-by-step guide included:
1. Download .tgz file
2. Close Companion app
3. Extract to modules directory
4. Restart Companion
5. Configure instance

---

## Future Development Notes

### **For Future Claude Sessions**
- **Complete module** ready για production use
- **All major features** implemented και tested
- **Documentation embedded** στο CLAUDE.md + companion.md
- **Maintain dual compatibility**: Electron/Node.js patterns
- **Test thoroughly** before proposing new features
- **Follow established patterns** για consistency

### **Architecture Decisions**
- **HTTP-only communication**: Απλότερο από Socket.IO για companion use case
- **Polling-based updates**: Αξιόπιστο για real-time data
- **Smart feedback system**: Color-coded states για intuitive UX
- **Embedded distribution**: Self-contained module delivery

---

## Version History

### **v1.0.0** (Current - Production)
- ✅ Smart toggle buttons (Start/Pause, Show/Hide Message)
- ✅ Fixed message color logic (Green → Orange → Red)
- ✅ Button styling improvements (Red restart, Lightning flash)
- ✅ Commented legacy separate buttons
- ✅ Complete API integration με TimeCast Pro
- ✅ Embedded distribution system
- ✅ Comprehensive error handling
- ✅ Real-time variable updates
- ✅ Production-ready stability

**Final Status**: ✅ **ΚΛΕΙΔΩΜΕΝΟ** - Complete και ready για customer use.

---

*Generated: 2025-01-28 - Complete companion module documentation για TimeCast Pro*