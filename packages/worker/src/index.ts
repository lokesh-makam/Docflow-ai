import * as fs from "node:fs";
import * as path from "node:path";

function loadEnv() {
  let currentDir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const envPath = path.join(currentDir, ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        // Support escaped newlines in keys like GITHUB_PRIVATE_KEY
        val = val.replace(/\\n/g, "\n");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
      console.log(`[Env Loader] Loaded environment variables from ${envPath}`);
      return;
    }
    currentDir = path.dirname(currentDir);
  }
}
loadEnv();

import { createAnalysisWorker } from "@docflow/queue";
import type { AnalysisJobPayload } from "@docflow/shared";
import { runPipeline } from "./pipeline.js";
import type { Job } from "bullmq";

const concurrency = parseInt(process.env.WORKER_CONCURRENCY ?? "2", 10);

console.log(`[DocFlow Worker] Starting with concurrency=${concurrency}`);

const worker = createAnalysisWorker(
  async (job: Job<AnalysisJobPayload>) => {
    const payload = job.data;
    console.log(
      `[worker] Processing job ${job.id} for ${payload.repoFullName} ` +
      `(jobId: ${payload.jobId})`
    );

    const result = await runPipeline(payload);

    if (!result.success) {
      throw new Error(result.error ?? "Pipeline failed");
    }

    return result;
  },
  { concurrency }
);

worker.on("completed", (job) => {
  console.log(`[worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error(`[worker] Worker error:`, err);
});

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`[worker] ${signal} received, closing worker...`);
  await worker.close();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
