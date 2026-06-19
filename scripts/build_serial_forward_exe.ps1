param(
  [string]$Python = "python",
  [string]$Name = "PortVortexSerialForward"
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Venv = Join-Path $Root ".venv-serial-forward"
$Py = Join-Path $Venv "Scripts\python.exe"
$Script = Join-Path $Root "scripts\serial_forward.py"
$Com0comDir = Join-Path $Root "tools\com0com"

if (!(Test-Path -LiteralPath $Py)) {
  & $Python -m venv $Venv
}

& $Py -m pip install --upgrade pip
& $Py -m pip install pyinstaller pyserial

$Args = @(
  "--onefile",
  "--console",
  "--clean",
  "--name", $Name,
  "--distpath", (Join-Path $Root "dist-tools"),
  "--workpath", (Join-Path $Root "build\serial-forward"),
  "--specpath", (Join-Path $Root "build\serial-forward"),
  $Script
)

if (Test-Path -LiteralPath $Com0comDir) {
  $Args = @("--add-data", "$Com0comDir;com0com") + $Args
}

& $Py -m PyInstaller @Args

Write-Host ""
Write-Host "Built: $(Join-Path $Root "dist-tools\$Name.exe")"
Write-Host "Usage:"
Write-Host "  dist-tools\$Name.exe <device_id> --mode uart --server http://localhost:3000 --auto-com0com"
Write-Host ""
Write-Host "Optional: put the com0com installer or extracted setupc.exe files under tools\com0com before building."
