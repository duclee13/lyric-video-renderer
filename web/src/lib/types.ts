export type AspectRatio = "4:3" | "9:16" | "1:1";
export type LanguageCode = "auto" | "en" | "vi";
export type WhisperModel = "small" | "base";

export type RenderDispatchResponse = {
  jobId: string;
  dispatchedAt: string;
  audioPath: string;
};

export type WorkflowStepStatus = {
  number: number;
  name: string;
  status: "queued" | "in_progress" | "completed" | string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type RenderStatusResponse = {
  runId: number | null;
  status: "waiting" | "queued" | "in_progress" | "completed" | string;
  conclusion: string | null;
  htmlUrl: string | null;
  displayTitle: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  currentStep: string;
  steps: WorkflowStepStatus[];
};

export type RecentRunSummary = {
  runId: number;
  runNumber: number;
  displayTitle: string;
  status: string;
  conclusion: string | null;
  event: string;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  aspectRatio: AspectRatio | null;
  jobLabel: string;
};

export type RunsListResponse = {
  runs: RecentRunSummary[];
};
