param(
  [int]$Snapshots = 3,
  [int]$SleepSeconds = 65,
  [double]$ScoreJumpThreshold = 8
)

$ErrorActionPreference = 'Stop'

if ($Snapshots -lt 2) {
  throw 'Snapshots must be at least 2.'
}

$samples = @()
for ($i = 1; $i -le $Snapshots; $i++) {
  $rows = Invoke-RestMethod -Uri 'http://localhost:5000/api/scanner/results' -TimeoutSec 20
  $samples += ,([PSCustomObject]@{
    idx = $i
    ts = (Get-Date).ToString('o')
    rows = $rows
  })

  if ($i -lt $Snapshots) {
    Start-Sleep -Seconds $SleepSeconds
  }
}

$symbols = @($samples[0].rows | ForEach-Object { $_.symbol })
$transitionsPerSymbol = $Snapshots - 1
$flipRows = @()

foreach ($sym in $symbols) {
  $flipCount = 0
  $scoreJumps = 0
  $biasFlips = 0
  $signalFlips = 0
  $degradeFlips = 0

  for ($j = 1; $j -lt $samples.Count; $j++) {
    $prev = $samples[$j - 1].rows | Where-Object { $_.symbol -eq $sym } | Select-Object -First 1
    $curr = $samples[$j].rows | Where-Object { $_.symbol -eq $sym } | Select-Object -First 1

    if ($null -eq $prev -or $null -eq $curr) {
      continue
    }

    $prevBias = if ($prev.timeframeStack) { $prev.timeframeStack.bias } else { 'n/a' }
    $currBias = if ($curr.timeframeStack) { $curr.timeframeStack.bias } else { 'n/a' }
    $scoreDelta = [math]::Abs([double]$curr.breakoutScore - [double]$prev.breakoutScore)

    $didFlip = $false

    if ($prev.breakoutSignal -ne $curr.breakoutSignal) {
      $signalFlips++
      $didFlip = $true
    }

    if ($prevBias -ne $currBias) {
      $biasFlips++
      $didFlip = $true
    }

    if (([bool]$prev.isDegraded) -ne ([bool]$curr.isDegraded)) {
      $degradeFlips++
      $didFlip = $true
    }

    if ($scoreDelta -ge $ScoreJumpThreshold) {
      $scoreJumps++
      $didFlip = $true
    }

    if ($didFlip) {
      $flipCount++
    }
  }

  $flipRows += [PSCustomObject]@{
    symbol = $sym
    transitions = $transitionsPerSymbol
    flipTransitions = $flipCount
    signalFlips = $signalFlips
    biasFlips = $biasFlips
    degradeFlips = $degradeFlips
    scoreJumpsGeThreshold = $scoreJumps
  }
}

$totalTransitions = ($flipRows | Measure-Object transitions -Sum).Sum
$totalFlipTransitions = ($flipRows | Measure-Object flipTransitions -Sum).Sum
$flipRate = if ($totalTransitions -gt 0) {
  [math]::Round(($totalFlipTransitions / [double]$totalTransitions) * 100, 2)
} else {
  0
}

Write-Output ("AUDIT snapshots=$Snapshots transitionsPerSymbol=$transitionsPerSymbol symbols=$($symbols.Count) totalTransitions=$totalTransitions totalFlipTransitions=$totalFlipTransitions flipRatePct=$flipRate")
$flipRows | Sort-Object symbol | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
