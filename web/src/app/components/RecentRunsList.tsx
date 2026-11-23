"use client";

import React from "react";
import {
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { RecentRunSummary } from "@/lib/types";

type RecentRunsListProps = {
  runs: RecentRunSummary[];
  loading: boolean;
  error: string | null;
  selectedRunId: number | null;
  passphrase: string;
  requiresPassphrase: boolean;
  onRefresh: () => void;
  onSelectRun: (run: RecentRunSummary) => void;
};

function formatRelativeTime(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (diffSec < 60) return "just now";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatusBadge({
  status,
  conclusion,
}: {
  status: string;
  conclusion: string | null;
}) {
  if (status !== "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#D29BFF]/15 px-2 py-0.5 text-[11px] font-medium text-[#D29BFF]">
        <Loader2 className="h-3 w-3 animate-spin" />
        {status === "queued" ? "Queued" : "Rendering"}
      </span>
    );
  }
  if (conclusion === "success") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        Ready
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-300">
      <XCircle className="h-3 w-3" />
      {conclusion ?? "Failed"}
    </span>
  );
}

export function RecentRunsList({
  runs,
  loading,
  error,
  selectedRunId,
  passphrase,
  requiresPassphrase,
  onRefresh,
  onSelectRun,
}: RecentRunsListProps) {
  const buildDownloadHref = (runId: number) => {
    const params = new URLSearchParams({
      runId: String(runId),
      download: "1",
    });
    if (requiresPassphrase && passphrase.trim()) {
      params.set("passphrase", passphrase.trim());
    }
    return `/api/download?${params.toString()}`;
  };

  return (
    <section className="rounded-2xl border border-[#D29BFF]/14 bg-[#140F1E] p-5">
      <div className="flex items-center justify-between gap-2 pb-3.5">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-[#C98BF5]" />
          <h2 className="font-[family-name:var(--font-display)] text-xs font-extrabold uppercase tracking-[0.12em] text-[#D6C9E6]">
            Recent Renders
          </h2>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh recent renders"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs font-medium text-[#B8A9CC] transition hover:border-[#D29BFF]/35 hover:text-[#F6F1FC] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <p className="rounded-xl border border-white/10 bg-[#1A1328] px-3.5 py-3 text-xs text-[#C4B4D8]">
          {error}
        </p>
      ) : loading && runs.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-[#A698B8]">
          <Loader2 className="h-4 w-4 animate-spin text-[#C98BF5]" />
          Loading recent workflow runs…
        </div>
      ) : runs.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-[#120D1B] px-4 py-6 text-center text-xs text-[#8E7EA3]">
          No renders yet. Upload an MP3 to start your first kinetic lyric video.
        </p>
      ) : (
        <ul className="space-y-2">
          {runs.map((run) => {
            const isSelected = selectedRunId === run.runId;
            const isReady =
              run.status === "completed" && run.conclusion === "success";

            return (
              <li
                key={run.runId}
                className={`rounded-xl border p-3 transition ${
                  isSelected
                    ? "border-[#D29BFF]/45 bg-[#221638]"
                    : "border-white/8 bg-[#120D1B] hover:border-[#D29BFF]/25 hover:bg-[#181126]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectRun(run)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-xs font-semibold text-[#F6F1FC]">
                        {run.jobLabel}
                      </span>
                      {run.aspectRatio && (
                        <span className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[10px] text-[#C9BADB]">
                          {run.aspectRatio}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-[#8E7EA3]">
                      #{run.runNumber} · {formatRelativeTime(run.createdAt)}
                    </p>
                  </button>

                  <StatusBadge
                    status={run.status}
                    conclusion={run.conclusion}
                  />
                </div>

                <div className="mt-2.5 flex items-center gap-2 border-t border-white/6 pt-2">
                  {isReady ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onSelectRun(run)}
                        className="inline-flex items-center gap-1 rounded-md bg-[#D29BFF]/15 px-2.5 py-1 text-[11px] font-semibold text-[#D29BFF] transition hover:bg-[#D29BFF]/25"
                      >
                        <Play className="h-3 w-3" />
                        Preview
                      </button>
                      <a
                        href={buildDownloadHref(run.runId)}
                        download={`lyric-video-${run.runId}.mp4`}
                        className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1 text-[11px] font-medium text-[#D6C9E6] transition hover:border-[#D29BFF]/35 hover:text-[#F6F1FC]"
                      >
                        <Download className="h-3 w-3" />
                        MP4
                      </a>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectRun(run)}
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1 text-[11px] font-medium text-[#D6C9E6] transition hover:border-[#D29BFF]/35 hover:text-[#F6F1FC]"
                    >
                      Inspect Steps
                    </button>
                  )}

                  <a
                    href={run.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto inline-flex items-center gap-1 text-[11px] text-[#8E7EA3] transition hover:text-[#D29BFF]"
                  >
                    Logs
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
