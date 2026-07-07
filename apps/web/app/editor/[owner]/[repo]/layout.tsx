import type { Metadata } from "next";

interface Props {
  params: { owner: string; repo: string };
}

export function generateMetadata({ params }: Props): Metadata {
  return {
    title: `Document ${params.owner}/${params.repo}`,
    description: `Analyze codebase and generate README documentation for ${params.owner}/${params.repo} using AI.`,
  };
}

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
