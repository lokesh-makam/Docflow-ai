import type { Context } from "probot";
import type { PushEventPayload } from "@docflow/shared";
import { branchFromRef } from "@docflow/shared";
import { db } from "@docflow/database";
import { enqueueAnalysisJob } from "@docflow/queue";

/**
 * Handles GitHub push events.
 *
 * Key responsibilities:
 * 1. Extract the pushed branch and validate it's being tracked
 * 2. Deduplicate via X-GitHub-Delivery header (idempotency)
 * 3. Collect changed files from the push commits
 * 4. Enqueue a BullMQ analysis job
 * 5. Guard against fork pushes and non-tracked branches
 */
export async function handlePushEvent(
  context: Context<"push">
) {
  const deliveryId = context.id;
  const payload = context.payload as PushEventPayload;

  const pushedBranch = branchFromRef(payload.ref);
  const repoFullName = payload.repository.full_name;
  const installationId = payload.installation?.id;

  context.log.info(`[push] ${repoFullName} → ${pushedBranch} (delivery: ${deliveryId})`);

  // ── Guard: installation required ─────────────────────────────────────────
  if (!installationId) {
    context.log.warn(`[push] No installation ID in payload, skipping`);
    return;
  }

  // ── Guard: deleted branch push (after:0000...) ───────────────────────────
  if (payload.after === "0000000000000000000000000000000000000000") {
    context.log.info(`[push] Branch deletion detected, skipping`);
    return;
  }

  // ── Find the repository config in our database ────────────────────────────
  const repository = await db.repository.findFirst({
    where: {
      fullName: repoFullName,
      enabled: true,
      installation: {
        githubInstallationId: installationId,
        suspended: false,
      },
    },
  });

  if (!repository) {
    context.log.info(`[push] Repo ${repoFullName} not configured or not enabled, skipping`);
    return;
  }

  // ── Guard: only process the tracked branch ────────────────────────────────
  if (pushedBranch !== repository.trackedBranch) {
    context.log.info(
      `[push] Branch "${pushedBranch}" is not tracked (tracking: "${repository.trackedBranch}"), skipping`
    );
    return;
  }

  // ── Collect changed files from all commits in this push ───────────────────
  const changedFiles = [
    ...new Set(
      payload.commits.flatMap((c) => [
        ...c.added,
        ...c.modified,
        ...c.removed,
      ])
    ),
  ];

  // ── Idempotency check: skip if we've already processed this delivery ──────
  const existingJob = await db.analysisJob.findUnique({
    where: { webhookDeliveryId: deliveryId },
  });

  if (existingJob) {
    context.log.info(
      `[push] Delivery ${deliveryId} already processed (job: ${existingJob.id}, status: ${existingJob.status})`
    );
    return;
  }

  // ── Create job record in DB ───────────────────────────────────────────────
  const dbJob = await db.analysisJob.create({
    data: {
      webhookDeliveryId: deliveryId,
      commitSha: payload.after,
      beforeSha: payload.before,
      branch: pushedBranch,
      changedFiles,
      status: "PENDING",
      repositoryId: repository.id,
    },
  });

  context.log.info(`[push] Created job ${dbJob.id} for ${repoFullName}@${payload.after.slice(0, 7)}`);

  // ── Find installation for this repository ────────────────────────────────
  const installation = await db.installation.findFirst({
    where: { githubInstallationId: installationId },
  });

  if (!installation) {
    context.log.error(`[push] Installation ${installationId} not found in DB`);
    return;
  }

  // ── Enqueue BullMQ job ────────────────────────────────────────────────────
  await enqueueAnalysisJob({
    jobId: dbJob.id,
    webhookDeliveryId: deliveryId,
    repositoryId: repository.id,
    installationId,
    repoFullName,
    branch: pushedBranch,
    beforeSha: payload.before,
    afterSha: payload.after,
    changedFiles,
  });

  context.log.info(`[push] Enqueued analysis job for ${repoFullName}`);
}
