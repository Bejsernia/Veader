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
    (Join-Path $ProjectRoot 'node_modules\expo-sqlite\android\.cxx'),
    (Join-Path $ProjectRoot 'node_modules\react-native-reanimated\android\.cxx')
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

  # Reanimated keeps one CMake tree for every ABI. On Windows, reusing the
  # x86_64 tree after other ABI builds can leave Ninja with an invalid process
  # command even when the cached paths are still present. This directory is
  # generated and safe to recreate for a release build.
  $reanimatedCmake = Join-Path $ProjectRoot 'node_modules\react-native-reanimated\android\.cxx'
  if (Test-Path -LiteralPath $reanimatedCmake) {
    Write-Host "Removing generated Reanimated CMake cache: $reanimatedCmake"
    Remove-Item -LiteralPath $reanimatedCmake -Recurse -Force
  }
}

function Prepare-ReleaseJsBundle {
  param(
    [string]$ProjectRoot
  )

  $releaseAssets = Join-Path $ProjectRoot 'android\app\build\generated\assets\createBundleReleaseJsAndAssets'
  $releaseResources = Join-Path $ProjectRoot 'android\app\build\generated\res\createBundleReleaseJsAndAssets'
  $intermediateMaps = Join-Path $ProjectRoot 'android\app\build\intermediates\sourcemaps\react\release'
  $generatedMaps = Join-Path $ProjectRoot 'android\app\build\generated\sourcemaps\react\release'
  $generatedRoots = @($releaseAssets, $releaseResources, $intermediateMaps, $generatedMaps)

  foreach ($generatedRoot in $generatedRoots) {
    if (Test-Path -LiteralPath $generatedRoot) {
      Remove-Item -LiteralPath $generatedRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Path $generatedRoot -Force | Out-Null
  }

  $node = (Get-Command node -ErrorAction Stop).Source
  $expoCli = Join-Path $ProjectRoot 'node_modules\expo\node_modules\@expo\cli\build\bin\cli'
  $bundle = Join-Path $releaseAssets 'index.android.bundle'
  $packagerMap = Join-Path $intermediateMaps 'index.android.bundle.packager.map'
  $compilerMap = Join-Path $intermediateMaps 'index.android.bundle.compiler.map'
  $sourceMap = Join-Path $generatedMaps 'index.android.bundle.map'
  $hermes = Join-Path $ProjectRoot 'node_modules\react-native\sdks\hermesc\win64-bin\hermesc.exe'

  Write-Host 'Preparing Android release JavaScript bundle directly (Windows Gradle workaround)...'
  & $node $expoCli export:embed --platform android --dev false --reset-cache --max-workers 1 --entry-file 'node_modules\expo\AppEntry.js' --bundle-output $bundle --assets-dest $releaseResources --sourcemap-output $packagerMap --minify false --verbose
  if ($LASTEXITCODE -ne 0) { throw "Expo bundle failed with exit code $LASTEXITCODE" }

  $hermesOutput = "$bundle.hbc"
  & $hermes -emit-binary -max-diagnostic-width=80 -out $hermesOutput $bundle -O -output-source-map
  if ($LASTEXITCODE -ne 0) { throw "Hermes compilation failed with exit code $LASTEXITCODE" }

  Move-Item -LiteralPath $hermesOutput -Destination $bundle -Force
  Move-Item -LiteralPath "$hermesOutput.map" -Destination $compilerMap -Force

  # The composed source map is only useful for debugging and is not required
  # in the APK. On Windows, composing the Hermes and Metro maps can hang after
  # the bundle has already been generated, which prevents Gradle from starting.
  Write-Host 'Skipping optional source-map composition for Android release build.'
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
$env:VEADER_NODE_EXECUTABLE = (Get-Command node -ErrorAction Stop).Source
$env:CMAKE_BUILD_PARALLEL_LEVEL = '1'
$env:GRADLE_OPTS = '-Dhttps.protocols=TLSv1.2 -Djdk.tls.client.protocols=TLSv1.2 -Dhttp.keepAlive=false'
$androidArchitectures = if ($env:VEADER_ANDROID_ARCHITECTURES) { $env:VEADER_ANDROID_ARCHITECTURES } else { 'arm64-v8a' }
Write-Host "Android architectures: $androidArchitectures"

Remove-StaleNativeCmakeCaches -ProjectRoot $projectRoot
Prepare-ReleaseJsBundle -ProjectRoot $projectRoot

$androidRoot = Join-Path $projectRoot 'android'
Push-Location $androidRoot
# Keep native ABI builds serial on Windows; each Ninja invocation can otherwise
# fan out across all cores and exhaust the process/handle budget.
try { & .\gradlew.bat assembleRelease --no-daemon --max-workers=1 "-PreactNativeArchitectures=$androidArchitectures" -PveaderPrebuiltBundle=true } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw "Gradle failed with exit code $LASTEXITCODE" }

$apkPath = Join-Path $androidRoot 'app\build\outputs\apk\release\app-release.apk'
$outputApk = Join-Path $projectRoot 'Veader-0.1.0.apk'
Copy-Item -LiteralPath $apkPath -Destination $outputApk -Force
Write-Host "APK: $outputApk"
