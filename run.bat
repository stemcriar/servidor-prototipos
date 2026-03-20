@echo off
REM Script para iniciar o servidor STEM Criar

echo.
echo [*] Verificando dependencias...

REM Verificando Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo [X] Node.js nao encontrado. Por favor, instale Node.js
    echo Acesse: https://nodejs.org/
    pause
    exit /b
)

REM Verificando node_modules\
if not exist "node_modules\" (
    echo [!] node_modules nao encontrado!
    echo [*] Instalando dependencias...
    call npm install
    if errorlevel 1 (
        echo [X] Erro ao instalar dependencias!
        pause
        exit /b 1
    )
    echo [OK] Dependencias instaladas!
) else (
    echo [OK] Dependencias OK!
)

echo.
echo [*] Inicializando o servidor...
echo.

setlocal enabledelayedexpansion
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /I "IPv4"') do (
    set "ip=%%A"
    set "ip=!ip:~1!"
)

echo Acesse o servidor em:
echo - Neste computador:     http://localhost
echo - Outro dispositivo:    http://!ip!

REM Abre o navegador
timeout /t 2 /nobreak >nul
start http://localhost

REM Inicia o servidor
call npm start
