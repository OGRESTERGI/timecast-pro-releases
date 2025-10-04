@echo off
echo ===== Εγκατάσταση Τοπικών Εξαρτήσεων Χρονομέτρου Συνεδρίων =====
echo.

:: Μετάβαση στον φάκελο του σεναρίου
cd /d "%~dp0"

:: Δημιουργία καταλόγου libs αν δεν υπάρχει
if not exist "libs" mkdir libs

:: Εγκατάσταση εξαρτήσεων διακομιστή
echo Εγκατάσταση εξαρτήσεων διακομιστή...
npm install

:: Εγκατάσταση NoSleep.js
echo Λήψη NoSleep.js...
curl -L https://unpkg.com/nosleep.js@0.12.0/dist/NoSleep.min.js -o libs\NoSleep.min.js

:: Εγκατάσταση QRCode.js
echo Λήψη QRCode.js...
curl -L https://cdn.rawgit.com/davidshimjs/qrcodejs/gh-pages/qrcode.min.js -o libs\qrcode.min.js

:: Αντιγραφή Socket.IO από το node_modules στο libs για πρόσβαση από τον πελάτη
echo Αντιγραφή Socket.IO από το node_modules...
if exist node_modules\socket.io\client-dist\socket.io.min.js (
  copy node_modules\socket.io\client-dist\socket.io.min.js libs\socket.io.min.js
) else (
  echo Προειδοποίηση: Το αρχείο πελάτη Socket.IO δεν βρέθηκε στην αναμενόμενη τοποθεσία.
  echo Θα γίνει προσπάθεια λήψης του...
  curl -L https://cdn.socket.io/4.7.2/socket.io.min.js -o libs\socket.io.min.js
)

echo.
echo Όλες οι εξαρτήσεις έχουν εγκατασταθεί στον κατάλογο libs.
echo Τώρα μπορείτε να ενημερώσετε τα αρχεία HTML για να χρησιμοποιούν τόσο τα CDN όσο και τα τοπικά αρχεία.
echo.
pause