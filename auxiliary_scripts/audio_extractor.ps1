<#
.SYNOPSIS
Извлекает аудиодорожки из видео, перекодируя неподдерживаемые Chrome форматы в Opus.
.DESCRIPTION
Для каждого видео создаётся папка .audio\<имя_файла>.
- Если аудиокодек поддерживается Chrome (AAC, MP3, Opus, FLAC, Vorbis) – копируется без изменений.
- Если кодек не поддерживается (AC3, DTS, E-AC3, PCM и др.) – перекодируется в Opus (128 kbps).
При повторном запуске существующие файлы не перезаписываются (если не указан -Force).
.PARAMETER SourceDir
Корневая директория для поиска видео (по умолчанию текущая).
.PARAMETER Extensions
Список расширений видео через запятую (по умолчанию .mp4,.mkv,.avi,.mov,.webm).
.PARAMETER Force
Принудительно перезаписывать все существующие аудиофайлы.
.PARAMETER TranscodeBitrate
Битрейт для Opus при перекодировании (по умолчанию 128k).
#>

param(
    [string]$SourceDir = ".",
    [string]$Extensions = ".mp4,.mkv,.avi,.mov,.webm",
    [switch]$Force,
    [string]$TranscodeBitrate = "128k"
)

$OutputEncoding = [System.Text.Encoding]::UTF8
[System.Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[System.Console]::InputEncoding = [System.Text.Encoding]::UTF8

# Проверка ffmpeg/ffprobe
$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
$ffprobe = Get-Command ffprobe -ErrorAction SilentlyContinue
if (-not $ffmpeg -or -not $ffprobe) {
    Write-Error "ffmpeg и ffprobe не найдены в PATH. Установите FFmpeg."
    exit 1
}

# Список кодеков, которые Chrome поддерживает нативно
$chromeSupportedCodecs = @("aac", "mp3", "opus", "flac", "vorbis")

# Маппинг кодека на расширение (для копирования)
$codecToExtension = @{
    "aac"    = "m4a"
    "mp3"    = "mp3"
    "opus"   = "opus"
    "flac"   = "flac"
    "vorbis" = "ogg"
}

$extList = $Extensions -split ',' | ForEach-Object { $_.Trim().ToLower() }
$videoFiles = Get-ChildItem -Path $SourceDir -Recurse -File | Where-Object {
    $extList -contains $_.Extension.ToLower()
}

Write-Host "Найдено $($videoFiles.Count) видеофайлов."

$total = $videoFiles.Count
$i = 0

foreach ($video in $videoFiles) {
    $i++
    Write-Progress -Activity "Обработка видео" -Status $video.Name -PercentComplete (($i / $total) * 100)

    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($video.Name)
    $audioDir = Join-Path $video.DirectoryName ".audio" | Join-Path -ChildPath $baseName

    # Создаём папку, если её нет
    if (-not (Test-Path $audioDir)) {
        try {
            New-Item -ItemType Directory -Path $audioDir -Force -ErrorAction Stop | Out-Null
            Write-Host "Создана папка $audioDir"
        } catch {
            Write-Error "Не удалось создать папку $audioDir : $_"
            continue
        }
    }

    # Получаем информацию о потоках через ffprobe
    $ffprobeArgs = @("-v", "quiet", "-print_format", "json", "-show_streams", $video.FullName)
    $streamInfo = & $ffprobe $ffprobeArgs 2>$null
    if (-not $streamInfo) {
        Write-Warning "Не удалось получить информацию о потоках для $($video.Name). Пропускаем."
        continue
    }

    try {
        $streamInfoObj = $streamInfo | ConvertFrom-Json
    } catch {
        Write-Warning "Ошибка при разборе JSON для $($video.Name): $_"
        continue
    }

    $audioStreams = $streamInfoObj.streams | Where-Object { $_.codec_type -eq "audio" }

    if (-not $audioStreams) {
        Write-Warning "В файле $($video.Name) нет аудиопотоков."
        continue
    }

    $tracksMeta = @()
    $streamIndex = 0
    $extractedCount = 0

    foreach ($stream in $audioStreams) {
        $lang = if ($stream.tags.language) { $stream.tags.language } else { "und" }
        $title = if ($stream.tags.title) { $stream.tags.title } else { "Track $($streamIndex+1)" }
        $codec = $stream.codec_name
        $isSupported = $chromeSupportedCodecs -contains $codec

        # Определяем расширение и параметры кодирования
        if ($isSupported) {
            # Поддерживаемый кодек – копируем без изменений
            $extension = $codecToExtension[$codec]
            if (-not $extension) { $extension = "mka" }
            $ffmpegArgs = @("-c:a", "copy")
            $action = "копирование"
        } else {
            # Неподдерживаемый кодек – перекодируем в Opus
            $extension = "opus"
            $ffmpegArgs = @("-c:a", "libopus", "-b:a", $TranscodeBitrate)
            $action = "перекодирование в Opus ($TranscodeBitrate)"
            Write-Host "  Кодек '$codec' не поддерживается Chrome -> $action"
        }

        $safeTitle = $title -replace '[\\/:*?"<>|]', '_'
        $safeLang = $lang -replace '[\\/:*?"<>|]', '_'
        $trackFileName = "track_$($streamIndex+1)_$safeLang_$safeTitle.$extension"
        $trackFile = Join-Path $audioDir $trackFileName

        # Проверяем, существует ли уже этот файл
        if (Test-Path $trackFile) {
            if (-not $Force) {
                Write-Host "  Дорожка $($streamIndex+1) уже существует: $trackFileName – пропускаем"
                $trackMeta = @{
                    index    = $streamIndex + 1
                    file     = $trackFileName
                    language = $lang
                    title    = $title
                    codec    = $codec
                    bitrate  = $stream.bit_rate
                    duration = $stream.duration
                    transcoded = (-not $isSupported)
                }
                $tracksMeta += $trackMeta
                $streamIndex++
                continue
            } else {
                Write-Host "  Принудительная перезапись дорожки $($streamIndex+1): $trackFileName"
                Remove-Item $trackFile -Force
            }
        }

        # Формируем команду ffmpeg
        $fullFfmpegArgs = @(
            "-i", $video.FullName,
            "-map", "0:$($stream.index)"
        ) + $ffmpegArgs + @(
            "-metadata", "title=$title",
            "-metadata", "language=$lang"
        )
        if (-not $Force) { $fullFfmpegArgs += "-n" }
        $fullFfmpegArgs += $trackFile

        Write-Host "  Извлечение дорожки $($streamIndex+1): $title ($lang) – $action"
        $output = & $ffmpeg $fullFfmpegArgs 2>&1

        if ($LASTEXITCODE -ne 0) {
            Write-Error "    Ошибка: $output"
            if (Test-Path $trackFile) { Remove-Item $trackFile -Force }
            $streamIndex++
            continue
        }

        $trackMeta = @{
            index     = $streamIndex + 1
            file      = $trackFileName
            language  = $lang
            title     = $title
            codec     = if ($isSupported) { $codec } else { "opus" }
            original_codec = if (-not $isSupported) { $codec } else { $null }
            bitrate   = $stream.bit_rate
            duration  = $stream.duration
            transcoded = (-not $isSupported)
        }
        # Удаляем null-поля для чистоты JSON
        if (-not $trackMeta.original_codec) { $trackMeta.Remove('original_codec') }

        $tracksMeta += $trackMeta
        $streamIndex++
        $extractedCount++
    }

    if ($tracksMeta.Count -eq 0) {
        Write-Warning "Не найдено ни одной дорожки для $($video.Name). Папка $audioDir остаётся без изменений."
        continue
    }

    # Сохраняем JSON
    $metaJson = @{
        videoFile = $video.Name
        tracks    = $tracksMeta
    } | ConvertTo-Json -Depth 3

    $jsonFile = Join-Path $audioDir "tracks.json"
    [System.IO.File]::WriteAllText($jsonFile, $metaJson, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Обновлены метаданные в $jsonFile"
}

Write-Progress -Activity "Обработка видео" -Completed
Write-Host "`nГотово!"