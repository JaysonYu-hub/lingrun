param([string]$Jdk='C:/Program Files/Microsoft/jdk-17.0.12.7-hotspot')
$ErrorActionPreference='Stop';$appRoot=$PSScriptRoot
& (Join-Path $appRoot 'build.ps1') -Jdk $Jdk
$version=Get-Content -Raw (Join-Path $appRoot 'version.json') | ConvertFrom-Json
$dist=Join-Path $appRoot 'dist';$apk=Join-Path $dist ('LingRun-'+$version.versionName+'.apk')
$apkSigner=Join-Path $appRoot '.tools/build-tools/android-15/lib/apksigner.jar'
$signature=& (Join-Path $Jdk 'bin/java.exe') -jar $apkSigner verify --print-certs $apk
if($LASTEXITCODE -ne 0){throw 'Signature verification failed'}
$cert=($signature | Where-Object {$_ -match '^Signer #1 certificate SHA-256 digest:'}) -replace '^Signer #1 certificate SHA-256 digest:\s*',''
if(!$cert){throw 'No signer digest'}
$releasePath=Join-Path $dist 'release.json'
if(Test-Path -LiteralPath $releasePath){$previousRelease=Get-Content -Raw $releasePath | ConvertFrom-Json;if($previousRelease.signerCertificateSha256 -ne $cert){throw 'Signing certificate changed; refuse to publish an incompatible update'}}
$metadata=[ordered]@{schema=1;applicationId=$version.applicationId;versionName=$version.versionName;versionCode=$version.versionCode;channel=$version.channel;fileName=[IO.Path]::GetFileName($apk);bytes=(Get-Item $apk).Length;sha256=(Get-FileHash $apk -Algorithm SHA256).Hash.ToLowerInvariant();signerCertificateSha256=$cert;minAndroidApi=$version.minAndroidApi;targetAndroidApi=$version.targetAndroidApi;realDeviceStatus='PENDING';releaseStage=$version.releaseStage;baselineValidation=$version.baselineValidation;foregroundOnly=$version.foregroundOnly;backgroundExperimental=$version.backgroundExperimental;distribution='manual-local-file';generatedAt=[DateTimeOffset]::Now.ToString('o')}
[IO.File]::WriteAllText($releasePath,($metadata|ConvertTo-Json -Depth 5),(New-Object Text.UTF8Encoding($false)))
Copy-Item -LiteralPath (Join-Path $appRoot 'CHANGELOG.md') -Destination (Join-Path $dist '更新记录.md') -Force
Copy-Item -LiteralPath (Join-Path $appRoot '内测版使用说明.md') -Destination (Join-Path $dist '内测版使用说明.md') -Force
Copy-Item -LiteralPath (Join-Path $appRoot '新手快速开始.md') -Destination (Join-Path $dist '新手快速开始.md') -Force
$publicFiles=@((Join-Path $dist '新手快速开始.md'),(Join-Path $dist '内测版使用说明.md'),$apk,$releasePath,(Join-Path $dist '更新记录.md'))
Copy-Item -LiteralPath (Join-Path $appRoot '问题反馈使用指南.md') -Destination (Join-Path $dist '问题反馈使用指南.md') -Force
$publicFiles+=Join-Path $dist '问题反馈使用指南.md'
$kit=Join-Path $dist ('trackcheck-app-'+$version.versionName+'.zip')
Compress-Archive -LiteralPath $publicFiles -DestinationPath $kit -Force
Write-Output ('App package: '+$kit)
Write-Output 'Includes APK + instructions + public release metadata only. No signing keys, credentials or local reports.'
