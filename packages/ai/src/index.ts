import type { RepoFacts, GeneratedDocs, AIProvider } from "@docflow/shared";
import { sanitizeFacts } from "@docflow/shared";
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

  // Check if we have a valid API key before trying provider
  const hasGroqKey = !!process.env.GROQ_API_KEY;
  const hasGeminiKey = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10);

  if (providerName === "groq" && !hasGroqKey) {
    console.warn("[DocFlow AI] No valid GROQ_API_KEY — using deterministic fallback");
    return generateFallbackDocs(safeFacts);
  }
  if (providerName === "gemini" && !hasGeminiKey) {
    console.warn("[DocFlow AI] No valid GEMINI_API_KEY — using deterministic fallback");
    return generateFallbackDocs(safeFacts);
  }

  try {
    let provider;
    switch (providerName) {
      case "groq":
        { const { GroqProvider } = await import("./providers/groq.js");
        provider = new GroqProvider();
        break; }
      case "gemini":
        { const { GeminiProvider } = await import("./providers/gemini.js");
        provider = new GeminiProvider();
        break; }
      case "ollama":
        { const { OllamaProvider } = await import("./providers/ollama.js");
        provider = new OllamaProvider();
        break; }
      default:
        console.warn(`[DocFlow AI] Unknown provider "${providerName}", using fallback`);
        return generateFallbackDocs(safeFacts);
    }
    return await provider.generate(safeFacts);
  } catch (err) {
    const error = err as Error;
    console.warn(
      `[DocFlow AI] Provider "${providerName}" failed: ${error.message}. Using deterministic fallback.`
    );
    return generateFallbackDocs(safeFacts);
  }
}

export { generateFallbackDocs } from "./fallback.js";
export { validateGeneratedDocs } from "./validator.js";
