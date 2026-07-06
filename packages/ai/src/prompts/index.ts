import type { RepoFacts } from "@docflow/shared";

/**
 * Builds the system and user prompts for AI doc generation.
 *
 * CRITICAL: Only accepts RepoFacts — never raw source strings.
 * The TypeScript type system enforces this at compile time.
 */
export function buildPrompt(facts: RepoFacts): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `You are DocFlow AI, an expert technical documentation writer.

You receive structured JSON facts extracted from a code repository. Your job is to write clear, accurate, developer-friendly documentation based ONLY on these facts.

## Output Format
Return a single JSON object with this exact structure:
{
  "sections": [
    { "heading": "Overview", "content": "..." },
    { "heading": "Features", "content": "..." },
    { "heading": "Installation", "content": "..." },
    { "heading": "API Reference", "content": "..." },
    { "heading": "Environment Variables", "content": "..." },
    { "heading": "Architecture", "content": "..." },
    { "heading": "Deployment", "content": "..." }
  ]
}

## Rules
1. Write in clean, valid Markdown for each section content
2. Use real data from the facts — no placeholders like "[add description here]"
3. For the API Reference, create a proper Markdown table with columns: Method | Path | Auth | Description
4. For Environment Variables, create a Markdown table: Variable | Required | Sensitive | Description
5. For Architecture, include a Mermaid diagram showing the tech flow
6. Installation section must use the exact commands from the facts (installCommands, devCommands)
7. Be concise but complete — aim for documentation that a new developer can actually use
8. Never invent routes, env vars, or features not in the facts JSON`;

  const userPrompt = `Generate documentation for this repository based on the following structured facts:

\`\`\`json
${JSON.stringify(facts, null, 2)}
\`\`\`

Generate all documentation sections as specified. Use only the information in the JSON above.`;

  return { systemPrompt, userPrompt };
}
