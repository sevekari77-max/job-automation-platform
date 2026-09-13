import { app } from "./app";
import { config } from "./config";
import { prisma } from "./db";
import { startQueue, stopQueue } from "./queue";

async function startServer(): Promise<void> {
  await startQueue();

  const server = app.listen(config.API_PORT, () => {
    console.log(`API listening on ${config.API_URL}`);
  });

  async function shutdown(signal: string): Promise<void> {
    console.log(`${signal} received. Shutting down...`);

    await stopQueue();

    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

startServer().catch((error: unknown) => {
  console.error("Failed to start API:", error);
  process.exit(1);
});