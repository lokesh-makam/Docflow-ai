import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@docflow/database";
import { enqueueAnalysisJob } from "@docflow/queue";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { githubRepoId, repoFullName, branch = "main", docStyle = "standard", aiProvider } = body;

    if (!githubRepoId || !repoFullName) {
      return NextResponse.json(
        { error: "Missing required fields: githubRepoId, repoFullName" },
        { status: 400 }
      );
    }

    const [owner, name] = repoFullName.split("/");

    // Upsert the repository record
    const repo = await db.repository.upsert({
      where: { githubRepoId: parseInt(String(githubRepoId), 10) },
      update: { fullName: repoFullName, trackedBranch: branch, docStyle },
      create: {
        githubRepoId: parseInt(String(githubRepoId), 10),
        fullName: repoFullName,
        name: name ?? "",
        owner: owner ?? "",
        defaultBranch: branch,
        trackedBranch: branch,
        docStyle,
        aiProvider,
        userId,
      },
    });

    // Create the pending analysis job
    const job = await db.analysisJob.create({
      data: {
        status: "PENDING",
        commitSha: "pending",
        branch,
        repositoryId: repo.id,
      },
    });

    // Dispatch to BullMQ
    await enqueueAnalysisJob({
      jobId: job.id,
      repositoryId: repo.id,
      userId,
      repoFullName,
      branch,
      commitSha: "latest",
    });

    return NextResponse.json({ success: true, jobId: job.id, repositoryId: repo.id });
  } catch (err: any) {
    console.error("[analyze] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
