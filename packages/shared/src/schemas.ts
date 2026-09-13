import { z } from "zod";

type JsonPrimitive = string | number | boolean | null;

type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const sensitiveHeaderNames = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
]);

const headersSchema = z
  .record(z.string(), z.string())
  .refine(
    (headers) =>
      Object.keys(headers).every(
        (name) => !sensitiveHeaderNames.has(name.toLowerCase()),
      ),
    {
      message:
        "Authorization, Cookie, Proxy-Authorization, and Set-Cookie headers are not allowed.",
    },
  );

const baseJobSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Job name is required")
    .max(120, "Job name must be 120 characters or less"),

  description: z
    .string()
    .trim()
    .max(500, "Description must be 500 characters or less")
    .nullable()
    .optional(),

  type: z.enum(HTTP_METHODS),

  url: z
    .string()
    .trim()
    .url("A valid URL is required")
    .max(2048, "URL must be 2048 characters or less"),

  headers: headersSchema.optional(),

  body: jsonValueSchema.optional(),

  cron: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .nullable()
    .optional(),

  timeoutMs: z
    .number()
    .int()
    .min(1000, "Timeout must be at least 1000ms")
    .max(120000, "Timeout cannot exceed 120000ms")
    .default(30000),

  maxRetries: z
    .number()
    .int()
    .min(0)
    .max(10)
    .default(3),

  backoffMs: z
    .number()
    .int()
    .min(100)
    .max(300000)
    .default(1000),
});

export const createJobSchema = baseJobSchema;

export const updateJobSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Job name is required")
    .max(120, "Job name must be 120 characters or less")
    .optional(),

  description: z
    .string()
    .trim()
    .max(500, "Description must be 500 characters or less")
    .nullable()
    .optional(),

  type: z.enum(HTTP_METHODS).optional(),

  url: z
    .string()
    .trim()
    .url("A valid URL is required")
    .max(2048, "URL must be 2048 characters or less")
    .optional(),

  headers: headersSchema.optional(),

  body: jsonValueSchema.optional(),

  cron: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .nullable()
    .optional(),

  timeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(120000)
    .optional(),

  maxRetries: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional(),

  backoffMs: z
    .number()
    .int()
    .min(100)
    .max(300000)
    .optional(),
});

export const jobIdSchema = z.object({
  id: z.string().cuid(),
});

export const executionIdSchema = z.object({
  id: z.string().cuid(),
});

export const loginSchema = z.object({
  email: z.string().trim().email("A valid email is required").max(320),
  password: z.string().min(8).max(128),
});

export const registerSchema = z.object({
  email: z.string().trim().email("A valid email is required").max(320),
  password: z.string().min(8).max(128),
});

export const listJobsQuerySchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const listExecutionsQuerySchema = z.object({
  status: z
    .enum([
      "QUEUED",
      "RUNNING",
      "SUCCEEDED",
      "FAILED",
      "RETRYING",
      "CANCELLED",
    ])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const retryExecutionSchema = z.object({
  executionId: z.string().cuid(),
});

export type HttpMethod = (typeof HTTP_METHODS)[number];

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;