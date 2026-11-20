$ErrorActionPreference='Stop'
$recordPath=Join-Path $PSScriptRoot 'data/service.json'
if(-not (Test-Path -LiteralPath $recordPath)){Write-Output 'No local service record was found.';return}
$record=Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
$expected=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'server/main.cjs'))
if([IO.Path]::GetFullPath([string]$record.serverPath) -ne $expected){throw 'The service record belongs to a different app folder.'}
$serviceUrl='http://127.0.0.1:'+([int]$record.port)
try{$health=Invoke-RestMethod -Uri "$serviceUrl/api/health" -TimeoutSec 2}catch{$health=$null}
if($health){
  if($health.service -ne 'parlay-all-day' -or [int]$health.pid -ne [int]$record.pid){throw 'The recorded port now belongs to a different process; nothing was stopped.'}
  Invoke-RestMethod -Uri "$serviceUrl/api/shutdown" -Method Post -ContentType 'application/json' -Headers @{'X-Parlay-Request'='1'} -Body '{}' | Out-Null
  Write-Output 'Stopped the Parlay All Day service. Saved history is retained.'
}
Remove-Item -LiteralPath $recordPath
