$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$toolRoot=Join-Path $PSScriptRoot '.tools'
New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null
$packages=@(
    @{Name='platform';Url='https://dl.google.com/android/repository/platform-35-ext15_r01.zip';Sha1='ce757091f933b7ac646bf197ce8957cc73b95614'},
    @{Name='build-tools';Url='https://dl.google.com/android/repository/build-tools_r35_windows.zip';Sha1='af059bb67cf7786f45ee0db85e2d24985df1b4b6'}
)
foreach($package in $packages){$archive=Join-Path $toolRoot ($package.Name+'.zip');if(!(Test-Path -LiteralPath $archive)){Invoke-WebRequest -Uri $package.Url -OutFile $archive -TimeoutSec 240};if((Get-FileHash -LiteralPath $archive -Algorithm SHA1).Hash -ne $package.Sha1){throw ($package.Name+' checksum mismatch')};Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $toolRoot $package.Name) -Force}
Write-Output 'SDK packages verified against Google repository checksums. See Google Android SDK license terms.'
