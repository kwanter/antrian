@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Iware C-58BT Printer Bridge
cd /d "%~dp0"

echo ========================================
echo  Iware C-58BT Printer Bridge
echo  Windows Batch Launcher
echo ========================================
echo.

:: Check Python
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    where python3 >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Python tidak ditemukan.
        echo Install Python dari https://www.python.org/downloads/
        echo Pastikan centang "Add Python to PATH" saat install.
        pause
        exit /b 1
    )
    set PY=python3
) else (
    set PY=python
)

:: Install dependencies if missing
echo [INFO] Memeriksa dependensi...
%PY% -c "import serial, win32print" 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] Menginstall pyserial dan pywin32...
    %PY% -m pip install pyserial pywin32
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Gagal install dependensi. Coba manual:
        echo   %PY% -m pip install pyserial pywin32
        pause
        exit /b 1
    )
    echo [OK] Dependensi terinstall.
)

:: Check bridge.py exists next to this bat
if not exist "%~dp0bridge.py" (
    echo [ERROR] bridge.py tidak ditemukan di folder yang sama.
    echo   Pastikan bridge.py ada di: %~dp0
    pause
    exit /b 1
)

:: Choose mode
echo Pilih mode koneksi printer:
echo.
echo   [1] Serial / COM (printer sebagai port COM)
echo   [2] Raw Printer (printer sebagai driver Windows)
echo   [3] Daftar perangkat yang tersedia
echo.
set /p MODE="Pilih [1/2/3]: "

if "%MODE%"=="3" (
    echo.
    echo --- Mencari perangkat printer ---
    %PY% "%~dp0bridge.py" --list
    echo.
    pause
    exit /b 0
)

if "%MODE%"=="1" (
    echo.
    echo --- Mencari port COM yang tersedia ---
    %PY% -c "
import serial.tools.list_ports
ports = serial.tools.list_ports.comports()
for p in ports:
    print(f'  {p.device} - {p.description}')
"
    echo.
    set /p COMPORT="Masukkan port COM (contoh: COM5): "
    set /p BAUDRATE="Masukkan baud rate [9600]: "
    if "!BAUDRATE!"=="" set BAUDRATE=9600
    echo.
    echo [INFO] Menjalankan bridge mode serial pada %COMPORT% %BAUDRATE%...
    echo [INFO] Biarkan jendela ini tetap terbuka.
    echo.
    %PY% "%~dp0bridge.py" --mode serial %COMPORT% %BAUDRATE%
    pause
    exit /b 0
)

if "%MODE%"=="2" (
    echo.
    echo --- Mencari printer Windows ---
    %PY% "%~dp0bridge.py" --list
    echo.
    set /p PRINTER="Masukkan nama printer (copy-paste dari daftar di atas): "
    echo.
    echo [INFO] Menjalankan bridge mode raw pada "%PRINTER%"...
    echo [INFO] Biarkan jendela ini tetap terbuka.
    echo.
    %PY% "%~dp0bridge.py" --mode raw "%PRINTER%"
    pause
    exit /b 0
)

echo [ERROR] Pilihan tidak valid.
pause
exit /b 1
