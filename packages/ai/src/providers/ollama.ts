import type { RepoFacts, GeneratedDocs } from "@docflow/shared";
import { buildPrompt } from "../prompts/index.js";
import { parseAIResponse } from "../response-parser.js";

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "qwen2.5-coder:7b";

export class OllamaProvider {
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL;
    this.model = process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
  }

  async generate(facts: RepoFacts): Promise<GeneratedDocs> {
    const { systemPrompt, userPrompt } = buildPrompt(facts);

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 4096,
          num_ctx: 8192,
        },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Ollama API error ${response.status}: ${body}. ` +
        `Is Ollama running at ${this.baseUrl}? Try: ollama serve`
      );
    }

    const data = (await response.json()) as {
      message?: { content?: string };
      error?: string;
    };

    if (data.error) {
      throw new Error(`Ollama error: ${data.error}`);
    }

    const content = data.message?.content;
    if (!content) {
      throw new Error("Empty response from Ollama");
    }

    return parseAIResponse(content, "ollama");
  }
}
