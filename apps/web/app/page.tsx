"use client";

import { FormEvent, useEffect, useState } from "react";

const API_URL = "";

type JobStatus = "ACTIVE" | "PAUSED" | "ARCHIVED";
type JobType = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface Job {
  id: string;
  name: string;
  description: string | null;
  type: JobType;
  url: string;
  status: JobStatus;
  cron: string | null;
  timeoutMs: number;
  maxRetries: number;
  backoffMs: number;
  createdAt: string;
  updatedAt: string;
}

interface ExecutionAttempt {
  id: string;
  attemptNumber: number;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  statusCode: number | null;
  responseBody: string | null;
  errorMessage: string | null;
}

interface Execution {
  id: string;
  status: string;
  triggerType: string;
  scheduledFor: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  attemptCount: number;
  workerId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt?: string;
  attempts?: ExecutionAttempt[];
}

interface User {
  id: string;
  email: string;
}

interface JobForm {
  name: string;
  description: string;
  type: JobType;
  url: string;
  cron: string;
  timeoutMs: string;
  maxRetries: string;
  backoffMs: string;
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "Request failed",
    );
  }

  return data as T;
}

function createEmptyForm(): JobForm {
  return {
    name: "",
    description: "",
    type: "GET",
    url: "https://example.com",
    cron: "",
    timeoutMs: "30000",
    maxRetries: "3",
    backoffMs: "1000",
  };
}

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
}

function statusClass(status: string): string {
  return `status-badge ${status.toLowerCase()}`;
}

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);

  const [jobs, setJobs] = useState<Job[]>([]);

  const [executions, setExecutions] = useState<
    Record<string, Execution[]>
  >({});

  const [executionDetails, setExecutionDetails] = useState<
    Record<string, Execution>
  >({});

  const [selectedJob, setSelectedJob] = useState<Job | null>(
    null,
  );

  const [selectedExecution, setSelectedExecution] =
    useState<Execution | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  const [showCreate, setShowCreate] = useState(false);

  const [editingJob, setEditingJob] = useState<Job | null>(
    null,
  );

  const [actionLoading, setActionLoading] = useState<
    Record<string, boolean>
  >({});

  const [registerMode, setRegisterMode] = useState(false);

  const [authLoading, setAuthLoading] = useState(false);

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [form, setForm] = useState<JobForm>(
    createEmptyForm(),
  );

  function setActionBusy(
    key: string,
    busy: boolean,
  ) {
    setActionLoading((current) => ({
      ...current,
      [key]: busy,
    }));
  }

  function clearMessages() {
    setError("");
    setSuccessMessage("");
  }

  async function loadDashboard() {
    try {
      setLoading(true);
      setError("");

      const me = await apiRequest<{ user: User }>(
        "/api/auth/me",
      );

      setUser(me.user);

      const jobResponse = await apiRequest<{
        jobs: Job[];
      }>("/api/jobs");

      setJobs(jobResponse.jobs);

      if (selectedJob) {
        const refreshedSelectedJob =
          jobResponse.jobs.find(
            (job) => job.id === selectedJob.id,
          );

        if (refreshedSelectedJob) {
          setSelectedJob(refreshedSelectedJob);
        }
      }
    } catch {
      setUser(null);
      setError("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  async function authenticate(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    try {
      setAuthLoading(true);
      clearMessages();

      const endpoint = registerMode
        ? "/api/auth/register"
        : "/api/auth/login";

      const response = await apiRequest<{
        user: User;
      }>(endpoint, {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
        }),
      });

      setUser(response.user);

      const jobResponse = await apiRequest<{
        jobs: Job[];
      }>("/api/jobs");

      setJobs(jobResponse.jobs);

      setEmail("");
      setPassword("");
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Authentication failed",
      );
    } finally {
      setAuthLoading(false);
    }
  }

  function openCreateModal() {
    clearMessages();
    setEditingJob(null);
    setForm(createEmptyForm());
    setShowCreate(true);
  }

  function openEditModal(job: Job) {
    clearMessages();

    setEditingJob(job);

    setForm({
      name: job.name,
      description: job.description ?? "",
      type: job.type,
      url: job.url,
      cron: job.cron ?? "",
      timeoutMs: String(job.timeoutMs),
      maxRetries: String(job.maxRetries),
      backoffMs: String(job.backoffMs),
    });

    setShowCreate(true);
  }

  function closeJobModal() {
    setShowCreate(false);
    setEditingJob(null);
    setForm(createEmptyForm());
  }

  async function saveJob(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const actionKey = editingJob
      ? `edit-${editingJob.id}`
      : "create-job";

    try {
      setActionBusy(actionKey, true);
      clearMessages();

      const payload = {
        name: form.name,
        description: form.description || undefined,
        type: form.type,
        url: form.url,
        cron: form.cron || null,
        timeoutMs: Number(form.timeoutMs),
        maxRetries: Number(form.maxRetries),
        backoffMs: Number(form.backoffMs),
      };

      if (editingJob) {
        await apiRequest(
          `/api/jobs/${editingJob.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
        );

        setSuccessMessage("Job updated successfully.");
      } else {
        await apiRequest("/api/jobs", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        setSuccessMessage("Job created successfully.");
      }

      closeJobModal();

      await loadDashboard();
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save job",
      );
    } finally {
      setActionBusy(actionKey, false);
    }
  }

  async function loadExecutions(
    jobId: string,
    showErrors = true,
  ): Promise<Execution[]> {
    try {
      const response = await apiRequest<{
        executions: Execution[];
      }>(`/api/jobs/${jobId}/executions`);

      setExecutions((current) => ({
        ...current,
        [jobId]: response.executions,
      }));

      return response.executions;
    } catch (requestError: unknown) {
      if (showErrors) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load executions",
        );
      }

      return [];
    }
  }

  async function loadExecutionDetail(
    jobId: string,
    executionId: string,
  ): Promise<Execution | null> {
    try {
      const response = await apiRequest<{
        execution: Execution;
      }>(
        `/api/jobs/${jobId}/executions/${executionId}`,
      );

      setExecutionDetails((current) => ({
        ...current,
        [executionId]: response.execution,
      }));

      setSelectedExecution(response.execution);

      return response.execution;
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load execution details",
      );

      return null;
    }
  }

  async function selectExecution(
    jobId: string,
    executionId: string,
  ) {
    setSelectedExecution(null);

    const cachedExecution =
      executionDetails[executionId];

    if (cachedExecution) {
      setSelectedExecution(cachedExecution);
    }

    await loadExecutionDetail(
      jobId,
      executionId,
    );
  }

  async function selectJob(job: Job) {
    setSelectedJob(job);
    setSelectedExecution(null);

    const loadedExecutions =
      await loadExecutions(job.id);

    if (loadedExecutions.length > 0) {
      await loadExecutionDetail(
        job.id,
        loadedExecutions[0].id,
      );
    }
  }

  async function runJob(job: Job) {
    const actionKey = `run-${job.id}`;

    try {
      setActionBusy(actionKey, true);
      clearMessages();

      const response = await apiRequest<{
        execution: Execution;
      }>(`/api/jobs/${job.id}/run`, {
        method: "POST",
      });

      setSelectedJob(job);

      const executionId =
        response.execution.id;

      setSelectedExecution(
        response.execution,
      );

      setExecutionDetails((current) => ({
        ...current,
        [executionId]:
          response.execution,
      }));

      await loadExecutions(
        job.id,
        false,
      );

      await loadExecutionDetail(
        job.id,
        executionId,
      );

      setSuccessMessage(
        "Job execution queued successfully.",
      );

      const poll = async () => {
        const refreshed =
          await loadExecutionDetail(
            job.id,
            executionId,
          );

        if (
          refreshed &&
          (
            refreshed.status === "QUEUED" ||
            refreshed.status === "RUNNING" ||
            refreshed.status === "RETRYING"
          )
        ) {
          window.setTimeout(
            () => {
              void poll();
            },
            1000,
          );
        } else {
          await loadExecutions(
            job.id,
            false,
          );
        }
      };

      window.setTimeout(
        () => {
          void poll();
        },
        1000,
      );
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to run job",
      );
    } finally {
      setActionBusy(actionKey, false);
    }
  }

  async function toggleJob(job: Job) {
    const action =
      job.status === "PAUSED"
        ? "resume"
        : "pause";

    const actionKey = `${action}-${job.id}`;

    try {
      setActionBusy(actionKey, true);
      clearMessages();

      await apiRequest(
        `/api/jobs/${job.id}/${action}`,
        {
          method: "POST",
        },
      );

      setSuccessMessage(
        action === "pause"
          ? "Job paused successfully."
          : "Job resumed successfully.",
      );

      await loadDashboard();

      if (selectedJob?.id === job.id) {
        const updatedJob = jobs.find(
          (item) => item.id === job.id,
        );

        if (updatedJob) {
          setSelectedJob(updatedJob);
        }
      }
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update job",
      );
    } finally {
      setActionBusy(actionKey, false);
    }
  }

  async function archiveJob(job: Job) {
    const confirmed = window.confirm(
      `Archive "${job.name}"? This will stop its schedule.`,
    );

    if (!confirmed) {
      return;
    }

    const actionKey = `archive-${job.id}`;

    try {
      setActionBusy(actionKey, true);
      clearMessages();

      await apiRequest(
        `/api/jobs/${job.id}`,
        {
          method: "DELETE",
        },
      );

      if (selectedJob?.id === job.id) {
        setSelectedJob(null);
        setSelectedExecution(null);
      }

      setSuccessMessage(
        "Job archived successfully.",
      );

      await loadDashboard();
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to archive job",
      );
    } finally {
      setActionBusy(actionKey, false);
    }
  }

  async function logout() {
    try {
      await apiRequest(
        "/api/auth/logout",
        {
          method: "POST",
        },
      );
    } finally {
      setUser(null);
      setJobs([]);
      setSelectedJob(null);
      setSelectedExecution(null);
      setExecutions({});
      setExecutionDetails({});
    }
  }

  const activeJobs = jobs.filter(
    (job) => job.status === "ACTIVE",
  ).length;

  const pausedJobs = jobs.filter(
    (job) => job.status === "PAUSED",
  ).length;

  const visibleJobs = jobs.filter(
    (job) => job.status !== "ARCHIVED",
  );

  const selectedExecutions =
    selectedJob
      ? executions[selectedJob.id] ?? []
      : [];

  if (loading) {
    return (
      <main className="loading-screen">
        <div className="loading-card">
          <div className="spinner" />
          <h1>Loading Job Automation</h1>
          <p>
            Connecting to the API...
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-screen">
        <div className="auth-card">
          <div className="brand-mark">
            JA
          </div>

          <p className="eyebrow">
            ENRICHLY HR
          </p>

          <h1>
            {registerMode
              ? "Create your account"
              : "Welcome back"}
          </h1>

          <p className="auth-description">
            {registerMode
              ? "Create an account to start managing HTTP automation jobs."
              : "Sign in to manage HTTP jobs, schedules, retries, and execution history."}
          </p>

          {error && (
            <div className="alert error">
              {error}
            </div>
          )}

          <form
            className="auth-form"
            onSubmit={authenticate}
          >
            <label>
              Email

              <input
                required
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(
                    event.target.value,
                  )
                }
                placeholder="you@example.com"
              />
            </label>

            <label>
              Password

              <input
                required
                type="password"
                minLength={8}
                value={password}
                onChange={(event) =>
                  setPassword(
                    event.target.value,
                  )
                }
                placeholder="••••••••"
              />
            </label>

            <button
              type="submit"
              className="primary-button auth-submit"
              disabled={authLoading}
            >
              {authLoading
                ? "Please wait..."
                : registerMode
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          <button
            className="auth-switch"
            onClick={() => {
              setRegisterMode(
                !registerMode,
              );
              setError("");
            }}
          >
            {registerMode
              ? "Already have an account? Sign in"
              : "Need an account? Create one"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <p className="eyebrow">
            ENRICHLY HR
          </p>

          <h1>Job Automation</h1>
        </div>

        <div className="topbar-actions">
          <span className="user-email">
            {user.email}
          </span>

          <button
            className="secondary-button"
            onClick={() =>
              void logout()
            }
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">
            AUTOMATION CONTROL CENTER
          </p>

          <h2>
            Reliable HTTP jobs,
            scheduled and tracked.
          </h2>

          <p>
            Create jobs, trigger them
            manually, pause schedules,
            and inspect execution history.
          </p>
        </div>

        <button
          className="primary-button"
          onClick={openCreateModal}
        >
          + Create Job
        </button>
      </section>

      {error && (
        <div className="alert error dashboard-alert">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="alert success dashboard-alert">
          {successMessage}
        </div>
      )}

      <section className="stats-grid">
        <div className="stat-card">
          <span>Total Jobs</span>
          <strong>
            {jobs.length}
          </strong>
        </div>

        <div className="stat-card">
          <span>Active</span>
          <strong>
            {activeJobs}
          </strong>
        </div>

        <div className="stat-card">
          <span>Paused</span>
          <strong>
            {pausedJobs}
          </strong>
        </div>

        <div className="stat-card">
          <span>Loaded Executions</span>
          <strong>
            {selectedExecutions.length}
          </strong>
        </div>
      </section>

      <section className="content-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Jobs</h3>

              <p>
                Your HTTP automation
                workflows.
              </p>
            </div>

            <button
              className="secondary-button"
              onClick={() =>
                void loadDashboard()
              }
            >
              Refresh
            </button>
          </div>

          {visibleJobs.length === 0 ? (
            <div className="empty-state">
              <h3>No jobs yet</h3>

              <p>
                Create your first HTTP
                automation job.
              </p>

              <button
                className="primary-button"
                onClick={
                  openCreateModal
                }
              >
                Create your first job
              </button>
            </div>
          ) : (
            <div className="job-list">
              {visibleJobs.map(
                (job) => {
                  const runBusy =
                    actionLoading[
                      `run-${job.id}`
                    ] ?? false;

                  const toggleBusy =
                    actionLoading[
                      `${
                        job.status ===
                        "PAUSED"
                          ? "resume"
                          : "pause"
                      }-${job.id}`
                    ] ?? false;

                  const archiveBusy =
                    actionLoading[
                      `archive-${job.id}`
                    ] ?? false;

                  return (
                    <article
                      className={`job-card ${
                        selectedJob?.id ===
                        job.id
                          ? "selected"
                          : ""
                      }`}
                      key={job.id}
                      onClick={() =>
                        void selectJob(job)
                      }
                    >
                      <div className="job-main">
                        <div className="job-title-row">
                          <h3>
                            {job.name}
                          </h3>

                          <span
                            className={statusClass(
                              job.status,
                            )}
                          >
                            {job.status}
                          </span>
                        </div>

                        <p className="job-description">
                          {job.description ||
                            "No description provided."}
                        </p>

                        <div className="job-meta">
                          <span className="method-badge">
                            {job.type}
                          </span>

                          <span>
                            {job.url}
                          </span>

                          {job.cron && (
                            <span>
                              Cron:{" "}
                              {job.cron}
                            </span>
                          )}
                        </div>
                      </div>

                      <div
                        className="job-actions"
                        onClick={(
                          event,
                        ) =>
                          event.stopPropagation()
                        }
                      >
                        <button
                          className="secondary-small"
                          onClick={() =>
                            void selectJob(
                              job,
                            )
                          }
                        >
                          History
                        </button>

                        <button
                          className="primary-small"
                          onClick={() =>
                            void runJob(job)
                          }
                          disabled={
                            job.status ===
                              "PAUSED" ||
                            runBusy
                          }
                        >
                          {runBusy
                            ? "Queueing..."
                            : "Run now"}
                        </button>

                        <button
                          className="secondary-small"
                          onClick={() =>
                            openEditModal(
                              job,
                            )
                          }
                          disabled={
                            toggleBusy ||
                            archiveBusy
                          }
                        >
                          Edit
                        </button>

                        <button
                          className="secondary-small"
                          onClick={() =>
                            void toggleJob(
                              job,
                            )
                          }
                          disabled={
                            toggleBusy ||
                            archiveBusy
                          }
                        >
                          {toggleBusy
                            ? "..."
                            : job.status ===
                                "PAUSED"
                              ? "Resume"
                              : "Pause"}
                        </button>

                        <button
                          className="danger-small"
                          onClick={() =>
                            void archiveJob(
                              job,
                            )
                          }
                          disabled={
                            archiveBusy
                          }
                        >
                          {archiveBusy
                            ? "..."
                            : "Archive"}
                        </button>
                      </div>
                    </article>
                  );
                },
              )}
            </div>
          )}
        </div>

        <aside className="panel details-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">
                EXECUTION MONITOR
              </p>

              <h3>
                Execution History
              </h3>

              <p>
                {selectedJob
                  ? selectedJob.name
                  : "Select a job"}
              </p>
            </div>

            {selectedJob && (
              <button
                className="secondary-button"
                onClick={async () => {
                  const refreshed =
                    await loadExecutions(
                      selectedJob.id,
                    );

                  if (
                    selectedExecution
                  ) {
                    const stillExists =
                      refreshed.find(
                        (execution) =>
                          execution.id ===
                          selectedExecution.id,
                      );

                    if (
                      stillExists
                    ) {
                      await loadExecutionDetail(
                        selectedJob.id,
                        selectedExecution.id,
                      );
                    }
                  }
                }}
              >
                Refresh
              </button>
            )}
          </div>

          {!selectedJob ? (
            <div className="empty-state compact">
              <p>
                Select a job to view its
                execution history.
              </p>
            </div>
          ) : selectedExecutions.length ===
            0 ? (
            <div className="empty-state compact">
              <p>
                No executions found.
              </p>

              <button
                className="secondary-button"
                onClick={() =>
                  void loadExecutions(
                    selectedJob.id,
                  )
                }
              >
                Refresh history
              </button>
            </div>
          ) : (
            <>
              <div className="execution-list">
                {selectedExecutions.map(
                  (execution) => (
                    <button
                      className={`execution-row ${
                        selectedExecution?.id ===
                        execution.id
                          ? "selected"
                          : ""
                      }`}
                      key={execution.id}
                      onClick={() =>
                        void selectExecution(
                          selectedJob.id,
                          execution.id,
                        )
                      }
                    >
                      <div>
                        <strong>
                          {execution.status}
                        </strong>

                        <span>
                          {
                            execution.triggerType
                          }
                        </span>
                      </div>

                      <div className="execution-right">
                        <span>
                          Attempt{" "}
                          {
                            execution.attemptCount
                          }
                        </span>

                        <small>
                          {formatDate(
                            execution.createdAt,
                          )}
                        </small>
                      </div>
                    </button>
                  ),
                )}
              </div>

              {selectedExecution && (
                <div className="execution-detail">
                  <div className="execution-detail-header">
                    <div>
                      <p className="eyebrow">
                        EXECUTION DETAILS
                      </p>

                      <h3>
                        {selectedExecution.status}
                      </h3>
                    </div>

                    <button
                      className="secondary-button"
                      onClick={() =>
                        void loadExecutionDetail(
                          selectedJob.id,
                          selectedExecution.id,
                        )
                      }
                    >
                      Refresh
                    </button>
                  </div>

                  <div className="execution-detail-grid">
                    <div>
                      <span>
                        Status
                      </span>

                      <strong>
                        {selectedExecution.status}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Trigger
                      </span>

                      <strong>
                        {
                          selectedExecution.triggerType
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Execution ID
                      </span>

                      <strong className="execution-id">
                        {
                          selectedExecution.id
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Attempts
                      </span>

                      <strong>
                        {
                          selectedExecution.attemptCount
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Started
                      </span>

                      <strong>
                        {formatDate(
                          selectedExecution.startedAt,
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Finished
                      </span>

                      <strong>
                        {formatDate(
                          selectedExecution.finishedAt,
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Worker
                      </span>

                      <strong>
                        {
                          selectedExecution.workerId ??
                          "Pending"
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Created
                      </span>

                      <strong>
                        {formatDate(
                          selectedExecution.createdAt,
                        )}
                      </strong>
                    </div>
                  </div>

                  {selectedExecution.errorMessage && (
                    <div className="execution-error">
                      <strong>
                        Error
                      </strong>

                      <p>
                        {
                          selectedExecution.errorMessage
                        }
                      </p>
                    </div>
                  )}

                  <div className="attempts-section">
                    <h4>
                      Attempts
                    </h4>

                    {!selectedExecution.attempts ||
                    selectedExecution
                      .attempts.length ===
                      0 ? (
                      <p className="muted">
                        Attempt information
                        will appear when
                        the worker starts
                        processing the
                        execution.
                      </p>
                    ) : (
                      <div className="attempt-list">
                        {selectedExecution.attempts.map(
                          (attempt) => (
                            <div
                              className="attempt-card"
                              key={
                                attempt.id
                              }
                            >
                              <div className="attempt-header">
                                <strong>
                                  Attempt{" "}
                                  {
                                    attempt.attemptNumber
                                  }
                                </strong>

                                <span
                                  className={statusClass(
                                    attempt.status,
                                  )}
                                >
                                  {
                                    attempt.status
                                  }
                                </span>
                              </div>

                              <div className="attempt-meta">
                                <span>
                                  Started:{" "}
                                  {formatDate(
                                    attempt.startedAt,
                                  )}
                                </span>

                                <span>
                                  Finished:{" "}
                                  {formatDate(
                                    attempt.finishedAt,
                                  )}
                                </span>

                                {attempt.statusCode !==
                                  null && (
                                  <span>
                                    HTTP:{" "}
                                    {
                                      attempt.statusCode
                                    }
                                  </span>
                                )}
                              </div>

                              {attempt.errorMessage && (
                                <div className="attempt-error">
                                  {
                                    attempt.errorMessage
                                  }
                                </div>
                              )}

                              {attempt.responseBody && (
                                <details>
                                  <summary>
                                    Response body
                                  </summary>

                                  <pre>
                                    {
                                      attempt.responseBody
                                    }
                                  </pre>
                                </details>
                              )}
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </aside>
      </section>

      {showCreate && (
        <div
          className="modal-backdrop"
          onClick={
            closeJobModal
          }
        >
          <div
            className="modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">
                  {editingJob
                    ? "EDIT AUTOMATION"
                    : "NEW AUTOMATION"}
                </p>

                <h2>
                  {editingJob
                    ? "Edit Job"
                    : "Create Job"}
                </h2>
              </div>

              <button
                className="close-button"
                onClick={
                  closeJobModal
                }
              >
                ×
              </button>
            </div>

            <form
              onSubmit={saveJob}
            >
              <label>
                Name

                <input
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      name: event.target
                        .value,
                    })
                  }
                  placeholder="Daily health check"
                />
              </label>

              <label>
                Description

                <textarea
                  value={
                    form.description
                  }
                  onChange={(event) =>
                    setForm({
                      ...form,
                      description:
                        event.target
                          .value,
                    })
                  }
                  placeholder="What does this job do?"
                  rows={3}
                />
              </label>

              <div className="form-row">
                <label>
                  HTTP Method

                  <select
                    value={form.type}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        type: event
                          .target
                          .value as JobType,
                      })
                    }
                  >
                    <option value="GET">
                      GET
                    </option>

                    <option value="POST">
                      POST
                    </option>

                    <option value="PUT">
                      PUT
                    </option>

                    <option value="PATCH">
                      PATCH
                    </option>

                    <option value="DELETE">
                      DELETE
                    </option>
                  </select>
                </label>

                <label>
                  Timeout (ms)

                  <input
                    required
                    type="number"
                    min="1000"
                    max="120000"
                    value={
                      form.timeoutMs
                    }
                    onChange={(event) =>
                      setForm({
                        ...form,
                        timeoutMs:
                          event.target
                            .value,
                      })
                    }
                  />
                </label>
              </div>

              <label>
                URL

                <input
                  required
                  type="url"
                  value={form.url}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      url: event.target
                        .value,
                    })
                  }
                  placeholder="https://example.com/api"
                />
              </label>

              <label>
                Cron schedule

                <input
                  value={form.cron}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      cron: event.target
                        .value,
                    })
                  }
                  placeholder="*/5 * * * * (optional)"
                />

                <small>
                  Leave blank for
                  manual-only jobs.
                </small>
              </label>

              <div className="form-row">
                <label>
                  Max retries

                  <input
                    required
                    type="number"
                    min="0"
                    max="10"
                    value={
                      form.maxRetries
                    }
                    onChange={(event) =>
                      setForm({
                        ...form,
                        maxRetries:
                          event.target
                            .value,
                      })
                    }
                  />
                </label>

                <label>
                  Backoff (ms)

                  <input
                    required
                    type="number"
                    min="100"
                    max="300000"
                    value={
                      form.backoffMs
                    }
                    onChange={(event) =>
                      setForm({
                        ...form,
                        backoffMs:
                          event.target
                            .value,
                      })
                    }
                  />
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={
                    closeJobModal
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={
                    actionLoading[
                      editingJob
                        ? `edit-${editingJob.id}`
                        : "create-job"
                    ] ?? false
                  }
                >
                  {actionLoading[
                    editingJob
                      ? `edit-${editingJob.id}`
                      : "create-job"
                  ]
                    ? "Saving..."
                    : editingJob
                      ? "Save changes"
                      : "Create Job"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}