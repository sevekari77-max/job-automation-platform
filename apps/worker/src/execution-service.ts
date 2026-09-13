import { prisma } from "./db";
import type {
  ExecutionJobMessage,
  JobConfiguration,
} from "./execution-types";

const MAX_RESPONSE_BODY_LENGTH = 10_000;

function serializeResponseBody(value: string): string {
  if (value.length <= MAX_RESPONSE_BODY_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_RESPONSE_BODY_LENGTH)}\n...[truncated]`;
}

function getRequestBody(
  type: JobConfiguration["type"],
  body: unknown,
): string | undefined {
  if (body === null || body === undefined) {
    return undefined;
  }

  if (type === "GET" || type === "DELETE") {
    return undefined;
  }

  return JSON.stringify(body);
}

function getHeaders(value: unknown): Record<string, string> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  const result: Record<string, string> = {};

  for (const [key, headerValue] of Object.entries(value)) {
    if (typeof headerValue === "string") {
      result[key] = headerValue;
    }
  }

  return result;
}

export interface ExecutionResult {
  succeeded: boolean;
  shouldRetry: boolean;
  nextAttempt?: number;
  retryDelayMs?: number;
}

export async function executeJob(
  message: ExecutionJobMessage,
  workerId: string,
): Promise<ExecutionResult> {
  const execution = await prisma.execution.findUnique({
    where: {
      id: message.executionId,
    },
    include: {
      job: true,
    },
  });

  if (!execution) {
    throw new Error(
      `Execution ${message.executionId} was not found`,
    );
  }

  // Duplicate pg-boss messages must never execute the HTTP request twice.
  if (
    execution.status !== "QUEUED" &&
    execution.status !== "RETRYING"
  ) {
    return {
      succeeded: false,
      shouldRetry: false,
    };
  }

  const job: JobConfiguration = {
    id: execution.job.id,
    type: execution.job.type,
    url: execution.job.url,
    headers: getHeaders(execution.job.headers),
    body: execution.job.body,
    timeoutMs: execution.job.timeoutMs,
    maxRetries: execution.job.maxRetries,
    backoffMs: execution.job.backoffMs,
  };

  const attemptNumber = message.attempt;
  const startedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.execution.update({
      where: {
        id: execution.id,
      },
      data: {
        status: "RUNNING",
        workerId,
        startedAt,
        attemptCount: attemptNumber,
        errorMessage: null,
      },
    });

    await tx.executionAttempt.create({
      data: {
        executionId: execution.id,
        attemptNumber,
        status: "RUNNING",
        startedAt,
      },
    });
  });

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, job.timeoutMs);

  try {
    const response = await fetch(job.url, {
      method: job.type,
      headers: job.headers ?? {},
      body: getRequestBody(job.type, job.body),
      signal: controller.signal,
      redirect: "error",
    });

    const responseText = serializeResponseBody(
      await response.text(),
    );

    const finishedAt = new Date();

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText}: ${responseText}`,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.executionAttempt.update({
        where: {
          executionId_attemptNumber: {
            executionId: execution.id,
            attemptNumber,
          },
        },
        data: {
          status: "SUCCEEDED",
          finishedAt,
          statusCode: response.status,
          responseBody: responseText,
        },
      });

      await tx.execution.update({
        where: {
          id: execution.id,
        },
        data: {
          status: "SUCCEEDED",
          finishedAt,
          errorMessage: null,
        },
      });
    });

    return {
      succeeded: true,
      shouldRetry: false,
    };
  } catch (error: unknown) {
    const finishedAt = new Date();

    const errorMessage =
      error instanceof Error
        ? error.name === "AbortError"
          ? `Request timed out after ${job.timeoutMs}ms`
          : error.message
        : "Unknown execution error";

    const shouldRetry = attemptNumber <= job.maxRetries;
    const nextAttempt = attemptNumber + 1;

    const retryDelayMs = Math.min(
      job.backoffMs * 2 ** (attemptNumber - 1),
      300_000,
    );

    await prisma.$transaction(async (tx) => {
      await tx.executionAttempt.update({
        where: {
          executionId_attemptNumber: {
            executionId: execution.id,
            attemptNumber,
          },
        },
        data: {
          status: "FAILED",
          finishedAt,
          errorMessage,
        },
      });

      await tx.execution.update({
        where: {
          id: execution.id,
        },
        data: {
          status: shouldRetry ? "RETRYING" : "FAILED",
          finishedAt: shouldRetry ? null : finishedAt,
          errorMessage,
        },
      });
    });

    return {
      succeeded: false,
      shouldRetry,
      nextAttempt: shouldRetry ? nextAttempt : undefined,
      retryDelayMs: shouldRetry ? retryDelayMs : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}