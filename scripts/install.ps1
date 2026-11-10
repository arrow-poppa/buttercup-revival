# Buttercup Revival - one-step setup for Windows.
# Installs what is missing (Python, Node.js, FFmpeg), prepares the local
# assistant inside this folder and registers it for Chrome, Edge and Chromium.
# Everything is per user; only the Node.js installer may ask for permission.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Portuguese = (Get-UICulture).Name -like 'pt*'
function Text([string]$English, [string]$Translated) { if ($Portuguese) { $Translated } else { $English } }
function Step([int]$Number, [string]$English, [string]$Translated) {
    Write-Host ''
    Write-Host ("[{0}/5] {1}" -f $Number, (Text $English $Translated)) -ForegroundColor Cyan
}
function Note([string]$English, [string]$Translated) { Write-Host ('      ' + (Text $English $Translated)) }
function Fail([string]$English, [string]$Translated) { throw (Text $English $Translated) }

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
        Fail "$Name is missing and Windows' installer tool (winget) was not found. Install 'App Installer' from the Microsoft Store, or install $Name yourself, then run this again." `
             "$Name não está instalado e a ferramenta de instalação do Windows (winget) não foi encontrada. Instale o 'Instalador de Aplicativo' pela Microsoft Store, ou instale $Name manualmente, e execute novamente."
    }
    Note "Installing $Name. This can take a few minutes..." "Instalando $Name. Isso pode levar alguns minutos..."
    & winget.exe install --id $Id --exact --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity | Out-Host
    Update-Path
}
function Invoke-Checked([string]$English, [string]$Translated, [scriptblock]$Command) {
    & $Command | Out-Host
    if ($LASTEXITCODE -ne 0) { Fail $English $Translated }
}

try {
    Write-Host ''
    Write-Host '  Buttercup Revival' -ForegroundColor Magenta
    Write-Host ('  ' + (Text 'Setting everything up. You can leave this window open and wait.' 'Preparando tudo. Deixe esta janela aberta e aguarde.'))

    if ($Root -match '\\Temp\\|\.zip\\') {
        Fail 'This folder is temporary. Extract the ZIP to a permanent place first (for example Documents), then run the installer from there.' `
             'Esta pasta é temporária. Extraia o ZIP para um lugar permanente (por exemplo Documentos) e execute o instalador a partir de lá.'
    }

    Step 1 'Checking the programs Buttercup needs' 'Verificando os programas de que o Buttercup precisa'
    Update-Path
    $Python = Find-Python
    if (-not $Python) { Install-Package 'Python.Python.3.13' 'Python'; $Python = Find-Python }
    if (-not $Python) { Fail 'Python could not be installed. Install Python 3.11 or newer from python.org and run this again.' 'Não foi possível instalar o Python. Instale o Python 3.11 ou mais novo em python.org e execute novamente.' }
    Note 'Python: OK' 'Python: OK'
    if (-not (Find-Tool 'node.exe')) { Install-Package 'OpenJS.NodeJS.LTS' 'Node.js' }
    if (-not (Find-Tool 'node.exe')) { Fail 'Node.js could not be installed. Install it from nodejs.org and run this again.' 'Não foi possível instalar o Node.js. Instale-o em nodejs.org e execute novamente.' }
    Note 'Node.js: OK' 'Node.js: OK'
    if (-not ((Find-Tool 'ffmpeg.exe') -and (Find-Tool 'ffprobe.exe'))) { Install-Package 'Gyan.FFmpeg.Essentials' 'FFmpeg' }
    if (-not ((Find-Tool 'ffmpeg.exe') -and (Find-Tool 'ffprobe.exe'))) { Fail 'FFmpeg could not be installed. Install it (ffmpeg and ffprobe) and run this again.' 'Não foi possível instalar o FFmpeg. Instale-o (ffmpeg e ffprobe) e execute novamente.' }
    Note 'FFmpeg: OK' 'FFmpeg: OK'

    Step 2 'Preparing the local assistant (downloads its components)' 'Preparando o assistente local (baixa os componentes)'
    Set-Location $Root
    $Venv = Join-Path $Root '.venv\Scripts\python.exe'
    if (-not (Test-Path $Venv)) {
        $Arguments = @($Python | Select-Object -Skip 1) + @('-m', 'venv', (Join-Path $Root '.venv'))
        Invoke-Checked 'Could not create the assistant environment.' 'Não foi possível criar o ambiente do assistente.' { & $Python[0] @Arguments }
    }
    Invoke-Checked 'Could not download the assistant components. Check your internet connection and run this again.' `
                   'Não foi possível baixar os componentes do assistente. Verifique a internet e execute novamente.' `
                   { & $Venv -m pip install --quiet --disable-pip-version-check --upgrade -r (Join-Path $Root 'backend\requirements.txt') }

    Step 3 'Preparing the browser extension' 'Preparando a extensão do navegador'
    Invoke-Checked 'Could not prepare the extension folder.' 'Não foi possível preparar a pasta da extensão.' { & node.exe (Join-Path $Root 'scripts\build.mjs') }

    Step 4 'Connecting the assistant to your browsers' 'Conectando o assistente aos seus navegadores'
    Invoke-Checked 'Could not register the assistant.' 'Não foi possível registrar o assistente.' { & $Venv (Join-Path $Root 'scripts\setup-assistant.py') }

    Step 5 'One last step, done by you in the browser' 'Um último passo, feito por você no navegador'
    $Extension = Join-Path $Root 'dist\extension'
    try { Set-Clipboard -Value $Extension } catch {}
    Write-Host ''
    Write-Host ('  ' + (Text 'Installed! Now add the extension to your browser:' 'Instalado! Agora adicione a extensão ao navegador:')) -ForegroundColor Green
    Write-Host ''
    Note '1. Open Chrome or Edge and type in the address bar:   chrome://extensions' '1. Abra o Chrome ou o Edge e digite na barra de endereço:   chrome://extensions'
    Note '2. Turn on "Developer mode" (a switch on that page).' '2. Ative o "Modo do desenvolvedor" (uma chave nessa página).'
    Note '3. Click "Load unpacked" and choose this folder:' '3. Clique em "Carregar sem compactação" e escolha esta pasta:'
    Write-Host ('         ' + $Extension) -ForegroundColor Yellow
    Note '   (its address is already copied: paste it into the folder window with Ctrl+V)' '   (o endereço já foi copiado: cole na janela de pastas com Ctrl+V)'
    Note '4. Click the Buttercup icon, then "Start and connect".' '4. Clique no ícone do Buttercup e depois em "Iniciar e conectar".'
    Write-Host ''
    Note 'Do not move or delete this folder afterwards: the extension runs from it.' 'Não mova nem apague esta pasta depois: a extensão funciona a partir dela.'
    Note 'The full guide, with pictures, is in README.md.' 'O guia completo, com imagens, está no README.md.'
    if (-not $env:BUTTERCUP_UNATTENDED) { Start-Process explorer.exe $Extension }
    $Code = 0
} catch {
    Write-Host ''
    Write-Host ('  ' + (Text 'The installation stopped:' 'A instalação parou:')) -ForegroundColor Red
    Write-Host ('  ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host ''
    Note 'Nothing was damaged. Fix the problem above and open the installer again.' 'Nada foi danificado. Corrija o problema acima e abra o instalador novamente.'
    $Code = 1
}
Write-Host ''
if (-not $env:BUTTERCUP_UNATTENDED) { Read-Host (Text 'Press Enter to close this window' 'Pressione Enter para fechar esta janela') | Out-Null }
exit $Code
