import { Router } from "express";
import { db } from "@docflow/database";
import { enqueueAnalysisJob } from "@docflow/queue";
import { requireAuth } from "../middleware/auth.js";
import { z } from "zod";
import crypto from "node:crypto";

export const reposRouter = Router();

// All repo routes require authentication
reposRouter.use(requireAuth);

/** GET /api/repos — list user's connected repositories */
reposRouter.get("/", async (req, res) => {
  try {
    const userId = req.user!.id;

    const repos = await db.repository.findMany({
      where: {
        installation: {
          userId,
          suspended: false,
        },
      },
      include: {
        jobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, prUrl: true, createdAt: true },
        },
        _count: {
          select: { jobs: { where: { status: "COMPLETED" } } },
        },
      },
      orderBy: { fullName: "asc" },
    });

    const response = repos.map((repo) => ({
      id: repo.id,
      fullName: repo.fullName,
      trackedBranch: repo.trackedBranch,
      enabled: repo.enabled,
      lastJobStatus: repo.jobs[0]?.status?.toLowerCase() ?? null,
      lastJobAt: repo.jobs[0]?.createdAt?.toISOString() ?? null,
      prUrl: repo.jobs[0]?.prUrl ?? null,
      docsGenerated: repo._count.jobs,
    }));

    res.json({ success: true, data: response });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to fetch repositories" });
  }
});

/** GET /api/repos/:id — get a single repo with full details */
reposRouter.get("/:id", async (req, res) => {
  try {
    const repo = await db.repository.findUnique({
      where: { id: req.params.id },
      include: {
        installation: { select: { userId: true } },
        cachedFacts: true,
      },
    });

    if (!repo || repo.installation.userId !== req.user!.id) {
      return res.status(404).json({ success: false, error: "Repository not found" });
    }

    res.json({ success: true, data: repo });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch repository" });
  }
});

/** PATCH /api/repos/:id — update repo settings */
const updateRepoSchema = z.object({
  enabled: z.boolean().optional(),
  trackedBranch: z.string().min(1).max(250).optional(),
  docStyle: z.enum(["standard", "minimal", "detailed"]).optional(),
  aiProvider: z.enum(["groq", "gemini", "ollama"]).nullable().optional(),
});

reposRouter.patch("/:id", async (req, res) => {
  try {
    const body = updateRepoSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ success: false, error: body.error.message });
    }

    const repo = await db.repository.findFirst({
      where: {
        id: req.params.id,
        installation: { userId: req.user!.id },
      },
    });

    if (!repo) {
      return res.status(404).json({ success: false, error: "Repository not found" });
    }

    const updated = await db.repository.update({
      where: { id: req.params.id },
      data: body.data,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to update repository" });
  }
});

/** POST /api/repos/:id/trigger — manually trigger re-analysis */
reposRouter.post("/:id/trigger", async (req, res) => {
  try {
    const repo = await db.repository.findFirst({
      where: {
        id: req.params.id,
        enabled: true,
        installation: { userId: req.user!.id, suspended: false },
      },
      include: { installation: true },
    });

    if (!repo) {
      return res.status(404).json({ success: false, error: "Repository not found or not enabled" });
    }

    // Create a synthetic delivery ID for manual triggers
    const deliveryId = `manual-${crypto.randomUUID()}`;

    const job = await db.analysisJob.create({
      data: {
        webhookDeliveryId: deliveryId,
        commitSha: "manual",
        beforeSha: "0000000000000000000000000000000000000000",
        branch: repo.trackedBranch,
        changedFiles: [],
        status: "PENDING",
        repositoryId: repo.id,
      },
    });

    await enqueueAnalysisJob({
      jobId: job.id,
      webhookDeliveryId: deliveryId,
      repositoryId: repo.id,
      installationId: repo.installation.githubInstallationId,
      repoFullName: repo.fullName,
      branch: repo.trackedBranch,
      beforeSha: "0000000000000000000000000000000000000000",
      afterSha: "manual",
      changedFiles: [],
    });

    res.json({ success: true, data: { jobId: job.id } });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to trigger analysis" });
  }
});

/** GET /api/repos/:id/jobs — get job history */
reposRouter.get("/:id/jobs", async (req, res) => {
  try {
    const repo = await db.repository.findFirst({
      where: {
        id: req.params.id,
        installation: { userId: req.user!.id },
      },
    });

    if (!repo) {
      return res.status(404).json({ success: false, error: "Repository not found" });
    }

    const jobs = await db.analysisJob.findMany({
      where: { repositoryId: req.params.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        commitSha: true,
        prUrl: true,
        prNumber: true,
        docsChangedCount: true,
        usedFallback: true,
        errorMessage: true,
        createdAt: true,
        completedAt: true,
      },
    });

    res.json({ success: true, data: jobs });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch jobs" });
  }
});

/** GET /api/repos/:id/facts — get latest cached facts */
reposRouter.get("/:id/facts", async (req, res) => {
  try {
    const repo = await db.repository.findFirst({
      where: {
        id: req.params.id,
        installation: { userId: req.user!.id },
      },
      include: { cachedFacts: true },
    });

    if (!repo) {
      return res.status(404).json({ success: false, error: "Repository not found" });
    }

    if (!repo.cachedFacts) {
      return res.status(404).json({ success: false, error: "No cached facts yet" });
    }

    res.json({ success: true, data: repo.cachedFacts.factJson });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch facts" });
  }
});
