import { getGitHubConfig } from "./auth";
import type { AspectRatio, LanguageCode, WhisperModel } from "./types";

const GITHUB_API_BASE = "https://api.github.com";
export const WORKFLOW_FILE = "render-lyrics.yml";

export class GitHubApiError extends Error {
  status: number;
  details?: string;

  constructor(message: string, status: number, details?: string) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.details = details;
  }
}

function buildHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "lyric-video-renderer-web",
  };
}

async function githubRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const { token } = getGitHubConfig();
  const res = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...buildHeaders(token),
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    let details = "";
    try {
      const text = await res.text();
      details = text.slice(0, 500);
    } catch {
      // ignore body read error
    }
    throw new GitHubApiError(
      `GitHub API request failed (${res.status} ${res.statusText})`,
      res.status,
      details
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export type GitHubWorkflowRun = {
  id: number;
  name: string;
  display_title?: string;
  run_number: number;
  event: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
};

export type GitHubJobStep = {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
  started_at: string | null;
  completed_at: string | null;
};

export type GitHubWorkflowJob = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  steps?: GitHubJobStep[];
};

export type GitHubArtifact = {
  id: number;
  name: string;
  size_in_bytes: number;
  archive_download_url: string;
  expired: boolean;
  created_at: string;
};

export async function uploadAudioToRepo(
  audioPath: string,
  jobId: string,
  audioBuffer: Buffer
): Promise<void> {
  const { owner, repo, branch } = getGitHubConfig();
  const encodedPath = audioPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  await githubRequest(`/repos/${owner}/${repo}/contents/${encodedPath}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `chore(jobs): upload audio for job ${jobId} [skip ci]`,
      content: audioBuffer.toString("base64"),
      branch,
    }),
  });
}

export async function dispatchRenderWorkflow(params: {
  audioPath: string;
  lyricsText: string;
  aspectRatio: AspectRatio;
  whisperModel: WhisperModel;
  language: LanguageCode;
}): Promise<void> {
  const { owner, repo, branch } = getGitHubConfig();

  await githubRequest(
    `/repos/${owner}/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ref: branch,
        inputs: {
          audio_path: params.audioPath,
          lyrics_text: params.lyricsText,
          aspect_ratio: params.aspectRatio,
          whisper_model: params.whisperModel,
          language: params.language,
        },
      }),
    }
  );
}

export async function listWorkflowRuns(
  perPage = 10
): Promise<GitHubWorkflowRun[]> {
  const { owner, repo } = getGitHubConfig();
  const data = await githubRequest<{ workflow_runs?: GitHubWorkflowRun[] }>(
    `/repos/${owner}/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=${perPage}`
  );
  return data.workflow_runs ?? [];
}

export async function getWorkflowRun(
  runId: string
): Promise<GitHubWorkflowRun> {
  const { owner, repo } = getGitHubConfig();
  return githubRequest<GitHubWorkflowRun>(
    `/repos/${owner}/${repo}/actions/runs/${encodeURIComponent(runId)}`
  );
}

export async function getWorkflowRunJobs(
  runId: number | string
): Promise<GitHubWorkflowJob[]> {
  const { owner, repo } = getGitHubConfig();
  const data = await githubRequest<{ jobs?: GitHubWorkflowJob[] }>(
    `/repos/${owner}/${repo}/actions/runs/${encodeURIComponent(String(runId))}/jobs?per_page=10`
  );
  return data.jobs ?? [];
}

export async function getWorkflowRunArtifacts(
  runId: string
): Promise<GitHubArtifact[]> {
  const { owner, repo } = getGitHubConfig();
  const data = await githubRequest<{ artifacts?: GitHubArtifact[] }>(
    `/repos/${owner}/${repo}/actions/runs/${encodeURIComponent(runId)}/artifacts`
  );
  return data.artifacts ?? [];
}

/**
 * Download a GitHub Actions artifact ZIP archive into memory.
 * Handles the 302 redirect manually so Authorization is never forwarded
 * to Azure Blob Storage pre-signed URLs.
 */
export async function downloadArtifactZip(
  archiveDownloadUrl: string
): Promise<Uint8Array> {
  const { token } = getGitHubConfig();

  const initialRes = await fetch(archiveDownloadUrl, {
    method: "GET",
    redirect: "manual",
    cache: "no-store",
    headers: buildHeaders(token),
  });

  if (
    initialRes.status >= 300 &&
    initialRes.status < 400 &&
    initialRes.headers.get("location")
  ) {
    const signedUrl = initialRes.headers.get("location")!;
    const blobRes = await fetch(signedUrl, {
      method: "GET",
      cache: "no-store",
    });
    if (!blobRes.ok) {
      throw new GitHubApiError(
        `Artifact storage download failed (${blobRes.status} ${blobRes.statusText})`,
        blobRes.status
      );
    }
    return new Uint8Array(await blobRes.arrayBuffer());
  }

  if (!initialRes.ok) {
    throw new GitHubApiError(
      `Artifact download failed (${initialRes.status} ${initialRes.statusText})`,
      initialRes.status
    );
  }

  return new Uint8Array(await initialRes.arrayBuffer());
}
