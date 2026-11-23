"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  Film,
  Loader2,
  XCircle,
} from "lucide-react";
import type { RenderStatusResponse } from "@/lib/types";
import { StarMark } from "./StarMark";

type ProgressTrackerProps = {
  activeJobId: string | null;
  dispatchedAt: string | null;
  statusData: RenderStatusResponse | null;
  previewRunId: number | null;
  previewLabel: string | null;
  previewHtmlUrl: string | null;
  passphrase: string;
  requiresPassphrase: boolean;
  statusError: string | null;
};

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function buildDownloadUrl(
  runId: number,
  options: { download?: boolean; passphrase?: string }
): string {
  const params = new URLSearchParams({ runId: String(runId) });
  if (options.download) {
    params.set("download", "1");
  }
  if (options.passphrase?.trim()) {
    params.set("passphrase", options.passphrase.trim());
  }
  return `/api/download?${params.toString()}`;
}

export function ProgressTracker({
  activeJobId,
  dispatchedAt,
  statusData,
  previewRunId,
  previewLabel,
  previewHtmlUrl,
  passphrase,
  requiresPassphrase,
  statusError,
}: ProgressTrackerProps) {
  const [nowMs, setNowMs] = useState(0);
  const [videoErrorState, setVideoErrorState] = useState<{
    runId: number;
    message: string;
  } | null>(null);

  const isRunning = Boolean(
    statusData &&
      statusData.status !== "completed" &&
      (activeJobId || statusData.runId)
  );

  const videoError =
    previewRunId && videoErrorState?.runId === previewRunId
      ? videoErrorState.message
      : null;

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const initial = setTimeout(() => setNowMs(Date.now()), 0);
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [isRunning]);

  const originIso = statusData?.createdAt ?? dispatchedAt;
  const originMs = originIso ? Date.parse(originIso) : NaN;
  const elapsedSec =
    isRunning && nowMs > 0 && !Number.isNaN(originMs)
      ? Math.max(0, Math.floor((nowMs - originMs) / 1000))
      : 0;

  // 1. Video preview mode (completed run selected or just finished)
  if (previewRunId) {
    const streamUrl = buildDownloadUrl(previewRunId, {
      passphrase: requiresPassphrase ? passphrase : undefined,
    });
    const downloadUrl = buildDownloadUrl(previewRunId, {
      download: true,
      passphrase: requiresPassphrase ? passphrase : undefined,
    });

    return (
      <section className="rounded-2xl border border-[#D29BFF]/18 bg-[#140F1E] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-sm font-extrabold uppercase tracking-[0.08em] text-[#F6F1FC]">
                Rendered Output
              </h2>
              <p className="font-mono text-xs text-[#A698B8]">
                {previewLabel ?? `Run #${previewRunId}`}
              </p>
            </div>
          </div>

          {previewHtmlUrl && (
            <a
              href={previewHtmlUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-[#C9BADB] transition hover:border-[#D29BFF]/40 hover:text-[#F6F1FC]"
            >
              Actions Logs
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0A0610]">
          {videoError ? (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <AlertTriangle className="mb-2.5 h-6 w-6 text-amber-300" />
              <p className="text-sm font-medium text-[#F6F1FC]">{videoError}</p>
              <p className="mt-1 text-xs text-[#A698B8]">
                GitHub Actions artifacts expire after 14 days, or the run may
                not have produced a video.
              </p>
            </div>
          ) : (
            <video
              key={streamUrl}
              controls
              playsInline
              preload="metadata"
              src={streamUrl}
              onError={() =>
                setVideoErrorState({
                  runId: previewRunId,
                  message: "Could not load MP4 preview for this run.",
                })
              }
              className="max-h-[420px] w-full bg-black object-contain"
            />
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <a
            href={downloadUrl}
            download={`lyric-video-${previewRunId}.mp4`}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#D29BFF] px-4 py-2.5 font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.08em] text-[#2B084A] transition hover:bg-[#DFB5FF]"
          >
            <Download className="h-4 w-4" />
            Download MP4
          </a>
        </div>
      </section>
    );
  }

  // 2. Active / Failed render tracker
  if (statusData || activeJobId) {
    const steps = statusData?.steps ?? [];
    const completedCount = steps.filter((s) => s.status === "completed").length;
    const progressPct =
      statusData?.status === "completed"
        ? 100
        : steps.length > 0
          ? Math.max(8, Math.round((completedCount / steps.length) * 100))
          : 6;

    const isFailed =
      statusData?.status === "completed" && statusData?.conclusion !== "success";

    return (
      <section className="rounded-2xl border border-[#D29BFF]/18 bg-[#140F1E] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {isFailed ? (
              <XCircle className="h-5 w-5 shrink-0 text-rose-400" />
            ) : (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#D29BFF]" />
            )}
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-sm font-extrabold uppercase tracking-[0.08em] text-[#F6F1FC]">
                {isFailed ? "Render Failed" : "Rendering on GitHub Actions"}
              </h2>
              <p className="mt-0.5 font-mono text-xs text-[#A698B8]">
                {activeJobId ? `Job ${activeJobId}` : `Run #${statusData?.runId}`}
                {isRunning && ` · ${formatElapsed(elapsedSec)}`}
              </p>
            </div>
          </div>

          {statusData?.htmlUrl && (
            <a
              href={statusData.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-[#D6C9E6] transition hover:border-[#D29BFF]/40 hover:text-[#F6F1FC]"
            >
              Logs
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

        {/* Active step banner + progress bar */}
        <div className="mt-4 rounded-xl bg-[#1A1328] p-3.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-medium text-[#F6F1FC]">
              {statusData?.currentStep ??
                "Dispatching workflow to ubuntu-latest runner…"}
            </span>
            <span className="shrink-0 font-mono text-[#D29BFF]">
              {progressPct}%
            </span>
          </div>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isFailed ? "bg-rose-400" : "bg-[#D29BFF]"
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {statusError && (
          <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Polling note: {statusError}
          </p>
        )}

        {/* Step-by-step live log */}
        {steps.length > 0 && (
          <ol className="mt-4 max-h-60 space-y-1.5 overflow-y-auto pr-1">
            {steps.map((step) => {
              const done = step.status === "completed";
              const active = step.status === "in_progress";
              const failed = done && step.conclusion === "failure";
              const skipped = done && step.conclusion === "skipped";

              return (
                <li
                  key={step.number}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs ${
                    active
                      ? "bg-[#2B084A]/65 text-[#F6F1FC]"
                      : failed
                        ? "bg-rose-500/10 text-rose-200"
                        : "text-[#A698B8]"
                  }`}
                >
                  {failed ? (
                    <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                  ) : done ? (
                    <CheckCircle2
                      className={`h-3.5 w-3.5 shrink-0 ${
                        skipped ? "text-[#6D5F82]" : "text-emerald-400"
                      }`}
                    />
                  ) : active ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#D29BFF]" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0 text-[#4E4161]" />
                  )}
                  <span className="truncate">{step.name}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    );
  }

  // 3. Idle aesthetic showcase card matching the actual Remotion dual-tone palette
  return (
    <section className="rounded-2xl border border-[#D29BFF]/14 bg-[#140F1E] p-5">
      <div className="flex items-center gap-2 pb-3.5">
        <Film className="h-4 w-4 text-[#C98BF5]" />
        <h2 className="font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.12em] text-[#D6C9E6]">
          Output Preview Deck
        </h2>
      </div>

      {/* Mini dual-tone preview tiles faithfully representing the lyric video style */}
      <div className="grid grid-cols-2 gap-2.5">
        <div
          className="relative flex aspect-[4/3] flex-col items-center justify-center overflow-hidden rounded-xl p-3 text-center"
          style={{
            background:
              "radial-gradient(ellipse 82% 76% at 50% 48%, #D29BFF 0%, #B476E8 100%)",
          }}
        >
          <p className="font-[family-name:var(--font-display)] text-xs font-extrabold uppercase leading-[1.12] tracking-wide text-[#2B084A] sm:text-sm">
            WE&apos;LL DRINK
            <br />
            BY THE OCEAN
          </p>
          <StarMark
            variant="solid"
            size={12}
            className="absolute bottom-2.5 text-[#2B084A]"
          />
        </div>

        <div
          className="relative flex aspect-[4/3] flex-col items-center justify-center overflow-hidden rounded-xl p-3 text-center"
          style={{
            background:
              "radial-gradient(ellipse 82% 76% at 50% 48%, #2B084A 0%, #1F0536 100%)",
          }}
        >
          <p className="font-[family-name:var(--font-display)] text-xs font-extrabold uppercase leading-[1.12] tracking-wide text-[#C98BF5] sm:text-sm">
            ĐÊM NAY MÌNH
            <br />
            BƯỚC TIẾP
          </p>
          <StarMark
            variant="outline"
            size={12}
            className="absolute bottom-2.5 text-[#C98BF5]"
          />
        </div>
      </div>

      <p className="mt-3.5 text-xs leading-relaxed text-[#A698B8]">
        Upload an MP3 on the left to start rendering, or pick any completed job
        under <strong className="font-medium text-[#E5DAFA]">Recent Renders</strong>{" "}
        to preview and download the MP4 directly.
      </p>
    </section>
  );
}
