import type { RepoFacts, GeneratedDocs } from "@docflow/shared";
import { buildPrompt } from "../prompts/index.js";
import { parseAIResponse } from "../response-parser.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const DEFAULT_MODEL = "gemini-2.0-flash";

export class GeminiProvider {
  private client: GoogleGenerativeAI;
  private model: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "[DocFlow AI] GEMINI_API_KEY is not set. " +
        "Get a free key at https://aistudio.google.com"
      );
    }
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  }

  async generate(facts: RepoFacts): Promise<GeneratedDocs> {
    const { systemPrompt, userPrompt } = buildPrompt(facts);

    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
      },
    });

    const result = await model.generateContent(userPrompt);
    const content = result.response.text();

    if (!content) {
      throw new Error("Empty response from Gemini API");
    }

    return parseAIResponse(content, "gemini");
  }
}
