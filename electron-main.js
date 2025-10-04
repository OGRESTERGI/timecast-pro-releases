const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let adminWindow = null;
let timerWindow = null;
let serverProcess = null;
const isDev = process.argv.includes('--dev');

// Auto-start server
function startServer() {
    if (serverProcess) return;
    
    console.log('🚀 Starting internal server...');
    serverProcess = spawn('node', ['server.js'], {
        cwd: __dirname,
        stdio: isDev ? 'inherit' : 'pipe'
    });
    
    serverProcess.on('error', (err) => {
        console.error('❌ Server failed to start:', err);
    });
    
    if (!isDev) {
        serverProcess.stdout.on('data', (data) => {
            console.log('Server:', data.toString());
        });
    }
}

// Create admin window
function createAdminWindow() {
    adminWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        title: 'Conference Timer - Admin Panel',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    
    // Wait for server, then load
    setTimeout(() => {
        adminWindow.loadURL('http://localhost:3000/admin.html');
    }, 3000);
    
    adminWindow.on('closed', () => {
        adminWindow = null;
    });
    
    // Open DevTools in development
    if (isDev) {
        adminWindow.webContents.openDevTools();
    }
}

// Create timer window
function createTimerWindow() {
    timerWindow = new BrowserWindow({
        title: 'Conference Timer - Display',
        fullscreen: true,
        frame: false,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    
    setTimeout(() => {
        timerWindow.loadURL('http://localhost:3000/timer.html');
    }, 3000);
    
    timerWindow.on('closed', () => {
        timerWindow = null;
    });
    
    // ESC to exit fullscreen
    timerWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'Escape') {
            if (timerWindow.isFullScreen()) {
                timerWindow.setFullScreen(false);
            } else {
                timerWindow.close();
            }
        }
    });
}

// Create menu
function createMenu() {
    const template = [
        {
            label: 'Conference Timer',
            submenu: [
                {
                    label: 'Admin Panel',
                    accelerator: 'CmdOrCtrl+A',
                    click: () => {
                        if (!adminWindow) createAdminWindow();
                        else adminWindow.focus();
                    }
                },
                {
                    label: 'Timer Display',
                    accelerator: 'CmdOrCtrl+T',
                    click: () => {
                        if (!timerWindow) createTimerWindow();
                        else timerWindow.focus();
                    }
                },
                { type: 'separator' },
                {
                    label: 'Quit',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => app.quit()
                }
            ]
        }
    ];
    
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// App events
app.whenReady().then(() => {
    startServer();
    createMenu();
    createAdminWindow();
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createAdminWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
        console.log('🛑 Server stopped');
    }
});