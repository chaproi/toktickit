param([Parameter(Mandatory=$true)][string]$RepositoryRoot,
      [Parameter(Mandatory=$true)][string]$EvidenceDirectory,
      [Parameter(Mandatory=$true)][string]$PrivateDirectory,
      [Parameter(Mandatory=$true)][ValidateRange(1,4)][int]$RunIndex)
$ErrorActionPreference='Stop'
$plan=Get-Content -Raw -LiteralPath (Join-Path $EvidenceDirectory 'plan.json') | ConvertFrom-Json
$version=$plan.order[$RunIndex-1].version
$expectedHead=$plan.versions.$version
$tree=Join-Path $RepositoryRoot ".worktrees\t47-abba-20261104-$($version.ToLowerInvariant())"
$server=Join-Path $tree 'server'
$label=('{0:d2}-{1}' -f $RunIndex,$version)
$destination=Join-Path $EvidenceDirectory $label
if(Test-Path -LiteralPath $destination){throw 'Run evidence already exists; no replacement execution permitted'}
if($RunIndex -gt 1){
 $previousVersion=$plan.order[$RunIndex-2].version
 $previousLabel=('{0:d2}-{1}' -f ($RunIndex-1),$previousVersion)
 $previous=Get-Content -Raw -LiteralPath (Join-Path $EvidenceDirectory "$previousLabel\execution.json") | ConvertFrom-Json
 if(!$previous.safeToContinue){throw 'Previous cleanup/compatibility gate failed; abort sequence'}
}
New-Item -ItemType Directory -Path $destination | Out-Null
if(!('AbbaNative' -as [type])){
 Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class AbbaNative {
 [StructLayout(LayoutKind.Sequential)] public struct Power { public byte ACLineStatus,BatteryFlag,BatteryLifePercent,SystemStatusFlag; public uint BatteryLifeTime,BatteryFullLifeTime; }
 [StructLayout(LayoutKind.Sequential)] public struct Memory { public uint Length,Load; public ulong TotalPhys,AvailPhys,TotalPageFile,AvailPageFile,TotalVirtual,AvailVirtual,AvailExtendedVirtual; }
 [DllImport("kernel32.dll")] public static extern bool GetSystemTimes(out long idle,out long kernel,out long user);
 [DllImport("kernel32.dll")] public static extern bool GetSystemPowerStatus(out Power power);
 [DllImport("kernel32.dll")] public static extern bool GlobalMemoryStatusEx(ref Memory memory);
}
'@
}
function Snapshot {
 $idle=0L;$kernel=0L;$user=0L
 $cpuOk=[AbbaNative]::GetSystemTimes([ref]$idle,[ref]$kernel,[ref]$user)
 $power=New-Object AbbaNative+Power;$powerOk=[AbbaNative]::GetSystemPowerStatus([ref]$power)
 $memory=New-Object AbbaNative+Memory;$memory.Length=[Runtime.InteropServices.Marshal]::SizeOf($memory)
 $memoryOk=[AbbaNative]::GlobalMemoryStatusEx([ref]$memory)
 $processes=@()
 foreach($kind in @('node','postgres','powershell')){
  foreach($item in [Diagnostics.Process]::GetProcessesByName($kind)){
   try {$processes+=@{id=$item.Id;kind=$kind;cpuMs=$item.TotalProcessorTime.TotalMilliseconds;workingSetBytes=$item.WorkingSet64}}
   catch {} finally {$item.Dispose()}
  }
 }
 [pscustomobject]@{atUtc=[DateTime]::UtcNow.ToString('o');monotonicTicks=[Diagnostics.Stopwatch]::GetTimestamp();cpuAvailable=$cpuOk;idle100ns=$idle;kernel100ns=$kernel;user100ns=$user;powerAvailable=$powerOk;acLine=if($powerOk){[int]$power.ACLineStatus}else{$null};batteryPercent=if($powerOk){[int]$power.BatteryLifePercent}else{$null};memoryAvailable=$memoryOk;availableRamBytes=if($memoryOk){$memory.AvailPhys}else{$null};totalRamBytes=if($memoryOk){$memory.TotalPhys}else{$null};processes=$processes}
}
function Scheme { ((& powercfg /getactivescheme) -join "`n").Trim() }
function Workloads {
 @(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(node|weed)(\.exe)?$' -and $_.CommandLine -match 'toktickit|vitest|prisma|playwright|seed' } | ForEach-Object { @{id=$_.ProcessId;kind=$_.Name} })
}
function Probe {
 $output=(& node --import tsx (Join-Path $EvidenceDirectory 'guard-probe.mjs'))
 if($LASTEXITCODE -ne 0){throw 'Independent dedicated database/cleanup probe failed; values withheld'}
 ($output -join "`n") | ConvertFrom-Json
}
function SaveJson($value,$file) { [IO.File]::WriteAllText($file,($value|ConvertTo-Json -Depth 30)+"`n",(New-Object Text.UTF8Encoding($false))) }
$record=[ordered]@{index=$RunIndex;version=$version;expectedHead=$expectedHead;command='npm.cmd test -- tests/lab-04/performance-smoke.integration.test.ts';executionStarted=$false;safeToContinue=$false;observerIntervalMs=1000;observerProcessId=$PID;error=$null}
$priorValidation=$env:TOKTICKIT_T47_VALIDATE_ONLY
$previousLocation=Get-Location
$process=$null;$samples=New-Object 'System.Collections.Generic.List[object]'
try {
 Set-Location -LiteralPath $server
 $head=(& git rev-parse HEAD).Trim();if($head -ne $expectedHead){throw 'Unexpected isolated revision'}
 & git diff --quiet HEAD; if($LASTEXITCODE -ne 0){throw 'Tracked source/index differs from pinned revision'}
 foreach($property in $plan.matchedTrackedFileSha256.PSObject.Properties){
  if((Get-FileHash -LiteralPath (Join-Path $tree $property.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $property.Value){throw 'Matched workload/dependency/settings hash changed'}
 }
 $competitors=Workloads;if($competitors.Count){throw 'Competing repository workload; abort before execution'}
 $record.preflight=Probe
 $before=Snapshot;$schemeBefore=Scheme
 $record.externalBefore=$before;$record.powerSchemeBefore=$schemeBefore
 if(!$before.powerAvailable -or $before.acLine -eq 255 -or !$schemeBefore){throw 'Power baseline unavailable; matched-condition gate cannot be established'}
 if($RunIndex -eq 1){SaveJson @{acLine=$before.acLine;scheme=$schemeBefore;packages=$record.preflight.packages;node=$record.preflight.node;postgres=$record.preflight.versions} (Join-Path $EvidenceDirectory 'condition-baseline.json')}
 else {
  $baseline=Get-Content -Raw -LiteralPath (Join-Path $EvidenceDirectory 'condition-baseline.json')|ConvertFrom-Json
  if($baseline.acLine -ne $before.acLine -or $baseline.scheme -ne $schemeBefore){throw 'Power conditions changed; abort sequence'}
  if(($baseline.packages|ConvertTo-Json -Compress) -ne ($record.preflight.packages|ConvertTo-Json -Compress) -or $baseline.node -ne $record.preflight.node -or ($baseline.postgres|ConvertTo-Json -Compress) -ne ($record.preflight.versions|ConvertTo-Json -Compress)){throw 'Runtime/database settings changed; abort sequence'}
 }
 $artifactDirectory=Join-Path $tree 'artifacts\lab-04\hardening'
 $priorArtifacts=@(Get-ChildItem -LiteralPath $artifactDirectory -Filter 't47-performance-*-measurement-*.json'|ForEach-Object {$_.Name})
 Remove-Item Env:TOKTICKIT_T47_VALIDATE_ONLY -ErrorAction SilentlyContinue
 $npm=(Get-Command npm.cmd).Source
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName=$env:ComSpec;$info.Arguments='/d /s /c ""'+$npm+'" test -- tests/lab-04/performance-smoke.integration.test.ts"'
 $info.WorkingDirectory=$server;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $process=New-Object Diagnostics.Process;$process.StartInfo=$info
 $record.startedAtUtc=[DateTime]::UtcNow.ToString('o');$clock=[Diagnostics.Stopwatch]::StartNew()
 if(!$process.Start()){throw 'Benchmark process failed to start'}
 $record.executionStarted=$true
 $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
 $samples.Add((Snapshot))
 while(!$process.WaitForExit(1000)){$samples.Add((Snapshot))}
 $process.WaitForExit();$clock.Stop();$samples.Add((Snapshot))
 $record.finishedAtUtc=[DateTime]::UtcNow.ToString('o');$record.seconds=$clock.Elapsed.TotalSeconds;$record.exit=$process.ExitCode
 $out=$stdout.GetAwaiter().GetResult();$err=$stderr.GetAwaiter().GetResult()
 [IO.File]::WriteAllText((Join-Path $PrivateDirectory "$label-stdout.log"),$out,(New-Object Text.UTF8Encoding($false)))
 [IO.File]::WriteAllText((Join-Path $PrivateDirectory "$label-stderr.log"),$err,(New-Object Text.UTF8Encoding($false)))
 $record.testSummary=@([regex]::Matches($out,'(?m)^\s*(Test Files|Tests|Duration)\s+[^\r\n]+')|ForEach-Object {$_.Value.Trim()})
 $record.externalAfter=Snapshot;$record.powerSchemeAfter=Scheme
 SaveJson @($samples) (Join-Path $destination 'external-samples.json')
 $newArtifacts=@(Get-ChildItem -LiteralPath $artifactDirectory -Filter 't47-performance-*-measurement-*.json'|Where-Object {$_.Name -notin $priorArtifacts})
 if($newArtifacts.Count -ne 1){throw 'Expected exactly one newly retained workload artifact; abort sequence'}
 $raw=$newArtifacts[0];$target=Join-Path $destination $raw.Name
 Copy-Item -LiteralPath $raw.FullName -Destination $target
 if((Get-FileHash -LiteralPath $raw.FullName).Hash -ne (Get-FileHash -LiteralPath $target).Hash){throw 'Artifact copy checksum mismatch'}
 $record.artifact=$raw.Name;$record.artifactSha256=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
 $business=Get-Content -Raw -LiteralPath $target|ConvertFrom-Json
 $record.artifactHead=$business.executionHead
 $record.cleanup=Probe
 $record.competingProcessesAfter=@(Workloads)
 $powerStable=($record.externalAfter.acLine -eq $before.acLine -and $record.powerSchemeAfter -eq $schemeBefore -and @($samples|Where-Object { !$_.powerAvailable -or $_.acLine -ne $before.acLine }).Count -eq 0)
 $record.powerStable=$powerStable
 $record.completeWorkload=($business.warmup.count -eq 5000 -and $business.measured.count -eq 500 -and $business.samples.Count -eq 5500)
 $record.safeToContinue=($powerStable -and $record.completeWorkload -and $record.artifactHead -eq $expectedHead -and $record.competingProcessesAfter.Count -eq 0)
 if(!$record.safeToContinue){throw 'Post-run compatible-conditions gate failed; no substitute run'}
} catch {
 $record.error='Comparison preflight/execution/cleanup gate failed; details retained privately; no replacement run.'
 throw
} finally {
 if($process){$process.Dispose()}
 if($null -eq $priorValidation){Remove-Item Env:TOKTICKIT_T47_VALIDATE_ONLY -ErrorAction SilentlyContinue}else{$env:TOKTICKIT_T47_VALIDATE_ONLY=$priorValidation}
 Set-Location -LiteralPath $previousLocation
 SaveJson $record (Join-Path $destination 'execution.json')
}
[pscustomobject]@{index=$RunIndex;version=$version;exit=$record.exit;seconds=$record.seconds;safeToContinue=$record.safeToContinue;summary=$record.testSummary} | ConvertTo-Json -Depth 5
