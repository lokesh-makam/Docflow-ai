import type { RepoFacts, GeneratedDocs, DocSection } from "@docflow/shared";

/**
 * Deterministic fallback documentation generator.
 * Produces a complete README from RepoFacts without any LLM call.
 * Used when AI providers are down, rate-limited, or unavailable.
 */
export function generateFallbackDocs(facts: RepoFacts): GeneratedDocs {
  const sections: DocSection[] = [
    {
      heading: "Overview",
      content: generateOverview(facts),
    },
    {
      heading: "Tech Stack",
      content: generateTechStack(facts),
    },
    {
      heading: "Installation",
      content: generateInstallation(facts),
    },
    {
      heading: "API Reference",
      content: generateApiReference(facts),
    },
    {
      heading: "Environment Variables",
      content: generateEnvVars(facts),
    },
    {
      heading: "Architecture",
      content: generateArchitecture(facts),
    },
    {
      heading: "Deployment",
      content: generateDeployment(facts),
    },
  ].filter((s) => s.content.trim().length > 0);

  const fullMarkdown = buildFullMarkdown(facts.repoFullName, sections);

  return {
    sections,
    fullMarkdown,
    usedFallback: true,
  };
}

function generateOverview(facts: RepoFacts): string {
  const name = facts.repoFullName.split("/")[1] ?? facts.repoFullName;
  const langs = [...new Set(facts.stack.map((s) => s.language))].join(", ");
  const frameworks = facts.stack
    .filter((s) => s.framework)
    .map((s) => s.framework)
    .join(", ");

  let md = `**${name}** is a ${langs} project`;
  if (frameworks) md += ` built with ${frameworks}`;
  md += `.\n\n`;
  md += `- **Branch:** \`${facts.branch}\`\n`;
  md += `- **Last analyzed:** ${new Date(facts.analyzedAt).toLocaleDateString()}\n`;
  if (facts.isMonorepo && facts.workspaces) {
    md += `- **Type:** Monorepo (${facts.workspaces.length} workspaces)\n`;
  }

  return md;
}

function generateTechStack(facts: RepoFacts): string {
  if (facts.stack.length === 0) return "";

  let md = "| Language | Framework | Database | Auth |\n|---|---|---|---|\n";
  const langs = [...new Set(facts.stack.map((s) => s.language))];
  const frameworks = facts.stack.filter((s) => s.framework).map((s) => s.framework).join(", ");
  const dbs = facts.databases.map((d) => `${d.type}${d.orm ? ` (${d.orm})` : ""}`).join(", ");
  const auth = facts.auth.map((a) => a.type).join(", ");

  md += `| ${langs.join(", ")} | ${frameworks || "—"} | ${dbs || "—"} | ${auth || "—"} |\n`;
  return md;
}

function generateInstallation(facts: RepoFacts): string {
  const lines: string[] = [];

  if (facts.installCommands.length > 0) {
    lines.push("### Install dependencies\n");
    lines.push("```bash");
    lines.push(...facts.installCommands);
    lines.push("```\n");
  }

  if (facts.devCommands.length > 0) {
    lines.push("### Start development server\n");
    lines.push("```bash");
    lines.push(...facts.devCommands);
    lines.push("```\n");
  }

  if (facts.buildCommands.length > 0) {
    lines.push("### Build for production\n");
    lines.push("```bash");
    lines.push(...facts.buildCommands);
    lines.push("```\n");
  }

  if (facts.infra.dockerCompose) {
    lines.push("### Or start with Docker\n");
    lines.push("```bash\ndocker compose up\n```\n");
  }

  return lines.join("\n");
}

function generateApiReference(facts: RepoFacts): string {
  if (facts.routes.length === 0) return "";

  let md = "| Method | Path | Auth | File |\n|---|---|---|---|\n";
  for (const route of facts.routes.slice(0, 50)) { // Cap at 50 for readability
    const auth = route.auth ?? "—";
    md += `| \`${route.method}\` | \`${route.path}\` | ${auth} | \`${route.file}\` |\n`;
  }

  if (facts.routes.length > 50) {
    md += `\n> *...and ${facts.routes.length - 50} more routes. See source for full list.*\n`;
  }

  return md;
}

function generateEnvVars(facts: RepoFacts): string {
  if (facts.envVars.length === 0) return "";

  let md = "| Variable | Sensitive | Used In |\n|---|---|---|\n";
  for (const ev of facts.envVars) {
    const sensitive = ev.isSensitive ? "🔒 Yes — **do not commit**" : "No";
    const usedIn = ev.usedIn.slice(0, 2).join(", ");
    md += `| \`${ev.name}\` | ${sensitive} | ${usedIn} |\n`;
  }

  return md;
}

function generateArchitecture(facts: RepoFacts): string {
  const lines: string[] = ["```mermaid", "graph TD"];

  // Build nodes based on detected facts
  if (facts.databases.length > 0) {
    const dbNode = facts.databases.map((d) => d.type).join(" + ");
    lines.push(`    DB["🗄️ Database\\n${dbNode}"]`);
  }
  if (facts.auth.length > 0) {
    lines.push(`    AUTH["🔒 Auth\\n${facts.auth[0].type}"]`);
  }
  if (facts.infra.docker) {
    lines.push(`    DOCKER["🐳 Docker"]`);
  }

  const frameworks = facts.stack.filter((s) => s.framework).map((s) => s.framework!);

  if (frameworks.length > 0) {
    lines.push(`    APP["⚙️ ${frameworks[0]}"]`);
    if (facts.databases.length > 0) lines.push("    APP --> DB");
    if (facts.auth.length > 0) lines.push("    APP --> AUTH");
  }

  if (facts.infra.ci.length > 0) {
    lines.push(`    CI["🔄 CI\\n${facts.infra.ci[0]}"]`);
    if (frameworks.length > 0) lines.push("    CI --> APP");
  }

  lines.push("```");
  return lines.join("\n");
}

function generateDeployment(facts: RepoFacts): string {
  const lines: string[] = [];

  if (facts.infra.platforms.length > 0) {
    lines.push(`Detected deployment targets: **${facts.infra.platforms.join(", ")}**.\n`);
  }

  if (facts.infra.dockerCompose) {
    lines.push("**Docker Compose:**\n```bash\ndocker compose up -d\n```\n");
  }

  if (facts.infra.docker && !facts.infra.dockerCompose) {
    lines.push("**Docker:**\n```bash\ndocker build -t app .\ndocker run -p 3000:3000 app\n```\n");
  }

  if (facts.buildCommands.length > 0) {
    lines.push("**Build:**\n```bash\n" + facts.buildCommands.join("\n") + "\n```\n");
  }

  return lines.join("\n");
}

function buildFullMarkdown(repoFullName: string, sections: DocSection[]): string {
  const name = repoFullName.split("/")[1] ?? repoFullName;
  const lines = [`# ${name}\n`];
  for (const section of sections) {
    lines.push(`## ${section.heading}\n`);
    lines.push(section.content);
    lines.push("");
  }
  return lines.join("\n");
}
