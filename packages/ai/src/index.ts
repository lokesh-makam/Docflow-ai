import type { RepoFacts, GeneratedDocs, AIProvider } from "@docflow/shared";
import { sanitizeFacts } from "@docflow/shared";
import { GroqProvider } from "./providers/groq.js";
import { GeminiProvider } from "./providers/gemini.js";
import { OllamaProvider } from "./providers/ollama.js";
import { generateFallbackDocs } from "./fallback.js";

export interface AIModuleOptions {
  /** Override the provider (defaults to AI_PROVIDER env var) */
  provider?: AIProvider;
}

/**
 * The central AI generation function.
 *
 * CRITICAL ARCHITECTURAL CONTRACT:
 * - Only accepts RepoFacts (structured JSON) — NEVER raw source code strings
 * - sanitizeFacts() is called first as a hard guard
 * - Falls back to deterministic templating if the AI provider fails
 *
 * @param facts - Structured repo facts from the Parser Engine
 * @param options - Optional provider override
 * @returns GeneratedDocs with markdown sections and full markdown
 */
export async function generateDocs(
  facts: RepoFacts,
  options: AIModuleOptions = {}
): Promise<GeneratedDocs> {
  // HARD BOUNDARY: Strip any raw source that might have leaked in
  const safeFacts = sanitizeFacts(facts);

  const providerName: AIProvider =
    options.provider ??
    (process.env.AI_PROVIDER as AIProvider) ??
    "groq";

  try {
    switch (providerName) {
      case "groq":
        return await new GroqProvider().generate(safeFacts);
      case "gemini":
        return await new GeminiProvider().generate(safeFacts);
      case "ollama":
        return await new OllamaProvider().generate(safeFacts);
      default:
        console.warn(`[DocFlow AI] Unknown provider "${providerName}", falling back to deterministic template`);
        return generateFallbackDocs(safeFacts);
    }
  } catch (err) {
    const error = err as Error;
    console.warn(
      `[DocFlow AI] AI provider "${providerName}" failed: ${error.message}. Using deterministic fallback.`
    );
    return generateFallbackDocs(safeFacts);
  }
}

export { generateFallbackDocs } from "./fallback.js";
export { validateGeneratedDocs } from "./validator.js";
export type { AIModuleOptions };
