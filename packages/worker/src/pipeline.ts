import type { AnalysisJobPayload } from "@docflow/shared";
import { analyzeRepo } from "@docflow/parser";
import { generateDocs } from "@docflow/ai";
import { cloneRepo } from "@docflow/github";
import { db } from "@docflow/database";
import { decrypt } from "@docflow/shared";
import { simpleGit } from "simple-git";

export interface PipelineResult {
  success: boolean;
  usedFallback?: boolean;
  sectionsCount?: number;
  error?: string;
}

/**
 * The core DocFlow AI documentation generation pipeline.
 *
 * Steps:
 * 1. Fetch user token from DB (decrypted)
 * 2. Shallow clone the repository
 * 3. Run static parser analysis (zero AI, zero network)
 * 4. Generate README via AI (LLM uses only structured facts)
 * 5. Persist generated README and cached facts to DB
 * 6. Mark job complete
 */
export async function runPipeline(payload: AnalysisJobPayload): Promise<PipelineResult> {
  const { jobId, repositoryId, userId, repoFullName, branch } = payload;

  await db.analysisJob.update({
    where: { id: jobId },
    data: { status: "ACTIVE" },
  });

  let cleanup: (() => Promise<void>) | undefined;

  try {
    // ── Step 0: Fetch decrypted GitHub token ────────────────────────────────
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user?.accessToken) {
      throw new Error(`User or access token not found for userId: ${userId}`);
    }
    const token = decrypt(user.accessToken);

    // ── Step 1: Shallow clone ───────────────────────────────────────────────
    console.log(`[pipeline] Cloning ${repoFullName}@${branch}…`);
    const { localPath, cleanup: _cleanup } = await cloneRepo(repoFullName, token, branch);
    cleanup = _cleanup;

    const git = simpleGit(localPath);
    const commitSha = (await git.revparse(["HEAD"])).trim();
    console.log(`[pipeline] Cloned at ${commitSha.slice(0, 8)}`);

    // ── Step 2: Static parser analysis ─────────────────────────────────────
    console.log(`[pipeline] Running static parser analysis…`);
    const facts = await analyzeRepo(localPath, { repoFullName, branch, commitSha });
    console.log(
      `[pipeline] Parser: stack=${facts.stack.map((s) => s.language).join(",")}, ` +
        `routes=${facts.routes.length}, envVars=${facts.envVars.length}, ` +
        `isMonorepo=${facts.isMonorepo}`
    );

    // ── Step 3: AI README generation ───────────────────────────────────────
    console.log(`[pipeline] Generating README via AI…`);
    const generatedDocs = await generateDocs(facts);
    console.log(
      `[pipeline] README generated via ${generatedDocs.usedFallback ? "deterministic fallback" : generatedDocs.provider} ` +
        `(${generatedDocs.sections.length} sections, ${generatedDocs.fullMarkdown.length} chars)`
    );

    // ── Step 4: Persist to database ─────────────────────────────────────────
    // Store facts JSON (without the raw README to avoid duplication)
    const factJson = { ...facts } as any;

    await db.cachedFacts.upsert({
      where: { repositoryId },
      create: {
        repositoryId,
        factJson,
        generatedReadme: generatedDocs.fullMarkdown,
        commitSha,
      },
      update: {
        factJson,
        generatedReadme: generatedDocs.fullMarkdown,
        commitSha,
      },
    });

    // ── Step 5: Mark job complete ────────────────────────────────────────────
    await db.analysisJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        commitSha,
        completedAt: new Date(),
        sectionsCount: generatedDocs.sections.length,
        usedFallback: generatedDocs.usedFallback,
      },
    });

    console.log(`[pipeline] ✅ Done for ${repoFullName}`);
    await cleanup();

    return {
      success: true,
      usedFallback: generatedDocs.usedFallback,
      sectionsCount: generatedDocs.sections.length,
    };
  } catch (err) {
    const error = err as Error;
    console.error(`[pipeline] ❌ Failed: ${error.message}`, error);

    await db.analysisJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: error.message.slice(0, 2000),
      },
    });

    if (cleanup) {
      try {
        await cleanup();
      } catch (cleanupErr) {
        console.error("[pipeline] Cleanup failed:", cleanupErr);
      }
    }

    return { success: false, error: error.message };
  }
}
