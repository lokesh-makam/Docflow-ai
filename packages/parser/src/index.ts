import type {
  TechStackEntry,
  ParsedRoute,
  DatabaseInfo,
  AuthInfo,
  EnvVar,
  InfraInfo,
  RepoFacts,
  FolderNode,
  WorkspaceFacts,
} from "@docflow/shared";
import { detectTechStack } from "./detectors/tech-stack.js";
import { detectRoutes } from "./detectors/routes.js";
import { detectDatabases } from "./detectors/database.js";
import { detectAuth } from "./detectors/auth.js";
import { detectEnvVars } from "./detectors/env-vars.js";
import { detectInfra } from "./detectors/infra.js";
import { detectMonorepo } from "./detectors/monorepo.js";
import { detectCommands } from "./detectors/commands.js";
import { buildFolderStructure } from "./detectors/folder-structure.js";
import * as fs from "node:fs";
import * as path from "node:path";

export interface AnalyzeOptions {
  /** Commit SHA being analyzed */
  commitSha: string;
  /** Branch name */
  branch: string;
  /** Repository full name */
  repoFullName: string;
  /**
   * If provided, only re-analyze facts affected by these changed files.
   * The caller is responsible for merging returned facts with cached facts.
   * If undefined, performs a full analysis.
   */
  changedFiles?: string[];
}

/**
 * Main entry point for the Parser Engine.
 *
 * Analyzes a local repository directory and returns structured RepoFacts.
 * RAW SOURCE CODE IS NEVER RETURNED — only extracted, structured facts.
 *
 * @param repoPath - Absolute path to the cloned repository root
 * @param options  - Analysis options
 * @returns RepoFacts — structured JSON summary safe to pass to the AI module
 */
export async function analyzeRepo(
  repoPath: string,
  options: AnalyzeOptions
): Promise<RepoFacts> {
  if (!fs.existsSync(repoPath)) {
    throw new Error(`Repository path does not exist: ${repoPath}`);
  }

  const { changedFiles, commitSha, branch, repoFullName } = options;

  // Determine which detectors to run based on changed files
  // For a full analysis (no changedFiles), run everything.
  const runAll = !changedFiles || changedFiles.length === 0;

  const [
    stack,
    databases,
    auth,
    envVars,
    infra,
    commands,
    folderStructure,
    monorepoInfo,
  ] = await Promise.all([
    detectTechStack(repoPath),
    detectDatabases(repoPath),
    detectAuth(repoPath),
    detectEnvVars(repoPath),
    detectInfra(repoPath),
    detectCommands(repoPath),
    buildFolderStructure(repoPath, 3),
    detectMonorepo(repoPath),
  ]);

  // Route detection is language-specific and most expensive — always run
  const routes = await detectRoutes(repoPath, stack, changedFiles);

  // For monorepos, also generate per-workspace facts
  let workspaces: WorkspaceFacts[] | undefined;
  if (monorepoInfo.isMonorepo && monorepoInfo.workspacePaths.length > 0) {
    workspaces = await Promise.all(
      monorepoInfo.workspacePaths.map((wsPath) =>
        analyzeWorkspace(repoPath, wsPath)
      )
    );
  }

  const manifest = extractManifestDetails(repoPath);

  const facts: RepoFacts = {
    repoFullName,
    branch,
    commitSha,
    analyzedAt: new Date().toISOString(),
    stack,
    routes,
    databases,
    auth,
    envVars,
    infra,
    folderStructure,
    installCommands: commands.install,
    devCommands: commands.dev,
    buildCommands: commands.build,
    isMonorepo: monorepoInfo.isMonorepo,
    workspaces,
    ...manifest,
  };

  return facts;
}

/**
 * Analyzes a single workspace within a monorepo.
 */
async function analyzeWorkspace(
  repoRoot: string,
  workspacePath: string
): Promise<WorkspaceFacts> {
  const fullPath = path.join(repoRoot, workspacePath);
  const name = path.basename(workspacePath);

  const stack = await detectTechStack(fullPath);
  const [routes, databases, auth, envVars, infra] = await Promise.all([
    detectRoutes(fullPath, stack, undefined),
    detectDatabases(fullPath),
    detectAuth(fullPath),
    detectEnvVars(fullPath),
    detectInfra(fullPath),
  ]);

  const manifest = extractManifestDetails(fullPath);

  return {
    name,
    path: workspacePath,
    stack,
    routes,
    databases,
    auth,
    envVars,
    infra,
    ...manifest,
  };
}

/**
 * Merges new partial facts (from a diff-only analysis) into cached full facts.
 * Only updates the fields affected by the changed files.
 */
export function mergeFacts(
  cached: RepoFacts,
  partial: Partial<RepoFacts>,
  newCommitSha: string
): RepoFacts {
  return {
    ...cached,
    ...partial,
    // Always update metadata
    commitSha: newCommitSha,
    analyzedAt: new Date().toISOString(),
    // Deep-merge routes: remove routes from changed files, add new ones
    routes:
      partial.routes !== undefined
        ? [
            ...cached.routes.filter(
              (r) =>
                !partial.routes?.some((nr) => nr.file === r.file)
            ),
            ...(partial.routes ?? []),
          ]
        : cached.routes,
    // Deep-merge env vars: deduplicate by name
    envVars:
      partial.envVars !== undefined
        ? deduplicateByName([...cached.envVars, ...(partial.envVars ?? [])])
        : cached.envVars,
  };
}

function deduplicateByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}

function extractManifestDetails(projectPath: string) {
  const details: {
    packageManager?: string;
    packageScripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } = {};

  const pkgPath = path.join(projectPath, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      details.packageScripts = pkg.scripts || undefined;
      details.dependencies = pkg.dependencies || undefined;
      details.devDependencies = pkg.devDependencies || undefined;

      if (fs.existsSync(path.join(projectPath, "bun.lockb"))) {
        details.packageManager = "bun";
      } else if (fs.existsSync(path.join(projectPath, "pnpm-lock.yaml"))) {
        details.packageManager = "pnpm";
      } else if (fs.existsSync(path.join(projectPath, "yarn.lock"))) {
        details.packageManager = "yarn";
      } else {
        details.packageManager = "npm";
      }
    } catch {
      // ignore
    }
  } else if (fs.existsSync(path.join(projectPath, "go.mod"))) {
    details.packageManager = "go";
  } else if (fs.existsSync(path.join(projectPath, "Cargo.toml"))) {
    details.packageManager = "cargo";
  } else if (fs.existsSync(path.join(projectPath, "requirements.txt")) || fs.existsSync(path.join(projectPath, "pyproject.toml"))) {
    details.packageManager = "pip";
  } else if (fs.existsSync(path.join(projectPath, "pom.xml"))) {
    details.packageManager = "maven";
  } else if (fs.existsSync(path.join(projectPath, "build.gradle")) || fs.existsSync(path.join(projectPath, "build.gradle.kts"))) {
    details.packageManager = "gradle";
  }

  return details;
}

export { detectTechStack } from "./detectors/tech-stack.js";
export { detectRoutes } from "./detectors/routes.js";
export { detectDatabases } from "./detectors/database.js";
export { detectAuth } from "./detectors/auth.js";
export { detectEnvVars } from "./detectors/env-vars.js";
export { detectInfra } from "./detectors/infra.js";
export { detectMonorepo } from "./detectors/monorepo.js";
