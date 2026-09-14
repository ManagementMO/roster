param(
  [Parameter(Mandatory=$true)][string]$Tarball,
  [Parameter(Mandatory=$true)][string]$ExpectedSha256,
  [Parameter(Mandatory=$true)][string]$Output
)
$ErrorActionPreference = "Stop"
if (Test-Path $Output) { throw "refusing to reuse existing evidence directory" }
New-Item -ItemType Directory -Path $Output | Out-Null
$root = Join-Path $env:RUNNER_TEMP ("roster-network-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $root | Out-Null
$driver = Join-Path $PSScriptRoot "windows-network-driver.mjs"
$session = "RosterNetwork" + [guid]::NewGuid().ToString("N")
$etl = Join-Path $root "network.etl"
$started = $false
$report = @{ status = "FAIL"; kind = "process-attributed ETW network events"; tarballSha256 = $ExpectedSha256 }
try {
  & node $driver prepare $root $Tarball $ExpectedSha256 | Tee-Object -FilePath (Join-Path $Output "prepare.log")
  if ($LASTEXITCODE -ne 0) { throw "candidate preparation failed" }
  & logman query providers "Microsoft-Windows-Kernel-Network" | Out-File (Join-Path $Output "provider.log")
  if ($LASTEXITCODE -ne 0) { throw "kernel network provider unavailable" }
  & logman create trace $session -p "Microsoft-Windows-Kernel-Network" 0xffffffffffffffff 5 -o $etl -f bin -max 64 -nb 16 64 -bs 64 -ets | Out-File (Join-Path $Output "trace-start.log")
  if ($LASTEXITCODE -ne 0) { throw "cannot start the owned ETW session" }
  $started = $true
  Start-Sleep -Seconds 1
  & node $driver measure $root $Tarball $ExpectedSha256 | Tee-Object -FilePath (Join-Path $Output "measure.log")
  if ($LASTEXITCODE -ne 0) { throw "fixture calls or positive network control failed" }
  Start-Sleep -Seconds 1
  & logman stop $session -ets | Out-File (Join-Path $Output "trace-stop.log")
  if ($LASTEXITCODE -ne 0) { throw "trace stop failed" }
  $started = $false
  $measurement = Get-Content (Join-Path $root "driver-result.json") -Raw | ConvertFrom-Json
  Copy-Item (Join-Path $root "driver-result.json") (Join-Path $Output "driver-result.json")
  $files = @(Get-ChildItem $root -Filter '*.etl')
  if ($files.Count -eq 0) { throw "no ETL evidence produced" }
  $positive = 0
  $owned = 0
  $total = 0
  $unattributed = 0
  $schemas = @{}
  foreach ($file in $files) {
    foreach ($event in (Get-WinEvent -Path $file.FullName -Oldest)) {
      if ($event.ProviderName -ne "Microsoft-Windows-Kernel-Network") { continue }
      $total++
      [xml]$xml = $event.ToXml()
      $fields = @{}
      foreach ($field in $xml.Event.EventData.Data) { $fields[[string]$field.Name] = [string]$field.'#text' }
      $schemas[[string]$event.Id] = @($fields.Keys | Sort-Object)
      $value = $fields["PID"]
      if (-not $value) { $value = $fields["ProcessId"] }
      if (-not $value) { $unattributed++; continue }
      $eventPid = if ($value.StartsWith("0x")) { [Convert]::ToInt64($value.Substring(2), 16) } else { [long]$value }
      if ($eventPid -eq $measurement.positivePid) { $positive++ }
      if ($measurement.pids -contains $eventPid) { $owned++ }
    }
  }
  $report.totalNetworkEvents = $total
  $report.positiveControlEvents = $positive
  $report.rosterAndFixtureEvents = $owned
  $report.unattributedNetworkEvents = $unattributed
  $report.eventSchemas = $schemas
  $report.arch = $measurement.arch
  $report.node = $measurement.node
  if ($positive -le 0) { throw "positive-control PID was not observed; zero is not evidence" }
  if ($unattributed -ne 0) { throw "unattributed network events prevent a complete process-level verdict" }
  if ($owned -ne 0) { throw "network events were attributed to Roster or its local fixture" }
  $report.status = "PASS"
} catch {
  $report.error = $_.Exception.Message
  $global:LASTEXITCODE = 1
} finally {
  if ($started) { & logman stop $session -ets | Out-Null }
  $report.finishedAt = [DateTime]::UtcNow.ToString("o")
  $report | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $Output "result.json")
  $report | ConvertTo-Json -Depth 8 | Write-Output
}
if ($report.status -ne "PASS") { exit 1 }
