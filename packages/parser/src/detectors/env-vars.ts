import type { EnvVar } from "@docflow/shared";
import * as fs from "node:fs";
import * as path from "node:path";
import { glob } from "glob";

/** Patterns that suggest a variable holds a secret/credential */
const SENSITIVE_PATTERNS = [
  /_SECRET$/i,
  /_KEY$/i,
  /_TOKEN$/i,
  /_PASSWORD$/i,
  /_PASS$/i,
  /_CREDENTIAL$/i,
  /_PRIVATE$/i,
  /^SECRET_/i,
  /^PRIVATE_/i,
  /API_KEY$/i,
  /WEBHOOK_SECRET/i,
  /SIGNING_KEY/i,
  /ENCRYPTION_KEY/i,
  /AUTH_SECRET/i,
  /JWT_SECRET/i,
];

/** Patterns to extract env var names from source code */
const ENV_PATTERNS: Array<{ pattern: RegExp; nameGroup: number }> = [
  // Node.js: process.env.VAR_NAME or process.env["VAR_NAME"]
  { pattern: /process\.env\.([A-Z][A-Z0-9_]*)/g, nameGroup: 1 },
  { pattern: /process\.env\[['"]([A-Z][A-Z0-9_]*)['"\]]/g, nameGroup: 1 },
  // Vite / Next.js client: import.meta.env.VITE_VAR
  { pattern: /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g, nameGroup: 1 },
  // Python: os.environ["VAR"] or os.environ.get("VAR") or os.getenv("VAR")
  { pattern: /os\.environ(?:\.get)?\s*\(\s*['"]([A-Z][A-Z0-9_]*)['"]/, nameGroup: 1 },
  { pattern: /os\.getenv\s*\(\s*['"]([A-Z][A-Z0-9_]*)['"]/, nameGroup: 1 },
  // Go: os.Getenv("VAR")
  { pattern: /os\.Getenv\s*\(\s*"([A-Z][A-Z0-9_]*)"/, nameGroup: 1 },
  // Java: System.getenv("VAR")
  { pattern: /System\.getenv\s*\(\s*"([A-Z][A-Z0-9_]*)"/, nameGroup: 1 },
  // Rust: std::env::var("VAR")
  { pattern: /std::env::var\s*\(\s*"([A-Z][A-Z0-9_]*)"/, nameGroup: 1 },
  // Ruby: ENV["VAR"] or ENV.fetch("VAR")
  { pattern: /ENV\[['"]([A-Z][A-Z0-9_]*)['"\]]/, nameGroup: 1 },
  { pattern: /ENV\.fetch\s*\(\s*['"]([A-Z][A-Z0-9_]*)['"]/, nameGroup: 1 },
];

/** Common env vars to exclude from documentation (too generic) */
const EXCLUDED_VARS = new Set([
  "NODE_ENV",
  "HOME",
  "PATH",
  "USER",
  "SHELL",
  "PWD",
  "TERM",
  "HOSTNAME",
  "PORT",
]);

export async function detectEnvVars(repoPath: string): Promise<EnvVar[]> {
  const varMap = new Map<string, EnvVar>();

  // 1. Parse .env.example / .env.template for canonical definitions
  const envExampleFiles = [".env.example", ".env.sample", ".env.template", ".env.defaults"];
  for (const envFile of envExampleFiles) {
    const filePath = path.join(repoPath, envFile);
    if (fs.existsSync(filePath)) {
      parseEnvFile(fs.readFileSync(filePath, "utf8"), envFile, varMap);
    }
  }

  // 2. Scan source files for env var usage
  const sourceFiles = await glob(
    ["**/*.{ts,js,mjs,cjs,tsx,jsx,py,go,java,rs,rb}", "**/*.env*"],
    {
      cwd: repoPath,
      absolute: true,
      ignore: [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/.git/**",
        "**/vendor/**",
        "**/__pycache__/**",
        "**/*.lock",
        // Never read actual .env files (could contain real secrets)
        "**/.env",
        "**/.env.local",
        "**/.env.production",
        "**/.env.development",
      ],
    }
  );

  for (const file of sourceFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }

    const relFile = path.relative(repoPath, file);
    extractEnvVarsFromSource(content, relFile, varMap);
  }

  return [...varMap.values()].filter((v) => !EXCLUDED_VARS.has(v.name));
}

/** Parse a .env.example file for variable definitions */
function parseEnvFile(content: string, filename: string, map: Map<string, EnvVar>) {
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const name = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) continue;

    const isSensitive = SENSITIVE_PATTERNS.some((p) => p.test(name));
    const example = value && !isSensitive ? value : undefined;

    if (!map.has(name)) {
      map.set(name, { name, isSensitive, usedIn: [filename], example });
    }
  }
}

/** Extract env var names from source code */
function extractEnvVarsFromSource(
  content: string,
  filename: string,
  map: Map<string, EnvVar>
) {
  for (const { pattern, nameGroup } of ENV_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const name = match[nameGroup];
      if (!name || EXCLUDED_VARS.has(name)) continue;

      const isSensitive = SENSITIVE_PATTERNS.some((p) => p.test(name));

      if (map.has(name)) {
        const existing = map.get(name)!;
        if (!existing.usedIn.includes(filename)) {
          existing.usedIn.push(filename);
        }
      } else {
        map.set(name, { name, isSensitive, usedIn: [filename] });
      }
    }
  }
}
