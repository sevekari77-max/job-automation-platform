import { PgBoss } from "pg-boss";
import { config } from "./config";

export const EXECUTION_QUEUE = "job-executions";
export const SCHEDULED_QUEUE = "scheduled-executions";
export const SCHEDULED_QUEUE_PREFIX = "scheduled-executions-";

export const boss = new PgBoss({
  connectionString: config.DATABASE_URL,
});

let started = false;

export async function startQueue(): Promise<void> {
  if (started) {
    return;
  }

  await boss.start();

  await boss.createQueue(EXECUTION_QUEUE);
  await boss.createQueue(SCHEDULED_QUEUE);

  started = true;

  console.log("pg-boss started");
}

export async function stopQueue(): Promise<void> {
  if (!started) {
    return;
  }

  await boss.stop();
  started = false;

  console.log("pg-boss stopped");
}