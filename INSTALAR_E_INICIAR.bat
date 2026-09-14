@echo off
chcp 65001 >nul
title Controle de Dividas
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js nao foi encontrado neste computador.
  echo Instale o Node.js 20 ou mais recente e tente novamente.
  echo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando os componentes do sistema...
  call npm install
  if errorlevel 1 (
    echo.
    echo Nao foi possivel instalar os componentes.
    pause
    exit /b 1
  )
)
echo.
echo Abrindo Controle de Dividas...
start "" http://localhost:3000
npm start
pause
