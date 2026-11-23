import crypto from "node:crypto";

export type GitHubRepoConfig = {
  token: string;
  owner: string;
  repo: string;
  branch: string;
};

export function getGitHubConfig(): GitHubRepoConfig {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "Server misconfiguration: GITHUB_TOKEN environment variable is not set."
    );
  }

  return {
    token,
    owner: process.env.GITHUB_OWNER?.trim() || "duclee13",
    repo: process.env.GITHUB_REPO?.trim() || "lyric-video-renderer",
    branch: process.env.GITHUB_BRANCH?.trim() || "main",
  };
}

export function getPublicRepoMeta(): { owner: string; repo: string } {
  return {
    owner: process.env.GITHUB_OWNER?.trim() || "duclee13",
    repo: process.env.GITHUB_REPO?.trim() || "lyric-video-renderer",
  };
}

export function isPassphraseRequired(): boolean {
  return Boolean(process.env.APP_PASSWORD?.trim());
}

function sha256(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

export function verifyPassphrase(candidate: string | null | undefined): boolean {
  const expected = process.env.APP_PASSWORD?.trim();
  if (!expected) {
    return true;
  }
  if (!candidate) {
    return false;
  }

  const expectedDigest = sha256(expected);
  const candidateDigest = sha256(candidate.trim());
  return crypto.timingSafeEqual(expectedDigest, candidateDigest);
}

export function extractRequestPassphrase(request: Request): string | null {
  const headerValue = request.headers.get("x-app-passphrase");
  if (headerValue) {
    return headerValue;
  }
  const url = new URL(request.url);
  return url.searchParams.get("passphrase");
}
