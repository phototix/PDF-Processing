$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$file = Join-Path $root 'index.html'

$content = Get-Content -Raw -Path $file
$pattern = '(?<prefix>(?:styles\.css|app\.js)\?version=)(?<ver>\d+\.\d+\.\d+)'
$match = [regex]::Match($content, $pattern)
if (-not $match.Success) {
  throw 'No version found in index.html'
}

$ver = $match.Groups['ver'].Value
$parts = $ver.Split('.') | ForEach-Object { [int]$_ }
if ($parts.Length -ne 3) {
  throw 'Version must be x.y.z'
}
$parts[2]++
$newVer = "$($parts[0]).$($parts[1]).$($parts[2])"

$updated = [regex]::Replace($content, $pattern, "`${prefix}$newVer")
Set-Content -Path $file -Value $updated -NoNewline

Write-Host "Version bumped to $newVer"
