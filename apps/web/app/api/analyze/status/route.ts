import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@docflow/database";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");
  const fullName = searchParams.get("fullName");

  try {
    // If querying by jobId
    if (jobId) {
      const job = await db.analysisJob.findUnique({
        where: { id: jobId },
        include: {
          repository: {
            include: { cachedFacts: true },
          },
        },
      });

      if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

      // Security: verify ownership
      if (job.repository.userId !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      return NextResponse.json({
        job: {
          id: job.id,
          status: job.status,
          error: job.errorMessage,
          completedAt: job.completedAt,
          usedFallback: job.usedFallback,
        },
        generatedReadme: job.repository.cachedFacts?.generatedReadme ?? null,
      });
    }

    // If querying by fullName (for checking cached state)
    if (fullName) {
      const repo = await db.repository.findFirst({
        where: { fullName, userId },
        include: {
          cachedFacts: true,
          jobs: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      if (!repo) return NextResponse.json({ hasCache: false });

      return NextResponse.json({
        hasCache: !!repo.cachedFacts?.generatedReadme,
        generatedReadme: repo.cachedFacts?.generatedReadme ?? null,
        latestJob: repo.jobs[0] ?? null,
      });
    }

    return NextResponse.json({ error: "Missing jobId or fullName" }, { status: 400 });
  } catch (err: any) {
    console.error("[analyze/status] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
