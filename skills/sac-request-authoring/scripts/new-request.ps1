param(
  [Parameter(Mandatory = $true)]
  [string]$SacNumero,

  [Parameter(Mandatory = $true)]
  [string]$SacNome,

  [string]$OutputPath,

  [switch]$Force
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$templatePath = Join-Path $repoRoot "skills\sac-request-authoring\assets\request.template.json"

if (-not (Test-Path $templatePath)) {
  throw "Template não encontrado: $templatePath"
}

if (-not $OutputPath -or $OutputPath.Trim().Length -eq 0) {
  $OutputPath = Join-Path $repoRoot ("requests_ia\request_{0}" -f $SacNumero)
}

if ((Test-Path $OutputPath) -and (-not $Force)) {
  throw "Arquivo já existe: $OutputPath (use -Force para sobrescrever)"
}

$raw = Get-Content -Raw $templatePath
$raw = $raw.Replace('"SAC_XXXXXX"', ('"{0}"' -f $SacNumero))
$raw = $raw.Replace('"NOME_DO_CENARIO"', ('"{0}"' -f $SacNome))

$dir = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $dir | Out-Null

Set-Content -Path $OutputPath -Value $raw -Encoding utf8
Write-Host ("OK: criado {0}" -f $OutputPath)

