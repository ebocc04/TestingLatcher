# Opens a debug Chrome (stay logged into Instagram there once).
# Latch "Grab photos" talks to http://127.0.0.1:7843
param(
  [int]$Port = 7843,
  [int]$DebugPort = 9222
)

$ErrorActionPreference = "Stop"
$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw "Chrome not found." }
$userDir = Join-Path $PSScriptRoot "chrome-debug"

function Test-Debug {
  try {
    Invoke-RestMethod "http://127.0.0.1:$DebugPort/json/version" -TimeoutSec 1 | Out-Null
    return $true
  } catch { return $false }
}

function Ensure-Chrome {
  if (Test-Debug) { return }
  New-Item -ItemType Directory -Force -Path $userDir | Out-Null
  Start-Process $chrome -ArgumentList @(
    "--remote-debugging-port=$DebugPort",
    "--remote-allow-origins=*",
    "--user-data-dir=`"$userDir`"",
    "--no-first-run",
    "--no-default-browser-check",
    "https://www.instagram.com/"
  )
  for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Milliseconds 400
    if (Test-Debug) { return }
  }
  throw "Chrome debug port did not open."
}

function Send-Cdp([string]$wsUrl, [string]$method, $params, [int]$timeoutSec = 45) {
  $ws = New-Object System.Net.WebSockets.ClientWebSocket
  $cts = New-Object Threading.CancellationTokenSource
  $cts.CancelAfter([TimeSpan]::FromSeconds($timeoutSec))
  $ws.ConnectAsync([Uri]$wsUrl, $cts.Token).GetAwaiter().GetResult() | Out-Null
  $id = Get-Random -Minimum 1 -Maximum 999999
  $payload = (@{ id = $id; method = $method; params = $params } | ConvertTo-Json -Compress -Depth 8)
  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $send = New-Object ArraySegment[byte] -ArgumentList @(, $bytes)
  $ws.SendAsync($send, [Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).GetAwaiter().GetResult() | Out-Null
  $ms = New-Object IO.MemoryStream
  $buf = New-Object byte[] 65536
  do {
    $recv = New-Object ArraySegment[byte] -ArgumentList @(, $buf)
    $r = $ws.ReceiveAsync($recv, $cts.Token).GetAwaiter().GetResult()
    $ms.Write($buf, 0, $r.Count)
  } while (-not $r.EndOfMessage)
  $ws.Dispose()
  $raw = [Text.Encoding]::UTF8.GetString($ms.ToArray())
  return $raw | ConvertFrom-Json
}

function Get-PageWs {
  $tabs = Invoke-RestMethod "http://127.0.0.1:$DebugPort/json/list"
  $page = @($tabs | Where-Object { $_.type -eq "page" -and $_.webSocketDebuggerUrl }) | Select-Object -First 1
  if (-not $page) {
    Invoke-RestMethod "http://127.0.0.1:$DebugPort/json/new" | Out-Null
    Start-Sleep -Milliseconds 400
    $tabs = Invoke-RestMethod "http://127.0.0.1:$DebugPort/json/list"
    $page = @($tabs | Where-Object { $_.type -eq "page" -and $_.webSocketDebuggerUrl }) | Select-Object -First 1
  }
  if (-not $page) { throw "No Chrome tab." }
  return $page.webSocketDebuggerUrl
}

function Grab-Profile([string]$pageUrl) {
  Ensure-Chrome
  $ws = Get-PageWs
  Send-Cdp $ws "Page.navigate" @{ url = $pageUrl } | Out-Null
  Start-Sleep -Seconds 4
  $js = @'
(async () => {
  if (/accounts\/login/i.test(location.href)) return { login: true, photos: [] };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 5; i++) {
    window.scrollBy(0, 1000);
    await sleep(350);
  }
  window.scrollTo(0, 0);
  await sleep(250);

  const seen = new Set();
  const candidates = [];
  document.querySelectorAll('main a[href*="/p/"] img, main a[href*="/reel/"] img').forEach((img) => {
    if (img.closest("nav, header, aside, [role='navigation']")) return;
    const src = img.currentSrc || img.src;
    if (!src || seen.has(src)) return;
    if (!/scontent|cdninstagram|fbcdn/i.test(src)) return;
    const w = img.naturalWidth || img.width || 0;
    if (w && w < 140) return;
    seen.add(src);
    candidates.push(img);
  });

  const isPerson = async (img) => {
    try {
      if (window.FaceDetector) {
        const faces = await new FaceDetector({ fastMode: true, maxDetectedFaces: 5 }).detect(img);
        if (faces && faces.length) return true;
      }
    } catch (e) {}
    try {
      const c = document.createElement("canvas");
      const s = 80;
      c.width = s;
      c.height = s;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, s, s);
      const data = ctx.getImageData(0, 0, s, s).data;
      let skin = 0;
      const n = s * s;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        if (r > 60 && g > 30 && b > 15 && r >= g && r > b && max - min > 15 && r - g > 8) skin += 1;
      }
      const p = skin / n;
      return p > 0.07 && p < 0.7;
    } catch (e) {
      return false;
    }
  };

  const out = [];
  for (const img of candidates) {
    if (out.length >= 6) break;
    if (!(await isPerson(img))) continue;
    try {
      const src = img.currentSrc || img.src;
      const blob = await fetch(src).then((r) => r.blob());
      const data = await new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.readAsDataURL(blob);
      });
      out.push(data);
    } catch (e) {}
  }
  return { login: false, photos: out, href: location.href, scanned: candidates.length };
})()
'@
  $res = Send-Cdp $ws "Runtime.evaluate" @{
    expression = $js
    awaitPromise = $true
    returnByValue = $true
  } 90
  $val = $res.result.result.value
  if (-not $val) { throw "Chrome returned nothing. Log into Instagram in the debug window." }
  return $val
}

$listen = [Net.HttpListener]::new()
$listen.Prefixes.Add("http://127.0.0.1:$Port/")
$listen.Start()
Write-Host "Latch Instagram grabber on http://127.0.0.1:$Port"
Write-Host "A Chrome window opens. Log into Instagram there once, then use Grab photos."

while ($listen.IsListening) {
  $ctx = $listen.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  $res.Headers.Add("Access-Control-Allow-Origin", "*")
  $res.Headers.Add("Access-Control-Allow-Methods", "GET, OPTIONS")
  try {
    if ($req.HttpMethod -eq "OPTIONS") {
      $res.StatusCode = 204
    } elseif ($req.Url.AbsolutePath -eq "/grab") {
      $target = $req.QueryString["url"]
      if (-not $target) { throw "missing url" }
      $got = Grab-Profile $target
      $json = $got | ConvertTo-Json -Compress -Depth 6
      $buf = [Text.Encoding]::UTF8.GetBytes($json)
      $res.ContentType = "application/json"
      $res.OutputStream.Write($buf, 0, $buf.Length)
    } else {
      $res.StatusCode = 404
    }
  } catch {
    $res.StatusCode = 500
    $buf = [Text.Encoding]::UTF8.GetBytes(($_.Exception.Message))
    $res.OutputStream.Write($buf, 0, $buf.Length)
  }
  $res.Close()
}
