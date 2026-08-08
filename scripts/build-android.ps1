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

$mappingCreated = $false
try {
  if (-not (Test-Path 'V:\')) {
    & subst.exe 'V:' $projectRoot
    $mappingCreated = $true
  }
  $env:JAVA_HOME = 'V:\.tools\jdk-dist\jdk-17.0.20+8'
  $env:ANDROID_SDK_ROOT = 'V:\.tools\android-sdk'
  $env:ANDROID_HOME = $env:ANDROID_SDK_ROOT
  $env:TEMP = 'V:\.tmp'
  $env:TMP = $env:TEMP
  $env:NODE_ENV = 'production'
  $env:GRADLE_OPTS = '-Dhttps.protocols=TLSv1.2 -Djdk.tls.client.protocols=TLSv1.2 -Dhttp.keepAlive=false'

  Push-Location 'V:\android'
  try { & .\gradlew.bat assembleRelease --no-daemon } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw "Gradle failed with exit code $LASTEXITCODE" }

  Copy-Item -LiteralPath 'V:\android\app\build\outputs\apk\release\app-release.apk' -Destination (Join-Path $projectRoot 'Veader-0.1.0.apk') -Force
  Write-Host "APK: $(Join-Path $projectRoot 'Veader-0.1.0.apk')"
} finally {
  if ($mappingCreated) { & subst.exe 'V:' '/D' }
}
