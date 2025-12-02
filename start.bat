@echo off
echo 🚀 estateLink Backend Server Startup
echo =====================================

echo 🔧 Killing processes on port 5000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000 ^| findstr LISTENING') do (
    echo Killing process %%a
    taskkill /f /pid %%a >nul 2>&1
)

echo 🔧 Killing Node.js processes...
taskkill /f /im node.exe >nul 2>&1

echo ✅ Port cleared, starting server...
echo =====================================

node index.js

pause
