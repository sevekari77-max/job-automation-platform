import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "./config";
import { authRouter } from "./routes/auth";
import { jobsRouter } from "./routes/jobs";

export const app = express();

app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  }),
);

app.use(
  cors({
    origin: config.CORS_ORIGIN,
    credentials: true,
  }),
);

app.use(
  express.json({
    limit: "256kb",
  }),
);

app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/jobs", jobsRouter);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "api",
    timestamp: new Date().toISOString(),
  });
});

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("API ERROR:", error);

    if (error instanceof Error && error.name === "ZodError") {
      res.status(400).json({
        error: "Validation failed",
        details: error.message,
      });
      return;
    }

    const message =
      error instanceof Error ? error.message : "Unknown server error";

    res.status(500).json({
      error: "Internal server error",
      ...(config.NODE_ENV === "development"
        ? {
            details: message,
          }
        : {}),
    });
  },
);