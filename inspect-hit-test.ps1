param([int]$ProcessId)

Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class NativeWindowProbe {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  public delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr hwnd, int index);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
}
'@

$window = [IntPtr]::Zero
$proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
if ($proc) { $window = [IntPtr]$proc.MainWindowHandle }
if ($window -eq [IntPtr]::Zero) {
  # Fall back to an explicit top-level enumeration for processes that do not
  # expose MainWindowHandle through the PowerShell process wrapper.
  $found = [hashtable]::Synchronized(@{ Handle = [IntPtr]::Zero })
  [NativeWindowProbe]::EnumWindows({ param($hwnd, $unused)
    [uint32]$owner = 0
    [NativeWindowProbe]::GetWindowThreadProcessId($hwnd, [ref]$owner) | Out-Null
    if ($owner -eq [uint32]$ProcessId -and [NativeWindowProbe]::IsWindowVisible($hwnd)) {
      $found.Handle = $hwnd
      return $false
    }
    return $true
  }, [IntPtr]::Zero) | Out-Null
  $window = $found.Handle
}

if ($null -eq $window) { throw "No visible top-level window found for PID $ProcessId" }
$rect = New-Object NativeWindowProbe+RECT
[NativeWindowProbe]::GetWindowRect($window, [ref]$rect) | Out-Null
$style = [uint64][int64][NativeWindowProbe]::GetWindowLongPtr($window, -16)
$thickFrame = (($style -band 0x00040000) -ne 0)

function Hit([int]$x, [int]$y) {
  # WM_NCHITTEST expects signed screen coordinates packed as two 16-bit words.
  $packed = ([int64]($x -band 0xffff)) -bor (([int64]($y -band 0xffff)) -shl 16)
  $lParam = [IntPtr]$packed
  return [NativeWindowProbe]::SendMessage($window, 0x0084, [IntPtr]::Zero, $lParam).ToInt32()
}

$points = [ordered]@{
  topLeft = @(($rect.Left + 2), ($rect.Top + 2)); top = @(($rect.Left + 400), ($rect.Top + 2)); topRight = @(($rect.Right - 2), ($rect.Top + 2));
  left = @(($rect.Left + 2), ($rect.Top + 300)); right = @(($rect.Right - 2), ($rect.Top + 300));
  bottomLeft = @(($rect.Left + 2), ($rect.Bottom - 2)); bottom = @(($rect.Left + 400), ($rect.Bottom - 2)); bottomRight = @(($rect.Right - 2), ($rect.Bottom - 2));
  center = @(($rect.Left + 400), ($rect.Top + 300))
}
$names = @{ 1='HTCLIENT'; 10='HTLEFT'; 11='HTRIGHT'; 12='HTTOP'; 13='HTTOPLEFT'; 14='HTTOPRIGHT'; 15='HTBOTTOM'; 16='HTBOTTOMLEFT'; 17='HTBOTTOMRIGHT' }
[pscustomobject]@{ PID=$ProcessId; HWND=('0x{0:X}' -f $window.ToInt64()); Rect="$($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom)"; Style=('0x{0:X8}' -f $style); WS_THICKFRAME=$thickFrame; HitTests=($points.GetEnumerator() | ForEach-Object { $code=Hit $_.Value[0] $_.Value[1]; "{0}={1}({2})" -f $_.Key,$code,$names[$code] }) -join ' ' }
