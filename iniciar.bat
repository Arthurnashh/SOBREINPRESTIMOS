@echo off
chcp 65001 >nul
title SobreImprestimos - localhost
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js nao encontrado neste computador.
  echo  Instale a versao LTS em https://nodejs.org e de dois cliques neste arquivo de novo.
  start https://nodejs.org
  pause
  exit /b 1
)

if not exist ".env.local" copy ".env.example" ".env.local" >nul

if not exist "node_modules" (
  echo.
  echo  Instalando dependencias ^(so na primeira vez, leva 1-2 minutos^)...
  call npm install
  if errorlevel 1 (
    echo  Falha no npm install. Tire um print desta janela e mande no chat.
    pause
    exit /b 1
  )
)

echo.
echo  Subindo o site em http://localhost:3000
echo  Para desligar, feche esta janela.
start "" cmd /c "timeout /t 10 >nul & start http://localhost:3000"
call npm run dev
pause
