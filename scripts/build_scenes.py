#!/usr/bin/env python3
"""Group word-level timestamps into kinetic typography scenes for Remotion.

Reads ``data/words.json`` (and optional line breaks from ``lyrics.txt``),
groups words into punchy 2-6 word phrases using pause gaps (> 0.35s) and
word/character limits, assigns strictly alternating ``light`` / ``dark``
themes, probes the audio duration via ``ffprobe``, and writes ``data/scenes.json``.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
import unicodedata
from pathlib import Path
from typing import Any

SECTION_HEADER_RE = re.compile(r"^\s*\[[^\]]+\]\s*$")
HARD_PUNCT_RE = re.compile(r"[.!?;…]+[\"”’')\]]*$")


def probe_audio_duration(audio_path: Path) -> float | None:
    """Return audio duration in seconds via ffprobe, or None if unavailable."""
    if not audio_path.is_file():
        return None
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(audio_path),
    ]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        )
        raw = proc.stdout.strip()
        if raw:
            val = float(raw)
            if math.isfinite(val) and val > 0:
                return val
    except (subprocess.SubprocessError, ValueError, FileNotFoundError) as exc:
        print(
            f"[build_scenes] Warning: ffprobe failed for {audio_path} ({exc}).",
            file=sys.stderr,
            flush=True,
        )
    return None


def _load_lyrics_line_breaks(lyrics_path: Path) -> list[list[str]]:
    """Parse non-empty non-header lines from lyrics.txt into word lists."""
    text = unicodedata.normalize("NFC", lyrics_path.read_text(encoding="utf-8-sig"))
    lines: list[list[str]] = []
    for raw_line in text.splitlines():
        stripped = raw_line.strip()
        if not stripped or SECTION_HEADER_RE.match(stripped):
            continue
        tokens = stripped.split()
        if tokens:
            lines.append(tokens)
    return lines


def _attach_line_indices_from_lyrics(
    words: list[dict[str, Any]],
    lyrics_path: Path,
) -> list[dict[str, Any]]:
    """Attach line_index to words when lyrics.txt is supplied separately."""
    if not words or any("line_index" in w and w["line_index"] is not None for w in words):
        return words

    lyric_lines = _load_lyrics_line_breaks(lyrics_path)
    flat_line_indices: list[int] = []
    for line_idx, tokens in enumerate(lyric_lines):
        flat_line_indices.extend([line_idx] * len(tokens))

    if len(flat_line_indices) == len(words):
        for w, line_idx in zip(words, flat_line_indices):
            w["line_index"] = line_idx
    return words


def _phrase_char_length(words: list[dict[str, Any]]) -> int:
    return sum(len(w["word"]) for w in words) + max(0, len(words) - 1)


def _split_oversized_chunk(
    chunk: list[dict[str, Any]],
    min_words: int,
    max_words: int,
    max_chars: int,
    pause_threshold: float,
) -> list[list[dict[str, Any]]]:
    """Split a long word chunk into balanced 2-6 word visual phrases without 1-word orphans."""
    if len(chunk) <= max_words and _phrase_char_length(chunk) <= max_chars:
        return [chunk]

    # Compute the smallest number of balanced sub-phrases that respect limits
    n = len(chunk)
    num_parts = max(
        math.ceil(n / max_words),
        math.ceil(_phrase_char_length(chunk) / max(1, max_chars)),
    )
    num_parts = max(2, min(num_parts, max(1, n // max(1, min_words))))

    if num_parts == 1:
        return [chunk]

    # Dynamic programming to choose optimal cut points favoring natural pauses & balanced widths
    target_chars = _phrase_char_length(chunk) / num_parts
    target_words = n / num_parts

    # Prefix character counts (excluding spaces)
    inf = float("inf")
    dp: list[list[float]] = [[inf] * (n + 1) for _ in range(num_parts + 1)]
    parent: list[list[int]] = [[-1] * (n + 1) for _ in range(num_parts + 1)]
    dp[0][0] = 0.0

    for k in range(1, num_parts + 1):
        for end in range(k, n + 1):
            for start in range(k - 1, end):
                if dp[k - 1][start] == inf:
                    continue
                sub = chunk[start:end]
                w_count = len(sub)
                c_len = _phrase_char_length(sub)

                # Soft/hard penalties for violating visual bounds
                cost = ((c_len - target_chars) / max(1.0, target_chars)) ** 2
                cost += 0.5 * ((w_count - target_words) / max(1.0, target_words)) ** 2

                if w_count < min_words:
                    cost += 25.0
                if w_count > max_words:
                    cost += 30.0 * (w_count - max_words)
                if c_len > max_chars:
                    cost += 2.0 * (c_len - max_chars)

                # Reward cutting right after a noticeable pause or punctuation
                if start > 0:
                    gap = float(chunk[start]["start"]) - float(chunk[start - 1]["end"])
                    if gap >= pause_threshold * 0.5:
                        cost -= min(1.5, gap * 2.0)
                    if HARD_PUNCT_RE.search(chunk[start - 1]["word"]):
                        cost -= 1.0
                    elif chunk[start - 1]["word"].endswith(","):
                        cost -= 0.45

                total = dp[k - 1][start] + cost
                if total < dp[k][end]:
                    dp[k][end] = total
                    parent[k][end] = start

    # Reconstruct splits
    cuts: list[list[dict[str, Any]]] = []
    cur = n
    for k in range(num_parts, 0, -1):
        prev = parent[k][cur]
        if prev < 0:
            # Fallback to uniform split if DP failed
            step = max(1, math.ceil(n / num_parts))
            return [chunk[i : i + step] for i in range(0, n, step)]
        cuts.append(chunk[prev:cur])
        cur = prev
    cuts.reverse()

    # Recursively refine if any piece still exceeds max_words or max_chars (very long tokens)
    refined: list[list[dict[str, Any]]] = []
    for piece in cuts:
        if (
            len(piece) > max_words
            or (_phrase_char_length(piece) > max_chars and len(piece) > 1)
        ) and len(piece) < len(chunk):
            refined.extend(
                _split_oversized_chunk(
                    piece, min_words, max_words, max_chars, pause_threshold
                )
            )
        else:
            refined.append(piece)
    return refined


def group_words_into_phrases(
    words: list[dict[str, Any]],
    min_words: int = 2,
    max_words: int = 6,
    max_chars: int = 36,
    pause_threshold: float = 0.35,
) -> list[list[dict[str, Any]]]:
    """Group aligned words into rhythmic 2-6 word phrases."""
    if not words:
        return []

    # Step 1: Split into coarse natural clauses by explicit line breaks, pause gaps, & hard punct
    clauses: list[tuple[list[dict[str, Any]], bool]] = []
    current: list[dict[str, Any]] = [words[0]]
    explicit_single_line = False

    for prev, curr in zip(words, words[1:]):
        prev_line = prev.get("line_index")
        curr_line = curr.get("line_index")
        line_changed = (
            prev_line is not None and curr_line is not None and prev_line != curr_line
        )
        pause_gap = float(curr["start"]) - float(prev["end"])
        is_pause = pause_gap > pause_threshold
        is_hard_punct = bool(HARD_PUNCT_RE.search(prev["word"])) and len(current) >= min_words

        if line_changed or is_pause or is_hard_punct:
            is_standalone = line_changed and len(current) == 1
            clauses.append((current, is_standalone or explicit_single_line))
            current = [curr]
            explicit_single_line = False
        else:
            current.append(curr)

    if current:
        # Preserve standalone 1-word final line if lyrics.txt explicitly separated it
        last_standalone = (
            len(current) == 1
            and current[0].get("line_index") is not None
            and (
                not clauses
                or clauses[-1][0][-1].get("line_index") != current[0].get("line_index")
            )
        )
        clauses.append((current, last_standalone))

    # Step 2: Split each coarse clause into balanced 2-6 word phrases
    phrases: list[tuple[list[dict[str, Any]], bool]] = []
    for clause, standalone in clauses:
        sub_phrases = _split_oversized_chunk(
            clause,
            min_words=min_words,
            max_words=max_words,
            max_chars=max_chars,
            pause_threshold=pause_threshold,
        )
        for sp in sub_phrases:
            phrases.append((sp, standalone and len(sub_phrases) == 1))

    # Step 3: Merge accidental non-standalone 1-word orphans if gap is small
    merged: list[list[dict[str, Any]]] = []
    for phrase, standalone in phrases:
        if (
            len(phrase) == 1
            and not standalone
            and merged
            and len(merged[-1]) < max_words
            and _phrase_char_length(merged[-1] + phrase) <= max_chars + 4
        ):
            gap = float(phrase[0]["start"]) - float(merged[-1][-1]["end"])
            if gap <= pause_threshold * 1.6:
                merged[-1].extend(phrase)
                continue
        merged.append(phrase)

    return merged


def build_scenes(
    words_payload: dict[str, Any] | list[dict[str, Any]],
    audio_path: Path | None = None,
    lyrics_path: Path | None = None,
    fps: int = 30,
    min_words: int = 2,
    max_words: int = 6,
    max_chars: int = 36,
    pause_threshold: float = 0.35,
    aspect_ratio: str = "4:3",
    audio_src: str = "audio.mp3",
) -> dict[str, Any]:
    """Build the complete Remotion-ready scenes.json payload."""
    if isinstance(words_payload, list):
        raw_words = words_payload
        payload_duration: float | None = None
        payload_audio: str | None = None
    else:
        raw_words = list(words_payload.get("words", []))
        raw_dur = words_payload.get("duration")
        payload_duration = float(raw_dur) if raw_dur is not None else None
        payload_audio = words_payload.get("audio_path")

    words: list[dict[str, Any]] = []
    for item in raw_words:
        text = unicodedata.normalize("NFC", str(item.get("word", "")).strip())
        if not text:
            continue
        start = max(0.0, float(item.get("start", 0.0)))
        end = max(start + 0.05, float(item.get("end", start + 0.2)))
        entry: dict[str, Any] = {"word": text, "start": round(start, 3), "end": round(end, 3)}
        if item.get("line_index") is not None:
            entry["line_index"] = int(item["line_index"])
        words.append(entry)

    if lyrics_path is not None and lyrics_path.is_file():
        words = _attach_line_indices_from_lyrics(words, lyrics_path)

    # Resolve audio duration via ffprobe -> words.json duration -> last word fallback
    resolved_audio = audio_path or (Path(payload_audio) if payload_audio else None)
    duration = probe_audio_duration(resolved_audio) if resolved_audio else None
    if duration is None:
        duration = payload_duration
    if duration is None:
        duration = (words[-1]["end"] + 1.2) if words else 5.0

    last_word_end = words[-1]["end"] if words else 0.0
    duration = max(duration, last_word_end + 0.5)
    total_frames = max(1, math.ceil(duration * fps))

    phrases = group_words_into_phrases(
        words,
        min_words=min_words,
        max_words=max_words,
        max_chars=max_chars,
        pause_threshold=pause_threshold,
    )

    # Convert word timings to integer frames with monotonic ordering
    scenes: list[dict[str, Any]] = []
    prev_word_start_frame = -1

    for scene_idx, phrase in enumerate(phrases):
        theme = "light" if scene_idx % 2 == 0 else "dark"
        scene_words: list[dict[str, Any]] = []

        for w in phrase:
            w_start_frame = max(0, round(w["start"] * fps))
            if w_start_frame <= prev_word_start_frame:
                w_start_frame = prev_word_start_frame + 1
            w_end_frame = max(w_start_frame + 1, round(w["end"] * fps))
            prev_word_start_frame = w_start_frame

            scene_words.append(
                {
                    "word": w["word"],
                    "start": round(w["start"], 3),
                    "end": round(w["end"], 3),
                    "startFrame": w_start_frame,
                    "endFrame": w_end_frame,
                }
            )

        first_word_frame = scene_words[0]["startFrame"]
        if scene_idx == 0:
            # Avoid a tiny <0.5s flash before scene 0; keep longer intros as ambient dark canvas
            start_frame = 0 if first_word_frame <= round(0.5 * fps) else first_word_frame
        else:
            start_frame = first_word_frame

        scenes.append(
            {
                "id": scene_idx,
                "theme": theme,
                "startFrame": start_frame,
                "endFrame": total_frames,  # finalized below
                "startTime": round(start_frame / fps, 3),
                "endTime": round(total_frames / fps, 3),
                "text": " ".join(w["word"] for w in scene_words),
                "words": scene_words,
            }
        )

    # Stitch contiguous hard-cut scene boundaries
    for i in range(len(scenes) - 1):
        next_start = scenes[i + 1]["startFrame"]
        if next_start <= scenes[i]["startFrame"]:
            next_start = scenes[i]["startFrame"] + 1
            scenes[i + 1]["startFrame"] = next_start
            scenes[i + 1]["startTime"] = round(next_start / fps, 3)
        scenes[i]["endFrame"] = next_start
        scenes[i]["endTime"] = round(next_start / fps, 3)

    if scenes:
        last_end = max(total_frames, scenes[-1]["words"][-1]["endFrame"] + round(0.5 * fps))
        scenes[-1]["endFrame"] = last_end
        scenes[-1]["endTime"] = round(last_end / fps, 3)
        total_frames = last_end
        duration = round(total_frames / fps, 3)

    return {
        "aspectRatio": aspect_ratio,
        "audioSrc": audio_src,
        "fps": fps,
        "durationInSeconds": round(duration, 3),
        "durationInFrames": total_frames,
        "sceneCount": len(scenes),
        "scenes": scenes,
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build Remotion scene timeline (data/scenes.json) from data/words.json."
    )
    parser.add_argument(
        "--words",
        default=Path("data/words.json"),
        type=Path,
        help="Input word-level timestamps JSON (default: data/words.json).",
    )
    parser.add_argument(
        "--audio",
        default=None,
        type=Path,
        help="Optional audio file path for ffprobe duration detection.",
    )
    parser.add_argument(
        "--lyrics",
        default=None,
        type=Path,
        help="Optional lyrics.txt file to honor explicit line breaks.",
    )
    parser.add_argument(
        "--output",
        default=Path("data/scenes.json"),
        type=Path,
        help="Output scenes JSON path (default: data/scenes.json).",
    )
    parser.add_argument(
        "--fps",
        default=30,
        type=int,
        help="Video frames per second (default: 30).",
    )
    parser.add_argument(
        "--min-words",
        default=2,
        type=int,
        help="Minimum target words per scene (default: 2).",
    )
    parser.add_argument(
        "--max-words",
        default=6,
        type=int,
        help="Maximum words per scene (default: 6).",
    )
    parser.add_argument(
        "--max-chars",
        default=36,
        type=int,
        help="Maximum character length per scene phrase (default: 36).",
    )
    parser.add_argument(
        "--pause-threshold",
        default=0.35,
        type=float,
        help="Pause gap in seconds that triggers a new scene (default: 0.35).",
    )
    parser.add_argument(
        "--aspect-ratio",
        default="4:3",
        choices=["4:3", "9:16", "1:1"],
        help="Canvas aspect ratio preset stored in scenes.json props (default: 4:3).",
    )
    parser.add_argument(
        "--audio-src",
        default="audio.mp3",
        help="Filename inside remotion/public/ (or URL) for Remotion <Audio> (default: audio.mp3).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not args.words.is_file():
        print(f"[build_scenes] Error: Words JSON not found: {args.words}", file=sys.stderr)
        return 1

    words_payload = json.loads(args.words.read_text(encoding="utf-8"))
    scenes_payload = build_scenes(
        words_payload=words_payload,
        audio_path=args.audio,
        lyrics_path=args.lyrics,
        fps=args.fps,
        min_words=args.min_words,
        max_words=args.max_words,
        max_chars=args.max_chars,
        pause_threshold=args.pause_threshold,
        aspect_ratio=args.aspect_ratio,
        audio_src=args.audio_src,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(scenes_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"[build_scenes] Wrote {scenes_payload['sceneCount']} scene(s) "
        f"({scenes_payload['durationInFrames']} frames @ {scenes_payload['fps']}fps, "
        f"{scenes_payload['aspectRatio']}) to {args.output}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
