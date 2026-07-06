import type { InfraInfo } from "@docflow/shared";
import * as fs from "node:fs";
import * as path from "node:path";
import { glob } from "glob";

export async function detectInfra(repoPath: string): Promise<InfraInfo> {
  const info: InfraInfo = {
    docker: false,
    dockerCompose: false,
    ci: [],
    platforms: [],
  };

  // ── Docker ────────────────────────────────────────────────────────────────
  if (fs.existsSync(path.join(repoPath, "Dockerfile")) ||
      (await glob("**/Dockerfile", { cwd: repoPath, ignore: ["**/node_modules/**"] })).length > 0) {
    info.docker = true;
  }

  if (fs.existsSync(path.join(repoPath, "docker-compose.yml")) ||
      fs.existsSync(path.join(repoPath, "docker-compose.yaml"))) {
    info.dockerCompose = true;
  }

  // ── CI Systems ────────────────────────────────────────────────────────────
  const ghWorkflowsPath = path.join(repoPath, ".github", "workflows");
  if (fs.existsSync(ghWorkflowsPath) &&
      fs.readdirSync(ghWorkflowsPath).some((f) => f.endsWith(".yml") || f.endsWith(".yaml"))) {
    info.ci.push("github-actions");
  }

  if (fs.existsSync(path.join(repoPath, ".gitlab-ci.yml"))) {
    info.ci.push("gitlab-ci");
  }

  if (fs.existsSync(path.join(repoPath, ".circleci", "config.yml"))) {
    info.ci.push("circleci");
  }

  if (fs.existsSync(path.join(repoPath, ".travis.yml"))) {
    info.ci.push("travis");
  }

  // ── Deployment Platforms ──────────────────────────────────────────────────
  const platformChecks: Array<[string, InfraInfo["platforms"][0]]> = [
    ["vercel.json", "vercel"],
    [".vercelignore", "vercel"],
    ["netlify.toml", "netlify"],
    ["_redirects", "netlify"],
    ["fly.toml", "fly"],
    ["railway.json", "railway"],
    ["railway.toml", "railway"],
    ["render.yaml", "render"],
  ];

  for (const [file, platform] of platformChecks) {
    if (fs.existsSync(path.join(repoPath, file)) && !info.platforms.includes(platform)) {
      info.platforms.push(platform);
    }
  }

  return info;
}
