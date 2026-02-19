@echo off
:: Check if a commit message was provided
if "%~1"=="" (
    echo Error: Please provide a commit message.
    echo Usage: g "your message here"
    exit /b 1
)

git add .
git commit -m "%~1"
git push