@echo off
chcp 65001 >nul
title Controle de Dividas
if not exist node_modules (
  echo Os componentes ainda nao foram instalados.
  echo Execute primeiro o arquivo INSTALAR_E_INICIAR.bat
  pause
  exit /b 1
)
start "" http://localhost:3000
npm start
pause
