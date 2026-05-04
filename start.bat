@echo off
echo ==========================================
echo    NaraSuite - Automatic Starter
echo ==========================================
echo.
echo 1. Checking Dependencies...
call npm install
echo.
echo 2. Setting up Database...
call npx prisma generate
call npx prisma db push
echo.
echo 3. Starting NaraSuite...
echo.
echo Web App will be ready at: http://localhost:3000
echo.
call npm run dev
pause
