param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Error $Message
  exit 1
}

if (-not (Test-Path $Path)) {
  Fail "Arquivo não encontrado: $Path"
}

try {
  # Windows PowerShell 5.1 não suporta -Depth em ConvertFrom-Json.
  $json = Get-Content -Raw $Path | ConvertFrom-Json
} catch {
  Fail ("JSON inválido: {0}. Erro: {1}" -f $Path, $_.Exception.Message)
}

if (-not $json.sac -or -not $json.sac.numero -or -not $json.sac.nome) {
  Fail "Campos obrigatórios ausentes: sac.numero e sac.nome"
}

if (-not $json.env -or -not $json.env.usuario -or -not $json.env.senha) {
  Fail "Campos obrigatorios ausentes: env.usuario e env.senha. env.base_url pode ser omitido quando o agent usar config-app.json como padrao."
}

if (-not $json.entrada -or ((-not $json.entrada.entradas -or $json.entrada.entradas.Count -lt 1) -and (-not $json.entrada.contratos -or $json.entrada.contratos.Count -lt 1))) {
  Fail "Campos obrigatórios ausentes: entrada.entradas (array com ao menos 1 item) ou entrada.contratos (compat)"
}

if (-not $json.menu) {
  Fail "Campos obrigatórios ausentes: menu"
}

if (-not $json.telas) {
  Fail "Campos obrigatórios ausentes: telas"
}

if (-not $json.execucao) {
  Fail "Campos obrigatórios ausentes: execucao"
}

if (-not $json.passos -or $json.passos.Count -lt 1) {
  Fail "Campos obrigatórios ausentes: passos (array com ao menos 1 item)"
}

$timeouts = @("delay_entre_passos_ms", "timeout_por_passo_ms")
foreach ($k in $timeouts) {
  if ($null -ne $json.execucao.$k -and ($json.execucao.$k -isnot [int] -and $json.execucao.$k -isnot [long])) {
    Fail "execucao.$k deve ser número (ms)"
  }
}

Write-Host ("OK: request válido (mínimo) - {0}" -f $Path)
