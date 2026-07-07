import type { RepoFacts, GeneratedDocs, DocSection, FolderNode } from "@docflow/shared";

const CATEGORY_MAP: Record<string, string> = {
  react: "Frontend Core",
  "react-dom": "Frontend Core",
  next: "Frontend Core (Next.js)",
  vue: "Frontend Core",
  nuxt: "Frontend Core (Nuxt.js)",
  svelte: "Frontend Core",
  vite: "Frontend Tooling",
  "react-router-dom": "Frontend Routing",
  tailwindcss: "Frontend Styling",
  autoprefixer: "Frontend Styling",
  postcss: "Frontend Styling",
  express: "Backend Server (Express)",
  fastify: "Backend Server (Fastify)",
  koa: "Backend Server (Koa)",
  ws: "WebSockets",
  "socket.io": "WebSockets",
  prisma: "ORM",
  "@prisma/client": "ORM Client",
  mongoose: "ORM/ODM",
  sequelize: "ORM",
  pg: "Database Driver",
  mysql: "Database Driver",
  mysql2: "Database Driver",
  ioredis: "Database/Caching (Redis)",
  redis: "Database/Caching (Redis)",
  "next-auth": "Authentication",
  bcrypt: "Authentication/Security",
  jsonwebtoken: "Authentication/Security",
  jose: "Authentication/Security",
  vitest: "Testing Framework",
  jest: "Testing Framework",
  mocha: "Testing Framework",
  playwright: "E2E Testing",
  cypress: "E2E Testing",
  typescript: "Developer Tools",
  eslint: "Linter",
  prettier: "Formatter",
  nodemon: "Developer Utilities",
  "ts-node": "Developer Utilities",
  tsx: "Developer Utilities",
  turbo: "Monorepo Orchestration",
  ollama: "AI/LLM Tools",
  "@google/generative-ai": "AI/LLM Tools",
  groq: "AI/LLM Tools",
  openai: "AI/LLM Tools",
};

/**
 * Deterministic fallback documentation generator.
 * Produces a complete README from RepoFacts without any LLM call.
 * Used when AI providers are down, rate-limited, or unavailable.
 */
export function generateFallbackDocs(facts: RepoFacts): GeneratedDocs {
  const sections: DocSection[] = [];

  // 1. Overview
  sections.push({
    heading: "Overview",
    content: generateOverview(facts),
  });

  // 2. Features
  sections.push({
    heading: "Features",
    content: generateFeatures(facts),
  });

  // 3. Tech Stack
  sections.push({
    heading: "Tech Stack",
    content: generateTechStack(facts),
  });

  // 4. Architecture & Data Flow
  sections.push({
    heading: "Architecture & Data Flow",
    content: generateArchitecture(facts),
  });

  // 5. Directory Structure
  sections.push({
    heading: "Directory Structure",
    content: generateDirectoryStructure(facts),
  });

  // 6. Getting Started
  sections.push({
    heading: "Getting Started",
    content: generateGettingStarted(facts),
  });

  // 7. API Documentation
  sections.push({
    heading: "API Documentation",
    content: generateApiDocumentation(facts),
  });

  // 8. Database Schema
  sections.push({
    heading: "Database Schema",
    content: generateDatabaseSchema(facts),
  });

  // 9. Security & Performance
  sections.push({
    heading: "Security & Performance",
    content: generateSecurityPerformance(facts),
  });

  // 10. Contributing & License
  sections.push({
    heading: "Contributing & License",
    content: `### Contributing\n\nContributions are welcome! Please follow these guidelines:\n1. Fork the repository.\n2. Create a feature branch (\`git checkout -b feature/amazing-feature\`).\n3. Commit your changes.\n4. Push to the branch and open a Pull Request.\n\n### License\n\nThis project is licensed under the MIT License - see the LICENSE file for details.`,
  });

  // Filter out any empty sections
  const filteredSections = sections.filter((s) => s.content.trim().length > 0);
  const fullMarkdown = buildFullMarkdown(facts.repoFullName, filteredSections);

  return {
    sections: filteredSections,
    fullMarkdown,
    usedFallback: true,
  };
}

function generateOverview(facts: RepoFacts): string {
  const name = facts.repoFullName.split("/")[1] ?? facts.repoFullName;
  let md = "";

  md += `![Build Status](https://img.shields.io/github/actions/workflow/status/${facts.repoFullName}/ci.yml?branch=${facts.branch}&style=flat-square) `;
  md += `![License](https://img.shields.io/github/license/${facts.repoFullName}?style=flat-square) `;
  md += `![Branch](https://img.shields.io/badge/branch-${facts.branch}-blue?style=flat-square)\n\n`;

  if (facts.isMonorepo && facts.workspaces) {
    md += `**${name}** is a production-ready, multi-service monorepo workspace containing ${facts.workspaces.length} distinct packages/applications.\n\n`;
    md += `- **Orchestration**: Managed with a multi-workspace structure.\n`;
    md += `- **Analysis Branch**: \`${facts.branch}\`\n`;
    md += `- **Last updated**: ${new Date(facts.analyzedAt).toLocaleDateString()}\n`;
  } else {
    const frameworks = facts.stack
      .filter((s) => s.framework)
      .map((s) => s.framework)
      .join(", ");
    md += `**${name}** is a software system`;
    if (frameworks) md += ` built on top of **${frameworks}**`;
    md += `.\n\n`;
    md += `- **Analysis Branch**: \`${facts.branch}\`\n`;
    md += `- **Last updated**: ${new Date(facts.analyzedAt).toLocaleDateString()}\n`;
  }

  return md;
}

function generateFeatures(facts: RepoFacts): string {
  const features: string[] = [];

  if (facts.isMonorepo && facts.workspaces) {
    features.push(`- **Modular Architecture**: Separate workspace modules managing services independently.`);
    for (const ws of facts.workspaces) {
      features.push(`- **Workspace \`${ws.name}\`**: Custom sub-module built with ${ws.stack.map(s => s.framework || s.language).join(", ") || "TypeScript"}.`);
    }
  } else {
    features.push("- **Component Architecture**: Modular codebase utilizing structured components.");
  }

  if (facts.databases.length > 0) {
    features.push(`- **Persistent Storage**: Robust data persistence powered by ${facts.databases.map(d => d.type).join(", ")}.`);
  }

  if (facts.auth.length > 0) {
    features.push(`- **Secure Authentication**: Built-in credential and session checking via ${facts.auth.map(a => a.type).join(", ")}.`);
  }

  if (facts.envVars.length > 0) {
    features.push(`- **Environment Configuration**: Safe credential separation with custom variables.`);
  }

  return features.join("\n");
}

function generateTechStack(facts: RepoFacts): string {
  let md = "Below is the structured breakdown of runtime dependencies:\n\n";

  const deps: Record<string, string> = {
    ...(facts.dependencies ?? {}),
    ...(facts.devDependencies ?? {}),
  };

  if (facts.isMonorepo && facts.workspaces) {
    for (const ws of facts.workspaces) {
      if (ws.dependencies) {
        Object.assign(deps, ws.dependencies);
      }
      if (ws.devDependencies) {
        Object.assign(deps, ws.devDependencies);
      }
    }
  }

  if (Object.keys(deps).length > 0) {
    const categories: Record<string, Array<{ name: string; version: string }>> = {};
    for (const [name, version] of Object.entries(deps)) {
      const category = CATEGORY_MAP[name] ?? "Other Utilities";
      if (!categories[category]) categories[category] = [];
      categories[category].push({ name, version });
    }

    for (const [category, items] of Object.entries(categories)) {
      md += `#### ${category}\n\n`;
      md += "| Dependency | Version |\n|---|---|\n";
      for (const item of items) {
        md += `| \`${item.name}\` | \`${item.version}\` |\n`;
      }
      md += "\n";
    }
  } else {
    const frameworks = facts.stack.filter((s) => s.framework).map((s) => s.framework).join(", ");
    md += `Built primarily with **${facts.stack.map(s => s.language).join(", ") || "TypeScript"}** ${frameworks ? `and **${frameworks}**` : ""}.\n`;
  }

  return md;
}

function generateArchitecture(facts: RepoFacts): string {
  let md = "Below is a visual diagram outlining the application system flow:\n\n";

  md += "```mermaid\ngraph TD\n";

  if (facts.isMonorepo && facts.workspaces) {
    md += "    subgraph Monorepo Workspaces\n";
    for (const ws of facts.workspaces) {
      md += `        WS_${ws.name}["📦 ${ws.name} workspace"]\n`;
    }
    md += "    end\n";

    const hasFront = facts.workspaces.some(w => w.name === "frontend" || w.name === "web");
    const hasBack = facts.workspaces.some(w => w.name === "backend" || w.name === "server" || w.name === "api");
    if (hasFront && hasBack) {
      const frontName = facts.workspaces.find(w => w.name === "frontend" || w.name === "web")!.name;
      const backName = facts.workspaces.find(w => w.name === "backend" || w.name === "server" || w.name === "api")!.name;
      md += `    WS_${frontName} -->|HTTP/WebSocket| WS_${backName}\n`;
    }
  } else {
    md += "    User[\"👤 Client App\"] --> APP[\"⚙️ Server/App Engine\"]\n";
    if (facts.databases.length > 0) {
      md += `    APP --> DB["🗄️ Database (${facts.databases[0].type})"]\n`;
    }
    if (facts.auth.length > 0) {
      md += `    APP --> AUTH["🔒 Auth System (${facts.auth[0].type})"]\n`;
    }
  }

  md += "```\n";
  return md;
}

function generateDirectoryStructure(facts: RepoFacts): string {
  if (!facts.folderStructure || facts.folderStructure.length === 0) return "";
  let md = "```bash\n";
  md += formatFolderStructure(facts.folderStructure, "");
  md += "```\n";
  return md;
}

function formatFolderStructure(nodes: FolderNode[], indent = ""): string {
  let md = "";
  for (const node of nodes) {
    const suffix = node.type === "dir" ? "/" : "";
    md += `${indent}${node.name}${suffix}\n`;
    if (node.children && node.children.length > 0) {
      md += formatFolderStructure(node.children, indent + "  ");
    }
  }
  return md;
}

function generateGettingStarted(facts: RepoFacts): string {
  let md = "";

  const pm = facts.packageManager ?? "npm";

  md += "#### Prerequisites\n";
  if (pm === "pnpm") {
    md += "- Ensure you have [pnpm](https://pnpm.io/) installed.\n";
  } else if (pm === "yarn") {
    md += "- Ensure you have [Yarn](https://yarnpkg.com/) installed.\n";
  } else if (pm === "bun") {
    md += "- Ensure you have [Bun](https://bun.sh/) installed.\n";
  } else {
    md += "- Ensure you have [Node.js](https://nodejs.org/) installed.\n";
  }
  md += "\n";

  md += "#### Installation\n\n";
  md += "```bash\n";
  if (facts.installCommands.length > 0) {
    md += facts.installCommands.join("\n") + "\n";
  } else {
    md += `${pm} install\n`;
  }
  md += "```\n\n";

  md += "#### Start development server\n\n";
  md += "```bash\n";
  if (facts.devCommands.length > 0) {
    md += facts.devCommands.join("\n") + "\n";
  } else {
    md += `${pm} run dev\n`;
  }
  md += "```\n\n";

  if (facts.buildCommands.length > 0) {
    md += "#### Production Build\n\n";
    md += "```bash\n";
    md += facts.buildCommands.join("\n") + "\n";
    md += "```\n\n";
  }

  const scripts = facts.packageScripts;
  if (scripts && Object.keys(scripts).length > 0) {
    md += "#### Available Scripts\n\n";
    md += "| Script | Command | Purpose |\n|---|---|---|\n";
    for (const [name, cmd] of Object.entries(scripts)) {
      let desc = "Runs customized commands";
      if (name === "dev" || name === "start:dev") desc = "Starts the application in development watch mode";
      else if (name === "build") desc = "Compiles assets and prepares production bundles";
      else if (name === "lint") desc = "Checks codebase style and rules conformities";
      else if (name === "test") desc = "Executes full testing suite";
      else if (name === "start") desc = "Runs production ready bundle";
      md += `| \`${name}\` | \`${cmd}\` | ${desc} |\n`;
    }
  }

  return md;
}

function generateApiDocumentation(facts: RepoFacts): string {
  let allRoutes = [...facts.routes];

  if (facts.isMonorepo && facts.workspaces) {
    for (const ws of facts.workspaces) {
      allRoutes.push(
        ...ws.routes.map((r) => ({ ...r, file: `${ws.path}/${r.file}` }))
      );
    }
  }

  if (allRoutes.length === 0) return "";

  let md = "";
  md += "| Method | Path | Authentication | Handler Location |\n|---|---|---|---|\n";
  for (const route of allRoutes.slice(0, 50)) {
    const auth = route.auth ?? "Public";
    md += `| \`${route.method}\` | \`${route.path}\` | ${auth} | \`${route.file}:${route.line || 1}\` |\n`;
  }
  return md;
}

function generateDatabaseSchema(facts: RepoFacts): string {
  let prismaSchema = facts.databases.find((d) => d.orm === "prisma" && d.prismaSchema)?.prismaSchema;

  if (!prismaSchema && facts.isMonorepo && facts.workspaces) {
    for (const ws of facts.workspaces) {
      const wsPrisma = ws.databases.find((d) => d.orm === "prisma" && d.prismaSchema)?.prismaSchema;
      if (wsPrisma) {
        prismaSchema = wsPrisma;
        break;
      }
    }
  }

  if (!prismaSchema) return "";

  let md = "";

  if (prismaSchema.relations.length > 0) {
    md += "#### Entity-Relationship Diagram\n\n";
    md += "```mermaid\nerDiagram\n";
    for (const rel of prismaSchema.relations) {
      md += `    ${rel.from} ||--o{ ${rel.to} : "references (${rel.fields.join(", ")}) -> (${rel.references.join(", ")})"\n`;
    }
    md += "```\n\n";
  }

  md += "#### Model Fields & Definitions\n\n";
  for (const model of prismaSchema.models) {
    md += `##### Model \`${model.name}\`\n\n`;
    md += "| Field | Type | Attributes | Relation |\n|---|---|---|---|\n";
    for (const field of model.fields) {
      const idAttr = field.isId ? "🔑 Primary Key" : "";
      const uniqAttr = field.isUnique ? "💎 Unique" : "";
      const attributes = [idAttr, uniqAttr].filter(Boolean).join(", ") || "—";
      const relationText = field.relation
        ? `Relation to \`${field.relation.to}\` (${field.relation.fields?.join(", ")})`
        : "—";
      md += `| \`${field.name}\` | \`${field.type}\` | ${attributes} | ${relationText} |\n`;
    }
    md += "\n";
  }

  return md;
}

function generateSecurityPerformance(facts: RepoFacts): string {
  let md = "";

  if (facts.envVars.length === 0) return "";

  md += "#### Environment Configuration\n\n";
  md += "| Variable | Sensitive | Description |\n|---|---|---|\n";
  for (const ev of facts.envVars) {
    const sensitive = ev.isSensitive ? "🔒 Yes (Keep secret)" : "No";
    const usedInList = ev.usedIn.join(", ");
    md += `| \`${ev.name}\` | ${sensitive} | Detected in \`${usedInList}\` |\n`;
  }
  return md;
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
