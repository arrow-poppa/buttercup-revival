param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
    [ValidateRange(1,65535)][int]$Port = 8767,
    [switch]$ShowToken
)
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackendPython = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $BackendPython)) { throw 'Create .venv and install backend/requirements.txt first. See README.md.' }
$BackendArguments = @('-m','backend.app','--extension-id',$ExtensionId,'--port',"$Port")
if ($ShowToken) { $BackendArguments += '--show-token' }
Push-Location -LiteralPath $ProjectRoot
try { & $BackendPython @BackendArguments; if ($LASTEXITCODE -ne 0) { throw "Backend exited with code $LASTEXITCODE" } }
finally { Pop-Location }
