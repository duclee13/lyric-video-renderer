import { NextResponse } from "next/server";
import { extractRequestPassphrase, verifyPassphrase } from "@/lib/auth";
import { GitHubApiError, listWorkflowRuns } from "@/lib/github";
import type {
  AspectRatio,
  RecentRunSummary,
  RunsListResponse,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRunMetadata(title: string, runNumber: number): {
  aspectRatio: AspectRatio | null;
  jobLabel: string;
} {
  const ratioMatch = /\[(4:3|9:16|1:1)\]/.exec(title);
  const aspectRatio = ratioMatch ? (ratioMatch[1] as AspectRatio) : null;

  const jobMatch = /input\/jobs\/([a-zA-Z0-9_-]+)\/audio\.mp3/.exec(title);
  if (jobMatch) {
    return { aspectRatio, jobLabel: `Job ${jobMatch[1]}` };
  }

  const fileMatch = /input\/([^\s/]+\.mp3)/i.exec(title);
  if (fileMatch) {
    return { aspectRatio, jobLabel: fileMatch[1] };
  }

  return { aspectRatio, jobLabel: `Render #${runNumber}` };
}

export async function GET(request: Request) {
  try {
    if (!verifyPassphrase(extractRequestPassphrase(request))) {
      return NextResponse.json(
        { error: "Invalid studio passphrase." },
        { status: 401 }
      );
    }

    const rawRuns = await listWorkflowRuns(10);
    const runs: RecentRunSummary[] = rawRuns.map((run) => {
      const displayTitle = run.display_title ?? run.name;
      const { aspectRatio, jobLabel } = parseRunMetadata(
        displayTitle,
        run.run_number
      );
      return {
        runId: run.id,
        runNumber: run.run_number,
        displayTitle,
        status: run.status,
        conclusion: run.conclusion,
        event: run.event,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        htmlUrl: run.html_url,
        aspectRatio,
        jobLabel,
      };
    });

    const payload: RunsListResponse = { runs };
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    if (err instanceof GitHubApiError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status >= 400 && err.status < 500 ? err.status : 502 }
      );
    }
    const message =
      err instanceof Error ? err.message : "Failed to fetch recent runs.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
