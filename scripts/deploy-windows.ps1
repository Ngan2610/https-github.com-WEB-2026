param([Parameter(Mandatory=$true)][string]$DataDirectory)
$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $DataDirectory '.env'
if (-not (Test-Path $envFile)) { throw "Missing $envFile; preserve your existing SQL password and configure this file first." }
if (-not $env:DUBCHEF_RELEASE -or -not $env:DUBCHEF_IMAGE_PREFIX) { throw 'Set DUBCHEF_RELEASE and DUBCHEF_IMAGE_PREFIX' }
$compose = @('compose', '--project-directory', $DataDirectory, '--env-file', $envFile,
  '-f', (Join-Path $sourceRoot 'docker-compose.yml'), '-f', (Join-Path $sourceRoot 'docker-compose.release.yml'))
& docker @compose config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Invalid Compose configuration' }
& docker @compose pull api migrate job-worker web translation render transcription
if ($LASTEXITCODE -ne 0) { throw 'Image pull failed; running containers were not updated' }
& docker @compose up -d --no-build --wait --wait-timeout 1200
if ($LASTEXITCODE -ne 0) { throw 'Deployment is not healthy; inspect docker compose logs. Existing data was retained.' }
& docker @compose exec -T api node -e "Promise.all(['/api/health','/api/health/translation'].map(p=>fetch('http://127.0.0.1:3000'+p).then(r=>{if(!r.ok)throw Error('Backend or translation is not ready')}))).catch(()=>process.exit(1))"
if ($LASTEXITCODE -ne 0) { throw 'Containers started but backend/translation readiness failed' }
& docker @compose ps
Write-Output "Deployed commit $env:DUBCHEF_RELEASE. Web: http://localhost:5173; API: http://localhost:4000/api/health"
