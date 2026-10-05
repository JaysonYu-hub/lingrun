$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$toolRoot=Join-Path $PSScriptRoot '.tools'
New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null
$packages=@(
    @{Name='platform';Url='https://dl.google.com/android/repository/platform-35-ext15_r01.zip';Sha1='ce757091f933b7ac646bf197ce8957cc73b95614'},
    @{Name='build-tools';Url='https://dl.google.com/android/repository/build-tools_r35_windows.zip';Sha1='af059bb67cf7786f45ee0db85e2d24985df1b4b6'}
)
foreach($package in $packages){$archive=Join-Path $toolRoot ($package.Name+'.zip');if(!(Test-Path -LiteralPath $archive)){Invoke-WebRequest -Uri $package.Url -OutFile $archive -TimeoutSec 240};if((Get-FileHash -LiteralPath $archive -Algorithm SHA1).Hash -ne $package.Sha1){throw ($package.Name+' checksum mismatch')};Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $toolRoot $package.Name) -Force}
Write-Output 'SDK packages verified against Google repository checksums. See Google Android SDK license terms.'
$jsonJar=Join-Path $toolRoot 'json-test.jar'
if(!(Test-Path -LiteralPath $jsonJar)){Invoke-WebRequest -Uri 'https://repo.maven.apache.org/maven2/org/json/json/20240303/json-20240303.jar' -OutFile $jsonJar -TimeoutSec 60}
if((Get-FileHash -LiteralPath $jsonJar -Algorithm SHA256).Hash -ne '3CF6CD6892E32E2B4C1C39E0F52F5248A2F5B37646FDFBB79A66B46B618414ED'){throw 'Host-test JSON library checksum mismatch'}
Write-Output 'Host-only org.json test library verified; Android uses its built-in JSON library.'
