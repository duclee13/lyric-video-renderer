# Lyric Video Renderer

Automated minimalist retro-pop kinetic typography lyric video generator powered by **WhisperX** (Python CPU word-level forced alignment), **Remotion v4** (React/TypeScript), and **GitHub Actions**.

Upload an `.mp3` file — or an `.mp3` + `lyrics.txt` for 100% exact wording on remixes or Vietnamese vocals — and get a rendered `.mp4` lyric video automatically as a downloadable workflow artifact.

---

## Visual Style

- **Canvas Presets (30 fps):** `4:3` (`1080×810`, default), `9:16` (`1080×1920`), and `1:1` (`1080×1080`).
- **Alternating Dual-Tone Palette (Hard Cut on Every Phrase):**
  - `light`: Soft lavender radial gradient (`#D29BFF` → `#B476E8`) with deep purple typography (`#2B084A`) and a solid 5-pointed star emblem.
  - `dark`: Deep purple radial gradient (`#2B084A` → `#1F0536`) with lavender typography (`#C98BF5`) and an outlined 5-pointed star emblem.
- **Kinetic Typography:** Bold uppercase `Montserrat` (800/900) with full **Latin & Vietnamese diacritic** support, max 3 lines with responsive auto-sizing, directional horizontal motion-blur entrance (`<feGaussianBlur stdDeviation="16 0" />` decaying to `0 0`), subtle horizontal pop (`scaleX` `1.15 → 1.0`), continuous floating wobble (`±1.4°`, `±3.6px`), and retro analog vignette + bloom.

---

## Repository Structure

```text
.
├── .github/workflows/render-lyrics.yml   # Automated CI/CD CPU render pipeline
├── input/                                # Drop .mp3 (and optional lyrics.txt) here
├── scripts/
│   ├── align.py                          # WhisperX CPU transcription + forced alignment
│   └── build_scenes.py                   # Phrase grouping (2-6 words) & 30fps timeline
├── remotion/
│   ├── public/                           # Bundled runtime audio (audio.mp3)
│   └── src/
│       ├── index.ts                      # Remotion entry point
│       ├── Root.tsx                      # Dynamic calculateMetadata composition
│       ├── LyricVideo.tsx                # Audio + active scene controller
│       ├── theme.ts                      # Presets & dual-tone palette tokens
│       ├── types.ts                      # Shared TypeScript schema
│       ├── utils/layout.ts               # Responsive max-3-line phrase layout
│       └── components/
│           ├── Scene.tsx                 # Dual-tone backdrop & floating phrase block
│           ├── WordReveal.tsx            # Directional horizontal SVG motion blur reveal
│           ├── StarEmblem.tsx            # Pulsing bottom-center 5-pointed star
│           └── Vignette.tsx              # Retro edge vignette & soft center bloom
├── web/                                  # Next.js App Router + Tailwind dashboard (Vercel)
│   ├── .env.example                      # Server-side GitHub PAT & optional passphrase vars
│   └── src/
│       ├── lib/                          # GitHub REST client & constant-time auth
│       └── app/
│           ├── page.tsx                  # Dark studio upload, progress & video preview UI
│           └── api/                      # /api/render, /api/status, /api/download, /api/runs
└── requirements.txt                      # Python / WhisperX dependencies
```

---

## Option 1: Web Dashboard on Vercel (Recommended)

The `web/` Next.js app provides a drag-and-drop studio UI for uploading `.mp3` files (`<= 4.2 MB`), pasting optional lyrics, tracking live GitHub Actions steps, previewing the finished `.mp4`, and browsing recent renders. Vercel only serves the thin UI and API routes; all WhisperX + Remotion compute stays on GitHub Actions.

### Deploy to Vercel

1. Create a **Fine-Grained GitHub Personal Access Token** scoped to `duclee13/lyric-video-renderer` with:
   - **Contents:** Read and write *(uploads `input/jobs/<jobId>/audio.mp3` with `[skip ci]`)*
   - **Actions:** Read and write *(dispatches `render-lyrics.yml`, polls job steps, downloads MP4 artifacts)*
2. In Vercel, click **Add New → Project** and import `duclee13/lyric-video-renderer`.
3. Set **Root Directory** to `web`.
4. Add **Environment Variables** (server-side only — see `web/.env.example`):
   - `GITHUB_TOKEN`: your Fine-Grained PAT
   - `GITHUB_OWNER`: `duclee13` *(default)*
   - `GITHUB_REPO`: `lyric-video-renderer` *(default)*
   - `GITHUB_BRANCH`: `main` *(default)*
   - `APP_PASSWORD`: *(optional)* studio passphrase required by the UI and all API routes so public visitors cannot consume your Actions minutes
5. Click **Deploy**.

### Local Web Dev

```bash
cd web
cp .env.example .env.local   # fill in GITHUB_TOKEN (and optional APP_PASSWORD)
npm install
npm run dev
```

---

## Option 2: Direct GitHub Actions (No Web UI)

### A. Push to `input/` (Zero-Touch)

1. Commit and push an `.mp3` file into `input/` (for example, `input/my-song.mp3`).
2. *(Optional — recommended for remixes or Vietnamese vocals)* Also include either:
   - `input/my-song.txt` (matching filename stem), or
   - `input/lyrics.txt`
   with one phrase/line per row. Section labels such as `[Verse 1]` or `[Chorus]` are automatically ignored.
3. GitHub Actions automatically triggers **Render Lyric Video**, runs WhisperX + Remotion on `ubuntu-latest`, and publishes **`lyric-video`** (`lyric-video.mp4`) under the workflow run's **Artifacts** tab.

### B. Manual Trigger (`workflow_dispatch`)

1. Open **Actions → Render Lyric Video → Run workflow**.
2. Configure inputs:
   - **`audio_path`**: Path to an `.mp3` in the repo (leave blank to auto-pick the newest `input/*.mp3`).
   - **`lyrics_text`**: Optional pasted lyrics (use `\n` for line breaks if pasting in a single line).
   - **`aspect_ratio`**: `4:3` (`1080×810`), `9:16` (`1080×1920`), or `1:1` (`1080×1080`).
   - **`whisper_model`**: `tiny`, `base`, `small` (default), or `medium`.
   - **`language`**: `auto` (default), `en`, `vi`, etc.
3. Download **`lyric-video`** (`lyric-video.mp4`) from the completed run's **Artifacts**.

---

## Option 3: Local Preview & Rendering

### Prerequisites

- **Python 3.10–3.12**
- **Node.js 20+**
- **FFmpeg** (`ffmpeg` and `ffprobe` on `PATH`)

### 1. Install Dependencies

```bash
# Python (CPU PyTorch + WhisperX)
python3 -m venv .venv
source .venv/bin/activate
pip install --index-url https://download.pytorch.org/whl/cpu torch torchaudio
pip install -r requirements.txt

# Remotion
cd remotion
npm install
cd ..
```

### 2. Align Audio & Build Scenes

**Mode A — MP3 Only (Auto-Transcribe + Forced Alignment):**

```bash
python scripts/align.py \
  --audio input/song.mp3 \
  --language auto \
  --model small \
  --output data/words.json
```

**Mode B — MP3 + `lyrics.txt` (100% Exact Text + Forced Alignment):**

```bash
python scripts/align.py \
  --audio input/song.mp3 \
  --lyrics input/lyrics.txt \
  --language auto \
  --model small \
  --output data/words.json
```

**Build Remotion Scene Timeline:**

```bash
cp input/song.mp3 remotion/public/audio.mp3

python scripts/build_scenes.py \
  --words data/words.json \
  --audio input/song.mp3 \
  --lyrics input/lyrics.txt \
  --aspect-ratio 4:3 \
  --audio-src audio.mp3 \
  --output data/scenes.json
```

### 3. Live Preview in Remotion Studio

```bash
cd remotion
# Opens interactive preview with built-in demo scenes (or pass --props=../data/scenes.json)
npx remotion studio src/index.ts --props=../data/scenes.json
```

### 4. Render MP4 Locally

```bash
cd remotion
npx remotion render src/index.ts LyricVideo ../out/lyric-video.mp4 \
  --props=../data/scenes.json \
  --codec=h264 \
  --crf=18
```

---

## Script Reference

| Script | Key Options | Output |
| --- | --- | --- |
| `scripts/align.py` | `--audio`, `--lyrics`, `--language`, `--model`, `--output`, `--batch-size`, `--align-model` | `data/words.json` |
| `scripts/build_scenes.py` | `--words`, `--audio`, `--lyrics`, `--output`, `--fps`, `--min-words`, `--max-words`, `--max-chars`, `--pause-threshold`, `--aspect-ratio`, `--audio-src` | `data/scenes.json` |
