$ErrorActionPreference = 'Stop'

$executable = Join-Path $PSScriptRoot '..\dist\win-unpacked\GameVault.exe'
if (-not (Test-Path $executable)) {
  throw "Packaged executable not found: $executable"
}

$profile = Join-Path ([System.IO.Path]::GetTempPath()) ("gamevault-smoke-" + [guid]::NewGuid())
$process = $null

try {
  New-Item -ItemType Directory -Path $profile | Out-Null
  $process = Start-Process -FilePath $executable -ArgumentList "--user-data-dir=$profile", '--disable-gpu' -PassThru
  $deadline = (Get-Date).AddSeconds(15)
  do {
    Start-Sleep -Milliseconds 250
    $process.Refresh()
    if ($process.HasExited) {
      throw "Packaged GameVault exited during startup with code $($process.ExitCode)"
    }
    if ($process.MainWindowTitle -eq 'GameVault') {
      return
    }
  } while ((Get-Date) -lt $deadline)

  throw "Packaged GameVault did not finish loading within 15 seconds"
} finally {
  if ($null -ne $process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force
    $process.WaitForExit()
  }
  Remove-Item -Path $profile -Recurse -Force -ErrorAction SilentlyContinue
}
