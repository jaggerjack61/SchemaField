@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"
set "VENV_DIR=%BACKEND%\.venv"
set "VENV_ACTIVATE=%VENV_DIR%\Scripts\activate.bat"

if not exist "%VENV_ACTIVATE%" (
    echo Creating backend venv ...
    pushd "%BACKEND%"
    python -m venv .venv
    popd
)

call "%VENV_ACTIVATE%"
pip install -r "%BACKEND%\requirements.txt"

echo Running migrations ...
pushd "%BACKEND%"
python manage.py migrate
popd

echo Starting ShemaField Backend (Django) ...
start "ShemaField Backend" cmd /k "cd /d "%BACKEND%" && call "%VENV_ACTIVATE%" && python manage.py runserver"

echo Starting ShemaField Frontend (Vite) ...
start "ShemaField Frontend" cmd /k "cd /d "%FRONTEND%" && npm run dev"

echo Done. Backend: http://127.0.0.1:8000 ^| Frontend: http://localhost:5173
endlocal
