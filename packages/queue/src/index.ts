import { Queue, Worker, QueueEvents, type Processor } from "bullmq";
import type { AnalysisJobPayload } from "@docflow/shared";
import Redis from "ioredis";

// ─── Redis Connection ─────────────────────────────────────────────────────────

function createRedisConnection(): Redis {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";

  // Upstash requires TLS — detect by URL scheme
  const isTls = url.startsWith("rediss://");

  return new Redis(url, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,    // Required for Upstash serverless Redis
    tls: isTls ? {} : undefined,
    lazyConnect: true,
  });
}

// Singleton connections — BullMQ needs separate connections for queue and worker
let _queueConnection: Redis | null = null;
let _workerConnection: Redis | null = null;

export function getQueueConnection(): Redis {
  if (!_queueConnection) {
    _queueConnection = createRedisConnection();
  }
  return _queueConnection;
}

export function getWorkerConnection(): Redis {
  if (!_workerConnection) {
    _workerConnection = createRedisConnection();
  }
  return _workerConnection;
}

// ─── Queue Names ──────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  ANALYSIS: "docflow:analysis",
  PR: "docflow:pr",
} as const;

// ─── Analysis Queue ───────────────────────────────────────────────────────────

let _analysisQueue: Queue<AnalysisJobPayload> | null = null;

export function getAnalysisQueue(): Queue<AnalysisJobPayload> {
  if (!_analysisQueue) {
    _analysisQueue = new Queue<AnalysisJobPayload>(QUEUE_NAMES.ANALYSIS, {
      connection: getQueueConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000, // Start at 5s, doubles each attempt
        },
        removeOnComplete: {
          age: 7 * 24 * 3600, // Keep completed jobs for 7 days
          count: 1000,
        },
        removeOnFail: {
          age: 30 * 24 * 3600, // Keep failed jobs for 30 days
        },
      },
    });
  }
  return _analysisQueue;
}

/**
 * Enqueue an analysis job with idempotency check.
 * The webhookDeliveryId is used as the job ID to prevent duplicate processing
 * of retried webhook deliveries.
 */
export async function enqueueAnalysisJob(
  payload: AnalysisJobPayload
): Promise<string> {
  const queue = getAnalysisQueue();

  // Use webhookDeliveryId as the job ID for deduplication
  // BullMQ will silently drop if a job with this ID already exists
  const job = await queue.add(QUEUE_NAMES.ANALYSIS, payload, {
    jobId: `delivery:${payload.webhookDeliveryId}`,
    // Delay slightly to allow for webhook delivery batching
    delay: 1000,
  });

  return job.id ?? payload.webhookDeliveryId;
}

// ─── Worker Factory ───────────────────────────────────────────────────────────

export interface WorkerOptions {
  concurrency?: number;
  rateLimiter?: {
    max: number;
    duration: number;
  };
}

/**
 * Creates a BullMQ worker for the analysis queue.
 * Configure concurrency to respect free-tier rate limits.
 */
export function createAnalysisWorker(
  processor: Processor<AnalysisJobPayload>,
  options: WorkerOptions = {}
): Worker<AnalysisJobPayload> {
  return new Worker<AnalysisJobPayload>(QUEUE_NAMES.ANALYSIS, processor, {
    connection: getWorkerConnection(),
    concurrency: options.concurrency ?? 2, // Conservative default for free tiers
    rateLimiter: options.rateLimiter ?? {
      max: 10,         // Max 10 jobs per duration
      duration: 60000, // Per minute
    },
    stalledInterval: 30000,
    maxStalledCount: 2,
  });
}

// ─── Queue Events (for monitoring) ───────────────────────────────────────────

let _queueEvents: QueueEvents | null = null;

export function getAnalysisQueueEvents(): QueueEvents {
  if (!_queueEvents) {
    _queueEvents = new QueueEvents(QUEUE_NAMES.ANALYSIS, {
      connection: createRedisConnection(),
    });
  }
  return _queueEvents;
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

export async function closeConnections(): Promise<void> {
  await Promise.allSettled([
    _analysisQueue?.close(),
    _queueConnection?.quit(),
    _workerConnection?.quit(),
    _queueEvents?.close(),
  ]);
  _analysisQueue = null;
  _queueConnection = null;
  _workerConnection = null;
  _queueEvents = null;
}
