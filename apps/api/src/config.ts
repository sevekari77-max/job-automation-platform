import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const environmentFiles = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
];

const environmentFile = environmentFiles.find(
  (filePath) => fs.existsSync(filePath),
);

if (environmentFile) {
  process.loadEnvFile?.(environmentFile);
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_URL: z
    .string()
    .url()
    .default("http://localhost:4000"),
  CORS_ORIGIN: z
    .string()
    .url()
    .default("http://localhost:3000"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export const config = envSchema.parse(process.env);