import type { GeneratedDocs, DocSection } from "@docflow/shared";
import { fromMarkdown } from "mdast-util-from-markdown";
import { toMarkdown } from "mdast-util-to-markdown";
import type { Root, Heading, PhrasingContent } from "mdast";
import * as fs from "node:fs";
import * as path from "node:path";

export interface PatchResult {
  patchedContent: string;
  sectionsUpdated: number;
  isNewFile: boolean;
}

/**
 * Applies surgical section-level patches to an existing README.
 *
 * Algorithm:
 * 1. Parse existing README into an mdast tree
 * 2. For each generated section, find the matching heading in the tree
 * 3. Replace only the content between that heading and the next same-level heading
 * 4. Leave all other content (custom prose, badges, etc.) completely untouched
 * 5. For new sections not in the existing README, append them
 * 6. Serialize the patched tree back to markdown
 */
export async function patchReadme(
  repoPath: string,
  generatedDocs: GeneratedDocs
): Promise<PatchResult> {
  const readmePath = findReadme(repoPath);

  if (!readmePath) {
    // No existing README — create from scratch
    return {
      patchedContent: generatedDocs.fullMarkdown,
      sectionsUpdated: generatedDocs.sections.length,
      isNewFile: true,
    };
  }

  const existingContent = fs.readFileSync(readmePath, "utf8");
  const tree = fromMarkdown(existingContent) as Root;

  let sectionsUpdated = 0;

  for (const section of generatedDocs.sections) {
    const updated = updateSection(tree, section);
    if (updated) sectionsUpdated++;
  }

  const patchedContent = toMarkdown(tree, {
    bullet: "-",
    fence: "`",
    fences: true,
    listItemIndent: "one",
  });

  return {
    patchedContent,
    sectionsUpdated,
    isNewFile: false,
  };
}

/**
 * Updates a single section in the mdast tree.
 * Returns true if the section was found and updated.
 */
function updateSection(tree: Root, section: DocSection): boolean {
  const headingText = section.heading.toLowerCase();

  // Find the heading node that matches this section
  let headingIndex = -1;
  let headingDepth = 2; // Default to ## level

  for (let i = 0; i < tree.children.length; i++) {
    const node = tree.children[i];
    if (node.type === "heading") {
      const text = extractHeadingText(node as Heading).toLowerCase();
      // Fuzzy match: check if the heading contains or equals our section title
      if (text === headingText || text.includes(headingText) || headingText.includes(text)) {
        headingIndex = i;
        headingDepth = (node as Heading).depth;
        break;
      }
    }
  }

  if (headingIndex === -1) {
    // Section not found in existing README — append it
    const newNodes = fromMarkdown(`## ${section.heading}\n\n${section.content}\n`).children;
    tree.children.push(...newNodes);
    return true;
  }

  // Find the end of this section (next heading of same or higher level)
  let sectionEnd = tree.children.length;
  for (let i = headingIndex + 1; i < tree.children.length; i++) {
    const node = tree.children[i];
    if (node.type === "heading" && (node as Heading).depth <= headingDepth) {
      sectionEnd = i;
      break;
    }
  }

  // Parse the new section content into mdast nodes
  const newContentNodes = fromMarkdown(section.content).children;

  // Replace content between heading (inclusive) and next heading (exclusive)
  // Keep the heading node itself, replace everything after it until the next heading
  tree.children.splice(headingIndex + 1, sectionEnd - headingIndex - 1, ...newContentNodes);

  return true;
}

function extractHeadingText(heading: Heading): string {
  return heading.children
    .filter((c): c is PhrasingContent & { value: string } => "value" in c)
    .map((c) => c.value)
    .join("");
}

/** Finds the README file in the repo root (case-insensitive) */
function findReadme(repoPath: string): string | null {
  const candidates = ["README.md", "readme.md", "Readme.md", "README.MD", "README.rst", "README.txt"];
  for (const candidate of candidates) {
    const fullPath = path.join(repoPath, candidate);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}
