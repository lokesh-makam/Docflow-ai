import * as fs from "node:fs";
import * as path from "node:path";

export interface MonorepoInfo {
  isMonorepo: boolean;
  workspacePaths: string[];
  type?: "pnpm" | "npm" | "yarn" | "turborepo" | "nx" | "lerna";
}

export async function detectMonorepo(repoPath: string): Promise<MonorepoInfo> {
  const workspacePaths: string[] = [];
  let type: MonorepoInfo["type"];

  // ── pnpm-workspace.yaml ───────────────────────────────────────────────────
  const pnpmWorkspace = path.join(repoPath, "pnpm-workspace.yaml");
  if (fs.existsSync(pnpmWorkspace)) {
    type = "pnpm";
    const content = fs.readFileSync(pnpmWorkspace, "utf8");
    const patterns = extractYamlList(content, "packages:");
    workspacePaths.push(...resolveGlobPatterns(repoPath, patterns));
  }

  // ── package.json workspaces ───────────────────────────────────────────────
  const pkgPath = path.join(repoPath, "package.json");
  if (fs.existsSync(pkgPath) && workspacePaths.length === 0) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
        workspaces?: string[] | { packages?: string[] };
      };
      if (pkg.workspaces) {
        type = "npm";
        const patterns = Array.isArray(pkg.workspaces)
          ? pkg.workspaces
          : pkg.workspaces.packages ?? [];
        workspacePaths.push(...resolveGlobPatterns(repoPath, patterns));
      }
    } catch {
      // ignore
    }
  }

  // ── Turborepo ─────────────────────────────────────────────────────────────
  if (fs.existsSync(path.join(repoPath, "turbo.json"))) {
    type = type ?? "turborepo";
  }

  // ── Nx ────────────────────────────────────────────────────────────────────
  if (fs.existsSync(path.join(repoPath, "nx.json"))) {
    type = "nx";
    // Nx keeps apps in /apps and libs in /libs by convention
    for (const dir of ["apps", "libs", "packages"]) {
      const dirPath = path.join(repoPath, dir);
      if (fs.existsSync(dirPath)) {
        const subdirs = fs.readdirSync(dirPath, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => `${dir}/${d.name}`);
        workspacePaths.push(...subdirs);
      }
    }
  }

  // ── Lerna ─────────────────────────────────────────────────────────────────
  const lernaPath = path.join(repoPath, "lerna.json");
  if (fs.existsSync(lernaPath) && workspacePaths.length === 0) {
    type = "lerna";
    try {
      const lerna = JSON.parse(fs.readFileSync(lernaPath, "utf8")) as {
        packages?: string[];
      };
      const patterns = lerna.packages ?? ["packages/*"];
      workspacePaths.push(...resolveGlobPatterns(repoPath, patterns));
    } catch {
      // ignore
    }
  }

  return {
    isMonorepo: workspacePaths.length > 0,
    workspacePaths: [...new Set(workspacePaths)],
    type,
  };
}

/** Resolve glob patterns like "apps/*" or "packages/*" to actual directory paths */
function resolveGlobPatterns(repoPath: string, patterns: string[]): string[] {
  const results: string[] = [];

  for (const pattern of patterns) {
    // Simple glob: handle "apps/*" style only (no deep nesting needed)
    const parts = pattern.replace(/\/\*$/, "").split("/");
    const parentDir = path.join(repoPath, ...parts);

    if (pattern.endsWith("/*") && fs.existsSync(parentDir)) {
      const subdirs = fs.readdirSync(parentDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => path.join(...parts, d.name));
      results.push(...subdirs);
    } else if (fs.existsSync(path.join(repoPath, pattern))) {
      results.push(pattern);
    }
  }

  return results;
}

/** Extract a YAML list value from content */
function extractYamlList(content: string, key: string): string[] {
  const results: string[] = [];
  let inList = false;

  for (const line of content.split("\n")) {
    if (line.trim().startsWith(key)) {
      inList = true;
      continue;
    }
    if (inList) {
      const match = /^\s*-\s+['"]?(.+?)['"]?\s*$/.exec(line);
      if (match) {
        results.push(match[1]);
      } else if (line.trim() && !line.startsWith(" ")) {
        break;
      }
    }
  }

  return results;
}
