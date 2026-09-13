import { Router } from "express";
import { createJobSchema, jobIdSchema, listJobsQuerySchema, updateJobSchema } from "@job-platform/shared";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../db";
import { getAuthenticatedUser, requireAuth } from "../auth";
import { assertSafeUrl } from "../url-security";
import { assertValidCron } from "../cron";
import { boss, EXECUTION_QUEUE } from "../queue";
import { scheduleJob, unscheduleJob } from "../scheduler";

export const jobsRouter = Router();

jobsRouter.use(requireAuth);

jobsRouter.get("/", async (req, res, next) => {
  try {
    const user = getAuthenticatedUser(req);
    const query = listJobsQuerySchema.parse(req.query);

    const where = {
      userId: user.id,
      ...(query.status ? { status: query.status } : {}),
    };

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: {
          updatedAt: "desc",
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          name: true,
          description: true,
          type: true,
          url: true,
          status: true,
          cron: true,
          timeoutMs: true,
          maxRetries: true,
          backoffMs: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.job.count({
        where,
      }),
    ]);

    res.status(200).json({
      jobs,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    });
  } catch (error) {
    next(error);
  }
});

jobsRouter.post("/", async (req, res, next) => {
  try {
    const user = getAuthenticatedUser(req);
    const input = createJobSchema.parse(req.body);

    await assertSafeUrl(input.url);

    if (input.cron) {
      assertValidCron(input.cron);
    }

    const job = await prisma.job.create({
      data: {
        userId: user.id,
        name: input.name,
        description: input.description ?? null,
        type: input.type,
        url: input.url,
        headers: input.headers,
        body:
          input.body === undefined
            ? undefined
            : input.body === null
              ? Prisma.JsonNull
              : input.body,
        cron: input.cron ?? null,
        timeoutMs: input.timeoutMs,
        maxRetries: input.maxRetries,
        backoffMs: input.backoffMs,
      },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        url: true,
        headers: true,
        body: true,
        status: true,
        cron: true,
        timeoutMs: true,
        maxRetries: true,
        backoffMs: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (job.status === "ACTIVE" && job.cron) {
      await scheduleJob(job.id, job.cron);
    }

    res.status(201).json({ job });
  } catch (error) {
    next(error);
  }
});

jobsRouter.get("/:id", async (req, res, next) => {
  try {
    const user = getAuthenticatedUser(req);
    const { id } = jobIdSchema.parse(req.params);

    const job = await prisma.job.findFirst({
      where: {
        id,
        userId: user.id,
      },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        url: true,
        headers: true,
        body: true,
        status: true,
        cron: true,
        timeoutMs: true,
        maxRetries: true,
        backoffMs: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!job) {
      res.status(404).json({
        error: "Job not found",
      });
      return;
    }

    res.status(200).json({ job });
  } catch (error) {
    next(error);
  }
});

jobsRouter.patch("/:id", async (req, res, next) => {
  try {
    const user = getAuthenticatedUser(req);
    const { id } = jobIdSchema.parse(req.params);
    const input = updateJobSchema.parse(req.body);

    const existingJob = await prisma.job.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!existingJob) {
      res.status(404).json({
        error: "Job not found",
      });
      return;
    }

    if (input.url !== undefined) {
      await assertSafeUrl(input.url);
    }

    if (input.cron !== undefined && input.cron !== null) {
      assertValidCron(input.cron);
    }

    const job = await prisma.job.update({
      where: {
        id: existingJob.id,
      },
      data: {
        ...(input.name !== undefined && {
          name: input.name,
        }),
        ...(input.description !== undefined && {
          description: input.description,
        }),
        ...(input.type !== undefined && {
          type: input.type,
        }),
        ...(input.url !== undefined && {
          url: input.url,
        }),
        ...(input.headers !== undefined && {
          headers: input.headers,
        }),
        ...(input.body !== undefined && {
          body:
            input.body === null
              ? Prisma.JsonNull
              : input.body,
        }),
        ...(input.cron !== undefined && {
          cron: input.cron,
        }),
        ...(input.timeoutMs !== undefined && {
          timeoutMs: input.timeoutMs,
        }),
        ...(input.maxRetries !== undefined && {
          maxRetries: input.maxRetries,
        }),
        ...(input.backoffMs !== undefined && {
          backoffMs: input.backoffMs,
        }),
      },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        url: true,
        headers: true,
        body: true,
        status: true,
        cron: true,
        timeoutMs: true,
        maxRetries: true,
        backoffMs: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (job.status === "ACTIVE" && job.cron) {
      await scheduleJob(job.id, job.cron);
    } else {
      await unscheduleJob(job.id);
    }

    res.status(200).json({ job });
  } catch (error) {
    next(error);
  }
});

jobsRouter.delete("/:id", async (req, res, next) => {
  try {
    const user = getAuthenticatedUser(req);
    const { id } = jobIdSchema.parse(req.params);

    const existingJob = await prisma.job.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!existingJob) {
      res.status(404).json({
        error: "Job not found",
      });
      return;
    }

    await unscheduleJob(existingJob.id);

    const job = await prisma.job.update({
      where: {
        id: existingJob.id,
      },
      data: {
        status: "ARCHIVED",
      },
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
      },
    });

    res.status(200).json({ job });
  } catch (error) {
    next(error);
  }
});

jobsRouter.post("/:id/run", async (req, res, next) => {
  try {
    const user = getAuthenticatedUser(req);
    const { id } = jobIdSchema.parse(req.params);

    const execution = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${id}))
      `;

      const job = await tx.job.findFirst({
        where: {
          id,
          userId: user.id,
        },
      });

      if (!job) {
        res.status(404).json({
          error: "Job not found",
        });
        return null;
      }

      if (job.status === "ARCHIVED") {
        res.status(409).json({
          error: "Archived jobs cannot be run",
        });
        return null;
      }

      const existingExecution = await tx.execution.findFirst({
        where: {
          jobId: id,
          status: {
            in: ["QUEUED", "RUNNING", "RETRYING"],
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (existingExecution) {
        res.status(409).json({
          error: "Job already has an active execution",
          executionId: existingExecution.id,
        });
        return null;
      }

      return tx.execution.create({
        data: {
          jobId: id,
          status: "QUEUED",
          triggerType: "MANUAL",
          attemptCount: 0,
        },
      });
    });

    if (!execution) {
      return;
    }

    try {
      await boss.send(EXECUTION_QUEUE, {
        executionId: execution.id,
        jobId: execution.jobId,
        attempt: 1,
      });
    } catch (queueError) {
      await prisma.execution.update({
        where: {
          id: execution.id,
        },
        data: {
          status: "FAILED",
          errorMessage: "Failed to enqueue execution",
          finishedAt: new Date(),
        },
      });

      throw queueError;
    }

    res.status(202).json({
      execution,
      message: "Job execution queued",
    });
  } catch (error) {
    next(error);
  }
});

jobsRouter.get("/:id/executions", async (req, res, next) => {
  try {
    const user = getAuthenticatedUser(req);
    const { id } = jobIdSchema.parse(req.params);

    const job = await prisma.job.findFirst({
      where: {
        id,
        userId: user.id,
      },
      select: {
        id: true,
      },
    });

    if (!job) {
      res.status(404).json({
        error: "Job not found",
      });
      return;
    }

    const executions = await prisma.execution.findMany({
      where: {
        jobId: id,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        status: true,
        triggerType: true,
        scheduledFor: true,
        startedAt: true,
        finishedAt: true,
        attemptCount: true,
        workerId: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(200).json({
      executions,
    });
  } catch (error) {
    next(error);
  }
});

jobsRouter.get("/:id/executions/:executionId", async (req, res, next) => {
  try {
    const user = getAuthenticatedUser(req);
    const { id } = jobIdSchema.parse(req.params);
    const executionId = req.params.executionId;

    const job = await prisma.job.findFirst({
      where: {
        id,
        userId: user.id,
      },
      select: {
        id: true,
      },
    });

    if (!job) {
      res.status(404).json({
        error: "Job not found",
      });
      return;
    }

    const execution = await prisma.execution.findFirst({
      where: {
        id: executionId,
        jobId: id,
      },
      include: {
        attempts: {
          orderBy: {
            attemptNumber: "asc",
          },
        },
      },
    });

    if (!execution) {
      res.status(404).json({
        error: "Execution not found",
      });
      return;
    }

    res.status(200).json({
      execution,
    });
  } catch (error) {
    next(error);
  }
});

jobsRouter.post("/:id/pause", async (req, res, next) => {
  try {
    const user = getAuthenticatedUser(req);
    const { id } = jobIdSchema.parse(req.params);

    const existingJob = await prisma.job.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!existingJob) {
      res.status(404).json({
        error: "Job not found",
      });
      return;
    }

    if (existingJob.status === "ARCHIVED") {
      res.status(409).json({
        error: "Archived jobs cannot be paused",
      });
      return;
    }

    if (existingJob.status === "PAUSED") {
      res.status(409).json({
        error: "Job is already paused",
      });
      return;
    }

    await unscheduleJob(existingJob.id);

    const job = await prisma.job.update({
      where: {
        id: existingJob.id,
      },
      data: {
        status: "PAUSED",
      },
      select: {
        id: true,
        name: true,
        status: true,
        cron: true,
        updatedAt: true,
      },
    });

    res.status(200).json({
      job,
      message: "Job paused",
    });
  } catch (error) {
    next(error);
  }
});

jobsRouter.post("/:id/resume", async (req, res, next) => {
  try {
    const user = getAuthenticatedUser(req);
    const { id } = jobIdSchema.parse(req.params);

    const existingJob = await prisma.job.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!existingJob) {
      res.status(404).json({
        error: "Job not found",
      });
      return;
    }

    if (existingJob.status === "ARCHIVED") {
      res.status(409).json({
        error: "Archived jobs cannot be resumed",
      });
      return;
    }

    if (existingJob.status === "ACTIVE") {
      res.status(409).json({
        error: "Job is already active",
      });
      return;
    }

    const job = await prisma.job.update({
      where: {
        id: existingJob.id,
      },
      data: {
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        status: true,
        cron: true,
        updatedAt: true,
      },
    });

    if (job.cron) {
      await scheduleJob(job.id, job.cron);
    }

    res.status(200).json({
      job,
      message: "Job resumed",
    });
  } catch (error) {
    next(error);
  }
});