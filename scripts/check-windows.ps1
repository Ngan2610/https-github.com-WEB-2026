param([string]$DataDirectory=(Split-Path $PSScriptRoot -Parent),[string]$RunnerDirectory='')
$ErrorActionPreference='Stop'
$problems=[Collections.Generic.List[string]]::new()
foreach($command in @('docker','git','node','pwsh')) {
  if(-not (Get-Command $command -ErrorAction SilentlyContinue)) { $problems.Add("Missing command: $command") }
}
if(Get-Command docker -ErrorAction SilentlyContinue) {
  $osType=& docker info --format '{{.OSType}}' 2>$null
  if($LASTEXITCODE -ne 0) { $problems.Add('Start Docker Desktop and wait until the engine is ready.') }
  elseif($osType.Trim() -ne 'linux') { $problems.Add('Docker Desktop must use Linux containers.') }
  & docker compose version --short 2>$null | Out-Null
  if($LASTEXITCODE -ne 0) { $problems.Add('Docker Compose v2 is required.') }
}
$envFile=Join-Path $DataDirectory '.env'
if(-not (Test-Path -LiteralPath $envFile)) { $problems.Add('The existing project .env file is missing. Do not replace SQL credentials.') }
else {
  $config=Get-Content -LiteralPath $envFile -Raw
  foreach($key in @('DB_PASSWORD','TOKEN_SECRET')) {
    if($config -notmatch "(?m)^\s*$key\s*=\s*\S+") { $problems.Add("Missing required setting: $key") }
  }
}
if($RunnerDirectory) {
  if(-not (Test-Path (Join-Path $RunnerDirectory '.runner'))) { $problems.Add('Runner registration is missing in RunnerDirectory.') }
  if(-not (Get-Process -Name 'Runner.Listener' -ErrorAction SilentlyContinue)) { $problems.Add('Runner.Listener is not running.') }
}
if($problems.Count) { $problems | ForEach-Object { Write-Output "CHECK FAILED: $_" };exit 1 }
Write-Output 'Local prerequisites passed. This does not confirm GitHub runner labels, Expo credentials or end-to-end video processing.'
Write-Output 'In GitHub, verify runner label dubchef, DEPLOY_LOCAL_WINDOWS=true and DUBCHEF_DEPLOY_DIR.'
