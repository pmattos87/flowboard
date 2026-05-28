Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $root 'assets\logo-noBackground.png'
$outPath = Join-Path $root 'assets\logo-square.png'

$src = [System.Drawing.Image]::FromFile($srcPath)
$size = 1024
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

$ratio = [Math]::Min($size / $src.Width, $size / $src.Height)
$newW = [int]($src.Width * $ratio)
$newH = [int]($src.Height * $ratio)
$x = [int](($size - $newW) / 2)
$y = [int](($size - $newH) / 2)
$g.DrawImage($src, $x, $y, $newW, $newH)

$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $src.Dispose()
Write-Output "Saved: $outPath"
