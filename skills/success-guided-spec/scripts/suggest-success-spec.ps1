param(
  [Parameter(Mandatory = $true)]
  [string] $Query,

  [Parameter(Mandatory = $false)]
  [int] $Top = 8,

  [Parameter(Mandatory = $false)]
  [switch] $ShowCode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function RepoRootFromScript {
  return (Resolve-Path (Join-Path $PSScriptRoot "..\\..\\..")).Path
}

function Normalize([string] $s) {
  if ($null -eq $s) { return "" }
  return ($s.ToLowerInvariant())
}

$repoRoot = RepoRootFromScript
$successPath = Join-Path $repoRoot "tests\\src\\success_base\\success_base.json"
if (-not (Test-Path $successPath)) {
  throw "success_base.json not found: $successPath"
}

$raw = Get-Content -Raw $successPath
$base = $raw | ConvertFrom-Json
$entries = @($base.entries)

$terms = @()
foreach ($t in ($Query -split "\\s+")) {
  $tt = $t.Trim()
  if ($tt) { $terms += (Normalize $tt) }
}
if (-not $terms.Count) { throw "Query vazio." }

function ScoreEntry($e) {
  $file = Normalize ($e.file)
  $title = Normalize (($e.titlePath -join " "))
  $code = Normalize ($e.code)

  $score = 0
  foreach ($term in $terms) {
    if (-not $term) { continue }
    if ($file.Contains($term)) { $score += 8 }
    if ($title.Contains($term)) { $score += 6 }
    if ($code.Contains($term)) { $score += 2 }
  }
  return $score
}

$scored = foreach ($e in $entries) {
  $s = ScoreEntry $e
  if ($s -le 0) { continue }
  [pscustomobject]@{
    score = $s
    lastSeen = $e.lastSeen
    file = $e.file
    title = ($e.titlePath -join " > ")
    key = $e.key
    code = $e.code
  }
}

$top = $scored | Sort-Object -Property @{ Expression = "score"; Descending = $true }, @{ Expression = "lastSeen"; Descending = $true } | Select-Object -First $Top

if (-not $top) {
  Write-Output "No matches for query: $Query"
  exit 0
}

foreach ($r in $top) {
  Write-Output ("[{0}] {1}" -f $r.score, $r.title)
  Write-Output ("  file: {0}" -f $r.file)
  Write-Output ("  lastSeen: {0}" -f $r.lastSeen)
  if ($ShowCode) {
    Write-Output "----- CODE -----"
    Write-Output $r.code
    Write-Output "---------------"
  }
  Write-Output ""
}
