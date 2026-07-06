import { Probot, createNodeMiddleware } from "probot";
import http from "node:http";
import { handlePushEvent } from "./handlers/push.js";
import { handleInstallationEvent } from "./handlers/installation.js";

/**
 * Probot GitHub App entry point.
 *
 * Probot handles:
 * - Webhook signature verification (HMAC-SHA256)
 * - GitHub App authentication (JWT + Installation tokens)
 * - Event routing
 */
function docflowApp(app: Probot) {
  // ── Push events (main pipeline trigger) ────────────────────────────────────
  app.on("push", handlePushEvent);

  // ── Installation events (onboarding) ───────────────────────────────────────
  app.on("installation.created", handleInstallationEvent);
  app.on("installation.deleted", async (context) => {
    const { db } = await import("@docflow/database");
    const installationId = context.payload.installation.id;

    await db.installation.updateMany({
      where: { githubInstallationId: installationId },
      data: { suspended: true },
    });

    app.log.info(`Installation ${installationId} deleted/suspended`);
  });

  app.on("installation_repositories.added", async (context) => {
    await handleInstallationEvent(context as Parameters<typeof handleInstallationEvent>[0]);
  });

  // ── Health check ping ───────────────────────────────────────────────────────
  app.on("ping", (context) => {
    app.log.info(`GitHub App ping received: zen = "${context.payload.zen}"`);
  });
}

// ── Start the HTTP server ─────────────────────────────────────────────────────

const port = parseInt(process.env.WEBHOOK_PORT ?? "4001", 10);

const server = http.createServer(
  createNodeMiddleware(docflowApp, {
    webhooksPath: "/api/github/webhooks",
  })
);

server.listen(port, () => {
  console.log(`[DocFlow GitHub App] Webhook receiver listening on port ${port}`);
  console.log(`[DocFlow GitHub App] Webhooks path: /api/github/webhooks`);
});

export { docflowApp };
