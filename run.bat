@echo off
REM Script para iniciar o servidor STEM Criar

echo.
echo [*] Verificando dependencias...
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
echo [*] Iniciando o servidor...
echo [*] Abrindo navegador em http://localhost...
echo.
echo ============================================
echo Servidor iniciando na porta 80
echo Pressione CTRL+C para parar o servidor
echo ============================================
echo.

REM Abre o navegador
timeout /t 2 /nobreak
start http://localhost

REM Inicia o servidor
call npm start
