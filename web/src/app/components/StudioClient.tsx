"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  AlertCircle,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import type {
  AspectRatio,
  LanguageCode,
  RecentRunSummary,
  RenderDispatchResponse,
  RenderStatusResponse,
  RunsListResponse,
  WhisperModel,
} from "@/lib/types";
import { AudioDropzone } from "./AudioDropzone";
import { ProgressTracker } from "./ProgressTracker";
import { RecentRunsList } from "./RecentRunsList";
import { StarMark } from "./StarMark";

type StudioClientProps = {
  requiresPassphrase: boolean;
  repoOwner: string;
  repoName: string;
};

type ActiveRenderJob = {
  jobId: string | null;
  dispatchedAt: string | null;
  runId: number | null;
  label: string | null;
};

const ASPECT_OPTIONS: {
  value: AspectRatio;
  label: string;
  dimensions: string;
  boxClass: string;
}[] = [
  {
    value: "4:3",
    label: "4:3",
    dimensions: "1080×810",
    boxClass: "w-5 h-3.5",
  },
  {
    value: "9:16",
    label: "9:16",
    dimensions: "1080×1920",
    boxClass: "w-3 h-5",
  },
  {
    value: "1:1",
    label: "1:1",
    dimensions: "1080×1080",
    boxClass: "w-4 h-4",
  },
];

const LANGUAGE_OPTIONS: { value: LanguageCode; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "Detect" },
  { value: "vi", label: "Vietnamese", hint: "Tiếng Việt" },
  { value: "en", label: "English", hint: "EN" },
];

const MODEL_OPTIONS: { value: WhisperModel; label: string; hint: string }[] = [
  { value: "small", label: "Small", hint: "Best accuracy" },
  { value: "base", label: "Base", hint: "Faster CPU" },
];

const PASSPHRASE_STORAGE_KEY = "lyric_studio_passphrase";

export function StudioClient({
  requiresPassphrase,
  repoOwner,
  repoName,
}: StudioClientProps) {
  const lyricsId = useId();
  const lyricsFileRef = useRef<HTMLInputElement | null>(null);
  const passphraseId = useId();

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [lyrics, setLyrics] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("4:3");
  const [language, setLanguage] = useState<LanguageCode>("auto");
  const [whisperModel, setWhisperModel] = useState<WhisperModel>("small");

  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [activeJob, setActiveJob] = useState<ActiveRenderJob | null>(null);
  const [statusData, setStatusData] = useState<RenderStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [previewRun, setPreviewRun] = useState<{
    runId: number;
    label: string;
    htmlUrl: string | null;
  } | null>(null);

  const [recentRuns, setRecentRuns] = useState<RecentRunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);

  const buildAuthHeaders = useCallback(
    (passValue?: string): HeadersInit => {
      const token = (passValue ?? passphrase).trim();
      return token ? { "x-app-passphrase": token } : {};
    },
    [passphrase]
  );

  const fetchRecentRuns = useCallback(
    async (passOverride?: string) => {
      const effectivePass = (passOverride ?? passphrase).trim();
      if (requiresPassphrase && !effectivePass) {
        setRunsError("Enter the studio passphrase above to load recent renders.");
        return;
      }

      setRunsLoading(true);
      setRunsError(null);
      try {
        const res = await fetch("/api/runs", {
          cache: "no-store",
          headers: buildAuthHeaders(effectivePass),
        });
        const data = (await res.json()) as RunsListResponse & {
          error?: string;
        };
        if (!res.ok) {
          setRunsError(data.error ?? `Failed to load runs (${res.status})`);
          return;
        }
        setRecentRuns(data.runs ?? []);
      } catch {
        setRunsError("Could not reach /api/runs. Check your connection.");
      } finally {
        setRunsLoading(false);
      }
    },
    [buildAuthHeaders, passphrase, requiresPassphrase]
  );

  // Restore saved passphrase from sessionStorage and perform initial runs load
  useEffect(() => {
    let saved = "";
    try {
      saved = sessionStorage.getItem(PASSPHRASE_STORAGE_KEY) ?? "";
    } catch {
      // sessionStorage unavailable
    }

    const timer = setTimeout(() => {
      if (saved) {
        setPassphrase(saved);
      }
      if (!requiresPassphrase || saved) {
        void fetchRecentRuns(saved);
      } else {
        setRunsError("Enter the studio passphrase above to load recent renders.");
      }
    }, 0);

    return () => clearTimeout(timer);
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll /api/status every 5 seconds while an active render job is running
  useEffect(() => {
    if (!activeJob) return;
    if (statusData?.status === "completed") return;

    let cancelled = false;

    const pollStatus = async () => {
      const params = new URLSearchParams();
      if (activeJob.runId) {
        params.set("runId", String(activeJob.runId));
      } else {
        if (activeJob.dispatchedAt) {
          params.set("since", activeJob.dispatchedAt);
        }
        if (activeJob.jobId) {
          params.set("jobId", activeJob.jobId);
        }
      }

      try {
        const res = await fetch(`/api/status?${params.toString()}`, {
          cache: "no-store",
          headers: buildAuthHeaders(),
        });
        const data = (await res.json()) as RenderStatusResponse & {
          error?: string;
        };
        if (cancelled) return;

        if (!res.ok) {
          setStatusError(data.error ?? `Status check failed (${res.status})`);
          return;
        }

        setStatusError(null);
        setStatusData(data);

        if (data.runId && !activeJob.runId) {
          setActiveJob((prev) =>
            prev ? { ...prev, runId: data.runId } : prev
          );
          void fetchRecentRuns();
        }

        if (data.status === "completed") {
          void fetchRecentRuns();
          if (data.conclusion === "success" && data.runId) {
            setPreviewRun({
              runId: data.runId,
              label:
                activeJob.label ??
                data.displayTitle ??
                `Run #${data.runId}`,
              htmlUrl: data.htmlUrl,
            });
          }
        }
      } catch {
        if (!cancelled) {
          setStatusError("Network error while polling render status.");
        }
      }
    };

    const immediate = setTimeout(() => {
      void pollStatus();
    }, 1500);
    const interval = setInterval(() => {
      void pollStatus();
    }, 5000);

    return () => {
      cancelled = true;
      clearTimeout(immediate);
      clearInterval(interval);
    };
  }, [activeJob, statusData?.status, buildAuthHeaders, fetchRecentRuns]);

  const handlePassphraseChange = (value: string) => {
    setPassphrase(value);
    try {
      if (value.trim()) {
        sessionStorage.setItem(PASSPHRASE_STORAGE_KEY, value);
      } else {
        sessionStorage.removeItem(PASSPHRASE_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  };

  const handleLoadLyricsFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      setLyrics(content);
    } finally {
      e.target.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);

    if (!audioFile) {
      setSubmitError("Please upload an .mp3 track before rendering.");
      return;
    }

    if (requiresPassphrase && !passphrase.trim()) {
      setSubmitError("Please enter the studio passphrase to start a render.");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("audio", audioFile);
      formData.append("lyrics", lyrics.trim());
      formData.append("aspectRatio", aspectRatio);
      formData.append("language", language);
      formData.append("whisperModel", whisperModel);
      if (requiresPassphrase && passphrase.trim()) {
        formData.append("passphrase", passphrase.trim());
      }

      const res = await fetch("/api/render", {
        method: "POST",
        body: formData,
        headers: buildAuthHeaders(),
      });

      const data = (await res.json()) as RenderDispatchResponse & {
        error?: string;
      };

      if (!res.ok) {
        setSubmitError(data.error ?? `Render dispatch failed (${res.status}).`);
        return;
      }

      // Switch right panel into live progress tracking mode
      setPreviewRun(null);
      setStatusError(null);
      setStatusData({
        runId: null,
        status: "waiting",
        conclusion: null,
        htmlUrl: null,
        displayTitle: null,
        createdAt: data.dispatchedAt,
        updatedAt: data.dispatchedAt,
        currentStep:
          "Audio uploaded with [skip ci] — waiting for GitHub Actions runner…",
        steps: [],
      });
      setActiveJob({
        jobId: data.jobId,
        dispatchedAt: data.dispatchedAt,
        runId: null,
        label: `${audioFile.name} (${aspectRatio})`,
      });
    } catch {
      setSubmitError(
        "Failed to upload audio to /api/render. Check your connection and file size."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectRecentRun = (run: RecentRunSummary) => {
    if (run.status === "completed" && run.conclusion === "success") {
      setActiveJob(null);
      setStatusData(null);
      setStatusError(null);
      setPreviewRun({
        runId: run.runId,
        label: `${run.jobLabel}${run.aspectRatio ? ` · ${run.aspectRatio}` : ""}`,
        htmlUrl: run.htmlUrl,
      });
      return;
    }

    // Attach live progress monitor to an in-progress, queued, or failed run
    setPreviewRun(null);
    setStatusError(null);
    setStatusData({
      runId: run.runId,
      status: run.status,
      conclusion: run.conclusion,
      htmlUrl: run.htmlUrl,
      displayTitle: run.displayTitle,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      currentStep:
        run.status === "completed"
          ? `Finished (${run.conclusion ?? "unknown"})`
          : "Loading live workflow steps…",
      steps: [],
    });
    setActiveJob({
      jobId: null,
      dispatchedAt: run.createdAt,
      runId: run.runId,
      label: run.jobLabel,
    });
  };

  const lyricsLineCount = lyrics.trim()
    ? lyrics
        .trim()
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0).length
    : 0;

  const isRenderActive = Boolean(
    activeJob && statusData && statusData.status !== "completed"
  );

  return (
    <div className="min-h-screen">
      {/* Studio Top Bar */}
      <header className="border-b border-[#D29BFF]/12 bg-[#0C0813]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D29BFF] text-[#2B084A] shadow-[0_0_24px_rgba(210,155,255,0.22)]">
              <StarMark variant="solid" size={18} />
            </div>
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-sm font-black uppercase tracking-[0.12em] text-[#F6F1FC] sm:text-base">
                Lyric Video Studio
              </h1>
              <p className="text-xs text-[#9E8FB2]">
                WhisperX Alignment · Remotion v4 · GitHub Actions Runner
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {requiresPassphrase && (
              <div className="flex items-center gap-1.5 rounded-xl border border-[#D29BFF]/25 bg-[#150F20] px-2.5 py-1.5">
                <KeyRound className="h-3.5 w-3.5 shrink-0 text-[#D29BFF]" />
                <label htmlFor={passphraseId} className="sr-only">
                  Studio passphrase
                </label>
                <input
                  id={passphraseId}
                  type={showPassphrase ? "text" : "password"}
                  value={passphrase}
                  onChange={(e) => handlePassphraseChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      void fetchRecentRuns();
                    }
                  }}
                  placeholder="Studio passphrase"
                  autoComplete="current-password"
                  className="w-32 bg-transparent text-xs text-[#F6F1FC] placeholder-[#7B6B91] focus:outline-none sm:w-40"
                />
                <button
                  type="button"
                  onClick={() => setShowPassphrase((v) => !v)}
                  aria-label={
                    showPassphrase ? "Hide passphrase" : "Show passphrase"
                  }
                  className="text-[#8E7EA3] transition hover:text-[#F6F1FC]"
                >
                  {showPassphrase ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void fetchRecentRuns()}
                  className="rounded-md bg-[#D29BFF]/15 px-2 py-0.5 text-[11px] font-semibold text-[#D29BFF] transition hover:bg-[#D29BFF]/25"
                >
                  Unlock
                </button>
              </div>
            )}

            <a
              href={`https://github.com/${repoOwner}/${repoName}/actions/workflows/render-lyrics.yml`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#140F1E] px-3 py-2 text-xs font-medium text-[#D6C9E6] transition hover:border-[#D29BFF]/40 hover:text-[#F6F1FC]"
            >
              Actions
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Responsive Two-Column Workspace */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          {/* Left Column: Audio + Lyrics + Render Controls */}
          <form
            onSubmit={handleSubmit}
            className="space-y-6 rounded-2xl border border-[#D29BFF]/14 bg-[#140F1E] p-5 sm:p-6 lg:col-span-7"
          >
            <AudioDropzone
              file={audioFile}
              onFileChange={(f) => {
                setAudioFile(f);
                setSubmitError(null);
              }}
              disabled={submitting}
            />

            {/* Optional Lyrics Textarea */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor={lyricsId}
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-[#B8A9CC]"
                >
                  Lyrics{" "}
                  <span className="font-normal normal-case tracking-normal text-[#8E7EA3]">
                    (optional)
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <input
                    ref={lyricsFileRef}
                    type="file"
                    accept=".txt,text/plain"
                    className="sr-only"
                    onChange={handleLoadLyricsFile}
                  />
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => lyricsFileRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] font-medium text-[#C9BADB] transition hover:border-[#D29BFF]/40 hover:text-[#F6F1FC]"
                  >
                    <FileText className="h-3 w-3" />
                    Load .txt
                  </button>
                  {lyrics && (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => setLyrics("")}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[#8E7EA3] transition hover:text-rose-300"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <textarea
                id={lyricsId}
                rows={6}
                disabled={submitting}
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder={
                  "We'll drink Henny by the ocean\nCome on, baby, let me tell you one\nĐêm nay mình cùng bước tiếp"
                }
                className="w-full resize-y rounded-xl border border-[#D29BFF]/18 bg-[#100B18] px-3.5 py-3 font-sans text-sm leading-relaxed text-[#F6F1FC] placeholder-[#5F5073] transition focus:border-[#D29BFF]/60 focus:outline-none disabled:opacity-60"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#9A8BB0]">
                <p>
                  Tip: Pasting exact lyrics guarantees{" "}
                  <span className="text-[#D29BFF]">100% accuracy</span> for
                  Vietnamese vocals and remixes (one phrase per line).
                </p>
                {lyricsLineCount > 0 && (
                  <span className="font-mono text-[#B8A9CC]">
                    {lyricsLineCount} {lyricsLineCount === 1 ? "line" : "lines"}
                  </span>
                )}
              </div>
            </div>

            {/* Aspect Ratio Selector */}
            <div className="space-y-2.5">
              <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#B8A9CC]">
                Aspect Ratio
              </span>
              <div className="grid grid-cols-3 gap-2.5">
                {ASPECT_OPTIONS.map((opt) => {
                  const selected = aspectRatio === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={submitting}
                      onClick={() => setAspectRatio(opt.value)}
                      className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-3 transition ${
                        selected
                          ? "border-[#D29BFF] bg-[#2B084A]/70 text-[#F6F1FC]"
                          : "border-white/10 bg-[#100B18] text-[#A698B8] hover:border-[#D29BFF]/35 hover:text-[#F6F1FC]"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`rounded-[3px] border-2 ${opt.boxClass} ${
                          selected ? "border-[#D29BFF]" : "border-[#6F6085]"
                        }`}
                      />
                      <span className="font-[family-name:var(--font-display)] text-xs font-extrabold tracking-wide">
                        {opt.label}
                      </span>
                      <span className="font-mono text-[10px] text-[#8E7EA3]">
                        {opt.dimensions}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Language & Whisper Model Controls */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#B8A9CC]">
                  Vocal Language
                </span>
                <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-white/10 bg-[#100B18] p-1">
                  {LANGUAGE_OPTIONS.map((opt) => {
                    const selected = language === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={submitting}
                        onClick={() => setLanguage(opt.value)}
                        className={`rounded-lg px-2 py-2 text-center transition ${
                          selected
                            ? "bg-[#2B084A] text-[#F6F1FC] shadow-sm"
                            : "text-[#9E8FB2] hover:text-[#F6F1FC]"
                        }`}
                      >
                        <div className="text-xs font-semibold">{opt.label}</div>
                        <div className="text-[10px] text-[#8E7EA3]">
                          {opt.hint}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#B8A9CC]">
                  Whisper Model
                </span>
                <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-white/10 bg-[#100B18] p-1">
                  {MODEL_OPTIONS.map((opt) => {
                    const selected = whisperModel === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={submitting}
                        onClick={() => setWhisperModel(opt.value)}
                        className={`rounded-lg px-2.5 py-2 text-center transition ${
                          selected
                            ? "bg-[#2B084A] text-[#F6F1FC] shadow-sm"
                            : "text-[#9E8FB2] hover:text-[#F6F1FC]"
                        }`}
                      >
                        <div className="text-xs font-semibold">{opt.label}</div>
                        <div className="text-[10px] text-[#8E7EA3]">
                          {opt.hint}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {submitError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3.5 py-3 text-xs text-rose-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                <span>{submitError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !audioFile}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#D29BFF] px-5 py-3.5 font-[family-name:var(--font-display)] text-xs font-black uppercase tracking-[0.12em] text-[#2B084A] transition hover:bg-[#DFB5FF] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading &amp; Dispatching Render…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {isRenderActive
                    ? "Queue Another Lyric Video"
                    : "Render Lyric Video"}
                </>
              )}
            </button>
          </form>

          {/* Right Column: Live Progress / Video Preview + Recent Renders */}
          <div className="space-y-6 lg:col-span-5">
            <ProgressTracker
              activeJobId={activeJob?.jobId ?? null}
              dispatchedAt={activeJob?.dispatchedAt ?? null}
              statusData={statusData}
              previewRunId={previewRun?.runId ?? null}
              previewLabel={previewRun?.label ?? null}
              previewHtmlUrl={previewRun?.htmlUrl ?? null}
              passphrase={passphrase}
              requiresPassphrase={requiresPassphrase}
              statusError={statusError}
            />

            <RecentRunsList
              runs={recentRuns}
              loading={runsLoading}
              error={runsError}
              selectedRunId={previewRun?.runId ?? activeJob?.runId ?? null}
              passphrase={passphrase}
              requiresPassphrase={requiresPassphrase}
              onRefresh={() => void fetchRecentRuns()}
              onSelectRun={handleSelectRecentRun}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
