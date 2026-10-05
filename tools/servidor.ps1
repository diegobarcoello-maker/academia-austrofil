# Servidor local para probar la Academia en Windows sin instalar nada (solo PowerShell).
# Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File tools\servidor.ps1 [-Puerto 8765]
# Abre http://localhost:8765/ (también responde en /academia-austrofil/, como GitHub Pages).
# localhost cuenta como sitio seguro: el service worker y el modo sin internet funcionan igual que publicados.
param([int]$Puerto = 8765, [string]$Raiz = (Split-Path -Parent $PSScriptRoot))

$Raiz = [System.IO.Path]::GetFullPath($Raiz)
$tipos = @{
  ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8"; ".js" = "text/javascript; charset=utf-8";
  ".json" = "application/json; charset=utf-8"; ".webmanifest" = "application/manifest+json"; ".png" = "image/png";
  ".woff2" = "font/woff2"; ".svg" = "image/svg+xml"; ".ico" = "image/x-icon"; ".md" = "text/plain; charset=utf-8"
}
$escucha = New-Object System.Net.HttpListener
$escucha.Prefixes.Add("http://localhost:$Puerto/")
$escucha.Start()
Write-Host "Academia en http://localhost:$Puerto/  (carpeta $Raiz)  Ctrl+C para cerrar"
try {
  while ($escucha.IsListening) {
    $ctx = $escucha.GetContext()
    $res = $ctx.Response
    try {
      $ruta = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
      if ($ruta.StartsWith("/academia-austrofil/")) { $ruta = $ruta.Substring("/academia-austrofil".Length) }
      if ($ruta.EndsWith("/")) { $ruta += "index.html" }
      $archivo = [System.IO.Path]::GetFullPath((Join-Path $Raiz ($ruta.TrimStart("/") -replace "/", "\")))
      if (-not $archivo.StartsWith($Raiz) -or -not (Test-Path -LiteralPath $archivo -PathType Leaf)) {
        $res.StatusCode = 404
        $bytes = [System.Text.Encoding]::UTF8.GetBytes("No existe: $ruta")
        $res.ContentType = "text/plain; charset=utf-8"
      } else {
        $bytes = [System.IO.File]::ReadAllBytes($archivo)
        $ext = [System.IO.Path]::GetExtension($archivo).ToLower()
        $res.ContentType = $(if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { "application/octet-stream" })
        $res.Headers.Add("Cache-Control", "no-cache")
      }
      $res.ContentLength64 = $bytes.Length
      if ($ctx.Request.HttpMethod -ne "HEAD") { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
      Write-Host ("{0} {1} {2}" -f $res.StatusCode, $ctx.Request.HttpMethod, $ctx.Request.Url.PathAndQuery)
    } catch {
      Write-Host ("ERROR " + $_.Exception.Message)
    } finally {
      $res.Close()
    }
  }
} finally {
  $escucha.Stop()
}
