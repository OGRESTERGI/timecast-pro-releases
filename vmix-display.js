// vmix-display.js - Εξωτερικό module για vMix integration

const fs = require('fs');
const path = require('path');

class VmixDisplay {
    constructor() {
        this.filePath = path.join(__dirname, 'vmix-display.txt');
        this.lastUpdate = 0;
        console.log('📄 vMix Display Module initialized');
        console.log('📁 File location:', this.filePath);
    }

    // Κύρια function για ενημέρωση display
    updateDisplay(timerState) {
        try {
            // Αποφυγή υπερβολικών ενημερώσεων
            const now = Date.now();
            if (now - this.lastUpdate < 100) return; // Μέγιστο 10 FPS
            this.lastUpdate = now;

            const displayContent = this.generateDisplayContent(timerState);
            
            fs.writeFileSync(this.filePath, displayContent, 'utf8');
            // console.log('📄 vMix display updated'); // Uncomment για debugging
            
        } catch (error) {
            console.error('❌ Error updating vMix display file:', error);
        }
    }

    // Δημιουργία περιεχομένου display
    generateDisplayContent(timerState) {
        const formattedTime = this.formatTime(timerState.timeLeft);
        const percentage = this.calculatePercentage(timerState);
        const progressBar = this.createProgressBar(percentage, timerState.timeLeft <= 0);
        
        let display = '';
        
        // Τίτλος
        display += `${timerState.title || 'TimeCast® Pro Conference Timer'}\n`;
        
        // Χρόνος
        display += `${formattedTime}\n`;
        
        // Status και Progress Bar
        if (timerState.timeLeft <= 0) {
            display += `🚨 ΤΕΛΟΣ ΧΡΟΝΟΥ 🚨\n`;
            display += `[${progressBar}]\n`;
            display += `ΥΠΕΡΩΡΙΑ: ${Math.abs(timerState.timeLeft)} δευτ.`;
        } else if (timerState.timeLeft <= timerState.warningThreshold) {
            display += `⚠️ ΠΡΟΣΟΧΗ - ΛΙΓΟΣ ΧΡΟΝΟΣ\n`;
            display += `[${progressBar}] ${Math.round(percentage)}%`;
        } else {
            const statusIcon = timerState.isRunning ? '▶️' : '⏸️';
            const statusText = timerState.isRunning ? 'ΕΚΤΕΛΕΣΗ' : 'ΠΑΥΣΗ';
            display += `${statusIcon} ${statusText}\n`;
            display += `[${progressBar}] ${Math.round(percentage)}%`;
        }
        
        // Μήνυμα αν υπάρχει
        if (timerState.messageVisible && timerState.message && timerState.message.trim() !== '') {
            display += `\n📢 ${timerState.message}`;
        }
        
        return display;
    }

    // Μορφοποίηση χρόνου
    formatTime(timeLeft) {
        const hours = Math.floor(Math.abs(timeLeft) / 3600);
        const minutes = Math.floor((Math.abs(timeLeft) % 3600) / 60);
        const seconds = Math.abs(timeLeft) % 60;
        
        return timeLeft < 0 
            ? `+${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            : `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // Υπολογισμός ποσοστού
    calculatePercentage(timerState) {
        return Math.max(0, Math.min(100, (timerState.timeLeft / timerState.originalTime) * 100));
    }

    // Δημιουργία ASCII progress bar
    createProgressBar(percentage, isOvertime = false) {
        const totalBlocks = 30; // Περισσότερα blocks για καλύτερη ανάλυση
        
        if (isOvertime) {
            // Μόνο τελείες για υπερωρία
            return '.'.repeat(totalBlocks);
        }
        
        const filledBlocks = Math.round((percentage / 100) * totalBlocks);
        const emptyBlocks = totalBlocks - filledBlocks;
        
        return '█'.repeat(filledBlocks) + '.'.repeat(emptyBlocks);
    }

    // Αρχική δημιουργία αρχείου
    initialize(timerState) {
        this.updateDisplay(timerState);
        console.log('🎥 vMix display file ready for use!');
        console.log('💡 In vMix: Add Text Data Source → File → vmix-display.txt');
    }

    // Καθαρισμός αρχείου
    cleanup() {
        try {
            if (fs.existsSync(this.filePath)) {
                fs.unlinkSync(this.filePath);
                console.log('📄 vMix display file cleaned up');
            }
        } catch (error) {
            console.error('❌ Error cleaning up vMix display file:', error);
        }
    }
}

module.exports = VmixDisplay;