import type { FolderNode } from "@docflow/shared";
import * as fs from "node:fs";
import * as path from "node:path";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "__pycache__",
  ".venv",
  "venv",
  "vendor",
  ".turbo",
  ".vercel",
  "coverage",
  ".nyc_output",
  "target", // Rust/Java
]);

/**
 * Builds a JSON folder structure up to `maxDepth` levels deep.
 * Never reads file contents — only names and types.
 */
export function buildFolderStructure(repoPath: string, maxDepth: number): FolderNode[] {
  return scanDir(repoPath, maxDepth, 0);
}

function scanDir(dirPath: string, maxDepth: number, currentDepth: number): FolderNode[] {
  if (currentDepth >= maxDepth) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes: FolderNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
    if (IGNORED_DIRS.has(entry.name)) continue;

    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        type: "dir",
        children: scanDir(path.join(dirPath, entry.name), maxDepth, currentDepth + 1),
      });
    } else if (entry.isFile()) {
      nodes.push({ name: entry.name, type: "file" });
    }
  }

  return nodes.sort((a, b) => {
    // Directories first, then files
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
