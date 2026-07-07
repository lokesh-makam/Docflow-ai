import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@docflow/database";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { repoFullName, section, sectionContent, instruction } = await req.json();

    if (!repoFullName || !section) {
      return NextResponse.json({ error: "Missing repoFullName or section" }, { status: 400 });
    }

    // Verify ownership and get cached facts
    const repo = await db.repository.findFirst({
      where: { fullName: repoFullName, userId },
      include: { cachedFacts: true },
    });

    if (!repo) {
      return NextResponse.json({ error: "Repository not found or access denied" }, { status: 403 });
    }

    const facts = repo.cachedFacts?.factJson;

    const systemPrompt = `You are a senior software engineer rewriting a specific section of a GitHub README.
You will be given the section name, its current content, optional user instruction, and repository facts.
Rewrite ONLY the requested section. Do not include headings like "## ${section}" — just the section content.
Write as an experienced engineer would. Be specific. Use facts from the repository data.
Never hallucinate. If you're unsure about something, omit it or say "This repository appears to..."`;

    const userPrompt = `Section to rewrite: **${section}**

Current content:
${sectionContent || "(empty)"}

${instruction ? `User instruction: ${instruction}\n` : ""}
Repository facts (JSON):
${JSON.stringify(facts, null, 2).slice(0, 3000)}

Write only the improved markdown content for this section. No heading needed.`;

    // Determine which provider to use
    const aiProvider = (repo.aiProvider || process.env.AI_PROVIDER || "ollama") as string;

    let regenerated = "";

    if (aiProvider === "ollama") {
      const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
      const model = process.env.OLLAMA_MODEL || "qwen2.5-coder:7b";

      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          options: { temperature: 0.4, num_predict: 2048 },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
      const data = await res.json();
      regenerated = data.message?.content || "";
    } else if (aiProvider === "groq") {
      const groqKey = process.env.GROQ_API_KEY;
      if (!groqKey) throw new Error("GROQ_API_KEY not configured");

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.4,
          max_tokens: 2048,
        }),
      });

      if (!res.ok) throw new Error(`Groq error: ${res.status}`);
      const data = await res.json();
      regenerated = data.choices?.[0]?.message?.content || "";
    } else {
      throw new Error(`Unsupported AI provider: ${aiProvider}`);
    }

    return NextResponse.json({ content: regenerated.trim() });
  } catch (err: any) {
    console.error("[regenerate] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
