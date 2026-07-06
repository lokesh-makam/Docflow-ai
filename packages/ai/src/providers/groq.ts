import type { RepoFacts, GeneratedDocs } from "@docflow/shared";
import { buildPrompt } from "../prompts/index.js";
import { parseAIResponse } from "../response-parser.js";
import Groq from "groq-sdk";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export class GroqProvider {
  private client: Groq;
  private model: string;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error(
        "[DocFlow AI] GROQ_API_KEY is not set. " +
        "Get a free key at https://console.groq.com"
      );
    }
    this.client = new Groq({ apiKey });
    this.model = process.env.GROQ_MODEL ?? DEFAULT_MODEL;
  }

  async generate(facts: RepoFacts): Promise<GeneratedDocs> {
    const { systemPrompt, userPrompt } = buildPrompt(facts);

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const completion = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3, // Lower temperature = more consistent docs
          max_tokens: 4096,
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
          throw new Error("Empty response from Groq API");
        }

        return parseAIResponse(content, "groq");
      } catch (err) {
        lastError = err as Error;
        const isRateLimit =
          lastError.message.includes("429") ||
          lastError.message.toLowerCase().includes("rate limit");

        if (isRateLimit && attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(
            `[DocFlow AI] Groq rate limited. Retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`
          );
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
