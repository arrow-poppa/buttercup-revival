$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DesktopDirectory = [Environment]::GetFolderPath('Desktop')
$StartMenuDirectory = Join-Path ([Environment]::GetFolderPath('Programs')) 'Buttercup Revival'
New-Item -ItemType Directory -Path $StartMenuDirectory -Force | Out-Null
$ShortcutShell = New-Object -ComObject WScript.Shell
$PythonWindowless = Join-Path $ProjectRoot '.venv\Scripts\pythonw.exe'
$LauncherScript = Join-Path $ProjectRoot 'scripts\windows-launcher.py'
function New-ButtercupShortcut([string]$Destination, [string]$Mode, [string]$Description) {
    $Shortcut = $ShortcutShell.CreateShortcut($Destination)
    $Shortcut.TargetPath = $PythonWindowless
    $Shortcut.Arguments = '"' + $LauncherScript + '"' + $Mode
    $Shortcut.WorkingDirectory = $ProjectRoot
    $Shortcut.Description = $Description
    $Shortcut.WindowStyle = 7
    $Shortcut.Save()
}
New-ButtercupShortcut (Join-Path $DesktopDirectory 'Buttercup Revival.lnk') '' 'Start the local backend and open Buttercup in the browser'
New-ButtercupShortcut (Join-Path $DesktopDirectory 'Stop Buttercup.lnk') ' --stop' 'Stop the local Buttercup backend'
New-ButtercupShortcut (Join-Path $StartMenuDirectory 'Buttercup Revival.lnk') '' 'Start Buttercup'
New-ButtercupShortcut (Join-Path $StartMenuDirectory 'Configure Buttercup.lnk') ' --settings' 'Open Buttercup settings'
New-ButtercupShortcut (Join-Path $StartMenuDirectory 'Stop Buttercup.lnk') ' --stop' 'Stop the local backend'
Write-Output 'Shortcuts created on the Desktop and in the Start menu.'
