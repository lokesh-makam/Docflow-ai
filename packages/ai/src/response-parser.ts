import type { GeneratedDocs, DocSection, AIProvider } from "@docflow/shared";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Parses a raw Markdown document into structured DocSection objects based on H2 headings.
 */
export function parseMarkdownToSections(markdown: string): DocSection[] {
  const lines = markdown.split("\n");
  const sections: DocSection[] = [];
  let currentSection: { heading: string; lines: string[] } | null = null;
  let initialLines: string[] = [];
  let foundFirstH2 = false;

  for (const line of lines) {
    const match = /^## (.+)/.exec(line);
    if (match) {
      if (currentSection) {
        sections.push({
          heading: currentSection.heading,
          content: currentSection.lines.join("\n").trim(),
        });
      }
      currentSection = { heading: match[1].trim(), lines: [] };
      foundFirstH2 = true;
    } else {
      if (foundFirstH2) {
        currentSection!.lines.push(line);
      } else {
        initialLines.push(line);
      }
    }
  }

  if (currentSection) {
    sections.push({
      heading: currentSection.heading,
      content: currentSection.lines.join("\n").trim(),
    });
  }

  const intro = initialLines.join("\n").trim();
  if (intro.length > 0) {
    const overviewIdx = sections.findIndex((s) => s.heading.toLowerCase() === "overview");
    if (overviewIdx !== -1) {
      sections[overviewIdx].content = `${intro}\n\n${sections[overviewIdx].content}`.trim();
    } else {
      sections.unshift({
        heading: "Overview",
        content: intro,
      });
    }
  }

  return sections.filter((s) => s.content.length > 0);
}

/**
 * Central AI Response Parser.
 *
 * HYBRID STRATEGY:
 * 1. Try to extract and parse JSON block.
 * 2. If it is valid JSON with sections, normalize and return.
 * 3. If JSON parsing fails (common in local models due to complex escaping in markdown blocks),
 *    fall back to parsing the response directly as raw Markdown.
 */
export function parseAIResponse(
  content: string,
  provider: AIProvider
): GeneratedDocs {
  let jsonStr = content.trim();

  // Try to find JSON block
  const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    jsonStr = jsonBlockMatch[1];
  } else {
    const startIdx = content.indexOf("{");
    const endIdx = content.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      jsonStr = content.slice(startIdx, endIdx + 1);
    }
  }

  // Attempt 1: JSON Parsing
  try {
    const parsed = JSON.parse(jsonStr.trim()) as {
      title?: string;
      tagline?: string;
      sections?: Array<{ heading?: string; content?: any }>;
    };

    if (parsed.sections && Array.isArray(parsed.sections)) {
      const sections: DocSection[] = parsed.sections
        .filter((s) => s.heading && s.content)
        .map((s) => {
          let sectionContent = "";
          if (Array.isArray(s.content)) {
            sectionContent = s.content
              .map((item) => {
                if (typeof item === "object" && item !== null) {
                  return JSON.stringify(item, null, 2);
                }
                return String(item);
              })
              .join("\n");
          } else if (typeof s.content === "object" && s.content !== null) {
            sectionContent = JSON.stringify(s.content, null, 2);
          } else {
            sectionContent = String(s.content);
          }
          return {
            heading: s.heading!.trim(),
            content: sectionContent.trim(),
          };
        })
        .filter((s) => s.content.length > 0);

      if (sections.length > 0) {
        const titleBlock = parsed.title
          ? `# ${parsed.title}${parsed.tagline ? `\n\n> ${parsed.tagline}` : ""}\n\n`
          : "";

        const fullMarkdown =
          titleBlock +
          sections.map((s) => `## ${s.heading}\n\n${s.content}`).join("\n\n---\n\n");

        return {
          sections,
          fullMarkdown,
          usedFallback: false,
          provider,
        };
      }
    }
  } catch (err: any) {
    // Save failing response to trace.txt for inspection
    try {
      fs.writeFileSync("trace.txt", content, "utf8");
      console.log(`[DocFlow AI] Saved failing JSON response to trace.txt`);
    } catch (e) {}
  }

  // Attempt 2: Fall back to raw Markdown parsing (Safe & Bulletproof)
  console.log(`[DocFlow AI] JSON parse failed or empty, parsing response directly as raw Markdown...`);
  
  let cleanMarkdown = content.trim();
  const mdMatch = content.match(/```markdown\s*([\s\S]*?)```/);
  if (mdMatch) {
    cleanMarkdown = mdMatch[1].trim();
  }

  const sections = parseMarkdownToSections(cleanMarkdown);
  if (sections.length === 0) {
    throw new Error(`[DocFlow AI] Could not extract any sections from raw Markdown or JSON`);
  }

  return {
    sections,
    fullMarkdown: cleanMarkdown,
    usedFallback: false,
    provider,
  };
}
