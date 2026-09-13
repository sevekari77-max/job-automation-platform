import { randomUUID } from "node:crypto";
import { prisma } from "./db";

const HEARTBEAT_INTERVAL_MS = 30_000;
const STALE_WORKER_THRESHOLD_MS = 90_000;

export const workerId = randomUUID();
export const workerName = `worker-${workerId}`;

export async function registerWorker(): Promise<void> {
  await prisma.worker.upsert({
    where: {
      name: workerName,
    },
    create: {
      name: workerName,
      status: "ACTIVE",
      lastHeartbeat: new Date(),
    },
    update: {
      status: "ACTIVE",
      lastHeartbeat: new Date(),
    },
  });

  console.log(`Worker registered: ${workerName}`);
}

export async function heartbeat(): Promise<void> {
  await prisma.worker.update({
    where: {
      name: workerName,
    },
    data: {
      status: "ACTIVE",
      lastHeartbeat: new Date(),
    },
  });
}

export async function markStaleWorkersOffline(): Promise<number> {
  const staleBefore = new Date(
    Date.now() - STALE_WORKER_THRESHOLD_MS,
  );

  const staleWorkers = await prisma.worker.findMany({
    where: {
      status: "ACTIVE",
      lastHeartbeat: {
        lt: staleBefore,
      },
    },
    select: {
      name: true,
    },
  });

  if (staleWorkers.length === 0) {
    return 0;
  }

  const staleWorkerNames = staleWorkers.map(
    (worker) => worker.name,
  );

  const result = await prisma.worker.updateMany({
    where: {
      name: {
        in: staleWorkerNames,
      },
      status: "ACTIVE",
      lastHeartbeat: {
        lt: staleBefore,
      },
    },
    data: {
      status: "OFFLINE",
    },
  });

  if (result.count > 0) {
    console.warn(
      `Marked ${result.count} stale worker(s) offline`,
    );
  }

  return result.count;
}

export async function recoverStaleExecutions(): Promise<string[]> {
  const staleBefore = new Date(
    Date.now() - STALE_WORKER_THRESHOLD_MS,
  );

  const staleWorkers = await prisma.worker.findMany({
    where: {
      status: "OFFLINE",
      lastHeartbeat: {
        lt: staleBefore,
      },
    },
    select: {
      name: true,
    },
  });

  if (staleWorkers.length === 0) {
    return [];
  }

  const recoveredExecutionIds: string[] = [];

  for (const worker of staleWorkers) {
    const executions = await prisma.execution.findMany({
      where: {
        workerId: worker.name,
        status: "RUNNING",
      },
      select: {
        id: true,
        attemptCount: true,
      },
    });

    for (const execution of executions) {
      const recovered = await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`
            SELECT pg_advisory_xact_lock(
              hashtext(${execution.id})
            )
          `;

          const currentExecution =
            await tx.execution.findUnique({
              where: {
                id: execution.id,
              },
              select: {
                id: true,
                status: true,
                attemptCount: true,
                workerId: true,
              },
            });

          if (
            !currentExecution ||
            currentExecution.status !== "RUNNING" ||
            currentExecution.workerId !== worker.name
          ) {
            return false;
          }

          const attemptNumber =
            currentExecution.attemptCount;

          if (attemptNumber < 1) {
            return false;
          }

          await tx.executionAttempt.updateMany({
            where: {
              executionId: currentExecution.id,
              attemptNumber,
              status: "RUNNING",
            },
            data: {
              status: "FAILED",
              finishedAt: new Date(),
              errorMessage:
                "Worker became stale while executing this job",
            },
          });

          await tx.execution.update({
            where: {
              id: currentExecution.id,
            },
            data: {
              status: "RETRYING",
              workerId: null,
              finishedAt: null,
              errorMessage:
                "Worker became stale while executing this job",
            },
          });

          return true;
        },
      );

      if (recovered) {
        recoveredExecutionIds.push(execution.id);
        console.warn(
          `Recovered stale execution ${execution.id} from worker ${worker.name}`,
        );
      }
    }
  }

  return recoveredExecutionIds;
}

export function startHeartbeat(): NodeJS.Timeout {
  return setInterval(() => {
    void heartbeat().catch((error: unknown) => {
      console.error("Worker heartbeat failed:", error);
    });
  }, HEARTBEAT_INTERVAL_MS);
}

export async function markWorkerOffline(): Promise<void> {
  await prisma.worker.updateMany({
    where: {
      name: workerName,
    },
    data: {
      status: "OFFLINE",
      lastHeartbeat: new Date(),
    },
  });
}