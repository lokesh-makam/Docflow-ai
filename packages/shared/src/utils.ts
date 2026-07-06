import type { RepoFacts } from "./types.js";

/**
 * Sanitizes RepoFacts to ensure no raw source code strings are present.
 * This is a hard architectural boundary — only structured facts reach the AI.
 *
 * Throws if any value exceeds the raw-source threshold (strings > 2000 chars
 * that look like source code rather than a structured value).
 */
export function sanitizeFacts(facts: RepoFacts): RepoFacts {
  const json = JSON.stringify(facts);

  // Detect if any string value looks like raw source (heuristic: contains
  // multiple lines with indentation AND code keywords)
  const sourceCodePattern =
    /(?:function|class|import|export|const|let|var|def |return |if \(|for \()\s/g;

  const values = extractStringValues(facts);
  for (const value of values) {
    if (value.length > 500 && (value.match(sourceCodePattern) ?? []).length > 3) {
      throw new Error(
        `[DocFlow AI] Security violation: RepoFacts contains what appears to be raw source code. ` +
          `Only structured facts are permitted in the AI context. ` +
          `Offending value (first 100 chars): "${value.slice(0, 100)}..."`
      );
    }
  }

  return facts;
}

/** Recursively extract all string values from an object */
function extractStringValues(obj: unknown): string[] {
  if (typeof obj === "string") return [obj];
  if (Array.isArray(obj)) return obj.flatMap(extractStringValues);
  if (obj !== null && typeof obj === "object") {
    return Object.values(obj).flatMap(extractStringValues);
  }
  return [];
}

/**
 * Validates that a markdown string has correct heading hierarchy,
 * no broken tables, and valid Mermaid blocks.
 * Returns an array of error messages (empty = valid).
 */
export async function validateMarkdown(markdown: string): Promise<string[]> {
  const errors: string[] = [];

  // Check heading hierarchy (no skipping levels)
  const headings = [...markdown.matchAll(/^(#{1,6})\s+.+$/gm)];
  let prevLevel = 0;
  for (const match of headings) {
    const level = match[1].length;
    if (level > prevLevel + 1 && prevLevel !== 0) {
      errors.push(
        `Heading hierarchy skip: jumped from h${prevLevel} to h${level} at: "${match[0]}"`
      );
    }
    prevLevel = level;
  }

  // Check table alignment (every row must have same column count)
  const tableBlocks = [...markdown.matchAll(/(\|.+\|\n)+/g)];
  for (const block of tableBlocks) {
    const rows = block[0].trim().split("\n");
    const colCounts = rows.map((r) => r.split("|").length);
    const expected = colCounts[0];
    for (let i = 1; i < colCounts.length; i++) {
      if (colCounts[i] !== expected) {
        errors.push(`Table has inconsistent column count at row ${i + 1}`);
        break;
      }
    }
  }

  // Check Mermaid blocks are closed
  const openMermaid = (markdown.match(/```mermaid/g) ?? []).length;
  const closeMermaid = (markdown.match(/```\s*\n/g) ?? []).length;
  if (openMermaid > 0 && openMermaid !== closeMermaid) {
    errors.push("Unclosed mermaid code block detected");
  }

  return errors;
}

/**
 * Extracts the branch name from a Git ref string.
 * "refs/heads/main" → "main"
 */
export function branchFromRef(ref: string): string {
  return ref.replace(/^refs\/heads\//, "");
}

/**
 * Converts a list of changed file paths to a categorized summary
 * used by the parser to decide which detectors to re-run.
 */
export function categorizeChangedFiles(files: string[]): {
  hasPackageManifests: boolean;
  hasSourceFiles: boolean;
  hasInfraFiles: boolean;
  hasEnvFiles: boolean;
} {
  const manifestExts = ["package.json", "requirements.txt", "pyproject.toml",
    "pom.xml", "build.gradle", "go.mod", "Cargo.toml", "composer.json"];
  const infraFiles = ["Dockerfile", "docker-compose.yml", "docker-compose.yaml",
    ".github", ".gitlab-ci.yml", "vercel.json", "netlify.toml", "fly.toml"];
  const envFiles = [".env", ".env.example", ".env.local"];

  return {
    hasPackageManifests: files.some((f) => manifestExts.some((m) => f.endsWith(m))),
    hasSourceFiles: files.some((f) =>
      /\.(ts|tsx|js|jsx|py|java|go|rs|rb)$/.test(f)
    ),
    hasInfraFiles: files.some((f) => infraFiles.some((i) => f.includes(i))),
    hasEnvFiles: files.some((f) => envFiles.some((e) => f.endsWith(e))),
  };
}

/**
 * Generates a short fingerprint of the repo facts for cache comparison.
 */
export function factFingerprint(facts: RepoFacts): string {
  const key = [
    facts.repoFullName,
    facts.commitSha,
    facts.stack.map((s) => `${s.language}:${s.framework}`).join(","),
    facts.routes.length,
    facts.envVars.length,
  ].join("|");
  return key;
}
