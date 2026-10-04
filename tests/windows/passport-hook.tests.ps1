# Windows checks for plugins/passport/scripts/passport-hook.ps1, run in CI on
# windows-latest under Windows PowerShell 5.1 and PowerShell 7. Everything runs
# in a temporary USERPROFILE with a stub CLI and a stub npm.
param([string]$Shell = 'powershell')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$script = Join-Path $root 'plugins\passport\scripts\passport-hook.ps1'
$fixtures = Join-Path $root 'tests\fixtures'
$failures = 0

function New-Box {
  $dir = Join-Path ([IO.Path]::GetTempPath()) ("passport-plugin-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
  $bin = Join-Path $dir 'bin'
  New-Item -ItemType Directory -Force -Path (Join-Path $dir 'home'), $bin | Out-Null
  $node = (Get-Command node.exe).Source
  Copy-Item $node (Join-Path $bin 'node.exe')
  Set-Content -Path (Join-Path $bin 'npm.cmd') -Value "@`"$bin\node.exe`" `"$fixtures\fake-npm.mjs`" %*" -Encoding ASCII
  $homeDir = Join-Path $dir 'home'
  return @{
    Dir = $dir; Bin = $bin; Home = $homeDir
    Env = @{
      USERPROFILE = $homeDir; HOME = $homeDir
      PASSPORT_HOME = (Join-Path $homeDir '.passport'); CLAUDE_CONFIG_DIR = (Join-Path $homeDir '.claude')
      CODEX_HOME = (Join-Path $homeDir '.codex'); PASSPORT_CURSOR_HOME = (Join-Path $homeDir '.cursor')
      PATH = "$bin;$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\WindowsPowerShell\v1.0;$env:ProgramFiles\PowerShell\7"
      PASSPORT_PLUGIN_NODE_SEARCH = (Join-Path $dir 'no-node-here')
      FAKE_CLI_RECORD = (Join-Path $dir 'cli-calls.jsonl'); FAKE_NPM_LOG = (Join-Path $dir 'npm-calls.log')
      FAKE_NPM_PACKAGE = (Join-Path $fixtures 'fake-cli')
    }
  }
}

function Invoke-HookScript($box, [string[]]$hookArgs, [string]$stdin = '', [hashtable]$extra = @{}) {
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = (Get-Command $Shell).Source
  $info.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $script + '" ' + ($hookArgs -join ' ')
  $info.UseShellExecute = $false
  $info.RedirectStandardInput = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  foreach ($key in $box.Env.Keys) { $info.EnvironmentVariables[$key] = $box.Env[$key] }
  foreach ($key in $extra.Keys) { $info.EnvironmentVariables[$key] = $extra[$key] }
  $process = [Diagnostics.Process]::Start($info)
  $process.StandardInput.Write($stdin)
  $process.StandardInput.Close()
  $out = $process.StandardOutput.ReadToEnd()
  $err = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  return @{ Status = $process.ExitCode; Out = $out; Err = $err }
}

function Install-Pinned($box) {
  $target = Join-Path $box.Env.PASSPORT_HOME 'cli\0.16.2'
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Copy-Item -Recurse -Force (Join-Path $fixtures 'fake-cli\package\*') $target
  Set-Content -Path (Join-Path $target '.passport-install.json') -Value '{"version":"0.16.2","installedAt":1}' -Encoding ASCII
}

function Check([string]$name, [scriptblock]$body) {
  try { & $body; Write-Host "ok - $name" } catch { $script:failures++; Write-Host "not ok - ${name}: $($_.Exception.Message)" }
}
function Assert($condition, [string]$message) { if (-not $condition) { throw $message } }

$pre = '{"session_id":"thr_1","hook_event_name":"PreToolUse","tool_name":"Bash","tool_use_id":"call_1","tool_input":{"command":"railway volume delete data"}}'
$deny = '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"test"}}'

Check 'guard passes stdin through and returns the CLI answer' {
  $box = New-Box; Install-Pinned $box
  $r = Invoke-HookScript $box @('guard', 'codex') $pre @{ FAKE_CLI_STDOUT = $deny }
  Assert ($r.Status -eq 0) "exit $($r.Status)"
  Assert ($r.Out.Trim() -eq $deny) "stdout: $($r.Out)"
  $call = Get-Content $box.Env.FAKE_CLI_RECORD | Select-Object -First 1 | ConvertFrom-Json
  Assert (($call.argv -join ' ') -eq 'hook guard --client codex') "argv: $($call.argv -join ' ')"
  Assert ($call.stdin -eq $pre) "stdin: $($call.stdin)"
}

Check 'audit maps to passport hook --client codex and prints nothing' {
  $box = New-Box; Install-Pinned $box
  $r = Invoke-HookScript $box @('audit', 'codex') $pre
  Assert ($r.Out -eq '') "stdout: $($r.Out)"
  $call = Get-Content $box.Env.FAKE_CLI_RECORD | Select-Object -First 1 | ConvertFrom-Json
  Assert (($call.argv -join ' ') -eq 'hook --client codex') "argv: $($call.argv -join ' ')"
}

Check 'a failing CLI reaches the agent as nothing' {
  $box = New-Box; Install-Pinned $box
  $r = Invoke-HookScript $box @('guard', 'codex') $pre @{ FAKE_CLI_STDOUT = $deny; FAKE_CLI_EXIT = '1' }
  Assert ($r.Status -eq 0 -and $r.Out -eq '') "stdout: $($r.Out)"
}

Check 'CLI absent: silent no-op' {
  $box = New-Box
  foreach ($mode in @('guard', 'audit')) {
    $r = Invoke-HookScript $box @($mode, 'codex') $pre
    Assert ($r.Status -eq 0 -and $r.Out -eq '' -and $r.Err -eq '') "$mode printed: $($r.Out)$($r.Err)"
  }
}

Check 'session-start installs the pinned CLI once in the background' {
  $box = New-Box
  $watch = [Diagnostics.Stopwatch]::StartNew()
  $r = Invoke-HookScript $box @('session-start', 'codex')
  Assert ($r.Status -eq 0 -and $r.Out -eq '') "stdout: $($r.Out)"
  $marker = Join-Path $box.Env.PASSPORT_HOME 'cli\0.16.2\.passport-install.json'
  $shim = Join-Path $box.Env.PASSPORT_HOME 'cli\bin\passport.cmd'
  $lock = Join-Path $box.Env.PASSPORT_HOME 'cli\.plugin-install.lock'
  $log = Join-Path $box.Env.PASSPORT_HOME 'logs\plugin-install.log'
  # The copy lands before the shims are written and the lock is released, so
  # wait for the whole install, not just the marker.
  $deadline = (Get-Date).AddSeconds(60)
  while (-not ((Test-Path $marker) -and (Test-Path $shim) -and -not (Test-Path $lock)) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250 }
  $logText = if (Test-Path $log) { (Get-Content -Raw $log) } else { '(no log)' }
  Assert (Test-Path $marker) "install finished. Log: $logText"
  Assert (Test-Path $shim) "shim written. Log: $logText"
  Start-Sleep -Seconds 2
  $packs = @(Get-Content $box.Env.FAKE_NPM_LOG | Where-Object { $_ -like 'pack *' }).Count
  $null = Invoke-HookScript $box @('session-start', 'codex')
  Start-Sleep -Seconds 2
  $after = @(Get-Content $box.Env.FAKE_NPM_LOG | Where-Object { $_ -like 'pack *' }).Count
  Assert ($packs -eq 1 -and $after -eq 1) "pack ran $packs then $after times"
  $g = Invoke-HookScript $box @('guard', 'codex') $pre @{ FAKE_CLI_STDOUT = $deny }
  Assert ($g.Out.Trim() -eq $deny) 'installed CLI answers through the shim'
}

Check 'session-start without Node.js leaves one hint and prints nothing' {
  $box = New-Box
  Remove-Item (Join-Path $box.Bin 'node.exe')
  $null = Invoke-HookScript $box @('session-start', 'codex')
  $r = Invoke-HookScript $box @('session-start', 'codex')
  Assert ($r.Out -eq '') "stdout: $($r.Out)"
  $lines = @(Get-Content (Join-Path $box.Env.PASSPORT_HOME 'logs\plugin-install.log'))
  Assert ($lines.Count -eq 1 -and $lines[0] -like '*Node.js 20 or newer*') "log: $($lines -join ' | ')"
}

if ($failures) { Write-Host "$failures failed"; exit 1 }
Write-Host 'all passed'
