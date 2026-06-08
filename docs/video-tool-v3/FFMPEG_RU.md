# Video Tool v3: FFmpeg/FFprobe

## 1. Общие требования

Все prepared sources и outputs:

- `mp4`;
- вертикальный формат `720x1280`;
- `24fps`;
- video codec `libx264`;
- pixel format `yuv420p`;
- audio codec `aac`, stereo, `48000Hz`;
- если source без audio stream, добавляется silent audio fallback;
- `+faststart`.

## 2. Quality presets

```ts
type VideoQualityPreset = 'fast' | 'standard' | 'high';

const presets = {
  fast: { preset: 'veryfast', crf: 28 },
  standard: { preset: 'medium', crf: 23 },
  high: { preset: 'slow', crf: 20 }
};
```

## 3. Probe исходника

Команда:

```text
ffprobe -v error
  -print_format json
  -show_format
  -show_streams
  <input>
```

Валидация:

- есть video stream;
- duration > 0;
- duration <= 60 минут;
- width/height > 0;
- файл читается с диска;
- размер файла > 0.

Ошибка probe переводит source в `PREPARE_FAILED`.

## 4. Prepare source

Команда:

```text
ffmpeg -y
  -i <input>
  [-f lavfi -t <durationSec> -i "anullsrc=channel_layout=stereo:sample_rate=48000"]
  -map 0:v:0
  -map <sourceAudioOrSilentAudio>
  -vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=24,setsar=1"
  -af "aresample=async=1:first_pts=0,apad"
  -c:v libx264
  -preset <preset>
  -crf <crf>
  -pix_fmt yuv420p
  -c:a aac
  -b:a 128k
  -ar 48000
  -ac 2
  -shortest
  -movflags +faststart
  <tmpOutput>
```

После команды:

1. `ffprobe <tmpOutput>`.
2. Проверить `720x1280`.
3. Проверить наличие audio stream.
4. Проверить duration > 0.
5. Проверить file size > 0.
6. Посчитать sha256.
7. Атомарно перенести tmp в prepared path.

## 5. Render item

Input:

- intro segment;
- tail segment;
- оба segment читаются из prepared sources.

Команда:

```text
ffmpeg -y
  -i <introPrepared>
  -i <tailPrepared>
  -filter_complex "
    [0:v]trim=start=<introStartSec>:end=<introEndSec>,setpts=PTS-STARTPTS[v0];
    [0:a]atrim=start=<introStartSec>:end=<introEndSec>,asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo[a0];
    [1:v]trim=start=<tailStartSec>:end=<tailEndSec>,setpts=PTS-STARTPTS[v1];
    [1:a]atrim=start=<tailStartSec>:end=<tailEndSec>,asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo[a1];
    [v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]
  "
  -map "[v]"
  -map "[a]"
  -c:v libx264
  -preset <preset>
  -crf <crf>
  -pix_fmt yuv420p
  -c:a aac
  -b:a 128k
  -ar 48000
  -ac 2
  -movflags +faststart
  <tmpOutput>
```

Если prepared input без audio stream, вместо `[N:a]atrim...` используется `anullsrc` нужной длительности.

После команды:

1. `ffprobe <tmpOutput>`.
2. Проверить `720x1280`.
3. Проверить наличие audio stream.
4. Проверить duration примерно равен `introDuration + tailDuration`.
5. Проверить file size > 0.
6. Посчитать sha256.
7. Атомарно перенести tmp в export output path.

## 6. Progress

Предпочтительно запускать FFmpeg с:

```text
-progress pipe:1 -nostats
```

Парсить:

```text
out_time_ms=<number>
progress=continue|end
```

Расчет:

```ts
progress = Math.floor((outTimeMs / expectedDurationMs) * 100)
```

Ограничить:

- во время работы max `99`;
- после успешной проверки файла `100`.

## 7. Отмена

Каждый render/prepare должен иметь `AbortSignal`.

Поведение:

- сначала отправить SIGTERM;
- через 5 секунд SIGKILL;
- удалить только tmp output;
- финальный output не удалять без явного retry.

## 8. Частые ошибки

- `Invalid data found when processing input`: source failed.
- `No space left on device`: job failed, показать ошибку диска.
- `Output file is empty`: render failed.
- `Conversion failed`: render failed.

Любая ошибка FFmpeg не должна падать процесс Electron.
