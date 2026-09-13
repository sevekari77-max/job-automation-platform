import { boss, SCHEDULED_QUEUE_PREFIX } from "./queue";

export function getScheduledQueueName(jobId: string): string {
  return `${SCHEDULED_QUEUE_PREFIX}${jobId}`;
}

export async function scheduleJob(
  jobId: string,
  cron: string,
): Promise<void> {
  const queueName = getScheduledQueueName(jobId);

  await boss.createQueue(queueName);

  await boss.schedule(
    queueName,
    cron,
    {
      jobId,
    },
    {
      retryLimit: 0,
    },
  );
}

export async function unscheduleJob(
  jobId: string,
): Promise<void> {
  const queueName = getScheduledQueueName(jobId);

  await boss.unschedule(queueName);
}