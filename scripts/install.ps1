# Buttercup Revival - one-step setup for Windows.
# Installs what is missing (Python, Node.js, FFmpeg), prepares the local
# assistant inside this folder and registers it for Chromium and Gecko browsers.
# Everything is per user; only the Node.js installer may ask for permission.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
function Step([int]$Number, [string]$English) {
    Write-Host ''
    Write-Host ("[{0}/5] {1}" -f $Number, $English) -ForegroundColor Cyan
}
function Note([string]$English) { Write-Host ('      ' + $English) }
function Fail([string]$English) { throw $English }

# Programs installed a moment ago are not on this window's PATH yet.
function Update-Path {
    $Parts = @([Environment]::GetEnvironmentVariable('Path', 'Machine'), [Environment]::GetEnvironmentVariable('Path', 'User'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links'), (Join-Path $env:ProgramFiles 'nodejs'))
    $Tools = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages') -Filter 'ffmpeg.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($Tools) { $Parts += $Tools.DirectoryName }
    $env:Path = ($Parts | Where-Object { $_ }) -join ';'
}
function Find-Tool([string]$Name) {
    $Command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($Command) { $Command.Source }
}
# Python 3.11 or newer. The Microsoft Store placeholder named python.exe prints nothing useful.
function Find-Python {
    $Candidates = @()
    $Launcher = Find-Tool 'py.exe'
    if ($Launcher) { $Candidates += ,@($Launcher, '-3') }
    $Direct = Find-Tool 'python.exe'
    if ($Direct) { $Candidates += ,@($Direct) }
    Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Programs\Python') -Filter 'python.exe' -Recurse -Depth 1 -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | ForEach-Object { $Candidates += ,@($_.FullName) }
    foreach ($Candidate in $Candidates) {
        $Arguments = @($Candidate | Select-Object -Skip 1) + @('-c', 'import sys; print(sys.version_info[0] * 100 + sys.version_info[1])')
        try { $Version = & $Candidate[0] @Arguments 2>$null } catch { $Version = $null }
        if ("$Version" -match '^\d+$' -and [int]"$Version" -ge 311) { return ,$Candidate }
    }
}
function Install-Package([string]$Id, [string]$Name) {
    if (-not (Find-Tool 'winget.exe')) {
        Fail "$Name is missing and Windows' installer tool (winget) was not found. Install 'App Installer' from the Microsoft Store, or install $Name yourself, then run this again."
    }
    Note "Installing $Name. This can take a few minutes..."
    & winget.exe install --id $Id --exact --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity | Out-Host
    Update-Path
}
function Invoke-Checked([string]$English, [scriptblock]$Command) {
    & $Command | Out-Host
    if ($LASTEXITCODE -ne 0) { Fail $English }
}

try {
    Write-Host ''
    Write-Host '  Buttercup Revival' -ForegroundColor Magenta
    Write-Host ('  ' + 'Setting everything up. You can leave this window open and wait.')

    if ($Root -match '\\Temp\\|\.zip\\') {
        Fail 'This folder is temporary. Extract the ZIP to a permanent place first (for example Documents), then run the installer from there.'
    }

    Step 1 'Checking the programs Buttercup needs'
    Update-Path
    $Python = Find-Python
    if (-not $Python) { Install-Package 'Python.Python.3.13' 'Python'; $Python = Find-Python }
    if (-not $Python) { Fail 'Python could not be installed. Install Python 3.11 or newer from python.org and run this again.' }
    Note 'Python: OK'
    if (-not (Find-Tool 'node.exe')) { Install-Package 'OpenJS.NodeJS.LTS' 'Node.js' }
    if (-not (Find-Tool 'node.exe')) { Fail 'Node.js could not be installed. Install it from nodejs.org and run this again.' }
    Note 'Node.js: OK'
    if (-not ((Find-Tool 'ffmpeg.exe') -and (Find-Tool 'ffprobe.exe'))) { Install-Package 'Gyan.FFmpeg.Essentials' 'FFmpeg' }
    if (-not ((Find-Tool 'ffmpeg.exe') -and (Find-Tool 'ffprobe.exe'))) { Fail 'FFmpeg could not be installed. Install it (ffmpeg and ffprobe) and run this again.' }
    Note 'FFmpeg: OK'

    Step 2 'Preparing the local assistant (downloads its components)'
    Set-Location $Root
    $Venv = Join-Path $Root '.venv\Scripts\python.exe'
    if (-not (Test-Path $Venv)) {
        $Arguments = @($Python | Select-Object -Skip 1) + @('-m', 'venv', (Join-Path $Root '.venv'))
        Invoke-Checked 'Could not create the assistant environment.' { & $Python[0] @Arguments }
    }
    Invoke-Checked 'Could not download the assistant components. Check your internet connection and run this again.' `
                   { & $Venv -m pip install --quiet --disable-pip-version-check --upgrade -r (Join-Path $Root 'backend\requirements.txt') }

    Step 3 'Preparing the browser extension'
    Invoke-Checked 'Could not prepare the extension folder.' { & node.exe (Join-Path $Root 'scripts\build.mjs') }

    Step 4 'Connecting the assistant to your browsers'
    Invoke-Checked 'Could not register the assistant.' { & $Venv (Join-Path $Root 'scripts\setup-assistant.py') }

    Step 5 'One last step, done by you in the browser'
    $Extension = Join-Path $Root 'dist\chromium'
    try { Set-Clipboard -Value $Extension } catch {}
    Write-Host ''
    Write-Host ('  ' + 'Installed! Now add the extension to your browser:') -ForegroundColor Green
    Write-Host ''
    Note '1. Open your Chromium-based browser and go to:   chrome://extensions'
    Note '2. Turn on "Developer mode" (a switch on that page).'
    Note '3. Click "Load unpacked" and choose this folder:'
    Write-Host ('         ' + $Extension) -ForegroundColor Yellow
    Note '   (its address is already copied: paste it into the folder window with Ctrl+V)'
    Note '4. Click the Buttercup icon, then "Start and connect".'
    Note 'Firefox / Zen: open about:debugging#/runtime/this-firefox, choose Load Temporary Add-on, then dist/firefox/manifest.json.'
    Note 'Temporary Firefox installs last until browser exit. See docs/firefox.md for signing and setup.'
    Write-Host ''
    Note 'Do not move or delete this folder afterwards: the extension runs from it.'
    Note 'The full guide, with pictures, is in README.md.'
    if (-not $env:BUTTERCUP_UNATTENDED) { Start-Process explorer.exe $Extension }
    $Code = 0
} catch {
    Write-Host ''
    Write-Host ('  ' + 'The installation stopped:') -ForegroundColor Red
    Write-Host ('  ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host ''
    Note 'Nothing was damaged. Fix the problem above and open the installer again.'
    $Code = 1
}
Write-Host ''
if (-not $env:BUTTERCUP_UNATTENDED) { Read-Host 'Press Enter to close this window' | Out-Null }
exit $Code
