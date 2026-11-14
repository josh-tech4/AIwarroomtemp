# One-command local launcher for AI WarRoom (Windows PowerShell)
# Starts Django backend (port 8000) and Vite frontend (port 5173)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "==> Applying database migrations and seeding illustrative demo data..." -ForegroundColor Cyan
Push-Location "$Root\backend"
.\.venv\Scripts\python.exe manage.py migrate --noinput
.\.venv\Scripts\python.exe manage.py seed_demo

Write-Host "==> Starting Django backend on http://localhost:8000 ..." -ForegroundColor Green
$BackendProc = Start-Process -FilePath ".\.venv\Scripts\python.exe" `
    -ArgumentList "manage.py", "runserver", "127.0.0.1:8000" `
    -PassThru -NoNewWindow
Pop-Location

Write-Host "==> Starting React + Vite frontend on http://localhost:5173 ..." -ForegroundColor Green
Write-Host "    Demo login: demo@aiwarroom.local / DemoPass123!" -ForegroundColor Yellow
Write-Host "    API Docs:   http://localhost:8000/api/docs/" -ForegroundColor Yellow
Write-Host "    Press Ctrl+C to stop." -ForegroundColor DarkGray

try {
    Push-Location "$Root\frontend"
    npm run dev
} finally {
    Pop-Location
    if ($BackendProc -and -not $BackendProc.HasExited) {
        Stop-Process -Id $BackendProc.Id -Force -ErrorAction SilentlyContinue
    }
}

