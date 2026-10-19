# Generates the PWA launcher icons from the club crest.
#
# The icons are committed, so a build never reaches for a CDN or an image service. Run this only
# when the crest changes:
#   pwsh scripts/make-pwa-icons.ps1
#
# 512 is the largest size the manifest asks for. The crest is 320px, so the 512 is an upscale. It
# is the best source the club has supplied; replace it with a vector crest when the club sends one
# (docs/PLAN.md, decision 11).

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$crestPath = Join-Path $root "public\brand\igcc-crest.png"
$outDir = Join-Path $root "public\icons"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$crest = [System.Drawing.Image]::FromFile($crestPath)

function Save-Icon {
  param(
    [int]$Size,
    [string]$Name,
    [double]$Inset = 0
  )

  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $background = [System.Drawing.Color]::FromArgb(7, 61, 46)
  $graphics.Clear($background)

  $padding = [int]($Size * $Inset)
  $inner = $Size - ($padding * 2)
  $graphics.DrawImage($crest, $padding, $padding, $inner, $inner)

  $path = Join-Path $outDir $Name
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
  Write-Output "wrote $path"
}

# The launcher icon. The crest already has a light background of its own.
Save-Icon -Size 192 -Name "icon-192.png"
Save-Icon -Size 512 -Name "icon-512.png"
Save-Icon -Size 180 -Name "apple-touch-icon.png"

# Maskable icons are cropped to a circle on some launchers, so keep the crest inside the safe zone.
Save-Icon -Size 512 -Name "maskable-512.png" -Inset 0.14

$crest.Dispose()
