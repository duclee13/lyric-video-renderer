import { unzipSync } from "fflate";
import { NextResponse } from "next/server";
import { extractRequestPassphrase, verifyPassphrase } from "@/lib/auth";
import {
  downloadArtifactZip,
  getWorkflowRunArtifacts,
  GitHubApiError,
} from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    if (!verifyPassphrase(extractRequestPassphrase(request))) {
      return NextResponse.json(
        { error: "Invalid studio passphrase." },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const runId = url.searchParams.get("runId")?.trim();
    const forceDownload = url.searchParams.get("download") === "1";

    if (!runId || !/^\d+$/.test(runId)) {
      return NextResponse.json(
        { error: "Missing or invalid runId query parameter." },
        { status: 400 }
      );
    }

    const artifacts = await getWorkflowRunArtifacts(runId);
    const videoArtifact =
      artifacts.find((a) => a.name === "lyric-video" && !a.expired) ??
      artifacts.find(
        (a) => a.name.toLowerCase().includes("video") && !a.expired
      );

    if (!videoArtifact) {
      return NextResponse.json(
        {
          error:
            "Rendered video artifact not found or has expired (artifacts are retained for 14 days).",
        },
        { status: 404 }
      );
    }

    const zipBytes = await downloadArtifactZip(
      videoArtifact.archive_download_url
    );
    const extracted = unzipSync(zipBytes);

    const mp4EntryName =
      Object.keys(extracted).find((name) =>
        name.toLowerCase().endsWith("lyric-video.mp4")
      ) ??
      Object.keys(extracted).find((name) =>
        name.toLowerCase().endsWith(".mp4")
      );

    if (!mp4EntryName) {
      return NextResponse.json(
        { error: "Artifact archive did not contain a .mp4 video file." },
        { status: 404 }
      );
    }

    const mp4Bytes = extracted[mp4EntryName];
    const totalLength = mp4Bytes.byteLength;
    const filename = `lyric-video-${runId}.mp4`;
    const disposition = forceDownload
      ? `attachment; filename="${filename}"`
      : `inline; filename="${filename}"`;

    // Support HTTP Range requests so HTML5 <video> seeking works in Chrome & Safari
    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
      if (match) {
        const start = match[1] ? Number.parseInt(match[1], 10) : 0;
        const end = match[2]
          ? Math.min(Number.parseInt(match[2], 10), totalLength - 1)
          : totalLength - 1;

        if (
          Number.isNaN(start) ||
          Number.isNaN(end) ||
          start < 0 ||
          start >= totalLength ||
          end < start
        ) {
          return new NextResponse(null, {
            status: 416,
            headers: {
              "Content-Range": `bytes */${totalLength}`,
            },
          });
        }

        const chunk = mp4Bytes.subarray(start, end + 1);
        return new NextResponse(
          Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength),
          {
            status: 206,
            headers: {
              "Content-Type": "video/mp4",
              "Content-Length": String(chunk.byteLength),
              "Content-Range": `bytes ${start}-${end}/${totalLength}`,
              "Accept-Ranges": "bytes",
              "Content-Disposition": disposition,
              "Cache-Control": "private, max-age=3600",
            },
          }
        );
      }
    }

    return new NextResponse(
      Buffer.from(mp4Bytes.buffer, mp4Bytes.byteOffset, mp4Bytes.byteLength),
      {
        status: 200,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(totalLength),
          "Accept-Ranges": "bytes",
          "Content-Disposition": disposition,
          "Cache-Control": "private, max-age=3600",
        },
      }
    );
  } catch (err) {
    if (err instanceof GitHubApiError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status >= 400 && err.status < 500 ? err.status : 502 }
      );
    }
    const message =
      err instanceof Error ? err.message : "Failed to extract video artifact.";
    console.error("[api/download] Error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
