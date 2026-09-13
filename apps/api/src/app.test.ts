import { randomUUID } from "node:crypto";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { app } from "./app";
import { prisma } from "./db";
import { boss, EXECUTION_QUEUE } from "./queue";

describe("API integration", () => {
  beforeAll(async () => {
    await boss.start();
    await boss.createQueue(EXECUTION_QUEUE);
  });

  const email = `test-${randomUUID()}@example.com`;
  const password = "TestPassword123!";

  let cookie: string | undefined;
  let jobId: string | undefined;

  afterAll(async () => {
    if (jobId) {
      await prisma.job.deleteMany({
        where: {
          id: jobId,
        },
      });
    }

    await prisma.user.deleteMany({
      where: {
        email,
      },
    });

    await boss.stop();
    await prisma.$disconnect();
  });

  it("registers a user", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        email,
        password,
      })
      .expect(201);

    expect(response.body.user).toMatchObject({
      email,
    });

    expect(response.headers["set-cookie"]).toBeDefined();

    const cookies = response.headers["set-cookie"];

    if (cookies) {
      cookie = cookies[0];
    }

    expect(cookie).toBeDefined();
  });

  it("returns the authenticated user", async () => {
    expect(cookie).toBeDefined();

    const response = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookie as string)
      .expect(200);

    expect(response.body.user).toMatchObject({
      email,
    });
  });

  it("creates a job", async () => {
    expect(cookie).toBeDefined();

    const response = await request(app)
      .post("/api/jobs")
      .set("Cookie", cookie as string)
      .send({
        name: "Integration Test Job",
        description: "Created by API integration tests",
        type: "GET",
        url: "https://example.com",
        cron: null,
        timeoutMs: 30000,
        maxRetries: 2,
        backoffMs: 1000,
      })
      .expect(201);

    expect(response.body.job).toMatchObject({
      name: "Integration Test Job",
      type: "GET",
      url: "https://example.com",
      status: "ACTIVE",
    });

    jobId = response.body.job.id;

    expect(jobId).toBeDefined();
  });

  it("lists the authenticated user's jobs", async () => {
    expect(cookie).toBeDefined();
    expect(jobId).toBeDefined();

    const response = await request(app)
      .get("/api/jobs")
      .set("Cookie", cookie as string)
      .expect(200);

    expect(response.body.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: jobId,
          name: "Integration Test Job",
        }),
      ]),
    );
  });

  it("updates a job", async () => {
    expect(cookie).toBeDefined();
    expect(jobId).toBeDefined();

    const response = await request(app)
      .patch(`/api/jobs/${jobId}`)
      .set("Cookie", cookie as string)
      .send({
        description: "Updated integration test job",
      })
      .expect(200);

    expect(response.body.job).toMatchObject({
      id: jobId,
      description: "Updated integration test job",
    });
  });

  it("rejects unauthenticated job access", async () => {
    await request(app)
      .get("/api/jobs")
      .expect(401);
  });

  it("queues a manual execution", async () => {
    expect(cookie).toBeDefined();
    expect(jobId).toBeDefined();

    const response = await request(app)
      .post(`/api/jobs/${jobId}/run`)
      .set("Cookie", cookie as string)
      .expect(202);

    expect(response.body.execution).toMatchObject({
      jobId,
      status: "QUEUED",
      triggerType: "MANUAL",
    });
  });

  it("rejects a second active manual execution", async () => {
    expect(cookie).toBeDefined();
    expect(jobId).toBeDefined();

    const response = await request(app)
      .post(`/api/jobs/${jobId}/run`)
      .set("Cookie", cookie as string)
      .expect(409);

    expect(response.body).toMatchObject({
      error: "Job already has an active execution",
    });
  });

  it("returns execution history for the job", async () => {
    expect(cookie).toBeDefined();
    expect(jobId).toBeDefined();

    const response = await request(app)
      .get(`/api/jobs/${jobId}/executions`)
      .set("Cookie", cookie as string)
      .expect(200);

    expect(response.body.executions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          triggerType: "MANUAL",
        }),
      ]),
    );
  });

  it("archives the job", async () => {
    expect(cookie).toBeDefined();
    expect(jobId).toBeDefined();

    const response = await request(app)
      .delete(`/api/jobs/${jobId}`)
      .set("Cookie", cookie as string)
      .expect(200);

    expect(response.body.job).toMatchObject({
      id: jobId,
      status: "ARCHIVED",
    });
  });
});