# Passport plugin hook (Windows PowerShell 5.1+ and PowerShell 7). Usage:
#
#   passport-hook.ps1 guard|audit|session-start claude-code|codex|cursor
#
# Same contract as passport-hook.sh: guard/audit run the installed Passport
# CLI's `passport hook guard` / `passport hook` with the agent's stdin and pass
# its JSON answer through; nothing is printed when the CLI is missing or fails.
# session-start installs the pinned passport-bridge into
# %USERPROFILE%\.passport\cli\<version>\ in the background, once, and prints
# nothing. Problems go to %USERPROFILE%\.passport\logs\plugin-install.log.
param([string]$Mode = '', [string]$Client = 'claude-code')

$ErrorActionPreference = 'Stop'
$PassportCliVersion = '0.14.0'
$MinNodeMajor = 20

if ($Client -notin @('claude-code', 'codex', 'cursor')) { exit 0 }
$HomeDir = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
if (-not $HomeDir) { exit 0 }
$PassportDir = if ($env:PASSPORT_HOME) { $env:PASSPORT_HOME } else { Join-Path $HomeDir '.passport' }
$CliRoot = Join-Path $PassportDir 'cli'
$LogDir = Join-Path $PassportDir 'logs'
$LogFile = Join-Path $LogDir 'plugin-install.log'
$PinDir = Join-Path $CliRoot $PassportCliVersion
$LockDir = Join-Path $CliRoot '.plugin-install.lock'
$FailedStamp = Join-Path $CliRoot '.plugin-install-failed'

function Test-Ephemeral([string]$Path) {
  return $Path -match '[\\/](_npx|\.npm|npm-cache|\.pnpm-store|\.yarn[\\/]berry[\\/]cache)[\\/]' -or $Path -match '[\\/]pnpm[\\/]dlx[\\/]'
}

function Find-Node {
  if ($env:PASSPORT_PLUGIN_NODE -and (Test-Path -LiteralPath $env:PASSPORT_PLUGIN_NODE -PathType Leaf)) { return $env:PASSPORT_PLUGIN_NODE }
  $dirs = @(($env:PATH -split ';') | Where-Object { $_ })
  if ($null -ne $env:PASSPORT_PLUGIN_NODE_SEARCH) {
    $dirs += @(($env:PASSPORT_PLUGIN_NODE_SEARCH -split ';') | Where-Object { $_ })
  } else {
    $dirs += @("$env:ProgramFiles\nodejs", "$env:LOCALAPPDATA\Volta\bin", "$env:APPDATA\nvm")
  }
  foreach ($dir in $dirs) {
    $candidate = Join-Path $dir 'node.exe'
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf) -or (Test-Ephemeral $candidate)) { continue }
    try {
      $version = & $candidate --version 2>$null
      if ($version -match '^v(\d+)' -and [int]$Matches[1] -ge $MinNodeMajor) { return $candidate }
    } catch { }
  }
  return $null
}

# `passport init` writes passport.cmd as: @echo off / "<node>" "<entry>" %*
function Get-ShimTarget {
  $shim = Join-Path $CliRoot 'bin\passport.cmd'
  if (-not (Test-Path -LiteralPath $shim -PathType Leaf)) { return $null }
  foreach ($line in Get-Content -LiteralPath $shim) {
    if ($line -match '^"([^"]+)" "([^"]+)" %\*') {
      if ((Test-Path -LiteralPath $Matches[1] -PathType Leaf) -and (Test-Path -LiteralPath $Matches[2] -PathType Leaf)) {
        return @{ Node = $Matches[1]; Entry = $Matches[2] }
      }
    }
  }
  return $null
}

function Test-Install([string]$Dir, [string]$Version) {
  if (-not (Test-Path -LiteralPath (Join-Path $Dir 'dist\passport.js') -PathType Leaf)) { return $false }
  try {
    $marker = Get-Content -Raw -LiteralPath (Join-Path $Dir '.passport-install.json') | ConvertFrom-Json
    return $marker.version -eq $Version
  } catch { return $false }
}

function Find-PathPassport {
  foreach ($dir in (($env:PATH -split ';') | Where-Object { $_ })) {
    foreach ($name in @('passport.cmd', 'passport.exe', 'passport.bat')) {
      $candidate = Join-Path $dir $name
      if ((Test-Path -LiteralPath $candidate -PathType Leaf) -and -not (Test-Ephemeral $candidate)) { return $candidate }
    }
  }
  return $null
}

function Test-GlobalCliCurrent {
  $bin = Find-PathPassport
  if (-not $bin) { return $false }
  $pkg = Join-Path (Split-Path $bin) 'node_modules\passport-bridge\package.json'
  if (-not (Test-Path -LiteralPath $pkg -PathType Leaf)) { return $false }
  try {
    $found = (Get-Content -Raw -LiteralPath $pkg | ConvertFrom-Json).version
    return [version]($found -replace '[-+].*$', '') -ge [version]$PassportCliVersion
  } catch { return $false }
}

function Resolve-Cli {
  $shim = Get-ShimTarget
  if ($shim) { return @{ File = $shim.Node; Args = @($shim.Entry) } }
  foreach ($dir in @((Join-Path $CliRoot 'current'), $PinDir)) {
    $entry = Join-Path $dir 'dist\passport.js'
    if (Test-Path -LiteralPath $entry -PathType Leaf) {
      $node = Find-Node
      if (-not $node) { return $null }
      return @{ File = $node; Args = @($entry) }
    }
  }
  $bin = Find-PathPassport
  if ($bin) { return @{ File = $bin; Args = @() } }
  return $null
}

function Get-SettingsFile {
  switch ($Client) {
    'claude-code' { $base = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HomeDir '.claude' }; return Join-Path $base 'settings.json' }
    'codex' { $base = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HomeDir '.codex' }; return Join-Path $base 'hooks.json' }
    'cursor' { $base = if ($env:PASSPORT_CURSOR_HOME) { $env:PASSPORT_CURSOR_HOME } else { Join-Path $HomeDir '.cursor' }; return Join-Path $base 'hooks.json' }
  }
}

# The agent's own settings already run this Passport hook, so stay quiet.
function Test-SettingsRegister([string]$Kind) {
  $file = Get-SettingsFile
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { return $false }
  $text = Get-Content -Raw -LiteralPath $file
  $tail = '(\s+--client(\s+|=)[a-z-]+)?\s*"'
  if ($Kind -eq 'guard') { return $text -match ('passport[^"]*(\\")?\s+hook\s+guard' + $tail) }
  return $text -match ('passport[^"]*(\\")?\s+hook' + $tail)
}

function Invoke-Hook([string]$Kind) {
  if ($env:PASSPORT_HOOK_DISABLED -eq '1') { return }
  if (Test-SettingsRegister $Kind) { return }
  $cli = Resolve-Cli
  if (-not $cli) { return }
  $hookArgs = @('hook')
  if ($Kind -eq 'guard') { $hookArgs += 'guard' }
  if ($Client -ne 'claude-code') { $hookArgs += @('--client', $Client) }
  $env:PASSPORT_HOOK_VIA = 'plugin'
  $stdin = [Console]::OpenStandardInput()
  $buffer = New-Object System.IO.MemoryStream
  $stdin.CopyTo($buffer)

  $info = New-Object System.Diagnostics.ProcessStartInfo
  $quote = { param($a) if ($a -match '[\s"&|<>^]') { '"' + ($a -replace '"', '\"') + '"' } else { $a } }
  $line = ((@($cli.File) + @($cli.Args) + $hookArgs) | ForEach-Object { & $quote $_ }) -join ' '
  if ($cli.File -match '\.(cmd|bat)$') {
    # cmd.exe runs .cmd shims; /s keeps the quoted path intact.
    $info.FileName = $env:ComSpec
    $info.Arguments = '/d /s /c "' + $line + '"'
  } else {
    $info.FileName = $cli.File
    $info.Arguments = ((@($cli.Args) + $hookArgs) | ForEach-Object { & $quote $_ }) -join ' '
  }
  $info.UseShellExecute = $false
  $info.RedirectStandardInput = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.CreateNoWindow = $true
  $info.StandardOutputEncoding = [System.Text.Encoding]::UTF8
  $process = [System.Diagnostics.Process]::Start($info)
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $bytes = $buffer.ToArray()
  $process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
  $process.StandardInput.Close()
  if (-not $process.WaitForExit(4500)) { try { $process.Kill() } catch { }; return }
  $null = $stderrTask.Result
  $out = $stdoutTask.Result.Trim()
  if ($process.ExitCode -ne 0) { return }
  # Only a JSON object reaches the agent; anything else is dropped.
  if ($out.StartsWith('{') -and $out.EndsWith('}')) {
    $writer = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), (New-Object System.Text.UTF8Encoding($false)))
    $writer.Write($out + "`n")
    $writer.Flush()
  }
}

function Write-Log([string]$Message) {
  try {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    if ((Test-Path -LiteralPath $LogFile) -and (Get-Item -LiteralPath $LogFile).Length -gt 262144) {
      Move-Item -Force -LiteralPath $LogFile -Destination "$LogFile.1"
    }
    $stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    Add-Content -LiteralPath $LogFile -Value "$stamp passport-plugin: $Message" -Encoding UTF8
  } catch { }
}

function Write-Hint([string]$Message) {
  if ((Test-Path -LiteralPath $LogFile) -and ((Get-Content -LiteralPath $LogFile -Tail 1) -like "*$Message*")) { return }
  Write-Log $Message
}

function Test-Recent([string]$Path, [int]$Minutes) {
  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  return (Get-Item -LiteralPath $Path).LastWriteTime -gt (Get-Date).AddMinutes(-$Minutes)
}

function Test-CliReady {
  if (Get-ShimTarget) { return $true }
  if (Test-Install $PinDir $PassportCliVersion) { return $true }
  if (Test-Path -LiteralPath (Join-Path $CliRoot 'current\dist\passport.js') -PathType Leaf) { return $true }
  return (Test-GlobalCliCurrent)
}

function Find-Npm([string]$Node) {
  $sibling = Join-Path (Split-Path $Node) 'npm.cmd'
  $onPath = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }
  if (Test-Path -LiteralPath $sibling -PathType Leaf) { return $sibling }
  return $null
}

function Start-SessionHook {
  if ($env:PASSPORT_PLUGIN_AUTO_INSTALL -eq '0') { return }
  if (Test-CliReady) { return }
  if (Test-Recent $FailedStamp 60) { return }
  if (Test-Path -LiteralPath $LockDir) {
    if (Test-Recent $LockDir 15) { return }
    Remove-Item -Recurse -Force -LiteralPath $LockDir -ErrorAction SilentlyContinue
  }
  $node = Find-Node
  if (-not $node) { Write-Hint "Node.js $MinNodeMajor or newer wasn't found, so the Passport CLI isn't installed yet. Install Node.js, or run: npx passport-bridge@latest init"; return }
  if (-not (Find-Npm $node)) { Write-Hint "npm wasn't found next to $node, so the Passport CLI isn't installed yet. Run: npx passport-bridge@latest init"; return }
  $env:PASSPORT_PLUGIN_NODE = $node
  $shell = (Get-Process -Id $PID).Path
  Start-Process -FilePath $shell -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '__ensure-worker', $Client) | Out-Null
}

function Write-Shims([string]$Node) {
  if (Get-ShimTarget) { return }
  $binDir = Join-Path $CliRoot 'bin'
  New-Item -ItemType Directory -Force -Path $binDir | Out-Null
  foreach ($pair in @(@('passport', 'passport.js'), @('passport-bridge', 'cli.js'))) {
    $entry = Join-Path $PinDir "dist\$($pair[1])"
    $temp = Join-Path $binDir ".$($pair[0])-plugin-$PID.tmp"
    [System.IO.File]::WriteAllText($temp, "@echo off`r`n`"$Node`" `"$entry`" %*`r`n")
    Move-Item -Force -LiteralPath $temp -Destination (Join-Path $binDir "$($pair[0]).cmd")
  }
}

function Invoke-EnsureWorker {
  New-Item -ItemType Directory -Force -Path $CliRoot | Out-Null
  try { New-Item -ItemType Directory -Path $LockDir -ErrorAction Stop | Out-Null } catch { return }
  $work = $null
  try {
    $node = if ($env:PASSPORT_PLUGIN_NODE) { $env:PASSPORT_PLUGIN_NODE } else { Find-Node }
    if (-not $node) { return }
    if (Test-Install $PinDir $PassportCliVersion) { Write-Shims $node; return }
    $npm = Find-Npm $node
    if (-not $npm) { return }
    $env:PATH = (Split-Path $node) + ';' + $env:PATH
    $spec = "passport-bridge@$PassportCliVersion"
    $work = Join-Path $CliRoot (".plugin-install-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Force -Path (Join-Path $work 'pack') | Out-Null
    Write-Log "Installing $spec into $PinDir"
    Push-Location (Join-Path $work 'pack')
    try { & $npm pack $spec --silent --no-audit --no-fund 2>&1 | Out-Null } finally { Pop-Location }
    $tarball = Get-ChildItem -LiteralPath (Join-Path $work 'pack') -Filter '*.tgz' | Select-Object -First 1
    if (-not $tarball) { throw 'npm pack failed' }
    & tar -xzf $tarball.FullName -C $work
    $package = Join-Path $work 'package'
    if (-not (Test-Path -LiteralPath (Join-Path $package 'dist\passport.js'))) { throw 'the package has no dist/passport.js' }
    Push-Location $package
    try {
      & $npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error 2>&1 | Out-Null
      if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $package 'node_modules'))) {
        & $npm install --omit=dev --ignore-scripts --no-audit --no-fund --no-package-lock --loglevel=error 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "npm couldn't install its dependencies" }
      }
    } finally { Pop-Location }
    $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    [System.IO.File]::WriteAllText((Join-Path $package '.passport-install.json'), "{`"version`":`"$PassportCliVersion`",`"installedAt`":$stamp,`"installedBy`":`"passport-plugin`"}`n")
    if (Test-Path -LiteralPath $PinDir) { Remove-Item -Recurse -Force -LiteralPath $PinDir }
    Move-Item -LiteralPath $package -Destination $PinDir
    Remove-Item -Force -LiteralPath $FailedStamp -ErrorAction SilentlyContinue
    Write-Shims $node
    Write-Log "Installed $spec. The Passport guard is on for new commands."
  } catch {
    Write-Log "Couldn't install passport-bridge@$PassportCliVersion ($($_.Exception.Message)). Passport will retry in an hour, or run: npx passport-bridge@latest init"
    try { New-Item -ItemType File -Force -Path $FailedStamp | Out-Null } catch { }
  } finally {
    if ($work) { Remove-Item -Recurse -Force -LiteralPath $work -ErrorAction SilentlyContinue }
    Remove-Item -Recurse -Force -LiteralPath $LockDir -ErrorAction SilentlyContinue
  }
}

try {
  switch ($Mode) {
    'guard' { Invoke-Hook 'guard' }
    'audit' { Invoke-Hook 'audit' }
    'session-start' { Start-SessionHook }
    '__ensure-worker' { Invoke-EnsureWorker }
  }
} catch { }
exit 0
