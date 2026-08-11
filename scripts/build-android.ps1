$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$jdkHome = Join-Path $projectRoot '.tools\jdk-dist\jdk-17.0.20+8'
$androidSdk = Join-Path $projectRoot '.tools\android-sdk'

if (-not (Test-Path (Join-Path $jdkHome 'bin\java.exe'))) {
  throw 'Portable JDK not found under .tools. Reinstall the local Android toolchain.'
}
if (-not (Test-Path (Join-Path $androidSdk 'build-tools\34.0.0'))) {
  throw 'Android Build Tools 34.0.0 not found under .tools.'
}

function Remove-StaleNativeCmakeCaches {
  param(
    [string]$ProjectRoot
  )

  $cacheRoots = @(
    (Join-Path $ProjectRoot 'android\.cxx'),
    (Join-Path $ProjectRoot 'android\app\.cxx'),
    (Join-Path $ProjectRoot 'node_modules\expo-sqlite\android\.cxx')
  )

  foreach ($cacheRoot in $cacheRoots) {
    if (-not (Test-Path -LiteralPath $cacheRoot)) { continue }

    $stale = $false
    $cacheFiles = Get-ChildItem -LiteralPath $cacheRoot -Recurse -Filter 'CMakeCache.txt' -File -ErrorAction SilentlyContinue
    foreach ($cacheFile in $cacheFiles) {
      $content = Get-Content -LiteralPath $cacheFile.FullName -Raw -ErrorAction SilentlyContinue
      foreach ($key in @('CMAKE_COMMAND', 'CMAKE_MAKE_PROGRAM', 'CMAKE_HOME_DIRECTORY')) {
        $line = $content -split "`r?`n" | Where-Object { $_ -match "^${key}:[^=]+=.*$" } | Select-Object -First 1
        if (-not $line) { continue }

        $value = ($line -split '=', 2)[1].Trim()
        if ($value -and -not (Test-Path -LiteralPath $value)) {
          $stale = $true
          break
        }
      }
      if ($stale) { break }
    }

    if ($stale) {
      Write-Host "Removing stale native CMake cache: $cacheRoot"
      Remove-Item -LiteralPath $cacheRoot -Recurse -Force
    }
  }
}

$tempRoot = Join-Path $projectRoot '.tmp'
if (-not (Test-Path -LiteralPath $tempRoot)) {
  New-Item -ItemType Directory -Path $tempRoot | Out-Null
}

$env:JAVA_HOME = $jdkHome
$env:ANDROID_SDK_ROOT = $androidSdk
$env:ANDROID_HOME = $androidSdk
$env:TEMP = $tempRoot
$env:TMP = $tempRoot
$env:NODE_ENV = 'production'
$env:GRADLE_OPTS = '-Dhttps.protocols=TLSv1.2 -Djdk.tls.client.protocols=TLSv1.2 -Dhttp.keepAlive=false'

Remove-StaleNativeCmakeCaches -ProjectRoot $projectRoot

$androidRoot = Join-Path $projectRoot 'android'
Push-Location $androidRoot
# Keep native ABI builds serial on Windows; each Ninja invocation can otherwise
# fan out across all cores and exhaust the process/handle budget.
try { & .\gradlew.bat assembleRelease --no-daemon --max-workers=1 } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw "Gradle failed with exit code $LASTEXITCODE" }

$apkPath = Join-Path $androidRoot 'app\build\outputs\apk\release\app-release.apk'
$outputApk = Join-Path $projectRoot 'Veader-0.1.0.apk'
Copy-Item -LiteralPath $apkPath -Destination $outputApk -Force
Write-Host "APK: $outputApk"
