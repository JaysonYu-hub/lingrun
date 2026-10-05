param([string]$Jdk='C:/Program Files/Microsoft/jdk-17.0.12.7-hotspot',[switch]$Unsigned)
$ErrorActionPreference='Stop'
$appRoot=$PSScriptRoot
$version=Get-Content -Raw (Join-Path $appRoot 'version.json') | ConvertFrom-Json
$sdkPlatform=Join-Path $appRoot '.tools/platform/android-35-ext15/android.jar'
$sdkTools=Join-Path $appRoot '.tools/build-tools/android-15'
$originalSource=Join-Path $appRoot 'app/src/main'
# Windows aapt2 cannot reliably consume non-ASCII paths. Use an isolated ASCII staging directory.
$buildDir=Join-Path ([IO.Path]::GetTempPath()) ('trackcheck-build-'+[Guid]::NewGuid().ToString('N'))
$sourceRoot=Join-Path $buildDir 'source'
$distDir=Join-Path $appRoot 'dist'
if(!(Test-Path -LiteralPath $sdkPlatform) -or !(Test-Path -LiteralPath (Join-Path $sdkTools 'aapt2.exe'))) { throw 'SDK missing. Run setup-tools.ps1 first.' }
function Run-Native([string]$exe,[string[]]$arguments) { & $exe @arguments; if($LASTEXITCODE -ne 0){throw "$exe failed: $LASTEXITCODE"} }
New-Item -ItemType Directory -Force -Path $buildDir,$distDir,(Join-Path $buildDir 'generated'),(Join-Path $buildDir 'classes'),(Join-Path $buildDir 'dex') | Out-Null
Run-Native 'node' @((Join-Path $appRoot 'prepare-assets.cjs'))
Copy-Item -LiteralPath $originalSource -Destination $sourceRoot -Recurse
Copy-Item -LiteralPath $sdkPlatform -Destination (Join-Path $buildDir 'android.jar')
$sdkPlatform=Join-Path $buildDir 'android.jar'
Run-Native (Join-Path $sdkTools 'aapt2.exe') @('compile','--dir',(Join-Path $sourceRoot 'res'),'-o',(Join-Path $buildDir 'resources.zip'))
Run-Native (Join-Path $sdkTools 'aapt2.exe') @('link','-o',(Join-Path $buildDir 'base.apk'),'-I',$sdkPlatform,'--manifest',(Join-Path $sourceRoot 'AndroidManifest.xml'),'--java',(Join-Path $buildDir 'generated'),'-A',(Join-Path $sourceRoot 'assets'),(Join-Path $buildDir 'resources.zip'))
$javaSources=@(Get-ChildItem (Join-Path $sourceRoot 'java'),(Join-Path $buildDir 'generated') -Recurse -Filter '*.java' | ForEach-Object { '"'+$_.FullName.Replace('\','/')+'"' })
$sourceList=Join-Path $buildDir 'sources.txt'
[IO.File]::WriteAllLines($sourceList,$javaSources,(New-Object Text.UTF8Encoding($false)))
Run-Native (Join-Path $Jdk 'bin/javac.exe') @('-encoding','UTF-8','-source','8','-target','8','-classpath',$sdkPlatform,'-d',(Join-Path $buildDir 'classes'),('@'+$sourceList))
$classFiles=@(Get-ChildItem (Join-Path $buildDir 'classes') -Recurse -Filter '*.class' | ForEach-Object { $_.FullName })
$dexArgs=@('-cp',(Join-Path $sdkTools 'lib/d8.jar'),'com.android.tools.r8.D8','--release','--min-api','26','--lib',$sdkPlatform,'--output',(Join-Path $buildDir 'dex'))+$classFiles
Run-Native (Join-Path $Jdk 'bin/java.exe') $dexArgs
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::Open((Join-Path $buildDir 'base.apk'),[IO.Compression.ZipArchiveMode]::Update)
try { foreach($dex in (Get-ChildItem (Join-Path $buildDir 'dex') -Filter '*.dex')) { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$dex.FullName,$dex.Name) | Out-Null } } finally { $zip.Dispose() }
$unsignedApk=Join-Path $buildDir 'aligned.apk'
Run-Native (Join-Path $sdkTools 'zipalign.exe') @('-f','4',(Join-Path $buildDir 'base.apk'),$unsignedApk)
if($Unsigned) { Write-Output $unsignedApk; exit 0 }
$signing=Join-Path $appRoot '.signing'
New-Item -ItemType Directory -Force -Path $signing | Out-Null
$keyFile=Join-Path $signing 'beta.p12'; $passwordFile=Join-Path $signing 'password.txt'
if(!(Test-Path -LiteralPath $keyFile)) {
    $randomBytes=New-Object byte[] 32; $rng=[Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($randomBytes); $rng.Dispose()
    [IO.File]::WriteAllText($passwordFile,[Convert]::ToBase64String($randomBytes),(New-Object Text.UTF8Encoding($false)))
    Run-Native (Join-Path $Jdk 'bin/keytool.exe') @('-genkeypair','-keystore',$keyFile,'-storetype','PKCS12','-storepass:file',$passwordFile,'-alias','trackcheck-beta','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=TrackCheck Beta, O=Local Testing','-noprompt')
}
if(!(Test-Path -LiteralPath $passwordFile)) { throw 'Existing signing key password missing. Restore backup; do not create a replacement key.' }
$apk=Join-Path $distDir ('trackcheck-'+$version.versionName+'.apk')
Run-Native (Join-Path $Jdk 'bin/java.exe') @('-jar',(Join-Path $sdkTools 'lib/apksigner.jar'),'sign','--ks',$keyFile,'--ks-key-alias','trackcheck-beta','--ks-pass',('file:'+$passwordFile),'--out',$apk,$unsignedApk)
Run-Native (Join-Path $Jdk 'bin/java.exe') @('-jar',(Join-Path $sdkTools 'lib/apksigner.jar'),'verify','--verbose','--print-certs',$apk)
Get-FileHash -LiteralPath $apk -Algorithm SHA256 | Format-List
