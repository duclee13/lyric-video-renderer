import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { extractRequestPassphrase, verifyPassphrase } from "@/lib/auth";
import {
  dispatchRenderWorkflow,
  GitHubApiError,
  uploadAudioToRepo,
} from "@/lib/github";
import type {
  AspectRatio,
  LanguageCode,
  RenderDispatchResponse,
  WhisperModel,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Stay safely beneath Vercel's 4.5 MB serverless request body ceiling
const MAX_AUDIO_BYTES = Math.floor(4.2 * 1024 * 1024);
const MAX_LYRICS_CHARS = 45_000;

const VALID_ASPECT_RATIOS = new Set<AspectRatio>(["4:3", "9:16", "1:1"]);
const VALID_LANGUAGES = new Set<LanguageCode>(["auto", "en", "vi"]);
const VALID_MODELS = new Set<WhisperModel>(["small", "base"]);

function createJobId(): string {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:T]/g, "")
    .slice(0, 14);
  const rand = crypto.randomBytes(3).toString("hex");
  return `${stamp}-${rand}`;
}

export async function POST(request: Request) {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        {
          error:
            "Failed to parse upload payload. Ensure the MP3 file is 4.2 MB or smaller.",
        },
        { status: 400 }
      );
    }

    const formPassphrase = formData.get("passphrase");
    const passphrase =
      typeof formPassphrase === "string" && formPassphrase.trim()
        ? formPassphrase
        : extractRequestPassphrase(request);

    if (!verifyPassphrase(passphrase)) {
      return NextResponse.json(
        { error: "Invalid studio passphrase." },
        { status: 401 }
      );
    }

    const audioEntry = formData.get("audio");
    if (!(audioEntry instanceof File) || audioEntry.size === 0) {
      return NextResponse.json(
        { error: "Please attach a non-empty .mp3 audio file." },
        { status: 400 }
      );
    }

    const fileNameLower = audioEntry.name.toLowerCase();
    const mimeLower = audioEntry.type.toLowerCase();
    const isMp3 =
      fileNameLower.endsWith(".mp3") ||
      mimeLower === "audio/mpeg" ||
      mimeLower === "audio/mp3";
    if (!isMp3) {
      return NextResponse.json(
        { error: "Only .mp3 audio files are supported." },
        { status: 400 }
      );
    }

    if (audioEntry.size > MAX_AUDIO_BYTES) {
      const sizeMb = (audioEntry.size / (1024 * 1024)).toFixed(2);
      return NextResponse.json(
        {
          error: `Audio file is ${sizeMb} MB, exceeding Vercel's 4.2 MB serverless upload limit. Re-encode at 128-192 kbps MP3 or push larger tracks directly to input/ in GitHub.`,
        },
        { status: 413 }
      );
    }

    const rawAspect = String(formData.get("aspectRatio") ?? "4:3").trim();
    const aspectRatio: AspectRatio = VALID_ASPECT_RATIOS.has(
      rawAspect as AspectRatio
    )
      ? (rawAspect as AspectRatio)
      : "4:3";

    const rawLang = String(formData.get("language") ?? "auto")
      .trim()
      .toLowerCase();
    const language: LanguageCode = VALID_LANGUAGES.has(rawLang as LanguageCode)
      ? (rawLang as LanguageCode)
      : "auto";

    const rawModel = String(formData.get("whisperModel") ?? "small")
      .trim()
      .toLowerCase();
    const whisperModel: WhisperModel = VALID_MODELS.has(
      rawModel as WhisperModel
    )
      ? (rawModel as WhisperModel)
      : "small";

    const rawLyrics = formData.get("lyrics");
    const lyricsText =
      typeof rawLyrics === "string" ? rawLyrics.replace(/\r\n/g, "\n").trim() : "";
    if (lyricsText.length > MAX_LYRICS_CHARS) {
      return NextResponse.json(
        { error: "Lyrics text is too long (maximum 45,000 characters)." },
        { status: 400 }
      );
    }

    const jobId = createJobId();
    const audioPath = `input/jobs/${jobId}/audio.mp3`;
    const audioBuffer = Buffer.from(await audioEntry.arrayBuffer());

    // 1. Upload audio with [skip ci] so the push workflow never double-triggers
    await uploadAudioToRepo(audioPath, jobId, audioBuffer);

    // 2. Capture timestamp immediately before workflow_dispatch
    const dispatchedAt = new Date().toISOString();

    await dispatchRenderWorkflow({
      audioPath,
      lyricsText,
      aspectRatio,
      whisperModel,
      language,
    });

    const payload: RenderDispatchResponse = {
      jobId,
      dispatchedAt,
      audioPath,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    if (err instanceof GitHubApiError) {
      console.error("[api/render] GitHub API error:", err.status, err.details);
      return NextResponse.json(
        {
          error:
            err.status === 401 || err.status === 403
              ? "GitHub token rejected or missing Contents/Actions write permissions."
              : err.message,
        },
        { status: err.status >= 400 && err.status < 500 ? err.status : 502 }
      );
    }
    const message =
      err instanceof Error ? err.message : "Unexpected render dispatch error.";
    console.error("[api/render] Error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
