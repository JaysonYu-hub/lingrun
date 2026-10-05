param([string]$Jdk='C:/Program Files/Microsoft/jdk-17.0.12.7-hotspot')
$ErrorActionPreference='Stop';$appRoot=$PSScriptRoot
$env:TRACKCHECK_TEST_JDK=$Jdk
& node (Join-Path $appRoot 'prepare-assets.cjs');if($LASTEXITCODE){throw 'asset preparation failed'}
& node --test --experimental-test-isolation=none (Join-Path $appRoot 'tests/assets.test.cjs');if($LASTEXITCODE){throw 'APK asset tests failed'}
$testOutput=Join-Path $appRoot 'build/host-tests';New-Item -ItemType Directory -Force -Path $testOutput | Out-Null
& (Join-Path $Jdk 'bin/javac.exe') -encoding UTF-8 -d $testOutput (Join-Path $appRoot 'app/src/main/java/cn/trackcheck/beta/BrowserPolicy.java') (Join-Path $appRoot 'tests/BrowserPolicyTest.java');if($LASTEXITCODE){throw 'policy test compilation failed'}
& (Join-Path $Jdk 'bin/java.exe') -cp $testOutput cn.trackcheck.beta.BrowserPolicyTest;if($LASTEXITCODE){throw 'policy tests failed'}
& node (Join-Path $appRoot 'tests/generate-native-fixtures.cjs');if($LASTEXITCODE){throw 'fixture generation failed'}
$jsonJar=Join-Path $appRoot '.tools/json-test.jar'
if(!(Test-Path -LiteralPath $jsonJar)){throw 'Host JSON test library missing. See setup-tools.ps1'}
& (Join-Path $Jdk 'bin/javac.exe') -encoding UTF-8 -cp $jsonJar -d $testOutput (Join-Path $appRoot 'app/src/main/java/cn/trackcheck/beta/FeedbackPayload.java') (Join-Path $appRoot 'tests/FeedbackPayloadTest.java');if($LASTEXITCODE){throw 'feedback payload compilation failed'}
& (Join-Path $Jdk 'bin/java.exe') -cp ($testOutput+';'+$jsonJar) cn.trackcheck.beta.FeedbackPayloadTest;if($LASTEXITCODE){throw 'feedback payload tests failed'}
& node --test --experimental-test-isolation=none (Join-Path (Split-Path $appRoot -Parent) 'feedback-server/server.test.mjs');if($LASTEXITCODE){throw 'feedback receiver tests failed'}
& (Join-Path $Jdk 'bin/javac.exe') -encoding UTF-8 -cp $jsonJar -d $testOutput (Join-Path $appRoot 'app/src/main/java/cn/trackcheck/beta/BrowserPolicy.java') (Join-Path $appRoot 'app/src/main/java/cn/trackcheck/beta/RunPolicy.java') (Join-Path $appRoot 'app/src/main/java/cn/trackcheck/beta/RequestSigner.java') (Join-Path $appRoot 'app/src/main/java/cn/trackcheck/beta/NativeApi.java') (Join-Path $appRoot 'tests/NativeRuntimeTest.java');if($LASTEXITCODE){throw 'native test compilation failed'}
& (Join-Path $Jdk 'bin/java.exe') -cp ($testOutput+';'+$jsonJar) cn.trackcheck.beta.NativeRuntimeTest (Join-Path $appRoot 'build/fixtures/native-policy.tsv') (Join-Path $appRoot 'build/fixtures/signatures.json');if($LASTEXITCODE){throw 'native runtime tests failed'}
Push-Location (Split-Path $appRoot -Parent)
& node (Join-Path $appRoot 'tests/lifecycle-callsite.cjs');if($LASTEXITCODE){throw 'Activity restart call-site regression failed'}
& (Join-Path $Jdk 'bin/javac.exe') -encoding UTF-8 -d $testOutput (Join-Path $appRoot 'app/src/main/java/cn/trackcheck/beta/ScreenState.java') (Join-Path $appRoot 'tests/ScreenStateTest.java');if($LASTEXITCODE){throw 'screen test compilation failed'}
& (Join-Path $Jdk 'bin/java.exe') -cp $testOutput cn.trackcheck.beta.ScreenStateTest;if($LASTEXITCODE){throw 'screen classification failed'}
& (Join-Path $Jdk 'bin/javac.exe') -encoding UTF-8 -cp $jsonJar -d $testOutput (Join-Path $appRoot 'app/src/main/java/cn/trackcheck/beta/RunPresentation.java') (Join-Path $appRoot 'tests/RunPresentationTest.java');if($LASTEXITCODE){throw 'presentation test compilation failed'}
& (Join-Path $Jdk 'bin/java.exe') -cp ($testOutput+';'+$jsonJar) cn.trackcheck.beta.RunPresentationTest;if($LASTEXITCODE){throw 'presentation tests failed'}
& (Join-Path $Jdk 'bin/javac.exe') -encoding UTF-8 -cp ($testOutput+';'+$jsonJar) -d $testOutput (Join-Path $appRoot 'app/src/main/java/cn/trackcheck/beta/LabPlatform.java') (Join-Path $appRoot 'tests/ReportRegressionTest.java') (Join-Path $appRoot 'tests/LabPlatformTest.java');if($LASTEXITCODE){throw 'report/simulation test compilation failed'}
& (Join-Path $Jdk 'bin/java.exe') -cp ($testOutput+';'+$jsonJar) cn.trackcheck.beta.ReportRegressionTest;if($LASTEXITCODE){throw 'reported regression failed'}
& (Join-Path $Jdk 'bin/java.exe') -cp ($testOutput+';'+$jsonJar) cn.trackcheck.beta.LabPlatformTest;if($LASTEXITCODE){throw 'simulation pipeline failed'}
& node (Join-Path $appRoot 'tests/service-callsite.cjs');if($LASTEXITCODE){throw 'service call-site regression failed'}
& node (Join-Path $appRoot 'tests/background-setup-callsite.cjs');if($LASTEXITCODE){throw 'background permission routing regression failed'}
try { & npm test;if($LASTEXITCODE){throw 'shared engine regression failed'} } finally { Pop-Location }
