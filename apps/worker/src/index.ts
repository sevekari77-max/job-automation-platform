import { PgBoss } from "pg-boss";
import { prisma } from "./db";
import { executeJob } from "./execution-service";
import { markStaleWorkersOffline, markWorkerOffline, recoverStaleExecutions, registerWorker, startHeartbeat, workerId } from "./worker-registry";
import type { ExecutionJobMessage } from "./execution-types";

const EXECUTION_QUEUE = "job-executions";
const SCHEDULED_QUEUE = "scheduled-executions";
const SCHEDULED_QUEUE_PREFIX = "scheduled-executions-";
const SCHEDULE_DISCOVERY_INTERVAL_MS = 30_000;
const STALE_WORKER_CHECK_INTERVAL_MS = 30_000;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const boss = new PgBoss({
  connectionString: databaseUrl,
});

let heartbeatTimer: NodeJS.Timeout | undefined;
let scheduleDiscoveryTimer: NodeJS.Timeout | undefined;
let staleWorkerTimer: NodeJS.Timeout | undefined;

const registeredScheduledQueues = new Set<string>();

async function createScheduledExecution(jobId: string): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${jobId}))
    `;

    const job = await tx.job.findUnique({
      where: {
        id: jobId,
      },
    });

    if (!job || job.status !== "ACTIVE" || !job.cron) {
      return null;
    }

    const existingExecution = await tx.execution.findFirst({
      where: {
        jobId,
        status: {
          in: ["QUEUED", "RUNNING", "RETRYING"],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (existingExecution) {
      return null;
    }

    const execution = await tx.execution.create({
      data: {
        jobId,
        status: "QUEUED",
        triggerType: "SCHEDULED",
        scheduledFor: new Date(),
        attemptCount: 0,
      },
    });

    return execution.id;
  });
}

async function registerScheduledQueue(jobId: string): Promise<void> {
  const queueName = `${SCHEDULED_QUEUE_PREFIX}${jobId}`;

  if (registeredScheduledQueues.has(queueName)) {
    return;
  }

  await boss.createQueue(queueName);

  await boss.work(
    queueName,
    {
      batchSize: 1,
    },
    async ([job]) => {
      if (!job) {
        return;
      }

      const data = job.data;

      if (
        typeof data !== "object" ||
        data === null ||
        !("jobId" in data) ||
        typeof data.jobId !== "string"
      ) {
        console.error(
          `Invalid scheduled job message received from ${queueName}`,
        );
        return;
      }

      console.log(
        `Worker ${workerId} processing scheduled job ${data.jobId}`,
      );

      const executionId = await createScheduledExecution(data.jobId);

      if (!executionId) {
        return;
      }

      await boss.send(EXECUTION_QUEUE, {
        executionId,
        jobId: data.jobId,
        attempt: 1,
      });
    },
  );

  registeredScheduledQueues.add(queueName);

  console.log(`Scheduled queue consumer started: ${queueName}`);
}

async function discoverScheduledQueues(): Promise<void> {
  const jobs = await prisma.job.findMany({
    where: {
      status: "ACTIVE",
      cron: {
        not: null,
      },
    },
    select: {
      id: true,
    },
  });

  for (const job of jobs) {
    await registerScheduledQueue(job.id);
  }
}

async function recoverStaleExecutionsAndRequeue(): Promise<void> {
  await markStaleWorkersOffline();

  const recoveredExecutionIds = await recoverStaleExecutions();

  for (const executionId of recoveredExecutionIds) {
    const execution = await prisma.execution.findUnique({
      where: {
        id: executionId,
      },
      select: {
        id: true,
        jobId: true,
        status: true,
        attemptCount: true,
      },
    });

    if (!execution || execution.status !== "RETRYING") {
      continue;
    }

    await boss.send(EXECUTION_QUEUE, {
      executionId: execution.id,
      jobId: execution.jobId,
      attempt: execution.attemptCount + 1,
    });

    console.log(
      `Requeued stale execution ${execution.id} as attempt ${execution.attemptCount + 1}`,
    );
  }
}

async function start(): Promise<void> {
  await prisma.$connect();

  await boss.start();

  await boss.createQueue(EXECUTION_QUEUE);
  await boss.createQueue(SCHEDULED_QUEUE);

  await registerWorker();

  heartbeatTimer = startHeartbeat();

  await boss.work<ExecutionJobMessage>(
    EXECUTION_QUEUE,
    {
      batchSize: 1,
    },
    async ([job]) => {
      if (!job) {
        return;
      }

      console.log(
        `Worker ${workerId} processing execution ${job.data.executionId}`,
      );

      const result = await executeJob(job.data, workerId);

      if (
        result.shouldRetry &&
        result.nextAttempt !== undefined &&
        result.retryDelayMs !== undefined
      ) {
        console.log(
          `Execution ${job.data.executionId} retrying in ${result.retryDelayMs}ms`,
        );

        await boss.sendAfter(
          EXECUTION_QUEUE,
          {
            executionId: job.data.executionId,
            jobId: job.data.jobId,
            attempt: result.nextAttempt,
          },
          {},
          result.retryDelayMs / 1000,
        );
      }
    },
  );

  await discoverScheduledQueues();

  scheduleDiscoveryTimer = setInterval(() => {
    void discoverScheduledQueues().catch((error: unknown) => {
      console.error("Scheduled queue discovery failed:", error);
    });
  }, SCHEDULE_DISCOVERY_INTERVAL_MS);

  void recoverStaleExecutionsAndRequeue().catch(
    (error: unknown) => {
      console.error(
        "Initial stale execution recovery failed:",
        error,
      );
    },
  );

  staleWorkerTimer = setInterval(() => {
    void recoverStaleExecutionsAndRequeue().catch(
      (error: unknown) => {
        console.error(
          "Stale execution recovery failed:",
          error,
        );
      },
    );
  }, STALE_WORKER_CHECK_INTERVAL_MS);

  console.log("Worker PostgreSQL connection established");
  console.log("Worker pg-boss connection established");
  console.log(`Execution queue: ${EXECUTION_QUEUE}`);
  console.log(`Scheduled queue: ${SCHEDULED_QUEUE}`);
  console.log(`Worker ID: ${workerId}`);
  console.log("Execution consumer started");
  console.log("Scheduled queue discovery started");
  console.log("Stale worker detection started");
  console.log("Stale execution recovery started");
}

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received. Shutting down...`);

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  if (scheduleDiscoveryTimer) {
    clearInterval(scheduleDiscoveryTimer);
  }

  if (staleWorkerTimer) {
    clearInterval(staleWorkerTimer);
  }

  await markWorkerOffline();
  await boss.stop();
  await prisma.$disconnect();

  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

start().catch(async (error: unknown) => {
  console.error("Worker failed to start:", error);

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  if (scheduleDiscoveryTimer) {
    clearInterval(scheduleDiscoveryTimer);
  }

  if (staleWorkerTimer) {
    clearInterval(staleWorkerTimer);
  }

  await prisma.$disconnect();

  process.exit(1);
});