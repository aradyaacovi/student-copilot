# Starts n8n with the settings from automations/.env
# Run from the project folder:  powershell -ExecutionPolicy Bypass -File automations\start-n8n.ps1
# (ASCII only on purpose: Windows PowerShell 5.1 misreads Hebrew in script files.)
$envFile = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envFile)) {
  Write-Host "Missing automations\.env - copy .env.example and fill it in" -ForegroundColor Red
  exit 1
}
Get-Content $envFile -Encoding UTF8 | ForEach-Object {
  if ($_ -cmatch '^\s*([A-Z_]+)\s*=\s*(.*)$') {
    [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim(), "Process")
  }
}
$env:GENERIC_TIMEZONE = "Asia/Jerusalem"
$env:TZ = "Asia/Jerusalem"
# lets the workflows read the variables above
$env:N8N_BLOCK_ENV_ACCESS_IN_NODE = "false"
Write-Host "Starting n8n... UI: http://localhost:5678  (stop with Ctrl+C)" -ForegroundColor Cyan
# Installed globally with:  npm install -g n8n --ignore-scripts
# (--ignore-scripts skips the Kafka client's native build, which needs Visual Studio
#  and which these workflows never touch. npx would try to build it again.)
n8n.cmd
