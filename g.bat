@echo off
:: If no argument is provided, just show status
if "%~1"=="" (
    git status
    exit /b
)

if "%~1"=="-i" (
    git init
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

if "%~1"=="-h" (
    echo Git Helper 
    echo -i: Initialize a new Git repository
    echo -p: Pull the latest changes from the remote repository
    echo -b ^<branch_name^>: Checkout the specified branch
    echo ^<commit_message^>: Add, commit, and push changes with the provided message
    exit /b
)

if not "%~1"=="" (
    if not "%~2"=="" (
        echo Only one argument is expected
        exit /b 1
    )
    git add .
    git commit -m "%~1"
    git push
    exit /b
)

:: If an argument exists, run the add-commit-push sequence

