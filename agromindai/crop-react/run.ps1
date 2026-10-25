$ErrorActionPreference = 'Stop'

$projectDir = $PSScriptRoot
$backendDir = Join-Path $projectDir 'backend'
$venvDir = Join-Path $env:LOCALAPPDATA 'SmartCropAdvisor\venv'
$venvPython = Join-Path $venvDir 'Scripts\python.exe'

function Stop-WithMessage([string]$message) {
    Write-Error $message
    exit 1
}

$nodeCandidates = @(
    (Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Join-Path $env:ProgramW6432 'nodejs\node.exe')
)
$npmCandidates = @(
    (Get-Command npm.cmd -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
    (Join-Path $env:ProgramFiles 'nodejs\npm.cmd'),
    (Join-Path $env:ProgramW6432 'nodejs\npm.cmd')
)
$pythonLauncherCandidates = @(
    (Get-Command py.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\py.exe'),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\python.exe')
)
$pythonCandidates = @(
    (Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
    (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'),
    (Join-Path $env:ProgramFiles 'Python312\python.exe'),
    (Join-Path $env:ProgramW6432 'Python312\python.exe'),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\python.exe')
)

$node = $nodeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
$npm = $npmCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
$pythonLauncher = $pythonLauncherCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
$python = $pythonCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $node -or -not $npm) {
    Stop-WithMessage 'Node.js (including npm) is required. Install the current LTS version from https://nodejs.org/, then reopen VS Code.'
}

if (-not $pythonLauncher -and -not $python) {
    Stop-WithMessage 'Python 3 is required. Install it from https://www.python.org/downloads/ and enable "Add python.exe to PATH", then reopen VS Code.'
}

$pythonExecutable = if ($python) { $python } elseif ($pythonLauncher) { $pythonLauncher }

Write-Host 'Installing frontend dependencies...'
Push-Location $projectDir
try {
    & $npm ci
    if ($LASTEXITCODE -ne 0) {
        Stop-WithMessage 'Frontend dependency installation failed.'
    }
}
finally {
    Pop-Location
}

if (-not (Test-Path $venvPython)) {
    Write-Host 'Creating the Python environment...'
    & $pythonExecutable -m venv $venvDir

    if ($LASTEXITCODE -ne 0) {
        Stop-WithMessage 'Could not create the Python environment.'
    }
}

Write-Host 'Installing backend dependencies...'
& $venvPython -m pip install -r (Join-Path $backendDir 'req.txt')
if ($LASTEXITCODE -ne 0) {
    Stop-WithMessage 'Backend dependency installation failed.'
}

$backendCommand = "Set-Location -LiteralPath '$backendDir'; & '$venvPython' -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"
$frontendCommand = "Set-Location -LiteralPath '$projectDir'; & '$npm' start"
$powershellExe = (Get-Command powershell.exe).Source
$backendEncodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($backendCommand))
$frontendEncodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($frontendCommand))

Start-Process -FilePath $powershellExe -WorkingDirectory $backendDir -ArgumentList @('-NoExit', '-EncodedCommand', $backendEncodedCommand)
Start-Process -FilePath $powershellExe -WorkingDirectory $projectDir -ArgumentList @('-NoExit', '-EncodedCommand', $frontendEncodedCommand)

Write-Host ''
Write-Host 'The backend and frontend are starting in separate terminal windows.'
Write-Host 'The app will be available at http://localhost:3000.'
Write-Host 'Close both terminal windows to stop the app.'
