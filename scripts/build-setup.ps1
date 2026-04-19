[CmdletBinding()]
param(
  [switch]$Publish
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$artifactDir = Join-Path $projectRoot "dist-electron"
$licenseSource = Join-Path $projectRoot "build/installer-policy-tr.txt"
$licenseOutput = Join-Path $projectRoot "build/installer-policy-tr-cp1254.txt"
$logoSource = Join-Path $projectRoot "public/setuplogo.png"
$sidebarBmp = Join-Path $projectRoot "build/installerSidebar.bmp"
$headerBmp = Join-Path $projectRoot "build/installerHeader.bmp"
$dotenvPath = Join-Path $projectRoot ".env"
$dotenvLocalPath = Join-Path $projectRoot ".env.local"

function Import-DotEnvFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  if (-not (Test-Path $Path)) {
    return
  }

  $lines = [System.IO.File]::ReadAllLines($Path)
  foreach ($line in $lines) {
    $trimmed = $line.Trim()

    if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
      continue
    }

    $delimiterIndex = $trimmed.IndexOf("=")
    if ($delimiterIndex -lt 1) {
      continue
    }

    $key = $trimmed.Substring(0, $delimiterIndex).Trim()
    if ([string]::IsNullOrWhiteSpace($key)) {
      continue
    }

    if (Test-Path "Env:$key") {
      continue
    }

    $value = $trimmed.Substring($delimiterIndex + 1).Trim()
    if (
      $value.Length -ge 2 -and
      (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    [Environment]::SetEnvironmentVariable($key, $value, "Process")
  }
}

function Write-NsisLicenseFile {
  param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$OutputPath
  )

  if (-not (Test-Path $SourcePath)) {
    throw "License source file not found: $SourcePath"
  }

  $utf8 = [System.Text.UTF8Encoding]::new($false)
  $text = [System.IO.File]::ReadAllText($SourcePath, $utf8)
  $normalized = $text -replace "`r?`n", "`r`n"

  $turkishCodePage = [System.Text.Encoding]::GetEncoding(1254)
  [System.IO.File]::WriteAllBytes($OutputPath, $turkishCodePage.GetBytes($normalized))
}

function New-InstallerBitmap {
  param(
    [Parameter(Mandatory = $true)][string]$SourcePng,
    [Parameter(Mandatory = $true)][string]$OutputBmp,
    [Parameter(Mandatory = $true)][int]$Width,
    [Parameter(Mandatory = $true)][int]$Height
  )

  if (-not (Test-Path $SourcePng)) {
    throw "Logo source image not found: $SourcePng"
  }

  Add-Type -AssemblyName System.Drawing

  $sourceImage = [System.Drawing.Image]::FromFile($SourcePng)
  try {
    $bitmap = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

        $padding = [Math]::Max(8, [Math]::Round([Math]::Min($Width, $Height) * 0.08))
        $targetWidth = [Math]::Max(1, $Width - (2 * $padding))
        $targetHeight = [Math]::Max(1, $Height - (2 * $padding))
        $scale = [Math]::Min($targetWidth / $sourceImage.Width, $targetHeight / $sourceImage.Height)

        $drawWidth = [Math]::Max(1, [int][Math]::Round($sourceImage.Width * $scale))
        $drawHeight = [Math]::Max(1, [int][Math]::Round($sourceImage.Height * $scale))
        $drawX = [int][Math]::Floor(($Width - $drawWidth) / 2)
        $drawY = [int][Math]::Floor(($Height - $drawHeight) / 2)

        $graphics.DrawImage($sourceImage, $drawX, $drawY, $drawWidth, $drawHeight)
      }
      finally {
        $graphics.Dispose()
      }

      $bitmap.Save($OutputBmp, [System.Drawing.Imaging.ImageFormat]::Bmp)
    }
    finally {
      $bitmap.Dispose()
    }
  }
  finally {
    $sourceImage.Dispose()
  }
}

function Assert-PublishEnvironment {
  $requiredVars = @("GH_TOKEN", "GH_OWNER", "GH_REPO")
  $missingVars = @()

  foreach ($name in $requiredVars) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if ([string]::IsNullOrWhiteSpace($value)) {
      $missingVars += $name
    }
  }

  if ($missingVars.Count -gt 0) {
    throw "Publish mode requires environment variables: $($missingVars -join ', ')"
  }
}

Write-Host "[1/5] Policy: PowerShell process execution policy -> Bypass"
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

Push-Location $projectRoot
try {
  $totalSteps = if ($Publish) { 6 } else { 5 }
  $builderArgs = @("--win", "nsis", "--x64")

  if ($Publish) {
    Write-Host "[2/$totalSteps] Publish mode env loading (.env -> .env.local) + validation"
    Import-DotEnvFile -Path $dotenvPath
    Import-DotEnvFile -Path $dotenvLocalPath
    Assert-PublishEnvironment

    $builderArgs += @(
      "--publish",
      "always",
      "-c.publish.provider=github",
      "-c.publish.owner=$([Environment]::GetEnvironmentVariable('GH_OWNER'))",
      "-c.publish.repo=$([Environment]::GetEnvironmentVariable('GH_REPO'))",
      "-c.publish.releaseType=release"
    )
  }

  $assetsStep = if ($Publish) { 3 } else { 2 }
  $nextBuildStep = if ($Publish) { 4 } else { 3 }
  $installerStep = if ($Publish) { 5 } else { 4 }
  $artifactStep = if ($Publish) { 6 } else { 5 }

  Write-Host "[$assetsStep/$totalSteps] Preparing NSIS assets (license encoding + installer visuals)"
  Write-NsisLicenseFile -SourcePath $licenseSource -OutputPath $licenseOutput
  New-InstallerBitmap -SourcePng $logoSource -OutputBmp $sidebarBmp -Width 164 -Height 314
  New-InstallerBitmap -SourcePng $logoSource -OutputBmp $headerBmp -Width 150 -Height 57

  Write-Host "[$nextBuildStep/$totalSteps] Web build: Next.js production build baslatiliyor"
  pnpm build
  if (-not $?) {
    throw "Next.js build adimi basarisiz oldu."
  }

  if ($Publish) {
    Write-Host "[$installerStep/$totalSteps] Installer publish: electron-builder (win nsis x64 + GitHub release) baslatiliyor"
  } else {
    Write-Host "[$installerStep/$totalSteps] Installer build: electron-builder (win nsis x64) baslatiliyor"
  }

  & pnpm exec electron-builder @builderArgs
  if (-not $?) {
    throw "Installer build adimi basarisiz oldu."
  }

  Write-Host "[$artifactStep/$totalSteps] Artifact output: $artifactDir"
}
finally {
  Pop-Location
}
