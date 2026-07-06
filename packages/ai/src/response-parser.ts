import type { GeneratedDocs, DocSection, AIProvider } from "@docflow/shared";

/**
 * Parses the AI provider's JSON response into typed DocSection objects.
 * Handles malformed responses gracefully.
 */
export function parseAIResponse(
  content: string,
  provider: AIProvider
): GeneratedDocs {
  // Try to extract JSON from the response (LLMs sometimes add prose around it)
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  } else {
    // Try to find the JSON object directly
    const startIdx = content.indexOf("{");
    const endIdx = content.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1) {
      jsonStr = content.slice(startIdx, endIdx + 1);
    }
  }

  let parsed: { sections?: Array<{ heading?: string; content?: string }> };
  try {
    parsed = JSON.parse(jsonStr) as typeof parsed;
  } catch (err) {
    throw new Error(
      `[DocFlow AI] Failed to parse ${provider} response as JSON. ` +
      `Raw (first 500 chars): "${content.slice(0, 500)}"`
    );
  }

  if (!parsed.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `[DocFlow AI] ${provider} response missing "sections" array`
    );
  }

  const sections: DocSection[] = parsed.sections
    .filter((s) => s.heading && s.content)
    .map((s) => ({
      heading: s.heading!.trim(),
      content: s.content!.trim(),
    }));

  const fullMarkdown = sections
    .map((s) => `## ${s.heading}\n\n${s.content}`)
    .join("\n\n---\n\n");

  return {
    sections,
    fullMarkdown,
    usedFallback: false,
    provider,
  };
}
