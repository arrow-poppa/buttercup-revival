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
New-ButtercupShortcut (Join-Path $DesktopDirectory 'Buttercup Revival.lnk') '' 'Iniciar o backend local e abrir o Buttercup no navegador'
New-ButtercupShortcut (Join-Path $DesktopDirectory 'Parar Buttercup.lnk') ' --stop' 'Encerrar o backend local do Buttercup'
New-ButtercupShortcut (Join-Path $StartMenuDirectory 'Buttercup Revival.lnk') '' 'Iniciar o Buttercup'
New-ButtercupShortcut (Join-Path $StartMenuDirectory 'Configurar Buttercup.lnk') ' --settings' 'Abrir as configurações do Buttercup'
New-ButtercupShortcut (Join-Path $StartMenuDirectory 'Parar Buttercup.lnk') ' --stop' 'Encerrar o backend local'
Write-Output 'Atalhos criados na Área de Trabalho e no menu Iniciar.'
