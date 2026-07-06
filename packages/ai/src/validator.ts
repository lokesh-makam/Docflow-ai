import type { GeneratedDocs } from "@docflow/shared";
import { validateMarkdown } from "@docflow/shared";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates generated documentation sections for markdown correctness.
 * Checks heading hierarchy, table syntax, and Mermaid block completeness.
 */
export async function validateGeneratedDocs(
  docs: GeneratedDocs
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (docs.sections.length === 0) {
    errors.push("No sections were generated");
  }

  for (const section of docs.sections) {
    if (!section.heading) {
      errors.push("Found a section with empty heading");
      continue;
    }

    const sectionErrors = await validateMarkdown(section.content);
    for (const err of sectionErrors) {
      errors.push(`[${section.heading}] ${err}`);
    }

    // Warn on very short sections (< 20 chars)
    if (section.content.trim().length < 20) {
      warnings.push(
        `Section "${section.heading}" is very short (${section.content.trim().length} chars)`
      );
    }
  }

  // Check full markdown too
  const fullErrors = await validateMarkdown(docs.fullMarkdown);
  for (const err of fullErrors) {
    if (!errors.includes(err)) errors.push(err);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
