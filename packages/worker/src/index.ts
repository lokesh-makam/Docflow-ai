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
      `(delivery: ${payload.webhookDeliveryId})`
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
