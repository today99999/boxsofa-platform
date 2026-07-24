param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$OrderArguments
)

$ErrorActionPreference = 'Stop'
$credentialPath = Join-Path $env:USERPROFILE '.codex\credentials\boxsofa-private-email.txt'
$clientPath = Join-Path $PSScriptRoot 'boxsofa_paid_orders.py'
$isSend = $OrderArguments.Count -gt 0 -and $OrderArguments[0] -eq 'send'

if ($isSend -and -not (Test-Path -LiteralPath $credentialPath)) {
  throw 'The encrypted BoxSofa mailbox credential is missing.'
}

$pointer = [IntPtr]::Zero
try {
  if ($isSend) {
    $encrypted = (Get-Content -LiteralPath $credentialPath -Raw).Trim()
    $secure = $encrypted | ConvertTo-SecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $env:BOXSOFA_MAIL_ADDRESS = 'info@boxsofa.eu'
    $env:BOXSOFA_MAIL_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  & python $clientPath @OrderArguments
  if ($LASTEXITCODE -ne 0) {
    throw "Paid-order inspection failed with exit code $LASTEXITCODE."
  }
}
finally {
  Remove-Item Env:BOXSOFA_MAIL_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:BOXSOFA_MAIL_ADDRESS -ErrorAction SilentlyContinue
  if ($pointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}
