# TimeCast Pro LCD Strip - Technical Documentation

## 📋 Overview
**File**: `lcdstrip.html`  
**Purpose**: Stream Deck Plus style LCD strip emulation for TimeCast Pro  
**Integration**: External iframe module in admin.html  
**Dimensions**: 450x58px (7.71:1 aspect ratio)  
**Real-time Updates**: Socket.IO + postMessage communication  

## 🏗️ Architecture

### Integration Method
- **Module-based approach**: Referenced as external file (like NoSleep.js pattern)
- **iframe implementation**: `<iframe src="lcdstrip.html" width="460" height="90">`
- **No code duplication**: Maintains separation between main app and LCD module
- **Real-time sync**: Dual communication channels for reliability

### Communication Channels
1. **Direct Socket.IO**: LCD connects directly to TimeCast server
2. **postMessage API**: Fallback communication from admin.html parent frame
3. **HTTP API fallback**: Emergency data fetching if Socket.IO fails

## 📐 Physical Specifications

### Container Structure
```
LCD Panel Container (470x100px)
├── Body padding: 10px
├── Panel padding: 5px  
└── LCD Strip: 450x58px (7.71:1 ratio)
    ├── Segment 1: 112.5px (vMix Status)
    ├── Segment 2: 112.5px (Questions Stats)  
    ├── Segment 3: 112.5px (Client Count)
    └── Segment 4: 112.5px (Video Timer)
```

### iframe Sizing Logic
- **iframe total**: 460x90px (admin.html container)
- **Content area**: 450x58px (actual LCD)
- **Buffer space**: Accounts for body padding (10px) + panel padding (5px)
- **Aspect ratio**: Always maintained at 7.71:1

## 🎨 Visual Design

### LCD Aesthetics
- **Background**: `#193d91` (LCD blue)
- **Border radius**: 2px for authentic LCD look
- **Dot matrix pattern**: 2x2px repeating pattern overlay
- **Glass overlay**: Gradient reflection effect
- **Segment borders**: 1px white/transparent dividers

### Typography
- **Font family**: "Courier New", monospace (LCD-style)
- **Auto-scaling**: Dynamic font size 8px-30px based on content
- **Text shadow**: Cyan glow effect (`#0ff` with multiple shadows)
- **Letter spacing**: 0.3px for LCD character spacing

### Status Colors
```css
.status-online  { color: #0ff; }      /* Cyan - Active */
.status-offline { color: #666; }      /* Gray - Inactive */  
.status-bold    { font-weight: bold; } /* Emphasis */
```

## 🔌 Data Sources & Real-time Updates

### Segment 1: vMix Status
- **Data source**: Socket.IO `vmixTallyUpdate` events
- **Content**: Timer input status, program/preview state
- **Format**: `"Timer is: PROGRAM\nInput #3"`
- **Update frequency**: Real-time (immediate on tally change)

### Segment 2: Questions Stats  
- **Data source**: HTTP API `/api/questions/stats` + Socket.IO fallback
- **Content**: Questions answered vs total
- **Format**: `"Questions answered:\n5/12"`
- **Update frequency**: 5-second intervals + event-driven

### Segment 3: Client Count
- **Data source**: Socket.IO `questionsClientsCount` + postMessage
- **Content**: Active question form clients
- **Format**: `"Question Forms:\n3 Connected"`
- **Update frequency**: Real-time (immediate on connect/disconnect)

### Segment 4: Video Timer
- **Data source**: Socket.IO secondary timer events
- **Content**: Video playback timing
- **Format**: `"Video: filename.mp4\nElapsed: 02:15\nRemaining: 01:45"`
- **Update frequency**: 1-second intervals during video playback

## ⚙️ Auto-scaling Algorithm

### Font Scaling Logic
```javascript
function autoScaleText(textElement) {
    // 1. Start with minimum font size (8px)
    // 2. Calculate available container space (width-4, height-4)
    // 3. Incrementally increase font size by 0.5px steps
    // 4. Test fit using scrollWidth/scrollHeight vs container dimensions
    // 5. Use largest size that fits completely
    // 6. Maximum cap at 30px font size
    // 7. Maximum 50 iteration attempts for performance
}
```

### Scaling Priorities
1. **Fit all content**: No text clipping allowed
2. **Maximize readability**: Largest possible font size
3. **Performance**: Quick scaling with iteration limits
4. **Consistency**: Same algorithm for all segments

## 🔄 Communication Patterns

### Socket.IO Events (Primary)
```javascript
// Incoming events
socket.on('vmixTallyUpdate', updateVMixDisplay);
socket.on('questionsClientsCount', updateClientsDisplay);  
socket.on('secondaryTimerUpdate', updateVideoDisplay);

// Outgoing events  
socket.emit('requestTallyStatus');
socket.emit('registerClient', { type: 'lcdstrip' });
```

### postMessage Events (Fallback)
```javascript
// From admin.html parent frame
window.addEventListener('message', (event) => {
    if (event.data.type === 'questionsClientsCount') {
        updateClientsDisplay(event.data.count);
    }
});
```

### HTTP API Endpoints (Emergency)
```javascript
// Fallback data sources
GET /api/questions/stats        // Questions statistics
GET /api/timer/secondary       // Video timer data  
GET /api/vmix/status          // vMix connection status
```

## 🛠️ Performance Optimizations

### Auto-scaling Performance
- **Throttling**: Maximum 1 scaling operation per 200ms
- **Batch operations**: Scale all segments together when needed
- **Iteration limits**: Maximum 50 font size attempts per segment
- **Debounced resize**: Window resize events debounced to 300ms

### Memory Management
- **Event cleanup**: Remove listeners on disconnect
- **Timeout clearing**: Clear all intervals/timeouts on page unload
- **Reference cleanup**: Null out large objects when not needed

### Network Efficiency
- **Smart polling**: Only fetch data when Socket.IO unavailable
- **Event consolidation**: Multiple updates batched into single renders
- **Connection reuse**: Single Socket.IO connection for all data

## 🚨 Error Handling & Fallbacks

### Connection Failures
```javascript
// Socket.IO connection lost
socket.on('disconnect', () => {
    // Fall back to HTTP API polling
    startEmergencyPolling();
});

// HTTP API unavailable  
catch (error) => {
    // Display cached data with offline indicator
    showOfflineStatus();
}
```

### Content Validation
- **Null checks**: All data validated before display
- **Fallback content**: Default text when data unavailable
- **Format validation**: Ensure numeric values are valid
- **Length limits**: Prevent extremely long text from breaking layout

### Visual Feedback
- **Connection status**: Visual indicators for offline/online state
- **Data freshness**: Timestamp-based staleness detection
- **Error states**: Clear visual indication when data is unavailable

## 📊 Integration Points

### Admin Panel Integration  
- **iframe container**: Embedded in admin.html layout
- **Responsive design**: Scales with admin panel zoom
- **Event coordination**: Synchronized with admin panel state
- **CSS isolation**: No style conflicts with parent page

### Server Integration
- **Express.js routes**: Additional API endpoints for LCD data
- **Socket.IO namespace**: Dedicated events for LCD communication  
- **Data synchronization**: Real-time updates coordinated with main timer
- **Error handling**: Graceful degradation when server unavailable

### Build System Integration
- **package.json**: Included in `asarUnpack` for build process
- **Asset management**: Properly packaged in Electron distribution
- **Development mode**: Hot reload support during development
- **Production ready**: Optimized for portable .exe distribution

## 🔧 Configuration & Customization

### Visual Customization
```css
/* Easily customizable variables */
--lcd-background: #193d91;
--lcd-text-color: #0ff; 
--lcd-offline-color: #666;
--segment-width: 112.5px;
--font-family: "Courier New", monospace;
```

### Functional Configuration
```javascript
// Polling intervals (milliseconds)
const QUESTIONS_POLL_INTERVAL = 5000;
const EMERGENCY_POLL_INTERVAL = 10000; 
const AUTOSCALE_DEBOUNCE = 200;

// Font scaling limits
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 30;
const FONT_INCREMENT = 0.5;
```

## 🎯 Future Enhancement Opportunities

### Additional Segments
- **Network status**: Connection quality indicators
- **System resources**: CPU/memory usage for performance monitoring  
- **Custom messages**: User-defined informational displays
- **Event countdown**: Time remaining until next scheduled event

### Advanced Features
- **Touch interaction**: Clickable segments for quick actions
- **Animation effects**: Smooth transitions between states
- **Theme variants**: Multiple color schemes and styles
- **Accessibility**: Screen reader support and high contrast modes

### Integration Expansion
- **Stream Deck SDK**: Native Stream Deck plugin development
- **OBS integration**: Direct OBS Studio plugin compatibility
- **ATEM integration**: Blackmagic ATEM switcher support
- **Custom hardware**: Support for physical LCD displays

## 📝 Maintenance Notes

### Code Quality
- **Clean separation**: LCD logic isolated from main application
- **Consistent patterns**: Same coding style as main TimeCast Pro codebase
- **Comprehensive logging**: Debug output for troubleshooting
- **Error boundaries**: Graceful handling of all error conditions

### Testing Considerations
- **Multi-browser testing**: Chrome, Firefox, Edge compatibility
- **Network conditions**: Testing with poor/intermittent connectivity
- **High load scenarios**: Performance under heavy Socket.IO traffic
- **Long-running stability**: Memory leak detection and prevention

### Documentation Maintenance
- **API changes**: Update when server endpoints change
- **Socket events**: Document new event types as they're added
- **Visual changes**: Update screenshots and visual examples
- **Performance metrics**: Maintain benchmarks for regression testing

---

*This documentation serves as a comprehensive technical reference for the TimeCast Pro LCD Strip module. Keep updated as features evolve.*