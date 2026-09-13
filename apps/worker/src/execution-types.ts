import type { HttpMethod } from "@job-platform/shared";

export interface ExecutionJobMessage {
  executionId: string;
  jobId: string;
  attempt: number;
}

export interface JobConfiguration {
  id: string;
  type: HttpMethod;
  url: string;
  headers: Record<string, string> | null;
  body: unknown;
  timeoutMs: number;
  maxRetries: number;
  backoffMs: number;
}