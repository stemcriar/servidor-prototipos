@echo off
REM Script para iniciar o servidor STEM Criar

echo.
echo [*] Verificando dependencias...

where node >nul 2>nul
if errorlevel 1 (
    echo [X] Node.js nao encontrado. Por favor, instale Node.js
    echo Acesse: https://nodejs.org/
    pause
    exit /b
)

cd server

if not exist "node_modules\" (
    echo [!] node_modules nao encontrado!
    echo [*] Instalando dependencias...
    call cmd /c "npm install"
    if errorlevel 1 (
        echo [X] Erro ao instalar dependencias!
        pause
        exit /b 1
    )
    echo [OK] Dependencias instaladas!
) else (
    REM Força uma verificação rápida para garantir o pacote selfsigned, etc.
    echo [*] Verificando updates de dependencias...
    call cmd /c "npm install"
    echo [OK] Dependencias checadas e OK!
)

echo.
echo [*] Inicializando o servidor...
echo.

setlocal enabledelayedexpansion
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /I "IPv4"') do (
    set "ip=%%A"
    set "ip=!ip:~1!"
)

echo Acesse o servidor via HTTPS (necessario para a camera): https://!ip!
echo Para acessar via HTTP normal (sem camera): http://!ip!

timeout /t 2 /nobreak >nul
start https://!ip!

call npm start
