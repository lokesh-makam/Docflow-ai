import type { TechStackEntry } from "@docflow/shared";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── Language/Framework mappings ───────────────────────────────────────────

/** Maps package.json dependency name → framework entry */
const JS_FRAMEWORKS: Record<string, Omit<TechStackEntry, "language">> = {
  express: { framework: "express" },
  fastify: { framework: "fastify" },
  koa: { framework: "koa" },
  hapi: { framework: "hapi" },
  "@hapi/hapi": { framework: "hapi" },
  next: { framework: "nextjs" },
  nuxt: { framework: "nuxtjs" },
  "@nestjs/core": { framework: "nestjs" },
  "@nestjs/platform-express": { framework: "nestjs" },
  "remix": { framework: "remix" },
  "@remix-run/node": { framework: "remix" },
  astro: { framework: "astro" },
  "react-router-dom": { framework: "react-router" },
};

const PYTHON_FRAMEWORKS: Record<string, string> = {
  fastapi: "fastapi",
  flask: "flask",
  django: "django",
  tornado: "tornado",
  starlette: "starlette",
  litestar: "litestar",
  falcon: "falcon",
};

const JAVA_FRAMEWORKS: Record<string, string> = {
  "spring-boot": "spring-boot",
  "spring-boot-starter-web": "spring-boot",
  "spring-web": "spring",
  "jakarta.ws.rs": "jaxrs",
  "io.quarkus:quarkus-resteasy": "quarkus",
  "io.micronaut:micronaut-http-server": "micronaut",
};

const GO_FRAMEWORKS: Record<string, string> = {
  "github.com/gin-gonic/gin": "gin",
  "github.com/gofiber/fiber": "fiber",
  "github.com/labstack/echo": "echo",
  "github.com/gorilla/mux": "gorilla-mux",
  "net/http": "stdlib",
};

const RUST_FRAMEWORKS: Record<string, string> = {
  actix_web: "actix",
  axum: "axum",
  rocket: "rocket",
  warp: "warp",
};

// ─── Main detector ─────────────────────────────────────────────────────────

export async function detectTechStack(repoPath: string): Promise<TechStackEntry[]> {
  const results: TechStackEntry[] = [];

  await Promise.all([
    detectJavaScript(repoPath, results),
    detectPython(repoPath, results),
    detectJava(repoPath, results),
    detectGo(repoPath, results),
    detectRust(repoPath, results),
    detectRuby(repoPath, results),
    detectDotNet(repoPath, results),
  ]);

  // Remove duplicates
  return deduplicateStack(results);
}

// ─── JavaScript / TypeScript ───────────────────────────────────────────────

async function detectJavaScript(repoPath: string, results: TechStackEntry[]) {
  const pkgPath = path.join(repoPath, "package.json");
  if (!fs.existsSync(pkgPath)) return;

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
  } catch {
    return;
  }

  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined ?? {}),
    ...(pkg.devDependencies as Record<string, string> | undefined ?? {}),
  };

  const hasTypeScript =
    "typescript" in deps ||
    fs.existsSync(path.join(repoPath, "tsconfig.json"));

  const language = hasTypeScript ? "typescript" : "javascript";

  // Check for framework matches
  let matched = false;
  for (const [dep, frameworkInfo] of Object.entries(JS_FRAMEWORKS)) {
    if (dep in deps) {
      results.push({
        language,
        framework: frameworkInfo.framework,
        version: deps[dep] as string,
      });
      matched = true;
    }
  }

  // Bare Node.js project
  if (!matched) {
    results.push({ language });
  }
}

// ─── Python ───────────────────────────────────────────────────────────────

async function detectPython(repoPath: string, results: TechStackEntry[]) {
  const sources = [
    path.join(repoPath, "requirements.txt"),
    path.join(repoPath, "requirements-base.txt"),
    path.join(repoPath, "pyproject.toml"),
    path.join(repoPath, "setup.py"),
    path.join(repoPath, "Pipfile"),
  ];

  const existing = sources.filter(fs.existsSync);
  if (existing.length === 0) return;

  for (const src of existing) {
    const content = fs.readFileSync(src, "utf8").toLowerCase();

    let matched = false;
    for (const [lib, framework] of Object.entries(PYTHON_FRAMEWORKS)) {
      if (content.includes(lib)) {
        results.push({ language: "python", framework });
        matched = true;
      }
    }
    if (!matched && existing.length > 0) {
      results.push({ language: "python" });
    }
  }
}

// ─── Java ─────────────────────────────────────────────────────────────────

async function detectJava(repoPath: string, results: TechStackEntry[]) {
  const pomPath = path.join(repoPath, "pom.xml");
  const gradlePath = path.join(repoPath, "build.gradle");
  const gradleKtsPath = path.join(repoPath, "build.gradle.kts");

  const files = [pomPath, gradlePath, gradleKtsPath].filter(fs.existsSync);
  if (files.length === 0) return;

  for (const f of files) {
    const content = fs.readFileSync(f, "utf8");
    let matched = false;
    for (const [artifact, framework] of Object.entries(JAVA_FRAMEWORKS)) {
      if (content.includes(artifact)) {
        results.push({ language: "java", framework });
        matched = true;
      }
    }
    if (!matched) results.push({ language: "java" });
  }
}

// ─── Go ───────────────────────────────────────────────────────────────────

async function detectGo(repoPath: string, results: TechStackEntry[]) {
  const goModPath = path.join(repoPath, "go.mod");
  if (!fs.existsSync(goModPath)) return;

  const content = fs.readFileSync(goModPath, "utf8");
  let matched = false;
  for (const [module, framework] of Object.entries(GO_FRAMEWORKS)) {
    if (content.includes(module)) {
      results.push({ language: "go", framework });
      matched = true;
    }
  }
  if (!matched) results.push({ language: "go" });
}

// ─── Rust ─────────────────────────────────────────────────────────────────

async function detectRust(repoPath: string, results: TechStackEntry[]) {
  const cargoPath = path.join(repoPath, "Cargo.toml");
  if (!fs.existsSync(cargoPath)) return;

  const content = fs.readFileSync(cargoPath, "utf8");
  let matched = false;
  for (const [crate, framework] of Object.entries(RUST_FRAMEWORKS)) {
    if (content.includes(crate)) {
      results.push({ language: "rust", framework });
      matched = true;
    }
  }
  if (!matched) results.push({ language: "rust" });
}

// ─── Ruby ─────────────────────────────────────────────────────────────────

async function detectRuby(repoPath: string, results: TechStackEntry[]) {
  const gemfilePath = path.join(repoPath, "Gemfile");
  if (!fs.existsSync(gemfilePath)) return;

  const content = fs.readFileSync(gemfilePath, "utf8");
  const rubyFrameworks = { rails: "rails", sinatra: "sinatra", hanami: "hanami" };
  for (const [gem, framework] of Object.entries(rubyFrameworks)) {
    if (content.includes(`gem '${gem}'`) || content.includes(`gem "${gem}"`)) {
      results.push({ language: "unknown" as "javascript", framework } as TechStackEntry);
    }
  }
}

// ─── .NET ─────────────────────────────────────────────────────────────────

async function detectDotNet(repoPath: string, results: TechStackEntry[]) {
  const csprojFiles = fs.readdirSync(repoPath).filter((f) => f.endsWith(".csproj"));
  if (csprojFiles.length === 0) return;

  const content = fs.readFileSync(path.join(repoPath, csprojFiles[0]), "utf8");
  if (content.includes("Microsoft.AspNetCore")) {
    results.push({ language: "unknown" as "javascript", framework: "aspnet-core" } as TechStackEntry);
  } else {
    results.push({ language: "unknown" as "javascript", framework: "dotnet" } as TechStackEntry);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function deduplicateStack(entries: TechStackEntry[]): TechStackEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = `${e.language}:${e.framework ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
