param(
    [Parameter(Mandatory=$true)][string]$Out,
    [int]$CropTop = 130,
    [int]$CropBottom = 0
)

Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue

if (-not ("Win32Helper" -as [type])) {
    Add-Type @"
using System; using System.Runtime.InteropServices;
public class Win32Helper {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
}

$proc = Get-Process | Where-Object { $_.MainWindowTitle -like "*Domaine BENHALIMA*" } | Select-Object -First 1
if (-not $proc) { Write-Output "ERROR: Chrome window not found"; exit 1 }

[Win32Helper]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null
[Win32Helper]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 600

$r = New-Object Win32Helper+RECT
[Win32Helper]::GetWindowRect($proc.MainWindowHandle, [ref]$r) | Out-Null
$w = $r.Right - $r.Left
$h = $r.Bottom - $r.Top - $CropTop - $CropBottom
if ($w -le 0 -or $h -le 0) { Write-Output "ERROR: invalid dimensions"; exit 1 }

$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top + $CropTop, 0, 0, [System.Drawing.Size]::new($w, $h))
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "Saved: $Out ($w x $h)"
