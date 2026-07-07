import type { RepoFacts, GeneratedDocs } from "@docflow/shared";
import { buildPrompt } from "../prompts/index.js";
import { parseAIResponse } from "../response-parser.js";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

export class GroqProvider {
  private apiKey: string;
  private model: string;
  private baseUrl = "https://api.groq.com/openai/v1";

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error(
        "[DocFlow AI] Invalid or missing GROQ_API_KEY. " +
        "Get a free key at https://console.groq.com"
      );
    }
    this.apiKey = apiKey;
    this.model = process.env.GROQ_MODEL ?? DEFAULT_MODEL;
  }

  async generate(facts: RepoFacts): Promise<GeneratedDocs> {
    const { systemPrompt, userPrompt } = buildPrompt(facts);

    if (this.apiKey.includes("placeholder")) {
      console.log(`[GroqProvider] Using simulated temp API response for Groq`);
      await sleep(1500); // Simulate network delay
      const mockContent = generateMockMarkdown(facts);
      return parseAIResponse(mockContent, "groq");
    }

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 4096,
            stream: false,
          }),
        });

        if (!response.ok) {
          const body = await response.text();
          if (response.status === 429) {
            throw new Error(`RATE_LIMIT:${body}`);
          }
          throw new Error(`Groq API HTTP ${response.status}: ${body}`);
        }

        const data = await response.json() as {
          choices?: Array<{ message?: { content?: string } }>;
          error?: { message: string };
        };

        if (data.error) throw new Error(`Groq error: ${data.error.message}`);

        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error("Empty response from Groq API");

        console.log(`[GroqProvider] Generated ${content.length} chars via ${this.model}`);
        return parseAIResponse(content, "groq");

      } catch (err) {
        lastError = err as Error;
        const isRateLimit = lastError.message.startsWith("RATE_LIMIT:");

        if (isRateLimit && attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(`[GroqProvider] Rate limited. Retrying in ${delay}ms (${attempt}/${MAX_RETRIES})`);
          await sleep(delay);
          continue;
        }

        throw lastError;
      }
    }

    throw lastError!;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateMockMarkdown(facts: RepoFacts): string {
  const name = facts.repoFullName.split("/")[1] ?? facts.repoFullName;
  const langs = [...new Set(facts.stack.map(s => s.language))].filter(Boolean).join(", ") || "Unknown";
  const frameworks = facts.stack.filter(s => s.framework).map(s => s.framework).join(", ");
  const dbs = facts.databases.map(d => `${d.type}${d.orm ? ` (${d.orm})` : ""}`).join(", ");
  const auth = facts.auth.map(a => a.type).join(", ");
  const routes = facts.routes.slice(0, 15).map(r => `| \`${r.method}\` | \`${r.path}\` | ${r.auth ? "🔒 Yes" : "No"} | ${r.file} |`).join("\n");
  const envVars = facts.envVars.map(e => `| \`${e.name}\` | ${e.isSensitive ? "Yes" : "No"} | ${e.isSensitive ? "🔒 Do not commit" : "No"} | Configuration |`).join("\n");
  const installCmds = facts.installCommands.length > 0 ? facts.installCommands.join("\n") : "npm install";
  const devCmds = facts.devCommands.length > 0 ? facts.devCommands.join("\n") : "npm run dev";

  const sections = [
    {
      heading: "Overview",
      content: `**${name}** is a ${langs} project${frameworks ? ` built with ${frameworks}` : ""}.\n\nAnalyzed on ${new Date(facts.analyzedAt).toLocaleDateString()}. Branch: \`${facts.branch}\`${facts.isMonorepo ? " (Monorepo)" : ""}.`
    },
    {
      heading: "Tech Stack",
      content: `| Language | Framework | Database | Auth |\n|---|---|---|---|\n| ${langs} | ${frameworks || "—"} | ${dbs || "—"} | ${auth || "—"} |`
    },
    {
      heading: "Installation",
      content: `### Install dependencies\n\n\`\`\`bash\n${installCmds}\n\`\`\`\n\n### Start development server\n\n\`\`\`bash\n${devCmds}\n\`\`\``
    },
    {
      heading: "API Reference",
      content: facts.routes.length > 0
        ? `| Method | Path | Auth | File |\n|---|---|---|---|\n${routes}`
        : "No API routes detected in this repository."
    },
    {
      heading: "Environment Variables",
      content: facts.envVars.length > 0
        ? `| Variable | Required | Sensitive | Description |\n|---|---|---|---|\n${envVars}`
        : "No environment variables detected."
    },
    {
      heading: "Architecture",
      content: `\`\`\`mermaid\ngraph TD\n${facts.databases.length > 0 ? `    DB["🗄️ ${facts.databases.map(d => d.type).join(" + ")}"]` : ""}\n${frameworks ? `    APP["⚙️ ${frameworks}"]` : "    APP[\"⚙️ Application\"]"}\n${facts.databases.length > 0 ? "    APP --> DB" : ""}\n\`\`\``
    },
    {
      heading: "Deployment",
      content: facts.infra.dockerCompose
        ? "**Docker Compose:**\n```bash\ndocker compose up -d\n```"
        : facts.buildCommands.length > 0
        ? `**Build:**\n\`\`\`bash\n${facts.buildCommands.join("\n")}\n\`\`\``
        : "Deploy using your preferred platform (Vercel, Railway, Render, etc.)."
    }
  ];

  return JSON.stringify({ sections });
}

