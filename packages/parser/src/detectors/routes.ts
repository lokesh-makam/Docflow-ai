import type { ParsedRoute, TechStackEntry } from "@docflow/shared";
import * as fs from "node:fs";
import * as path from "node:path";
import { glob } from "glob";

// ─── Route pattern matchers per language ──────────────────────────────────

// Express.js / Fastify / Koa style: router.get("/path", ...)
const JS_ROUTER_PATTERN =
  /(?:router|app|server|fastify)\.(get|post|put|patch|delete|head|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi;

// NestJS decorators: @Get("/path"), @Post("/path")
const NEST_DECORATOR_PATTERN =
  /@(Get|Post|Put|Patch|Delete|Head|Options|All)\s*\(\s*['"`]?([^'"`)\s]*)['"`]?\s*\)/gi;

// Next.js App Router: export function GET(req) in route.ts files
const NEXTJS_ROUTE_PATTERN = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD)\s*\(/g;

// FastAPI / Flask Python
const FASTAPI_PATTERN =
  /@(?:app|router)\.(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi;

// Django urls.py: path("endpoint/", view)
const DJANGO_URL_PATTERN = /path\s*\(\s*['"`]([^'"`]+)['"`]/gi;

// Go: r.HandleFunc("/path", ...), http.HandleFunc("/path", ...)
const GO_HANDLER_PATTERN =
  /(?:r|mux|router|http)\.HandleFunc\s*\(\s*"([^"]+)"/gi;

// Gin: r.GET("/path", ...), router.POST("/path", ...)
const GIN_PATTERN =
  /(?:r|router|api|v1|group)\.(GET|POST|PUT|PATCH|DELETE)\s*\(\s*"([^"]+)"/gi;

// Spring Boot: @GetMapping, @PostMapping, etc.
const SPRING_MAPPING_PATTERN =
  /@(GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|RequestMapping)\s*(?:\(\s*(?:value\s*=\s*)?['"]([^'"]+)['"])?/gi;

// Auth detection patterns (to annotate routes)
const AUTH_PATTERNS = [
  /requireAuth/i,
  /isAuthenticated/i,
  /authMiddleware/i,
  /verifyToken/i,
  /protect\b/i,
  /@UseGuards/i,
  /JwtAuthGuard/i,
];

// ─── Main detector ─────────────────────────────────────────────────────────

export async function detectRoutes(
  repoPath: string,
  stack: TechStackEntry[],
  changedFiles?: string[]
): Promise<ParsedRoute[]> {
  const routes: ParsedRoute[] = [];

  const languages = stack.map((s) => s.language);
  const frameworks = stack.map((s) => s.framework).filter(Boolean);

  // Determine file globs to scan
  const filesToScan = changedFiles
    ? changedFiles.map((f) => path.join(repoPath, f)).filter(fs.existsSync)
    : await discoverRouteFiles(repoPath, languages, frameworks as string[]);

  for (const file of filesToScan) {
    const ext = path.extname(file).toLowerCase();
    const content = fs.readFileSync(file, "utf8");
    const relFile = path.relative(repoPath, file);

    if ([".ts", ".tsx", ".js", ".jsx", ".mjs"].includes(ext)) {
      // Check if this is a Next.js App Router route file
      if (file.includes(path.sep + "app" + path.sep) && path.basename(file, ext) === "route") {
        extractNextjsRoutes(content, relFile, routes);
      } else if (frameworks.includes("nestjs")) {
        extractNestRoutes(content, relFile, routes);
      } else {
        extractJsRoutes(content, relFile, routes);
      }
    } else if (ext === ".py") {
      if (frameworks.includes("django")) {
        extractDjangoRoutes(content, relFile, routes);
      } else {
        extractFastapiRoutes(content, relFile, routes);
      }
    } else if (ext === ".go") {
      extractGoRoutes(content, relFile, routes, frameworks as string[]);
    } else if (ext === ".java") {
      extractSpringRoutes(content, relFile, routes);
    }
  }

  return deduplicateRoutes(routes);
}

// ─── Language-specific extractors ─────────────────────────────────────────

function extractJsRoutes(content: string, file: string, routes: ParsedRoute[]) {
  let match: RegExpExecArray | null;

  JS_ROUTER_PATTERN.lastIndex = 0;
  while ((match = JS_ROUTER_PATTERN.exec(content)) !== null) {
    const lineNumber = countLines(content, match.index);
    const surrounding = getSurroundingLines(content, match.index, 5);
    routes.push({
      method: match[1].toUpperCase() as ParsedRoute["method"],
      path: match[2],
      file,
      line: lineNumber,
      auth: detectAuthInContext(surrounding) ?? undefined,
    });
  }
}

function extractNestRoutes(content: string, file: string, routes: ParsedRoute[]) {
  // Find controller path prefix
  const controllerMatch = /@Controller\s*\(\s*['"`]([^'"`]*)['"`]/.exec(content);
  const basePath = controllerMatch ? "/" + controllerMatch[1].replace(/^\//, "") : "";

  let match: RegExpExecArray | null;
  NEST_DECORATOR_PATTERN.lastIndex = 0;
  while ((match = NEST_DECORATOR_PATTERN.exec(content)) !== null) {
    const methodName = match[1].toUpperCase();
    if (["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "ALL"].includes(methodName)) {
      const subPath = match[2] ? "/" + match[2].replace(/^\//, "") : "";
      const surrounding = getSurroundingLines(content, match.index, 5);
      routes.push({
        method: (methodName === "ALL" ? "ANY" : methodName) as ParsedRoute["method"],
        path: basePath + subPath || "/",
        file,
        line: countLines(content, match.index),
        auth: detectAuthInContext(surrounding) ?? undefined,
      });
    }
  }
}

function extractNextjsRoutes(content: string, file: string, routes: ParsedRoute[]) {
  // Derive path from file path: app/api/users/route.ts → /api/users
  const appIndex = file.indexOf(path.sep + "app" + path.sep);
  const routePath = appIndex !== -1
    ? "/" + file.slice(appIndex + 5).replace(/route\.[^.]+$/, "").replace(/\\/g, "/").replace(/\/$/, "") || "/"
    : "/" + path.dirname(file).replace(/\\/g, "/");

  // Replace [param] → :param for display
  const normalizedPath = routePath.replace(/\[([^\]]+)\]/g, ":$1");

  let match: RegExpExecArray | null;
  NEXTJS_ROUTE_PATTERN.lastIndex = 0;
  while ((match = NEXTJS_ROUTE_PATTERN.exec(content)) !== null) {
    routes.push({
      method: match[1] as ParsedRoute["method"],
      path: normalizedPath,
      file,
      line: countLines(content, match.index),
    });
  }
}

function extractFastapiRoutes(content: string, file: string, routes: ParsedRoute[]) {
  let match: RegExpExecArray | null;
  FASTAPI_PATTERN.lastIndex = 0;
  while ((match = FASTAPI_PATTERN.exec(content)) !== null) {
    routes.push({
      method: match[1].toUpperCase() as ParsedRoute["method"],
      path: match[2],
      file,
      line: countLines(content, match.index),
    });
  }
}

function extractDjangoRoutes(content: string, file: string, routes: ParsedRoute[]) {
  let match: RegExpExecArray | null;
  DJANGO_URL_PATTERN.lastIndex = 0;
  while ((match = DJANGO_URL_PATTERN.exec(content)) !== null) {
    routes.push({
      method: "ANY",
      path: "/" + match[1],
      file,
      line: countLines(content, match.index),
    });
  }
}

function extractGoRoutes(content: string, file: string, routes: ParsedRoute[], frameworks: string[]) {
  let match: RegExpExecArray | null;

  if (frameworks.includes("gin") || frameworks.includes("fiber") || frameworks.includes("echo")) {
    GIN_PATTERN.lastIndex = 0;
    while ((match = GIN_PATTERN.exec(content)) !== null) {
      routes.push({
        method: match[1].toUpperCase() as ParsedRoute["method"],
        path: match[2],
        file,
        line: countLines(content, match.index),
      });
    }
  } else {
    GO_HANDLER_PATTERN.lastIndex = 0;
    while ((match = GO_HANDLER_PATTERN.exec(content)) !== null) {
      routes.push({
        method: "ANY",
        path: match[1],
        file,
        line: countLines(content, match.index),
      });
    }
  }
}

function extractSpringRoutes(content: string, file: string, routes: ParsedRoute[]) {
  let match: RegExpExecArray | null;
  SPRING_MAPPING_PATTERN.lastIndex = 0;
  while ((match = SPRING_MAPPING_PATTERN.exec(content)) !== null) {
    const annotationToMethod: Record<string, ParsedRoute["method"]> = {
      GetMapping: "GET",
      PostMapping: "POST",
      PutMapping: "PUT",
      PatchMapping: "PATCH",
      DeleteMapping: "DELETE",
      RequestMapping: "ANY",
    };
    routes.push({
      method: annotationToMethod[match[1]] ?? "ANY",
      path: match[2] ? "/" + match[2].replace(/^\//, "") : "/",
      file,
      line: countLines(content, match.index),
    });
  }
}

// ─── File discovery ────────────────────────────────────────────────────────

async function discoverRouteFiles(
  repoPath: string,
  languages: string[],
  frameworks: string[]
): Promise<string[]> {
  const patterns: string[] = [];

  if (languages.includes("typescript") || languages.includes("javascript")) {
    if (frameworks.includes("nextjs")) {
      patterns.push("**/app/**/*route.{ts,tsx,js}", "**/pages/api/**/*.{ts,js}");
    }
    patterns.push(
      "**/routes/**/*.{ts,js}",
      "**/controllers/**/*.{ts,js}",
      "**/handlers/**/*.{ts,js}",
      "**/api/**/*.{ts,js}",
      "**/router.{ts,js}",
      "**/routes.{ts,js}",
    );
  }
  if (languages.includes("python")) {
    patterns.push("**/*.py");
  }
  if (languages.includes("go")) {
    patterns.push("**/*.go");
  }
  if (languages.includes("java")) {
    patterns.push("**/src/**/*.java");
  }
  if (languages.includes("rust")) {
    patterns.push("**/src/**/*.rs");
  }

  if (patterns.length === 0) return [];

  const files = await glob(patterns, {
    cwd: repoPath,
    absolute: true,
    nodir: true,
    ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/*.test.*", "**/*.spec.*"],
  });

  return files;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function countLines(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function getSurroundingLines(content: string, index: number, lineCount: number): string {
  const lines = content.split("\n");
  const lineNum = content.slice(0, index).split("\n").length - 1;
  return lines.slice(Math.max(0, lineNum - lineCount), lineNum + lineCount).join("\n");
}

function detectAuthInContext(surrounding: string): string | null {
  for (const pattern of AUTH_PATTERNS) {
    if (pattern.test(surrounding)) return "Required";
  }
  return null;
}

function deduplicateRoutes(routes: ParsedRoute[]): ParsedRoute[] {
  const seen = new Set<string>();
  return routes.filter((r) => {
    const key = `${r.method}:${r.path}:${r.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
