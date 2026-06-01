# Start the ShemaField app locally (no Docker)
# Backend: Django + venv
# Frontend: Vite dev server

$Root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$VenvDir = Join-Path $Backend "venv"
$VenvActivate = Join-Path $VenvDir "Scripts\Activate.ps1"

if (-not (Test-Path $VenvActivate)) {
    Write-Host "Creating backend venv ..." -ForegroundColor Yellow
    python -m venv $VenvDir
}

& $VenvActivate
pip install -r (Join-Path $Backend "requirements.txt")

Write-Host "Running migrations ..." -ForegroundColor Green
python (Join-Path $Backend "manage.py") migrate

Write-Host "Starting ShemaField Backend (Django) ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$Backend`"; & `"$VenvActivate`"; python manage.py runserver"

Write-Host "Starting ShemaField Frontend (Vite) ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$Frontend`"; npm run dev"

Write-Host "Done. Backend: http://127.0.0.1:8000 | Frontend: http://localhost:5173" -ForegroundColor Cyan
