param(
  [string]$SourceRoot = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$targetRoot = Join-Path $repoRoot "src-tauri\resources\ghdl"

function Resolve-GhdlRoot {
  param([string]$ExplicitRoot)

  if ($ExplicitRoot) {
    $resolved = Resolve-Path -LiteralPath $ExplicitRoot
    if (Test-Path -LiteralPath (Join-Path $resolved "bin\ghdl.exe")) {
      return $resolved.Path
    }
    throw "GHDL source root '$ExplicitRoot' does not contain bin\ghdl.exe."
  }

  if ($env:GHDL_HOME -and (Test-Path -LiteralPath (Join-Path $env:GHDL_HOME "bin\ghdl.exe"))) {
    return (Resolve-Path -LiteralPath $env:GHDL_HOME).Path
  }

  $ghdlExe = (Get-Command ghdl.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
  if ($ghdlExe) {
    $binDir = Split-Path -Parent $ghdlExe
    $root = Split-Path -Parent $binDir
    if (Test-Path -LiteralPath (Join-Path $root "bin\ghdl.exe")) {
      return (Resolve-Path -LiteralPath $root).Path
    }
  }

  $wingetPackages = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
  if (Test-Path -LiteralPath $wingetPackages) {
    $candidate = Get-ChildItem -LiteralPath $wingetPackages -Directory |
      Where-Object { $_.Name -like "ghdl.ghdl.*" -and (Test-Path -LiteralPath (Join-Path $_.FullName "bin\ghdl.exe")) } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($candidate) {
      return $candidate.FullName
    }
  }

  throw "Could not find GHDL. Install it with 'winget install ghdl.ghdl' or set GHDL_HOME."
}

$source = Resolve-GhdlRoot $SourceRoot
Write-Host "Using GHDL from $source"

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $targetRoot) | Out-Null
if (Test-Path -LiteralPath $targetRoot) {
  $resolvedTarget = (Resolve-Path -LiteralPath $targetRoot).Path
  $expectedParent = (Resolve-Path -LiteralPath (Join-Path $repoRoot "src-tauri\resources")).Path
  if (-not $resolvedTarget.StartsWith($expectedParent, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove unexpected target '$resolvedTarget'."
  }
  Remove-Item -LiteralPath $targetRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null
Copy-Item -Path (Join-Path $source "*") -Destination $targetRoot -Recurse -Force

$bundledGhdl = Join-Path $targetRoot "bin\ghdl.exe"
if (-not (Test-Path -LiteralPath $bundledGhdl)) {
  throw "Bundled GHDL was not staged correctly: missing $bundledGhdl"
}

& $bundledGhdl --version | Select-Object -First 1
Write-Host "Staged bundled GHDL at $targetRoot"
