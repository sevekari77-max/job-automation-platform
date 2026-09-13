import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../apps/api/src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash("DemoPassword123!", 12);

  const user = await prisma.user.upsert({
    where: {
      email: "demo@example.com",
    },
    update: {
      passwordHash,
    },
    create: {
      email: "demo@example.com",
      passwordHash,
    },
  });

  await prisma.job.deleteMany({
    where: {
      userId: user.id,
    },
  });

  await prisma.job.createMany({
    data: [
      {
        userId: user.id,
        name: "Health Check",
        description: "Simple GET request demo job",
        type: "GET",
        url: "https://httpbin.org/status/200",
        timeoutMs: 30000,
        maxRetries: 3,
        backoffMs: 1000,
      },
      {
        userId: user.id,
        name: "HTTP Response Demo",
        description: "GET request that returns a JSON response",
        type: "GET",
        url: "https://httpbin.org/json",
        timeoutMs: 30000,
        maxRetries: 3,
        backoffMs: 1000,
      },
      {
        userId: user.id,
        name: "Scheduled Demo",
        description: "Scheduled HTTP job example",
        type: "GET",
        url: "https://httpbin.org/status/200",
        cron: "*/15 * * * *",
        timeoutMs: 30000,
        maxRetries: 3,
        backoffMs: 1000,
      },
    ],
  });

  console.log("Database seeded successfully.");
  console.log("Demo login: demo@example.com");
  console.log("Demo password: DemoPassword123!");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });