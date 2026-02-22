@echo off
:: If no argument is provided, just show status
if "%~1"=="" (
    git status
    exit /b
)

:: If -p is provided, run git pull
if "%~1"=="-p" (
    git pull
    exit /b
)

:: If -b <branch_name> is provided, checkout branch
if "%~1"=="-b" (
    if "%~2"=="" (
        echo Usage: g.bat -b ^<branch_name^>
        exit /b 1
    )
    git checkout "%~2"
    exit /b
)

:: If an argument exists, run the add-commit-push sequence
git add .
git commit -m "%~1"
git push
