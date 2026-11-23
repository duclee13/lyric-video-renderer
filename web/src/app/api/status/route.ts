import { NextResponse } from "next/server";
import { extractRequestPassphrase, verifyPassphrase } from "@/lib/auth";
import {
  getWorkflowRun,
  getWorkflowRunJobs,
  GitHubApiError,
  listWorkflowRuns,
  type GitHubWorkflowRun,
} from "@/lib/github";
import type { RenderStatusResponse, WorkflowStepStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveCurrentStep(
  run: GitHubWorkflowRun,
  steps: WorkflowStepStatus[]
): string {
  const active = steps.find((s) => s.status === "in_progress");
  if (active) {
    return active.name;
  }

  if (run.status === "completed") {
    if (run.conclusion === "success") {
      return "Render complete — MP4 artifact ready";
    }
    const failed = steps.find((s) => s.conclusion === "failure");
    if (failed) {
      return `Failed at: ${failed.name}`;
    }
    return `Finished with status: ${run.conclusion ?? "unknown"}`;
  }

  const completed = steps.filter((s) => s.status === "completed");
  if (completed.length > 0) {
    return `Completed: ${completed[completed.length - 1].name}`;
  }

  return run.status === "queued"
    ? "Queued on GitHub Actions ubuntu-latest runner…"
    : "Initializing workflow job…";
}

export async function GET(request: Request) {
  try {
    if (!verifyPassphrase(extractRequestPassphrase(request))) {
      return NextResponse.json(
        { error: "Invalid studio passphrase." },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const runIdParam = url.searchParams.get("runId")?.trim() || null;
    const sinceParam = url.searchParams.get("since")?.trim() || null;
    const jobIdParam = url.searchParams.get("jobId")?.trim() || null;

    let matchedRun: GitHubWorkflowRun | null = null;

    if (runIdParam) {
      if (!/^\d+$/.test(runIdParam)) {
        return NextResponse.json(
          { error: "Invalid runId parameter." },
          { status: 400 }
        );
      }
      matchedRun = await getWorkflowRun(runIdParam);
    } else {
      const sinceMs = sinceParam ? Date.parse(sinceParam) : NaN;
      if (sinceParam && Number.isNaN(sinceMs)) {
        return NextResponse.json(
          { error: "Invalid since ISO timestamp." },
          { status: 400 }
        );
      }

      const runs = await listWorkflowRuns(15);
      const dispatchRuns = runs.filter(
        (r) => r.event === "workflow_dispatch"
      );

      // Priority 1: exact jobId match in run display_title
      if (jobIdParam) {
        matchedRun =
          dispatchRuns.find((r) =>
            (r.display_title ?? "").includes(jobIdParam)
          ) ?? null;
      }

      // Priority 2: workflow_dispatch created at or shortly around `since`
      if (!matchedRun && !Number.isNaN(sinceMs)) {
        const thresholdMs = sinceMs - 15_000;
        const candidates = dispatchRuns.filter(
          (r) => Date.parse(r.created_at) >= thresholdMs
        );
        matchedRun = candidates[0] ?? null;
      }
    }

    if (!matchedRun) {
      const waitingPayload: RenderStatusResponse = {
        runId: null,
        status: "waiting",
        conclusion: null,
        htmlUrl: null,
        displayTitle: null,
        createdAt: null,
        updatedAt: null,
        currentStep: "Waiting for GitHub Actions to pick up the render job…",
        steps: [],
      };
      return NextResponse.json(waitingPayload, { status: 200 });
    }

    const jobs = await getWorkflowRunJobs(matchedRun.id);
    const primaryJob = jobs[0];
    const steps: WorkflowStepStatus[] = (primaryJob?.steps ?? []).map((s) => ({
      number: s.number,
      name: s.name,
      status: s.status,
      conclusion: s.conclusion,
      startedAt: s.started_at,
      completedAt: s.completed_at,
    }));

    const payload: RenderStatusResponse = {
      runId: matchedRun.id,
      status: matchedRun.status,
      conclusion: matchedRun.conclusion,
      htmlUrl: matchedRun.html_url,
      displayTitle: matchedRun.display_title ?? matchedRun.name,
      createdAt: matchedRun.created_at,
      updatedAt: matchedRun.updated_at,
      currentStep: resolveCurrentStep(matchedRun, steps),
      steps,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    if (err instanceof GitHubApiError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status >= 400 && err.status < 500 ? err.status : 502 }
      );
    }
    const message =
      err instanceof Error ? err.message : "Failed to fetch workflow status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
