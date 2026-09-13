# Runs native-qa.mjs under an EPHEMERAL local standard user inside the Windows
# runner VM (the VM is discarded after the job). The account is created with a
# random password that is never printed, is NOT added to Administrators, and is
# removed afterwards. Nothing about machine policy is changed: if the secondary
# logon path (CreateProcessWithLogonW) is unavailable, the run is reported as
# BLOCKED by the caller instead of being forced.
#
#   run-as-standard-user.ps1 -Tarball <path> -ExpectedSha256 <hex> -Out <dir> -NodeLabel <v> [-Dense]
param(
  [Parameter(Mandatory = $true)][string]$Tarball,
  [Parameter(Mandatory = $true)][string]$ExpectedSha256,
  [Parameter(Mandatory = $true)][string]$Out,
  [Parameter(Mandatory = $true)][string]$NodeLabel,
  [switch]$Dense
)
$ErrorActionPreference = "Stop"
$src = Split-Path -Parent $MyInvocation.MyCommand.Path
$suffix = -join ((48..57 + 97..122) | Get-Random -Count 6 | ForEach-Object { [char]$_ })
$user = "rqa$suffix"
# Uniquely named, fail-closed paths (short: MAX_PATH matters for the metachar / npx cases). Never
# delete or reuse anything preexisting. The workspace lives under the runner's own profile tree, so
# the standard user gets its own read-only copy of the harness directory.
$here = "C:\rqh$suffix"
$work = "C:\rq$suffix"
foreach ($p in @($here, $work)) { if (Test-Path $p) { throw "refusing to reuse preexisting path $p" } }
if (Test-Path $Out) { if ((Get-ChildItem -Force $Out | Measure-Object).Count -ne 0) { throw "refusing to write into non-empty $Out" } }
Copy-Item -Recurse $src $here
$harness = Join-Path $here "native-qa.mjs"
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$plain = ([Convert]::ToBase64String($bytes)).TrimEnd("=") + "!aZ9"
$secure = ConvertTo-SecureString $plain -AsPlainText -Force
New-Item -ItemType Directory -Force -Path $work, $Out | Out-Null

Write-Host "creating ephemeral standard user $user (no group beyond Users)"
New-LocalUser -Name $user -Password $secure -PasswordNeverExpires -UserMayNotChangePassword -AccountNeverExpires -Description "roster native-qa ephemeral standard user" | Out-Null
Add-LocalGroupMember -Group "Users" -Member $user
$isAdmin = (Get-LocalGroupMember -Group "Administrators" | Where-Object { $_.Name -like "*\$user" }).Count
if ($isAdmin -ne 0) { throw "ephemeral user unexpectedly in Administrators" }

# grant the user what a real consumer has: read the harness + tarball, write its own work/out dirs
icacls $here /grant "${user}:(OI)(CI)RX" /T /Q | Out-Null
icacls $Tarball /grant "${user}:R" /Q | Out-Null
foreach ($p in @($work, $Out)) { icacls $p /grant "${user}:(OI)(CI)M" /Q | Out-Null }
$node = (Get-Command node.exe).Source
Write-Host "node for the child: $node"

$stdout = Join-Path $Out "std-user.stdout.log"
$stderr = Join-Path $Out "std-user.stderr.log"
$nodeArgs = @($harness, "--tarball", $Tarball, "--expected-sha256", $ExpectedSha256, "--out", $Out, "--work", $work, "--node-label", $NodeLabel, "--expect-standard-user")
if ($Dense) { $nodeArgs += "--dense" }
Write-Host "child argv: $($nodeArgs -join ' ')"
$cred = New-Object System.Management.Automation.PSCredential("$env:COMPUTERNAME\$user", $secure)
$launch = "ok"
$exit = 1
try {
  # -LoadUserProfile gives the account a real profile (USERPROFILE/APPDATA) like an interactive standard user.
  $proc = Start-Process -FilePath $node -ArgumentList $nodeArgs -Credential $cred -LoadUserProfile -WorkingDirectory $work -WindowStyle Hidden `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -Wait
  $exit = $proc.ExitCode
} catch {
  $launch = "launch-failed: $($_.Exception.Message)"
  Write-Host "::warning::standard-user launch failed (no policy weakened): $($_.Exception.Message)"
}
if (Test-Path $stderr) { Get-Content $stderr | Select-Object -Last 200 }
@{ user = "$env:COMPUTERNAME\$user"; launch = $launch; exitCode = $exit; node = $node } | ConvertTo-Json | Set-Content (Join-Path $Out "std-user-launch.json")

Write-Host "removing ephemeral user $user"
try { Remove-LocalUser -Name $user } catch { Write-Host "::warning::could not remove $user : $($_.Exception.Message)" }
try { $prof = Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -like "*\$user" }; if ($prof) { $prof | Remove-CimInstance } } catch { }
if ($launch -ne "ok") { exit 3 }
exit $exit
