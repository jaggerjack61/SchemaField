@echo off

if "%~1"=="" (
    python manage.py runserver
    exit /b
)

if "%~1"=="-a" (
    call ".\venv\Scripts\activate"
    exit /b
)

if "%~1"=="-m" (
    if "%~2"=="-r" (
        echo Running migrate refresh
        @REM delete all sqlite3 files
        del /q /s "*.sqlite3"
        python manage.py migrate
        exit /b
      
    )
    python manage.py migrate
    exit /b
)

if "%~1"=="-cs" (
    python manage.py createsuperuser
    exit /b
    
)

if "%~1"=="-c" (
    python manage.py check
    exit /b
    
)

if "%~1"=="-h" (
    echo Usage: 
    echo p ^<port^>: Run the server on the specified port. Port is optional
    echo p -a:       Activate virtual environment
    echo p -m:       Run database migrations
    echo p -m -r:    Refresh database migrations
    echo p -cs:      Create superuser
    echo p -h:       Show this help message
    exit /b
)

if not "%~1"=="" (
    if not "%~2"=="" (
        echo Usage: p ^<port^>
        exit /b 1
    )
    python manage.py runserver "%~1"
    exit /b
)





