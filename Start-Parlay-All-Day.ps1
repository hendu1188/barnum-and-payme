param([switch]$Live,[switch]$Resume,[switch]$OpenBrowser,[int]$Port=8787)
$ErrorActionPreference='Stop'
$appRoot=$PSScriptRoot
$servicePath=Join-Path $appRoot 'server/main.cjs'
$serviceData=Join-Path $appRoot 'data'
New-Item -ItemType Directory -Force -Path $serviceData | Out-Null
$nodeCommand=Get-Command node -ErrorAction SilentlyContinue
$nodePath=if($nodeCommand){$nodeCommand.Source}else{$null}
if(-not $nodePath){
  $runtimeFolders=Get-ChildItem -LiteralPath 'C:/Program Files/WindowsApps' -Directory -Filter 'OpenAI.CodexPrimaryRuntime.v*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending
  foreach($runtimeFolder in $runtimeFolders){$candidate=Join-Path $runtimeFolder.FullName 'dependencies/node/bin/node.exe';if(Test-Path -LiteralPath $candidate){$nodePath=$candidate;break}}
}
if(-not $nodePath){throw 'Node.js 24.2 or later is required. The Codex bundled runtime could not be located.'}
$serviceUrl="http://127.0.0.1:$Port"
try{$health=Invoke-RestMethod -Uri "$serviceUrl/api/health" -TimeoutSec 2}catch{$health=$null}
if($health.service -eq 'parlay-all-day'){
  if($Live){Invoke-RestMethod -Uri "$serviceUrl/api/config" -Method Post -ContentType 'application/json' -Headers @{'X-Parlay-Request'='1'} -Body '{"enabled":true}' | Out-Null;Invoke-RestMethod -Uri "$serviceUrl/api/refresh" -Method Post -ContentType 'application/json' -Headers @{'X-Parlay-Request'='1'} -Body '{}' | Out-Null}
  Write-Output "Parlay All Day is already running at $serviceUrl"
  if($OpenBrowser){Start-Process $serviceUrl}
  return
}
$env:PARLAY_PORT=[string]$Port
$mode=if($Live){'--live'}elseif($Resume){''}else{'--saved-data'}
$arguments=@('--no-warnings',('"'+$servicePath+'"'),$mode)
$serviceProcess=Start-Process -FilePath $nodePath -ArgumentList $arguments -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $serviceData 'service-out.log') -RedirectStandardError (Join-Path $serviceData 'service-error.log')
@{pid=$serviceProcess.Id;serverPath=$servicePath;port=$Port;startedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $serviceData 'service.json')
for($attempt=0;$attempt -lt 30;$attempt++){
  Start-Sleep -Milliseconds 500
  try{$health=Invoke-RestMethod -Uri "$serviceUrl/api/health" -TimeoutSec 2}catch{$health=$null}
  if($health.service -eq 'parlay-all-day'){
    Write-Output "Parlay All Day is running at $serviceUrl"
    if($OpenBrowser){Start-Process $serviceUrl}
    return
  }
  if($serviceProcess.HasExited){throw 'The service stopped. Check data/service-error.log.'}
}
throw 'The service did not finish starting. Check data/service-error.log.'
