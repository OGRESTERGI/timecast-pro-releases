@echo off
echo ===== Εκκίνηση χρονομέτρου συνεδρίων =====
echo.

cd /d "%~dp0"

rem Βεβαιωθείτε ότι έχουν εγκατασταθεί όλες οι εξαρτήσεις
if not exist "node_modules" (
    echo Εγκατάσταση εξαρτήσεων...
    npm install
)

rem Έλεγχος για τοπικές βιβλιοθήκες
if not exist "libs" (
    echo Ο φάκελος libs δεν βρέθηκε!
    echo Συνιστάται να εκτελέσετε πρώτα το install-dependencies.bat
    echo Η εφαρμογή θα χρησιμοποιήσει βιβλιοθήκες από το διαδίκτυο.
    echo.
    pause
)

rem Καθαρισμός παλιού αρχείου port (αν υπάρχει)
if exist "server-port.txt" del "server-port.txt"

rem Εκκίνηση διακομιστή
echo Εκκίνηση διακομιστή...
start cmd /k "node server.js"

echo.
echo Περιμένουμε τον server να ξεκινήσει και να βρει διαθέσιμο port...

rem Ανάγνωση του σωστού port από το αρχείο
:wait_for_port
if not exist "server-port.txt" (
    timeout /t 1 /nobreak > nul
    goto :wait_for_port
)

rem Διαβάζουμε το port από το αρχείο
set /p PORT=<server-port.txt
echo ✅ Server βρέθηκε στο port %PORT%

rem Λήψη της IP διεύθυνσης του συστήματος
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set IP=%%a
    goto :found_ip
)
:found_ip
set IP=%IP:~1%

echo.
echo Άνοιγμα πίνακα διαχείρισης στο πρόγραμμα περιήγησης...
start http://%IP%:%PORT%/admin.html

echo.
echo Το χρονόμετρο έχει ξεκινήσει!
echo.
echo Πρόσβαση:
echo  - Πίνακας διαχείρισης: http://%IP%:%PORT%/admin.html
echo  - Οθόνη χρονομέτρου: http://%IP%:%PORT%/timer.html
echo.
echo Server τρέχει στο port: %PORT%
echo Για να τερματίσετε τον διακομιστή, κλείστε το παράθυρο cmd που άνοιξε.
echo.
pause