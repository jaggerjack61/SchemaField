@echo off
:: If no argument is provided, just show status
if "%~1"=="" (
    git status
    exit /b
)

:: If an argument exists, run the add-commit-push sequence
git add .
git commit -m "%~1"
git push