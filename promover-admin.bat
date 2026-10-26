@echo off
chcp 65001 >nul
title SobreImprestimos - promover administrador
cd /d "%~dp0"

set /p EMAIL="E-mail da conta que vira admin: "
if "%EMAIL%"=="" (
  echo Nenhum e-mail informado.
  pause
  exit /b 1
)

if not exist ".env.local" (
  echo Arquivo .env.local nao encontrado. Rode o iniciar.bat primeiro.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale em https://nodejs.org
  pause
  exit /b 1
)

node scripts/promover-admin.mjs "%EMAIL%"
echo.
pause
