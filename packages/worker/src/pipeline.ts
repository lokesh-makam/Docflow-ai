import type { AnalysisJobPayload, RepoFacts } from "@docflow/shared";
import { categorizeChangedFiles } from "@docflow/shared";
import { analyzeRepo, mergeFacts } from "@docflow/parser";
import { generateDocs } from "@docflow/ai";
import { validateGeneratedDocs } from "@docflow/ai";
import { cloneRepo, commitAndOpenPR } from "@docflow/github/git";
import { db } from "@docflow/database";
import { patchReadme } from "./readme-patcher.js";

export interface PipelineResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  usedFallback?: boolean;
  sectionsUpdated?: number;
  error?: string;
}

/**
 * The full documentation generation pipeline.
 *
 * Steps:
 * 1. Shallow-clone the repository
 * 2. Load cached facts (if any)
 * 3. Determine which detectors to run (diff-only or full)
 * 4. Run the Parser Engine (zero AI)
 * 5. Merge new facts with cached facts
 * 6. Update the fact cache in the database
 * 7. Generate documentation via AI (or fallback)
 * 8. Validate generated markdown
 * 9. Apply surgical section-level patches to existing READMEs
 * 10. Commit and open PR
 * 11. Update job status
 */
export async function runPipeline(payload: AnalysisJobPayload): Promise<PipelineResult> {
  const {
    jobId,
    repositoryId,
    installationId,
    repoFullName,
    branch,
    afterSha,
    beforeSha,
    changedFiles,
  } = payload;

  // ── Update job status to ACTIVE ────────────────────────────────────────────
  await db.analysisJob.update({
    where: { id: jobId },
    data: { status: "ACTIVE", startedAt: new Date() },
  });

  let cleanup: (() => Promise<void>) | undefined;

  try {
    // ── Step 1: Shallow clone ──────────────────────────────────────────────────
    console.log(`[pipeline] Cloning ${repoFullName}@${branch}...`);
    const { localPath, cleanup: _cleanup } = await cloneRepo(
      repoFullName,
      installationId,
      branch
    );
    cleanup = _cleanup;

    // ── Step 2: Load cached facts ──────────────────────────────────────────────
    const cachedFactsRecord = await db.cachedFacts.findUnique({
      where: { repositoryId },
    });
    const cachedFacts = cachedFactsRecord?.factJson as RepoFacts | null;

    // ── Step 3: Determine analysis scope ──────────────────────────────────────
    const shouldRunFullAnalysis =
      !cachedFacts ||
      cachedFacts.commitSha === "0000000000000000000000000000000000000000";

    const filesToAnalyze = shouldRunFullAnalysis ? undefined : changedFiles;

    console.log(
      `[pipeline] Running ${shouldRunFullAnalysis ? "FULL" : "DIFF-ONLY"} analysis` +
      (filesToAnalyze ? ` on ${filesToAnalyze.length} changed files` : "")
    );

    // ── Step 4: Run Parser Engine (zero AI) ────────────────────────────────────
    const newFacts = await analyzeRepo(localPath, {
      repoFullName,
      branch,
      commitSha: afterSha,
      changedFiles: filesToAnalyze,
    });

    // ── Step 5: Merge facts ────────────────────────────────────────────────────
    const mergedFacts = cachedFacts
      ? mergeFacts(cachedFacts, newFacts, afterSha)
      : newFacts;

    // ── Step 6: Update fact cache ──────────────────────────────────────────────
    await db.cachedFacts.upsert({
      where: { repositoryId },
      create: {
        repositoryId,
        factJson: mergedFacts as object,
        commitSha: afterSha,
      },
      update: {
        factJson: mergedFacts as object,
        commitSha: afterSha,
      },
    });

    // ── Step 7: Generate documentation ────────────────────────────────────────
    console.log(`[pipeline] Generating documentation...`);
    const generatedDocs = await generateDocs(mergedFacts);
    console.log(
      `[pipeline] Docs generated via ${generatedDocs.usedFallback ? "fallback template" : generatedDocs.provider}`
    );

    // ── Step 8: Validate generated markdown ───────────────────────────────────
    const validation = await validateGeneratedDocs(generatedDocs);
    if (!validation.isValid) {
      console.warn(
        `[pipeline] Markdown validation errors:\n${validation.errors.join("\n")}`
      );
      // Non-fatal: log and continue (better a slightly imperfect doc than no PR)
    }
    if (validation.warnings.length > 0) {
      console.warn(`[pipeline] Markdown warnings:\n${validation.warnings.join("\n")}`);
    }

    // ── Step 9: Apply surgical README patches ──────────────────────────────────
    console.log(`[pipeline] Patching README...`);
    const { patchedContent, sectionsUpdated } = await patchReadme(
      localPath,
      generatedDocs
    );

    if (sectionsUpdated === 0) {
      console.log(`[pipeline] No README sections changed, skipping PR`);
      await db.analysisJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          docsChangedCount: 0,
          usedFallback: generatedDocs.usedFallback,
        },
      });
      await cleanup();
      return { success: true, sectionsUpdated: 0 };
    }

    // ── Step 10: Commit and open PR ────────────────────────────────────────────
    console.log(`[pipeline] Opening PR with ${sectionsUpdated} updated section(s)...`);
    const { prUrl, prNumber } = await commitAndOpenPR({
      repoFullName,
      installationId,
      baseBranch: branch,
      commitSha: afterSha,
      patchedFiles: [{ path: "README.md", content: patchedContent }],
    });

    // ── Step 11: Mark job complete ─────────────────────────────────────────────
    await db.analysisJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        prUrl,
        prNumber,
        docsChangedCount: sectionsUpdated,
        usedFallback: generatedDocs.usedFallback,
      },
    });

    console.log(`[pipeline] ✅ PR opened: ${prUrl}`);
    await cleanup();

    return { success: true, prUrl, prNumber, sectionsUpdated, usedFallback: generatedDocs.usedFallback };
  } catch (err) {
    const error = err as Error;
    console.error(`[pipeline] ❌ Failed: ${error.message}`, error);

    await db.analysisJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: error.message.slice(0, 1000),
      },
    });

    if (cleanup) await cleanup();

    return { success: false, error: error.message };
  }
}
