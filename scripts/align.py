#!/usr/bin/env python3
"""Word-level audio-to-lyrics alignment using WhisperX on CPU.

Supports two operating modes:
  - Mode A (MP3 only): Transcribe audio with WhisperX (int8/CPU) and run
    wav2vec2 forced alignment to obtain word-level timestamps.
  - Mode B (MP3 + lyrics.txt): Preserve 100% of user-provided lyric text
    (ideal for remixes, stylized phrasing, and Vietnamese vocals), anchor
    lyric lines to vocal regions via ASR guidance, run wav2vec2 forced
    alignment, and interpolate any unaligned tokens so no word is ever dropped.
"""

from __future__ import annotations

import argparse
import difflib
import gc
import json
import os
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

# PyTorch 2.6+ defaults torch.load(..., weights_only=True), which breaks
# pyannote/silero VAD checkpoints used internally by WhisperX.
os.environ.setdefault("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "1")

SECTION_HEADER_RE = re.compile(r"^\s*\[[^\]]+\]\s*$")
PUNCT_EDGE_RE = re.compile(r"^[^\w]+|[^\w]+$", re.UNICODE)

# Characters strongly indicative of Vietnamese orthography
VIETNAMESE_SPECIFIC_CHARS = set(
    "ăĂđĐơƠưƯ"
    "ắằẳẵặẮẰẲẴẶ"
    "ấầẩẫậẤẦẨẪẬ"
    "ếềểễệẾỀỂỄỆ"
    "ốồổỗộỐỒỔỖỘ"
    "ớờởỡợỚỜỞỠỢ"
    "ứừửữựỨỪỬỮỰ"
    "ảãạẢÃẠẻẽẹẺẼẸỉĩịỈĨỊỏõọỎÕỌủũụỦŨỤỷỹỵỶỸỴ"
)


def detect_vietnamese_text(text: str) -> bool:
    """Return True if text contains distinctive Vietnamese diacritics/letters."""
    hits = sum(1 for ch in text if ch in VIETNAMESE_SPECIFIC_CHARS)
    return hits >= 2


def normalize_token(token: str) -> str:
    """Normalize a word token for fuzzy matching (lowercase, ASCII-folded, no edge punct)."""
    cleaned = unicodedata.normalize("NFC", token.strip())
    cleaned = cleaned.replace("đ", "d").replace("Đ", "d")
    decomposed = unicodedata.normalize("NFD", cleaned)
    ascii_only = "".join(
        ch for ch in decomposed if unicodedata.category(ch) != "Mn"
    )
    ascii_only = PUNCT_EDGE_RE.sub("", ascii_only).lower()
    return ascii_only


def parse_lyrics_file(lyrics_path: Path) -> list[dict[str, Any]]:
    """Parse lyrics.txt into structured lines while preserving exact text and line breaks.

    Skips empty lines and bracketed section markers such as ``[Chorus]`` or ``[Verse 1]``.
    """
    raw_text = lyrics_path.read_text(encoding="utf-8-sig")
    raw_text = unicodedata.normalize("NFC", raw_text)

    lines: list[dict[str, Any]] = []
    line_index = 0
    for raw_line in raw_text.splitlines():
        stripped = raw_line.strip()
        if not stripped:
            continue
        if SECTION_HEADER_RE.match(stripped):
            continue
        tokens = stripped.split()
        if not tokens:
            continue
        lines.append(
            {
                "line_index": line_index,
                "text": " ".join(tokens),
                "tokens": tokens,
            }
        )
        line_index += 1
    return lines


def _extract_asr_anchor_words(
    asr_segments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Flatten Whisper ASR segments into rough per-word anchor timestamps."""
    anchors: list[dict[str, Any]] = []
    for seg in asr_segments:
        seg_start = float(seg.get("start", 0.0))
        seg_end = float(seg.get("end", seg_start + 0.1))
        if seg_end <= seg_start:
            seg_end = seg_start + 0.1

        # Use word timings if already present; otherwise interpolate across segment
        seg_words = seg.get("words")
        if seg_words:
            for w in seg_words:
                txt = str(w.get("word", "")).strip()
                if not txt:
                    continue
                anchors.append(
                    {
                        "norm": normalize_token(txt),
                        "start": float(w.get("start", seg_start)),
                        "end": float(w.get("end", seg_end)),
                    }
                )
            continue

        tokens = str(seg.get("text", "")).strip().split()
        if not tokens:
            continue
        weights = [max(1, len(normalize_token(t)) or len(t)) for t in tokens]
        total_weight = sum(weights)
        cursor = seg_start
        span = seg_end - seg_start
        for tok, weight in zip(tokens, weights):
            dur = span * (weight / total_weight)
            anchors.append(
                {
                    "norm": normalize_token(tok),
                    "start": cursor,
                    "end": cursor + dur,
                }
            )
            cursor += dur
    return anchors


def build_anchored_segments(
    lyric_lines: list[dict[str, Any]],
    asr_segments: list[dict[str, Any]],
    audio_duration: float,
) -> list[dict[str, Any]]:
    """Map user lyric lines onto monotonic audio windows guided by ASR anchors."""
    flat_user_tokens: list[dict[str, Any]] = []
    for line in lyric_lines:
        for tok in line["tokens"]:
            flat_user_tokens.append(
                {
                    "word": tok,
                    "norm": normalize_token(tok),
                    "line_index": line["line_index"],
                    "weight": max(1, len(normalize_token(tok)) or len(tok)),
                }
            )

    n_user = len(flat_user_tokens)
    if n_user == 0:
        return []

    anchors = _extract_asr_anchor_words(asr_segments)
    vocal_start = anchors[0]["start"] if anchors else 0.0
    vocal_end = anchors[-1]["end"] if anchors else audio_duration
    if vocal_end <= vocal_start:
        vocal_start = 0.0
        vocal_end = max(audio_duration, 0.5)

    # Align user tokens to ASR tokens via SequenceMatcher to recover anchor times
    token_starts: list[float | None] = [None] * n_user
    token_ends: list[float | None] = [None] * n_user

    if anchors:
        user_norms = [t["norm"] for t in flat_user_tokens]
        asr_norms = [a["norm"] for a in anchors]
        matcher = difflib.SequenceMatcher(None, user_norms, asr_norms, autojunk=False)
        for block in matcher.get_matching_blocks():
            if block.size == 0:
                continue
            for offset in range(block.size):
                u_idx = block.a + offset
                a_idx = block.b + offset
                if user_norms[u_idx]:
                    token_starts[u_idx] = anchors[a_idx]["start"]
                    token_ends[u_idx] = anchors[a_idx]["end"]

    # Fill any unmatched user tokens by monotonic character-weighted interpolation
    known_indices = [i for i, s in enumerate(token_starts) if s is not None]
    if not known_indices:
        # Pure proportional fallback across active vocal span
        total_w = sum(t["weight"] for t in flat_user_tokens)
        cursor = vocal_start
        span = max(0.2, vocal_end - vocal_start)
        for i, tok in enumerate(flat_user_tokens):
            dur = span * (tok["weight"] / total_w)
            token_starts[i] = cursor
            token_ends[i] = cursor + dur
            cursor += dur
    else:
        # Interpolate leading gap
        first_known = known_indices[0]
        if first_known > 0:
            lead_start = max(0.0, min(vocal_start, (token_starts[first_known] or 0.0) - 0.1))
            lead_end = token_starts[first_known] or lead_start
            _fill_token_range(
                flat_user_tokens, token_starts, token_ends, 0, first_known, lead_start, lead_end
            )

        # Interpolate internal gaps between known anchors
        for left, right in zip(known_indices, known_indices[1:]):
            if right - left > 1:
                gap_start = token_ends[left] if token_ends[left] is not None else token_starts[left]
                gap_end = token_starts[right]
                assert gap_start is not None and gap_end is not None
                _fill_token_range(
                    flat_user_tokens,
                    token_starts,
                    token_ends,
                    left + 1,
                    right,
                    gap_start,
                    max(gap_start, gap_end),
                )

        # Interpolate trailing gap
        last_known = known_indices[-1]
        if last_known < n_user - 1:
            trail_start = token_ends[last_known] or token_starts[last_known] or vocal_start
            trail_end = max(vocal_end, trail_start + 0.5)
            trail_end = min(audio_duration, trail_end)
            _fill_token_range(
                flat_user_tokens,
                token_starts,
                token_ends,
                last_known + 1,
                n_user,
                trail_start,
                max(trail_start, trail_end),
            )

    # Build per-line windows with non-overlapping slack into adjacent pauses
    line_ranges: list[tuple[int, int, float, float]] = []
    idx = 0
    for line in lyric_lines:
        count = len(line["tokens"])
        l_start = float(token_starts[idx] or 0.0)
        l_end = float(token_ends[idx + count - 1] or (l_start + 0.2))
        if l_end <= l_start:
            l_end = min(audio_duration, l_start + 0.2)
        line_ranges.append((idx, idx + count, l_start, l_end))
        idx += count

    segments: list[dict[str, Any]] = []
    for i, (line, (_, _, raw_start, raw_end)) in enumerate(zip(lyric_lines, line_ranges)):
        if i == 0:
            win_start = max(0.0, raw_start - 1.5)
        else:
            prev_end = line_ranges[i - 1][3]
            gap = max(0.0, raw_start - prev_end)
            win_start = max(0.0, raw_start - min(0.75, gap * 0.45))

        if i == len(lyric_lines) - 1:
            win_end = min(audio_duration, raw_end + 1.5)
        else:
            next_start = line_ranges[i + 1][2]
            gap = max(0.0, next_start - raw_end)
            win_end = min(audio_duration, raw_end + min(0.75, gap * 0.45))

        # Guarantee valid non-empty span
        if win_end - win_start < 0.15:
            win_end = min(audio_duration, win_start + 0.25)
            win_start = max(0.0, win_end - 0.25)

        segments.append(
            {
                "text": line["text"],
                "start": round(win_start, 3),
                "end": round(win_end, 3),
                "line_index": line["line_index"],
                "tokens": line["tokens"],
            }
        )

    return segments


def _fill_token_range(
    tokens: list[dict[str, Any]],
    starts: list[float | None],
    ends: list[float | None],
    start_idx: int,
    end_idx: int,
    t_start: float,
    t_end: float,
) -> None:
    """Linearly interpolate timestamps across [start_idx, end_idx) weighted by token length."""
    subset = tokens[start_idx:end_idx]
    if not subset:
        return
    total_weight = sum(t["weight"] for t in subset)
    span = max(0.05 * len(subset), t_end - t_start)
    cursor = t_start
    for offset, tok in enumerate(subset):
        dur = span * (tok["weight"] / total_weight)
        starts[start_idx + offset] = cursor
        ends[start_idx + offset] = cursor + dur
        cursor += dur


def repair_missing_timestamps(
    words: list[dict[str, Any]],
    audio_duration: float,
    fallback_start: float = 0.0,
    fallback_end: float | None = None,
) -> list[dict[str, Any]]:
    """Interpolate any missing word timestamps and enforce strictly monotonic bounds.

    Guarantees no word is dropped and every word satisfies
    ``0 <= start < end <= audio_duration``.
    """
    if not words:
        return []

    end_bound = audio_duration if fallback_end is None else min(audio_duration, fallback_end)
    if end_bound <= fallback_start:
        end_bound = min(audio_duration, fallback_start + max(0.2, 0.12 * len(words)))

    n = len(words)
    valid_indices = [
        i
        for i, w in enumerate(words)
        if w.get("start") is not None and w.get("end") is not None
    ]

    if not valid_indices:
        weights = [max(1, len(normalize_token(w["word"])) or len(w["word"])) for w in words]
        total_w = sum(weights)
        span = max(0.08 * n, end_bound - fallback_start)
        cursor = fallback_start
        for w, weight in zip(words, weights):
            dur = span * (weight / total_w)
            w["start"] = cursor
            w["end"] = cursor + dur
            w["interpolated"] = True
            cursor += dur
    else:
        # Leading unaligned words
        first_valid = valid_indices[0]
        if first_valid > 0:
            t1 = float(words[first_valid]["start"])
            t0 = max(fallback_start, min(t1 - 0.12 * first_valid, t1))
            _interpolate_word_slice(words, 0, first_valid, t0, t1)

        # Internal gaps
        for left, right in zip(valid_indices, valid_indices[1:]):
            if right - left > 1:
                t0 = float(words[left]["end"])
                t1 = float(words[right]["start"])
                if t1 < t0:
                    t1 = t0
                _interpolate_word_slice(words, left + 1, right, t0, t1)

        # Trailing unaligned words
        last_valid = valid_indices[-1]
        if last_valid < n - 1:
            t0 = float(words[last_valid]["end"])
            remaining = n - 1 - last_valid
            t1 = min(end_bound, max(t0 + 0.18 * remaining, end_bound))
            if t1 <= t0:
                t1 = min(audio_duration, t0 + 0.15 * remaining)
            _interpolate_word_slice(words, last_valid + 1, n, t0, t1)

    # Final monotonic sanitization pass
    min_word_dur = 0.06
    repaired: list[dict[str, Any]] = []
    prev_start = 0.0
    for w in words:
        start = max(0.0, float(w["start"]))
        end = float(w["end"])

        if start < prev_start:
            start = prev_start
        if audio_duration > 0:
            start = min(start, max(0.0, audio_duration - min_word_dur))
        if end <= start:
            end = start + min_word_dur
        if audio_duration > 0:
            end = min(end, audio_duration)
            if end <= start:
                start = max(0.0, end - min_word_dur)

        entry: dict[str, Any] = {
            "word": unicodedata.normalize("NFC", str(w["word"]).strip()),
            "start": round(start, 3),
            "end": round(end, 3),
        }
        if w.get("score") is not None:
            entry["score"] = round(float(w["score"]), 4)
        if w.get("line_index") is not None:
            entry["line_index"] = int(w["line_index"])
        if w.get("interpolated"):
            entry["interpolated"] = True

        repaired.append(entry)
        prev_start = start

    return repaired


def _interpolate_word_slice(
    words: list[dict[str, Any]],
    start_idx: int,
    end_idx: int,
    t_start: float,
    t_end: float,
) -> None:
    """Interpolate timestamps for words[start_idx:end_idx] between t_start and t_end."""
    subset = words[start_idx:end_idx]
    if not subset:
        return
    weights = [max(1, len(normalize_token(w["word"])) or len(w["word"])) for w in subset]
    total_w = sum(weights)
    span = max(0.06 * len(subset), t_end - t_start)
    cursor = t_start
    for w, weight in zip(subset, weights):
        dur = span * (weight / total_w)
        w["start"] = cursor
        w["end"] = cursor + dur
        w["interpolated"] = True
        cursor += dur


def reconcile_aligned_segment(
    expected_tokens: list[str],
    aligned_words: list[dict[str, Any]],
    line_index: int,
    seg_start: float,
    seg_end: float,
    audio_duration: float,
) -> list[dict[str, Any]]:
    """Reconcile wav2vec2 output with the exact user tokens for one lyric line.

    Always returns exactly ``len(expected_tokens)`` word items with original spelling,
    diacritics, punctuation, and repaired timestamps.
    """
    reconciled: list[dict[str, Any]] = [
        {
            "word": tok,
            "start": None,
            "end": None,
            "score": None,
            "line_index": line_index,
        }
        for tok in expected_tokens
    ]

    if aligned_words:
        if len(aligned_words) == len(expected_tokens):
            for dst, src in zip(reconciled, aligned_words):
                if "start" in src and "end" in src:
                    dst["start"] = float(src["start"])
                    dst["end"] = float(src["end"])
                    dst["score"] = src.get("score")
        else:
            exp_norms = [normalize_token(t) for t in expected_tokens]
            src_norms = [normalize_token(str(w.get("word", ""))) for w in aligned_words]
            matcher = difflib.SequenceMatcher(None, exp_norms, src_norms, autojunk=False)
            for block in matcher.get_matching_blocks():
                for offset in range(block.size):
                    dst = reconciled[block.a + offset]
                    src = aligned_words[block.b + offset]
                    if "start" in src and "end" in src:
                        dst["start"] = float(src["start"])
                        dst["end"] = float(src["end"])
                        dst["score"] = src.get("score")

    return repair_missing_timestamps(
        reconciled,
        audio_duration=audio_duration,
        fallback_start=seg_start,
        fallback_end=seg_end,
    )


def _run_forced_alignment(
    segments: list[dict[str, Any]],
    audio: Any,
    language_code: str,
    align_model_name: str | None = None,
) -> list[dict[str, Any]] | None:
    """Run WhisperX wav2vec2 forced alignment on CPU, returning aligned segments or None on fallback."""
    import whisperx

    try:
        print(
            f"[align] Loading wav2vec2 alignment model for language='{language_code}' on CPU...",
            flush=True,
        )
        load_kwargs: dict[str, Any] = {
            "language_code": language_code,
            "device": "cpu",
        }
        if align_model_name:
            load_kwargs["model_name"] = align_model_name

        align_model, metadata = whisperx.load_align_model(**load_kwargs)
        aligned_result = whisperx.align(
            segments,
            align_model,
            metadata,
            audio,
            device="cpu",
            return_char_alignments=False,
        )
        del align_model
        gc.collect()
        return list(aligned_result.get("segments", []))
    except Exception as exc:  # noqa: BLE001
        print(
            f"[align] Warning: Forced alignment failed for language='{language_code}' ({exc}). "
            "Falling back to segment-level word timestamp interpolation.",
            file=sys.stderr,
            flush=True,
        )
        return None


def align_audio(
    audio_path: Path,
    lyrics_path: Path | None,
    language: str,
    model_name: str,
    batch_size: int = 4,
    align_model_name: str | None = None,
) -> dict[str, Any]:
    """Run the full alignment pipeline and return the structured words payload."""
    import whisperx

    if not audio_path.is_file():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    lyric_lines: list[dict[str, Any]] = []
    if lyrics_path is not None:
        if not lyrics_path.is_file():
            raise FileNotFoundError(f"Lyrics file not found: {lyrics_path}")
        lyric_lines = parse_lyrics_file(lyrics_path)
        if not lyric_lines:
            print(
                "[align] Lyrics file is empty after stripping headers; falling back to Mode A (ASR).",
                flush=True,
            )

    use_lyrics_mode = len(lyric_lines) > 0
    full_lyrics_text = "\n".join(line["text"] for line in lyric_lines)

    # Determine explicit language hint
    explicit_lang: str | None = None if language.lower() == "auto" else language.lower()
    if explicit_lang is None and use_lyrics_mode and detect_vietnamese_text(full_lyrics_text):
        explicit_lang = "vi"
        print("[align] Auto-detected Vietnamese ('vi') from lyrics diacritics.", flush=True)

    print(f"[align] Loading audio: {audio_path}", flush=True)
    audio = whisperx.load_audio(str(audio_path))
    audio_duration = round(len(audio) / 16000.0, 3)
    print(f"[align] Audio duration: {audio_duration:.2f}s", flush=True)

    print(
        f"[align] Loading WhisperX ASR model '{model_name}' (device=cpu, compute_type=int8)...",
        flush=True,
    )
    asr_model = whisperx.load_model(
        model_name,
        device="cpu",
        compute_type="int8",
        language=explicit_lang,
    )

    print("[align] Running WhisperX transcription...", flush=True)
    asr_result = asr_model.transcribe(audio, batch_size=batch_size)
    detected_language = (
        explicit_lang
        or str(asr_result.get("language") or "en").lower()
    )
    asr_segments: list[dict[str, Any]] = list(asr_result.get("segments", []))
    print(
        f"[align] Transcribed {len(asr_segments)} segment(s) (language='{detected_language}').",
        flush=True,
    )

    del asr_model
    gc.collect()

    all_words: list[dict[str, Any]] = []

    if use_lyrics_mode:
        print(
            f"[align] Mode B (MP3 + lyrics.txt): Anchoring {len(lyric_lines)} lyric line(s)...",
            flush=True,
        )
        anchored_segments = build_anchored_segments(lyric_lines, asr_segments, audio_duration)
        align_input = [
            {"text": seg["text"], "start": seg["start"], "end": seg["end"]}
            for seg in anchored_segments
        ]
        aligned_segments = _run_forced_alignment(
            align_input,
            audio=audio,
            language_code=detected_language,
            align_model_name=align_model_name,
        )

        for idx, meta_seg in enumerate(anchored_segments):
            aligned_words = (
                aligned_segments[idx].get("words", [])
                if aligned_segments is not None and idx < len(aligned_segments)
                else []
            )
            reconciled = reconcile_aligned_segment(
                expected_tokens=meta_seg["tokens"],
                aligned_words=aligned_words,
                line_index=meta_seg["line_index"],
                seg_start=meta_seg["start"],
                seg_end=meta_seg["end"],
                audio_duration=audio_duration,
            )
            all_words.extend(reconciled)

        # Global monotonic guarantee across all lines
        all_words = repair_missing_timestamps(all_words, audio_duration=audio_duration)
        mode_name = "lyrics_forced_align"
    else:
        print("[align] Mode A (MP3 only): Running wav2vec2 forced alignment...", flush=True)
        aligned_segments = _run_forced_alignment(
            asr_segments,
            audio=audio,
            language_code=detected_language,
            align_model_name=align_model_name,
        )
        source_segments = aligned_segments if aligned_segments is not None else asr_segments

        for seg in source_segments:
            seg_start = float(seg.get("start", 0.0))
            seg_end = float(seg.get("end", seg_start + 0.2))
            seg_words = seg.get("words")
            if seg_words:
                raw_words = [
                    {
                        "word": str(w.get("word", "")).strip(),
                        "start": w.get("start"),
                        "end": w.get("end"),
                        "score": w.get("score"),
                    }
                    for w in seg_words
                    if str(w.get("word", "")).strip()
                ]
            else:
                raw_words = [
                    {"word": tok, "start": None, "end": None, "score": None}
                    for tok in str(seg.get("text", "")).strip().split()
                    if tok
                ]
            if raw_words:
                all_words.extend(
                    repair_missing_timestamps(
                        raw_words,
                        audio_duration=audio_duration,
                        fallback_start=seg_start,
                        fallback_end=seg_end,
                    )
                )

        all_words = repair_missing_timestamps(all_words, audio_duration=audio_duration)
        mode_name = "asr_forced_align"

    return {
        "audio_path": str(audio_path),
        "duration": audio_duration,
        "language": detected_language,
        "mode": mode_name,
        "has_line_breaks": use_lyrics_mode,
        "word_count": len(all_words),
        "words": all_words,
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract word-level lyric timestamps using WhisperX (CPU int8)."
    )
    parser.add_argument(
        "--audio",
        required=True,
        type=Path,
        help="Path to input audio file (e.g., input/song.mp3).",
    )
    parser.add_argument(
        "--lyrics",
        default=None,
        type=Path,
        help="Optional path to UTF-8 lyrics.txt for exact-text forced alignment.",
    )
    parser.add_argument(
        "--language",
        default="auto",
        help="ISO-639-1 language code (e.g., en, vi) or 'auto' (default: auto).",
    )
    parser.add_argument(
        "--model",
        default="small",
        help="Whisper model size: tiny, base, small, medium, large-v3 (default: small).",
    )
    parser.add_argument(
        "--output",
        default=Path("data/words.json"),
        type=Path,
        help="Output JSON path (default: data/words.json).",
    )
    parser.add_argument(
        "--batch-size",
        default=4,
        type=int,
        help="WhisperX transcription batch size for CPU (default: 4).",
    )
    parser.add_argument(
        "--align-model",
        default=None,
        help="Optional custom HuggingFace wav2vec2 alignment model identifier.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    payload = align_audio(
        audio_path=args.audio,
        lyrics_path=args.lyrics,
        language=args.language,
        model_name=args.model,
        batch_size=args.batch_size,
        align_model_name=args.align_model,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"[align] Wrote {payload['word_count']} aligned word(s) to {args.output}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
