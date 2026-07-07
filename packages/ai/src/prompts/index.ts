import type { RepoFacts } from "@docflow/shared";

/**
 * Builds the system and user prompts for AI doc generation.
 * The system prompt instructs the LLM to write like a senior software engineer,
 * infer project purpose, and avoid generic template output.
 */
export function buildPrompt(facts: RepoFacts): {
  systemPrompt: string;
  userPrompt: string;
} {
  const hasDB = facts.databases && facts.databases.length > 0;
  const hasRoutes = facts.routes && facts.routes.length > 0;
  const hasPrisma = facts.databases?.some((d) => d.orm === "prisma");
  const isMonorepo = facts.isMonorepo;
  const hasAuth = facts.auth && facts.auth.length > 0;
  const hasDocker = facts.infra?.docker;
  const hasEnvVars = facts.envVars && facts.envVars.length > 0;
  const prismaSchema = facts.databases?.find((d) => d.orm === "prisma" && d.prismaSchema)?.prismaSchema;


  // Choose which sections to include based on what was detected
  const sectionGuide = `
Sections to include (only include sections where you have real data):
1. **Overview** — ALWAYS include. Infer the project purpose from folder names, routes, dependencies, and stack. Write 2-3 sentences of prose describing what this project does and who it's for. Add GitHub badges.
2. **Features** — Include if routes or meaningful functionality detected. List 4-8 key capabilities as bullet points with brief explanations.
3. **Tech Stack** — ALWAYS include. Group dependencies by category (Frontend, Backend, API, Database, Auth, AI, Infrastructure, Dev Tools). Explain WHY each major technology is used, not just that it's there.
${isMonorepo ? "4. **Project Structure** — Include since this is a monorepo. Explain each workspace/package." : "4. **Project Structure** — Include a commented directory tree showing the purpose of each major folder."}
5. **Getting Started** — ALWAYS include. Prerequisites → Install → Environment Setup (only if environment variables are detected in facts) → Run.
${facts.envVars && facts.envVars.length > 0 ? "6. **Environment Variables** — Include since env vars detected. Group them by category (Database, Auth, API Keys, etc.) in a table with Required, Sensitive, Description columns." : ""}
${hasRoutes ? "7. **API Reference** — Include since routes detected. Table with Method, Endpoint, Auth Required, Description. Group related endpoints together." : ""}
${hasDB ? "8. **Database** — Include since database detected. Describe the data model, key entities, and relationships." : ""}
${hasPrisma ? "   Include a Mermaid ER diagram for the database schema." : ""}
${hasDocker ? "9. **Deployment** — Include since Docker/CI detected. Explain deployment process." : ""}
10. **Contributing** — ALWAYS include. Standard contributing guide.`.trim();

  const systemPrompt = `You are a principal software engineer at a top tech company writing GitHub README documentation.

Your writing style:
- Clear, confident prose — not bullet-point data dumps
- Technical but accessible — explain WHY things exist, not just WHAT they are
- Specific to this codebase — never write generic placeholder content
- Professional and direct — no filler phrases like "This project is amazing" or "Feel free to..."

## Non-negotiable rules:
1. **ZERO HALLUCINATION**: Every fact must come from the repository data. If something is unclear, say "This appears to be..." or omit it.
2. **NO TEMPLATES**: Never write "No X detected" or "Add your X here". If you have no data for a section, skip the section entirely.
3. **INFER PURPOSE**: The project name and folder structure tell you what this project does. Use them to write a specific, accurate description.
4. **GROUPED DEPENDENCIES**: Never list every npm package. Group them by role and explain the grouping.
5. **REAL COMMANDS**: Only list commands found in the facts. Never invent npm scripts.
6. **NO EMPTY PLACEHOLDERS**: Never keep fields or sections empty, and never output notes like "None required" or "Not applicable" for missing information. If a repository lacks certain items (e.g. databases, API endpoints, environment variables, or docker configs), do NOT generate headings, setup blocks, tables, or placeholders for them. Only document what is explicitly present in the repository facts.

${sectionGuide}

## Output format:
Generate a professional, senior-engineer quality GitHub README in raw Markdown.
Do NOT wrap the response in a JSON object, HTML, or code block wrapper (like \`\`\`markdown).
Start directly with the main title H1 heading: \`# [Project Display Name]\`
Follow with H2 headings for each section (e.g. \`## Overview\`, \`## Features\`, \`## Tech Stack\`).
Use clean formatting, badges, tables, and Mermaid diagrams where they add real value.

Return ONLY the raw Markdown. No introductory or concluding prose.`;

  // Build a curated, token-efficient fact summary
  const repoName = facts.repoFullName?.split("/")[1] ?? "this-project";
  const ownerName = facts.repoFullName?.split("/")[0] ?? "";

  // Summarize dependencies (avoid huge lists)
  const depSummary = Object.entries(facts.dependencies ?? {})
    .filter(([k]) => !k.startsWith("@types/"))
    .slice(0, 60)
    .reduce<Record<string, string>>((acc, [k, v]) => { acc[k] = v as string; return acc; }, {});

  const devDepSummary = Object.entries(facts.devDependencies ?? {})
    .filter(([k]) => !k.startsWith("@types/"))
    .slice(0, 30)
    .reduce<Record<string, string>>((acc, [k, v]) => { acc[k] = v as string; return acc; }, {});

  const factsSummary = {
    repoFullName: facts.repoFullName,
    repoName,
    ownerName,
    branch: facts.branch,
    // Stack
    stack: facts.stack,
    packageManager: facts.packageManager,
    isMonorepo: facts.isMonorepo,
    workspaces: facts.workspaces,
    // Dependencies (capped)
    dependencies: depSummary,
    devDependencies: devDepSummary,
    packageScripts: facts.packageScripts,
    // Infrastructure
    databases: facts.databases,
    prismaSchema,
    auth: facts.auth,

    infra: facts.infra,
    // Routes (capped to avoid token overflow)
    routes: (facts.routes ?? []).slice(0, 30),
    // Env vars
    envVars: facts.envVars,
    // Commands
    installCommands: facts.installCommands,
    devCommands: facts.devCommands,
    buildCommands: facts.buildCommands,
    // Structure (top-level only)
    folderStructure: (facts.folderStructure ?? []).slice(0, 25),
  };

  const userPrompt = `Generate the README in raw Markdown for the following repository:

Repository: **${facts.repoFullName}**
Branch: ${facts.branch}

\`\`\`json
${JSON.stringify(factsSummary, null, 2)}
\`\`\`

Remember:
- Infer purpose from the repo name "${repoName}", the folder structure, and the tech stack.
- Write real prose, not template placeholders.
- Only include sections where you have actual data from the facts above.
- Group and explain dependencies rather than listing them.
- Return ONLY raw Markdown text. Do not wrap the response in a JSON block or a markdown code block wrapper.`;

  return { systemPrompt, userPrompt };
}
