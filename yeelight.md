# 💡 Yeelight RGB Integration Documentation

## 📋 Περιεχόμενα
- [Αρχιτεκτονική Συστήματος](#αρχιτεκτονική-συστήματος)
- [Λειτουργική Δομή](#λειτουργική-δομή)
- [Γρήγορη Εκκίνηση](#γρήγορη-εκκίνηση)
- [Ρύθμιση Λαμπών](#ρύθμιση-λαμπών)
- [Χρήση στο TimeCast Pro](#χρήση-στο-timecast-pro)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)

---

## 🏗️ Αρχιτεκτονική Συστήματος

### Δομή Αρχείων
```
├── yeelight.js              # Client-side manager (YeelightManager class)
├── yeelight-server.js       # Server-side API endpoints (YeelightServer class)
├── yeelight-ui-test.html    # Standalone testing interface
├── yeelight-controller.py   # Python development utilities
└── yeelight-udp-test.py     # UDP discovery testing script
```

### Αρχιτεκτονική Ροής
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   admin.html    │───▶│   yeelight.js    │───▶│ yeelight-server │
│ (Settings UI)   │    │ (Client Manager) │    │    (API Layer)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                        ┌──────────────────┐    ┌─────────────────┐
                        │ Timer Integration│    │ TCP Connections │
                        │ (Color Sync)     │    │ (Port 55443)    │
                        └──────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │ Yeelight Bulbs  │
                                                │ (192.168.x.x)   │
                                                └─────────────────┘
```

---

## ⚙️ Λειτουργική Δομή

### 1. YeelightManager (yeelight.js)
**Client-side βασική κλάση που διαχειρίζεται:**

#### Core Properties:
```javascript
class YeelightManager {
    isEnabled: false,                    // Global on/off state
    connectedBulbs: [],                  // Discovered bulbs array
    selectedBulbs: [],                   // User-selected bulbs for timer sync
    currentTimerState: 'idle',           // idle|running|warning|expired|break
    brightness: 100,                     // Global brightness (1-100)

    colorSettings: {
        idle: { r: 128, g: 128, b: 128 },     // Gray - timer not running
        running: { r: 0, g: 255, b: 0 },     // Green - timer running
        warning: { r: 255, g: 80, b: 0 },    // Orange - last 2 minutes
        expired: { r: 255, g: 0, b: 0 },     // Red - timer expired
        break: { r: 0, g: 100, b: 255 }      // Blue - break time
    }
}
```

#### Key Methods:
- `init()` - Initialize με auto-discovery και timer listeners
- `discoverBulbs()` - UDP multicast discovery (239.255.255.250:1982)
- `addBulbToSelection(ip)` - Add bulb to timer sync group
- `setBrightness(value)` - Global brightness control
- `updateBulbColors(state)` - Sync colors με timer state
- `triggerFlash(count)` - Flash effect συγχρονισμένο με UI

### 2. YeelightServer (yeelight-server.js)
**Server-side API layer που παρέχει:**

#### HTTP Endpoints:
```javascript
GET  /api/yeelight/discover           // Discover bulbs
POST /api/yeelight/set-color          // Set RGB color
POST /api/yeelight/set-brightness     // Set brightness
POST /api/yeelight/set-power          // Power on/off
GET  /api/yeelight/states             // Get all bulb states
```

#### TCP Connection Management:
- **Max connections**: 4 ταυτόχρονες (Yeelight spec limit)
- **Rate limiting**: 60 commands/minute per connection
- **Persistent connections**: Connection pooling για performance
- **Command queuing**: Queue με retry logic

### 3. Timer Integration Flow
**Ο μηχανισμός συγχρονισμού με το timer:**

```javascript
// 1. Timer state change
socket.on('timerUpdate', (data) => {
    if (data.timeLeft <= warningThreshold) {
        this.updateBulbColors('warning');
        this.startPulse();  // Pulse effect για warning
    } else if (data.timeLeft <= 0) {
        this.updateBulbColors('expired');
        this.stopPulse();
    } else {
        this.updateBulbColors('running');
        this.stopPulse();
    }
});

// 2. Color update to selected bulbs
async updateBulbColors(state) {
    const color = this.colorSettings[state];
    for (const bulb of this.selectedBulbs) {
        await this.setBulbColor(bulb.ip, color.r, color.g, color.b);
    }
}
```

---

## 🚀 Γρήγορη Εκκίνηση

### Τι είναι το Yeelight Integration;
Το TimeCast Pro υποστηρίζει **Yeelight RGB λάμπες** για οπτική ένδειση της κατάστασης του timer:
- 🟢 **Πράσινο**: Timer τρέχει κανονικά
- 🟠 **Πορτοκαλί με pulse**: Προειδοποίηση (τελευταία 2 λεπτά)
- 🔴 **Κόκκινο**: Timer έληξε
- 🔵 **Μπλε**: Διάλειμμα
- ⚡ **Flash**: Συγχρονισμός με UI flash alerts

### Συμβατές Λάμπες
- **Yeelight W3 RGB** (δοκιμασμένες)
- **Yeelight Color Bulb** (συμβατές)
- **Άλλες Yeelight RGB λάμπες** με LAN control support

---

## 💡 Ρύθμιση Λαμπών

### Βήμα 1: Εγκατάσταση Λαμπών
1. **Εγκαταστήστε** τις λάμπες στα επιθυμητά σημεία
2. **Συνδέστε** στο Wi-Fi μέσω Yeelight app
3. **Βεβαιωθείτε** ότι λειτουργούν κανονικά

### Βήμα 2: Ενεργοποίηση LAN Control
**ΚΡΙΣΙΜΟ**: Χωρίς αυτό δεν θα λειτουργήσει!

#### Μέθοδος 1: Yeelight App
1. Ανοίξτε το **Yeelight app**
2. Πηγαίνετε στις ρυθμίσεις κάθε λάμπας
3. Βρείτε **"LAN Control"** ή **"Local Network Control"**
4. **Ενεργοποιήστε** το

#### Μέθοδος 2: Mi Home App
1. Προσθέστε λάμπες στο **Mi Home app**
2. Settings → **Developer options**
3. Ενεργοποιήστε **"LAN Control"**

### Βήμα 3: Επαλήθευση
```bash
# Δοκιμή από Command Prompt/PowerShell
nmap -p 55443 192.168.x.x
# Θα πρέπει να δείτε: "55443/tcp open"
```

---

## 🎮 Χρήση στο TimeCast Pro

### Αυτόματη Εκκίνηση
- Οι λάμπες **ανακαλύπτονται αυτόματα** κατά την εκκίνηση
- **Δεν χρειάζεται** manual configuration
- Εμφανίζονται **un-ticked** για manual επιλογή

### Settings Modal Features
1. **💡 Yeelight RGB Λάμπες Section** (ροζ theme)
2. **Auto-discovery table** με real-time bulb detection
3. **Checkbox selection** για timer sync participation
4. **🔆 Brightness slider** με real-time control
5. **🔄 Universal ON/OFF toggle** για όλες τις λάμπες
6. **Auto-save** selections και brightness

### Universal Toggle Features
```javascript
// Οικουμενικός διακόπτης που προστέθηκε
- ON: Ανάβει όλες τις συνδεδεμένες λάμπες με smooth transition
- OFF: Σβήνει όλες τις συνδεδεμένες λάμπες με smooth transition
- Slider integration: Disable/enable brightness control
- State persistence: Συγχρονίζεται με yeelightManager.isEnabled
```

---

## 📚 API Reference

### Core Discovery Methods
```javascript
// Client-side (yeelight.js)
await yeelightManager.discoverBulbs()                    // UDP multicast discovery
yeelightManager.addBulbToSelection(ip)                   // Add to timer sync
yeelightManager.removeBulbFromSelection(ip)              // Remove from timer sync
await yeelightManager.forceReSelectBulbs(bulbIps)       // Force re-connection

// Server-side endpoints
GET /api/yeelight/discover                               // Returns discovered bulbs array
```

### Color & Control Methods
```javascript
// Direct color control
await yeelightManager.setBulbColor(ip, r, g, b)         // RGB values 0-255
await yeelightManager.setBrightness(value)              // Global brightness 1-100

// Flash effects
await yeelightManager.triggerFlash(flashCount = 3)      // Flash με current timer color
yeelightManager.startPulse()                            // Warning pulse effect
yeelightManager.stopPulse()                             // Stop pulse
```

### Server API Endpoints
```http
POST /api/yeelight/set-color
Body: {
    ip: "192.168.x.x",
    red: 255, green: 0, blue: 0,
    brightness: 100,
    duration: 300,
    flashMode: false
}

POST /api/yeelight/set-power
Body: {
    ip: "192.168.x.x",
    power: "on",        // "on" | "off"
    effect: "smooth",   // "smooth" | "sudden"
    duration: 300       // milliseconds
}

POST /api/yeelight/set-brightness
Body: {
    ip: "192.168.x.x",
    brightness: 80,     // 1-100
    duration: 300
}
```

### Timer Integration Events
```javascript
// Timer state synchronization
socket.on('timerUpdate', (data) => {
    // data.timeLeft, data.totalTime, data.isRunning
    yeelightManager.updateTimerState(data);
});

// Manual flash trigger (⚡ button)
socket.on('flashAlert', (data) => {
    if (data.active && data.flashCount) {
        yeelightManager.triggerFlash(data.flashCount);
    }
});
```

---

## 🔬 Τεχνικές Λεπτομέρειες

### Yeelight Protocol Compliance
**Βασισμένο στην επίσημη Yeelight Inter-Operation Specification:**

```json
// Official set_power command structure
{
    "id": 1,
    "method": "set_power",
    "params": ["on", "smooth", 500]
}

// Official set_rgb command structure
{
    "id": 1,
    "method": "set_rgb",
    "params": [16711680, "smooth", 300]  // RGB as decimal integer
}
```

### Network Requirements
- **Wi-Fi**: Όλες οι λάμπες στο ίδιο δίκτυο με το PC
- **Discovery**: Multicast 239.255.255.250:1982 (UDP)
- **Control**: Direct TCP connections στο port 55443
- **Firewall**: Allow inbound multicast για discovery

### Performance Characteristics
- **Discovery Cache**: 60 δευτερόλεπτα cache για optimization
- **Connection Pooling**: Persistent TCP connections
- **Rate Limiting**: 60 commands/minute per connection
- **Max Connections**: 4 ταυτόχρονες (Yeelight hardware limit)
- **Response Time**: <100ms for local network commands

---

## 🛠️ Troubleshooting

### Δεν Βρίσκει Λάμπες
**Αιτίες:**
- LAN Control δεν είναι ενεργοποιημένο
- Λάμπες σε διαφορετικό subnet
- Firewall blocking multicast

**Λύσεις:**
```bash
# 1. Έλεγχος connectivity
ping 192.168.x.x

# 2. Έλεγχος πόρτας
telnet 192.168.x.x 55443

# 3. Έλεγχος multicast
# Windows: Firewall → Advanced → Inbound Rules → Enable multicast
```

### Λάμπες Δεν Ανταποκρίνονται
**Συμπτώματα:**
- Εμφανίζονται στο discovery αλλά δεν αλλάζουν χρώμα
- "Connection timeout" errors

**Λύσεις:**
1. **Reset λάμπας**: Κλείσε/άνοιξε το ρεύμα 5 φορές γρήγορα
2. **Re-enable LAN Control** στο app
3. **Restart TimeCast Pro**

### Universal Toggle Δεν Λειτουργεί
**Debug Steps:**
1. **Console logs**: Αναζήτηση για "🔆 Yeelight Universal Toggle"
2. **API calls**: Έλεγχος για "🔆 Turning ON/OFF bulb: x.x.x.x"
3. **Selected bulbs**: Βεβαίωση ότι connectedBulbs.length > 0

---

## 📊 Configuration Integration

### Auto-Save Format
```json
{
  "yeelight": {
    "enabled": true,
    "brightness": 80,
    "selectedBulbs": [
      { "ip": "192.168.5.118", "name": "Yeelight-118" },
      { "ip": "192.168.5.125", "name": "Yeelight-125" }
    ],
    "connectedBulbs": [...],
    "currentTimerState": "running"
  }
}
```

### Settings Persistence
- **Brightness**: Auto-saved on slider change
- **Bulb selection**: Auto-saved on checkbox toggle
- **Universal toggle state**: Synced με yeelightManager.isEnabled
- **Import/Export**: Full configuration backup support

---

## 🎯 Best Practices

### Conference Room Setup
- **Selective participation**: Μη επιλέγετε όλες τις λάμπες του κτιρίου
- **Test πριν την παρουσίαση**: Επαληθεύστε ότι λειτουργούν σωστά
- **Brightness**: 70-80% για professional περιβάλλον
- **Universal toggle**: Χρήσιμο για γρήγορο on/off όλων των λαμπών

### Development & Testing
- **yeelight-ui-test.html**: Standalone testing interface
- **Console monitoring**: Enable debug logs με F12
- **Network tools**: nmap, telnet για connectivity tests
- **Python utilities**: yeelight-controller.py για advanced testing

---

## 🔄 Rebuilding από το Μηδέν

### Βήματα Αναδημιουργίας
Αν χρειαστεί να δημιουργήσετε το Yeelight integration από την αρχή:

1. **UDP Discovery Implementation**:
   - Multicast socket στο 239.255.255.250:1982
   - SSDP-like protocol με "ST: wifi_bulb" header
   - Parse response για IP, port, capabilities

2. **TCP Control Layer**:
   - JSON command structure: `{id, method, params}`
   - Methods: set_power, set_rgb, set_bright
   - Connection pooling με 4 max connections

3. **Client Manager Class**:
   - State management (connectedBulbs, selectedBulbs)
   - Timer integration με socket listeners
   - Color synchronization logic

4. **Server API Endpoints**:
   - Express.js routes για HTTP API
   - Error handling και rate limiting
   - Real-time state tracking

5. **UI Integration**:
   - Settings modal με bulb table
   - Checkbox selection mechanism
   - Brightness slider με real-time update

---

**Τελευταία ενημέρωση**: 2025-09-22
**TimeCast® Pro Yeelight Integration** - Production Ready με Universal Toggle Support