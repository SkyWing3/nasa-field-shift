param(
    [Parameter(Mandatory=$true)][string]$TextFile,
    [Parameter(Mandatory=$true)][string]$WavFile,
    [Parameter(Mandatory=$true)][string]$Mp3File,
    [string]$VoiceName = 'Microsoft Helena Desktop',
    [int]$Rate = 0
)
$ErrorActionPreference = 'Stop'
$text = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $TextFile), [Text.Encoding]::UTF8)
$speaker = New-Object -ComObject SAPI.SpVoice
$selected = @($speaker.GetVoices() | Where-Object { $_.GetDescription().StartsWith($VoiceName) })
if ($selected.Count -ne 1) { throw "Voz instalada no encontrada de forma unívoca: $VoiceName" }
$speaker.Voice = $selected[0]
$speaker.Rate = $Rate
$stream = New-Object -ComObject SAPI.SpFileStream
$stream.Format.Type = 22 # SAFT22kHz16BitMono
$stream.Open($WavFile, 3, $false)
try {
    $speaker.AudioOutputStream = $stream
    [void]$speaker.Speak($text, 16) # SVSFIsNotXML: texto literal, no SSML
} finally {
    $stream.Close()
}
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
[void][Windows.Storage.StorageFolder, Windows.Storage, ContentType=WindowsRuntime]
[void][Windows.Media.Transcoding.MediaTranscoder, Windows.Media.Transcoding, ContentType=WindowsRuntime]
[void][Windows.Media.Transcoding.PrepareTranscodeResult, Windows.Media.Transcoding, ContentType=WindowsRuntime]
[void][Windows.Media.MediaProperties.MediaEncodingProfile, Windows.Media.MediaProperties, ContentType=WindowsRuntime]
[void][Windows.Media.MediaProperties.AudioEncodingQuality, Windows.Media.MediaProperties, ContentType=WindowsRuntime]
$asOperation = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
$asProgress = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncActionWithProgress`1'
} | Select-Object -First 1
function AwaitOperation($Operation, $ResultType) {
    $task = $asOperation.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    $task.Wait()
    return $task.Result
}
$inputFile = AwaitOperation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($WavFile)) ([Windows.Storage.StorageFile])
$folder = AwaitOperation ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync([IO.Path]::GetDirectoryName($Mp3File))) ([Windows.Storage.StorageFolder])
$outputFile = AwaitOperation ($folder.CreateFileAsync([IO.Path]::GetFileName($Mp3File), 1)) ([Windows.Storage.StorageFile])
$audioEncodingProfile = [Windows.Media.MediaProperties.MediaEncodingProfile]::CreateMp3([Windows.Media.MediaProperties.AudioEncodingQuality]::Medium)
$transcoder = New-Object Windows.Media.Transcoding.MediaTranscoder
$prepared = AwaitOperation ($transcoder.PrepareFileTranscodeAsync($inputFile, $outputFile, $audioEncodingProfile)) ([Windows.Media.Transcoding.PrepareTranscodeResult])
if (-not $prepared.CanTranscode) { throw "No se puede codificar MP3: $($prepared.FailureReason)" }
$action = $prepared.TranscodeAsync()
$task = $asProgress.MakeGenericMethod([double]).Invoke($null, @($action))
$task.Wait()
Write-Output $selected[0].GetDescription()
