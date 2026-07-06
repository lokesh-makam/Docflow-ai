import * as fs from "node:fs";
import * as path from "node:path";

export interface DetectedCommands {
  install: string[];
  dev: string[];
  build: string[];
  test: string[];
}

/** Detects install/dev/build/test commands from package manifests and Makefiles */
export async function detectCommands(repoPath: string): Promise<DetectedCommands> {
  const commands: DetectedCommands = {
    install: [],
    dev: [],
    build: [],
    test: [],
  };

  // ── Node.js (package.json scripts) ───────────────────────────────────────
  const pkgPath = path.join(repoPath, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
        scripts?: Record<string, string>;
      };

      const lockFiles = ["pnpm-lock.yaml", "yarn.lock", "package-lock.json"];
      const packageManager = fs.existsSync(path.join(repoPath, "pnpm-lock.yaml"))
        ? "pnpm"
        : fs.existsSync(path.join(repoPath, "yarn.lock"))
        ? "yarn"
        : "npm";

      commands.install.push(`${packageManager} install`);

      if (pkg.scripts) {
        for (const [name, cmd] of Object.entries(pkg.scripts)) {
          if (/^(dev|start:dev|serve)$/.test(name)) {
            commands.dev.push(`${packageManager} run ${name}`);
          } else if (/^build$/.test(name)) {
            commands.build.push(`${packageManager} run build`);
          } else if (/^test$/.test(name)) {
            commands.test.push(`${packageManager} run test`);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // ── Python ────────────────────────────────────────────────────────────────
  if (fs.existsSync(path.join(repoPath, "requirements.txt"))) {
    commands.install.push("pip install -r requirements.txt");
  }
  if (fs.existsSync(path.join(repoPath, "pyproject.toml"))) {
    commands.install.push("pip install -e .");
    if (fs.existsSync(path.join(repoPath, "Pipfile"))) {
      commands.install.push("pipenv install");
    }
  }

  // ── Go ────────────────────────────────────────────────────────────────────
  if (fs.existsSync(path.join(repoPath, "go.mod"))) {
    commands.install.push("go mod download");
    commands.build.push("go build ./...");
    commands.test.push("go test ./...");
  }

  // ── Rust ──────────────────────────────────────────────────────────────────
  if (fs.existsSync(path.join(repoPath, "Cargo.toml"))) {
    commands.build.push("cargo build");
    commands.test.push("cargo test");
  }

  // ── Docker ────────────────────────────────────────────────────────────────
  if (fs.existsSync(path.join(repoPath, "docker-compose.yml")) ||
      fs.existsSync(path.join(repoPath, "docker-compose.yaml"))) {
    commands.dev.push("docker compose up");
  }

  // ── Java / Maven ──────────────────────────────────────────────────────────
  if (fs.existsSync(path.join(repoPath, "pom.xml"))) {
    commands.build.push("mvn clean package");
    commands.test.push("mvn test");
  }

  // ── Java / Gradle ─────────────────────────────────────────────────────────
  if (fs.existsSync(path.join(repoPath, "build.gradle")) ||
      fs.existsSync(path.join(repoPath, "build.gradle.kts"))) {
    commands.build.push("./gradlew build");
    commands.test.push("./gradlew test");
  }

  // Deduplicate
  return {
    install: [...new Set(commands.install)],
    dev: [...new Set(commands.dev)],
    build: [...new Set(commands.build)],
    test: [...new Set(commands.test)],
  };
}
