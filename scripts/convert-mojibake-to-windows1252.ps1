param(
  [Parameter(Mandatory = $false)]
  [string[]] $Roots = @("out"),

  [Parameter(Mandatory = $false)]
  [string[]] $IncludeExtensions = @(".json", ".csv", ".txt", ".md", ".html", ".xml", ".yml", ".yaml", ".log", ""),

  [Parameter(Mandatory = $false)]
  [switch] $DryRun,

  [Parameter(Mandatory = $false)]
  [string] $BackupRoot = $(Join-Path "out" ("encoding-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss")))
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Should-FixMojibake([string] $text) {
  # Heuristic: common UTF-8->CP1252 mojibake sequences in PT-BR content.
  # Examples: "BeneficiÃ¡rios", "ReferÃªncia", "RevisÃ£o", and stray "Â " before punctuation/spaces.
  # Use codepoints to avoid script/console encoding surprises:
  # - U+00C3 followed by 0x80..0xBF (typical mojibake second byte)
  # - U+00C2 followed by whitespace
  return ($text -match "\u00C3[\x80-\xBF]" -or $text -match "\u00C2\\s")
}

function Fix-MojibakeUtf8AsCp1252([string] $text) {
  $cp1252 = [System.Text.Encoding]::GetEncoding(1252)
  $utf8 = [System.Text.Encoding]::UTF8
  return $utf8.GetString($cp1252.GetBytes($text))
}

function Fix-MojibakeSelective([string] $text) {
  # Fix only classic mojibake sequences without re-decoding the whole file.
  $out = $text

  # Normalize NBSP and remove stray "Â ".
  $out = $out.Replace(([char]0x00C2 + [char]0x00A0), " ")
  $out = $out.Replace(([char]0x00C2 + " "), "")

  # Replace "Ã" + [0x80..0xBF] by decoding bytes {0xC3, secondByte}.
  $pattern = "\u00C3[\x80-\xBF]"
  $out = [System.Text.RegularExpressions.Regex]::Replace($out, $pattern, {
      param($m)
      $chars = $m.Value.ToCharArray()
      $b0 = [byte]0xC3
      $b1 = [byte][int][char]$chars[1]
      return [System.Text.Encoding]::UTF8.GetString([byte[]]@($b0, $b1))
    })

  return $out
<#
  $pairs = @(
    @("Â ", ""), @("Â ", ""), # includes NBSP variant
    @("Ã¡", "á"), @("ÃÁ", "Á"), @("Ãà", "à"), @("ÃÀ", "À"),
    @("Ã¢", "â"), @("ÃÂ", "Â"), @("Ãã", "ã"), @("ÃÃ", "Ã"),
    @("Ãä", "ä"), @("ÃÄ", "Ä"), @("Ãå", "å"), @("ÃÅ", "Å"),
    @("Ãç", "ç"), @("ÃÇ", "Ç"),
    @("Ãé", "é"), @("ÃÉ", "É"), @("Ãê", "ê"), @("ÃÊ", "Ê"), @("Ãë", "ë"), @("ÃË", "Ë"),
    @("Ãí", "í"), @("ÃÍ", "Í"), @("Ãì", "ì"), @("ÃÌ", "Ì"), @("Ãî", "î"), @("ÃÎ", "Î"), @("Ãï", "ï"), @("ÃÏ", "Ï"),
    @("Ãñ", "ñ"), @("ÃÑ", "Ñ"),
    @("Ãó", "ó"), @("ÃÓ", "Ó"), @("Ãô", "ô"), @("ÃÔ", "Ô"), @("Ãõ", "õ"), @("ÃÕ", "Õ"), @("Ãö", "ö"), @("ÃÖ", "Ö"),
    @("Ãú", "ú"), @("ÃÚ", "Ú"), @("Ãù", "ù"), @("ÃÙ", "Ù"), @("Ãû", "û"), @("ÃÛ", "Û"), @("Ãü", "ü"), @("ÃÜ", "Ü"),
    @("Ãœ", "Ü"), @("Ãœ", "Ü"),
    @("Ãº", "ú"), @("Ãª", "ê"), @("Ã£", "ã"), @("Ã§", "ç"), @("Ã³", "ó"), @("Ã¡", "á"), @("Ãµ", "õ"),
    @("Ã‰", "É"), @("Ã“", "Ó"), @("Ãš", "Ú")
  )

  $out = $text
  foreach ($pair in $pairs) {
    $out = $out.Replace($pair[0], $pair[1])
  }
  return $out
#>
}

function Can-EncodeWindows1252([string] $text) {
  try {
    $enc = [System.Text.Encoding]::GetEncoding(
      1252,
      [System.Text.EncoderFallback]::ExceptionFallback,
      [System.Text.DecoderFallback]::ExceptionFallback
    )
    [void]$enc.GetBytes($text)
    return $true
  } catch {
    return $false
  }
}

$encodingReplacementChar = [char]0xFFFD

$cp1252Strict = [System.Text.Encoding]::GetEncoding(
  1252,
  [System.Text.EncoderFallback]::ExceptionFallback,
  [System.Text.DecoderFallback]::ExceptionFallback
)

$changed = New-Object System.Collections.Generic.List[string]
$skipped = New-Object System.Collections.Generic.List[string]

foreach ($root in $Roots) {
  if (-not (Test-Path -LiteralPath $root)) { continue }

  $files =
    Get-ChildItem -LiteralPath $root -File -Recurse -Force |
    Where-Object {
      $ext = $_.Extension
      if ($IncludeExtensions -contains "") {
        # Allow extensionless files too
        return ($IncludeExtensions -contains $ext -or [string]::IsNullOrWhiteSpace($ext))
      }
      return ($IncludeExtensions -contains $ext)
    }

  foreach ($file in $files) {
    $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
    $textUtf8 = [System.Text.Encoding]::UTF8.GetString($bytes)

    if (-not (Should-FixMojibake -text $textUtf8)) { continue }

    $fixed = Fix-MojibakeUtf8AsCp1252 -text $textUtf8
    $fixedHasReplacement = $fixed.Contains($encodingReplacementChar)

    if ($fixedHasReplacement -or -not (Can-EncodeWindows1252 -text $fixed)) {
      # Fallback: selective replacement only (avoids damaging valid UTF-8 punctuation like “—” or “€”).
      $fixed2 = Fix-MojibakeSelective -text $textUtf8
      if ($fixed2 -ne $textUtf8 -and (Can-EncodeWindows1252 -text $fixed2)) {
        $fixed = $fixed2
      } else {
        $skipped.Add($file.FullName) | Out-Null
        continue
      }
    }

    if ($DryRun) {
      $changed.Add($file.FullName) | Out-Null
      continue
    }

    $rel = Resolve-Path -LiteralPath $file.FullName | ForEach-Object {
      $_.Path.Substring((Resolve-Path -LiteralPath (Get-Location).Path).Path.Length).TrimStart("\")
    }
    $backupPath = Join-Path $BackupRoot $rel
    $backupDir = Split-Path -Parent $backupPath
    if (-not (Test-Path -LiteralPath $backupDir)) {
      New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    }
    [System.IO.File]::WriteAllBytes($backupPath, $bytes)

    $outBytes = $cp1252Strict.GetBytes($fixed)
    [System.IO.File]::WriteAllBytes($file.FullName, $outBytes)

    $changed.Add($file.FullName) | Out-Null
  }
}

Write-Host ("Changed: " + $changed.Count)
foreach ($p in $changed) { Write-Host ("  " + $p) }

if ($skipped.Count -gt 0) {
  Write-Host ("Skipped (cannot encode to Windows-1252): " + $skipped.Count)
  foreach ($p in $skipped) { Write-Host ("  " + $p) }
}
