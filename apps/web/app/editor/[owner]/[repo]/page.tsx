"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Zap, RotateCcw, Copy, Download, GitCommit,
  GitPullRequest, Eye, Code2, Columns, ChevronDown, Save,
  AlertCircle, CheckCircle2, Loader2, Settings, RefreshCw,
  Bold, Italic, Link2, List, Hash, FileText, X, Wand2
} from "lucide-react";

// ─── Markdown renderer (safe, no XSS) ───────────────────────────────────────
function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Headings
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold & italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Blockquote
    .replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>")
    // Horizontal rule
    .replace(/^---$/gm, "<hr>")
    // Lists (unordered)
    .replace(/^\s*[-*] (.+)$/gm, "<li>$1</li>")
    // Images (before links)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // Wrap li in ul
    .replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>")
    // Paragraphs
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");

  // Code blocks
  html = html.replace(/```([a-z]*)\n?([\s\S]*?)```/g, (_: string, lang: string, code: string) => {
    const escaped = code.trim().replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    return `<pre><code class="language-${lang}">${escaped.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`;
  });

  return `<p>${html}</p>`;
}

// ─── Extract section headings ────────────────────────────────────────────────
function extractSections(markdown: string): Array<{ heading: string; line: number; content: string }> {
  const lines = markdown.split("\n");
  const sections: Array<{ heading: string; line: number; content: string }> = [];
  let currentSection: { heading: string; line: number; lines: string[] } | null = null;

  lines.forEach((line, i) => {
    const h2 = /^## (.+)/.exec(line);
    if (h2) {
      if (currentSection) {
        sections.push({
          heading: currentSection.heading,
          line: currentSection.line,
          content: currentSection.lines.join("\n").trim(),
        });
      }
      currentSection = { heading: h2[1], line: i, lines: [] };
    } else if (currentSection) {
      currentSection.lines.push(line);
    }
  });

  if (currentSection) {
    sections.push({
      heading: (currentSection as any).heading,
      line: (currentSection as any).line,
      content: (currentSection as any).lines.join("\n").trim(),
    });
  }

  return sections;
}

type Stage = "idle" | "analyzing" | "done" | "error";
type ViewMode = "split" | "edit" | "preview";

interface PageProps {
  params: { owner: string; repo: string };
}

export default function EditorPage({ params }: PageProps) {
  const { owner, repo } = params;
  const { data: session, status } = useSession();
  const router = useRouter();

  // Auth guard
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  // Core state
  const [stage, setStage] = useState<Stage>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [readme, setReadme] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [repoMeta, setRepoMeta] = useState<any>(null);

  // History for undo/redo
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const historyUpdateRef = useRef(false);

  // Autosave
  const [autosaved, setAutosaved] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Commit panel state
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitBranch, setCommitBranch] = useState("");
  const [commitMsg, setCommitMsg] = useState("docs: update README via DocFlow AI");
  const [prMode, setPrMode] = useState(false);
  const [prBranch, setPrBranch] = useState("docs/update-readme");
  const [pushing, setPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState<string | null>(null);

  // Section regeneration
  const [regenSection, setRegenSection] = useState<string | null>(null);
  const [regenInstruction, setRegenInstruction] = useState("");
  const [regenLoading, setRegenLoading] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  // Keyboard shortcut
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (readme) triggerAutosave(readme);
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [history, historyIdx, readme]);

  // Load repo meta and check for existing readme
  useEffect(() => {
    if (status !== "authenticated") return;

    fetch("/api/repos")
      .then((r) => r.json())
      .then((d) => {
        const found = d.repos?.find((r: any) => r.owner === owner && r.name === repo);
        if (found) {
          setRepoMeta(found);
          setCommitBranch(found.defaultBranch || "main");
        }
      })
      .catch(console.error);

    // Check for cached readme
    fetch(`/api/analyze/status?fullName=${encodeURIComponent(`${owner}/${repo}`)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.generatedReadme) {
          const draft = localStorage.getItem(`draft:${owner}/${repo}`);
          const content = draft || d.generatedReadme;
          setReadme(content);
          pushHistory(content);
          setStage("done");
        }
      })
      .catch(console.error);
  }, [status, owner, repo]);

  // History management
  const pushHistory = useCallback((content: string) => {
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIdx + 1);
      return [...trimmed, content].slice(-50);
    });
    setHistoryIdx((prev) => Math.min(prev + 1, 49));
  }, [historyIdx]);

  const handleUndo = () => {
    if (historyIdx > 0) {
      historyUpdateRef.current = true;
      setHistoryIdx((i) => i - 1);
      setReadme(history[historyIdx - 1] ?? "");
    }
  };

  const handleRedo = () => {
    if (historyIdx < history.length - 1) {
      historyUpdateRef.current = true;
      setHistoryIdx((i) => i + 1);
      setReadme(history[historyIdx + 1] ?? "");
    }
  };

  // Autosave to localStorage with debounce
  const triggerAutosave = useCallback((content: string) => {
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      localStorage.setItem(`draft:${owner}/${repo}`, content);
      setAutosaved(true);
      setTimeout(() => setAutosaved(false), 2000);
    }, 1000);
  }, [owner, repo]);

  const handleReadmeChange = (val: string) => {
    setReadme(val);
    if (!historyUpdateRef.current) {
      triggerAutosave(val);
    }
    historyUpdateRef.current = false;
  };

  // Generate README
  const handleGenerate = async () => {
    if (!repoMeta) return;
    setStage("analyzing");
    setErrorMsg("");
    setReadme("");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubRepoId: repoMeta.id,
          repoFullName: `${owner}/${repo}`,
          branch: repoMeta.defaultBranch || "main",
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Failed to start analysis");

      setJobId(data.jobId);
      startPolling(data.jobId);
    } catch (err: any) {
      setErrorMsg(err.message);
      setStage("error");
    }
  };

  const startPolling = (id: string) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/analyze/status?jobId=${id}`);
        const data = await res.json();

        if (data.job?.status === "COMPLETED") {
          clearInterval(pollRef.current);
          const content = data.generatedReadme || "";
          setReadme(content);
          pushHistory(content);
          localStorage.setItem(`draft:${owner}/${repo}`, content);
          setStage("done");
        } else if (data.job?.status === "FAILED") {
          clearInterval(pollRef.current);
          setErrorMsg(data.job.error || "Generation failed");
          setStage("error");
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
    }, 2000);
  };

  // Stop polling on unmount
  useEffect(() => () => clearInterval(pollRef.current), []);

  // Commit to GitHub
  const handlePush = async () => {
    setPushing(true);
    setPushSuccess(null);

    try {
      const res = await fetch("/api/readme/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoFullName: `${owner}/${repo}`,
          content: readme,
          branch: commitBranch,
          commitMessage: commitMsg,
          createPR: prMode,
          prBranch: prMode ? prBranch : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setPushSuccess(data.prUrl || "Committed successfully!");
      setCommitOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setPushing(false);
    }
  };

  // Section regeneration
  const handleRegenSection = async (section: string, currentContent: string) => {
    setRegenSection(section);
    setRegenInstruction("");
  };

  const executeRegen = async () => {
    if (!regenSection) return;
    setRegenLoading(true);
    try {
      const sections = extractSections(readme);
      const current = sections.find((s) => s.heading === regenSection);

      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoFullName: `${owner}/${repo}`,
          section: regenSection,
          sectionContent: current?.content ?? "",
          instruction: regenInstruction || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Replace the section content in the readme
      const newReadme = readme.replace(
        new RegExp(`(## ${regenSection.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?)(?=^## |$)`, "m"),
        `## ${regenSection}\n\n${data.content}\n\n`
      );
      setReadme(newReadme);
      pushHistory(newReadme);
      setRegenSection(null);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setRegenLoading(false);
    }
  };

  // Toolbar actions
  const insertMarkdown = (prefix: string, suffix = "") => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = readme.slice(start, end);
    const newContent =
      readme.slice(0, start) + prefix + selected + suffix + readme.slice(end);
    setReadme(newContent);
    pushHistory(newContent);
  };

  const sections = extractSections(readme);
  const wordCount = readme.split(/\s+/).filter(Boolean).length;

  if (status === "loading") {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="min-h-screen grid-bg flex flex-col">
      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-50 border-b border-white/5 glass">
        <div className="px-4 h-14 flex items-center gap-3">
          {/* Back */}
          <Link
            href="/dashboard"
            className="p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          {/* Repo name */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">{owner}</span>
            <span className="text-slate-600">/</span>
            <span className="font-semibold text-white">{repo}</span>
          </div>

          {/* Autosave indicator */}
          {autosaved && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <Save className="w-3 h-3" /> Saved
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex items-center bg-white/5 border border-white/10 rounded-lg overflow-hidden">
              {([
                { v: "edit", icon: <Code2 className="w-3.5 h-3.5" /> },
                { v: "split", icon: <Columns className="w-3.5 h-3.5" /> },
                { v: "preview", icon: <Eye className="w-3.5 h-3.5" /> },
              ] as const).map(({ v, icon }) => (
                <button
                  key={v}
                  onClick={() => setViewMode(v)}
                  className={`p-2 transition-colors ${
                    viewMode === v
                      ? "bg-indigo-600 text-white"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>

            {/* Copy */}
            <button
              onClick={() => navigator.clipboard.writeText(readme)}
              disabled={!readme}
              className="p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-30"
              title="Copy markdown"
            >
              <Copy className="w-4 h-4" />
            </button>

            {/* Download */}
            <button
              onClick={() => {
                const blob = new Blob([readme], { type: "text/markdown" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "README.md";
                a.click();
              }}
              disabled={!readme}
              className="p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-30"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Generate button */}
            {stage !== "analyzing" ? (
              <button
                onClick={handleGenerate}
                disabled={!repoMeta}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-all"
              >
                <Zap className="w-3.5 h-3.5" />
                {stage === "done" ? "Regenerate" : "Generate README"}
              </button>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600/50 text-white/70 text-sm">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Analyzing...
              </div>
            )}

            {/* Commit button */}
            {readme && (
              <button
                onClick={() => setCommitOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-all"
              >
                <GitCommit className="w-3.5 h-3.5" />
                Commit
              </button>
            )}
          </div>
        </div>

        {/* ── Toolbar ── */}
        {viewMode !== "preview" && readme && (
          <div className="px-4 h-10 flex items-center gap-1 border-t border-white/5">
            {[
              { label: "Bold", prefix: "**", suffix: "**", icon: <Bold className="w-3.5 h-3.5" /> },
              { label: "Italic", prefix: "_", suffix: "_", icon: <Italic className="w-3.5 h-3.5" /> },
              { label: "Code", prefix: "`", suffix: "`", icon: <Code2 className="w-3.5 h-3.5" /> },
              { label: "Link", prefix: "[", suffix: "](url)", icon: <Link2 className="w-3.5 h-3.5" /> },
            ].map((t) => (
              <button
                key={t.label}
                onClick={() => insertMarkdown(t.prefix, t.suffix)}
                title={t.label}
                className="p-1.5 rounded hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {t.icon}
              </button>
            ))}

            <div className="w-px h-4 bg-white/10 mx-1" />

            <button onClick={handleUndo} disabled={historyIdx <= 0} title="Undo (⌘Z)" className="p-1.5 rounded hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-30">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <div className="ml-auto flex items-center gap-3 text-xs text-slate-600">
              <span>{wordCount.toLocaleString()} words</span>
              <span>{readme.length.toLocaleString()} chars</span>
            </div>
          </div>
        )}
      </header>

      {/* ── Success banner ── */}
      {pushSuccess && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-6 py-3 flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-sm text-emerald-300">
            {pushSuccess.startsWith("http") ? (
              <>
                Pull request created:{" "}
                <a href={pushSuccess} target="_blank" rel="noopener" className="underline">
                  {pushSuccess}
                </a>
              </>
            ) : (
              "README committed to GitHub successfully!"
            )}
          </span>
          <button onClick={() => setPushSuccess(null)} className="ml-auto text-emerald-400/50 hover:text-emerald-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Error banner ── */}
      {errorMsg && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-3 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-sm text-red-300">{errorMsg}</span>
          <button onClick={() => setErrorMsg("")} className="ml-auto text-red-400/50 hover:text-red-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Main Content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Section navigator sidebar */}
        {sections.length > 0 && viewMode !== "preview" && (
          <aside className="w-52 shrink-0 border-r border-white/5 overflow-y-auto py-4 hidden lg:block">
            <p className="px-4 text-xs font-medium text-slate-600 uppercase tracking-wider mb-2">
              Sections
            </p>
            {sections.map((s) => (
              <button
                key={s.line}
                onClick={() => {
                  const ta = textareaRef.current;
                  if (!ta) return;
                  const lines = readme.split("\n");
                  let charPos = 0;
                  for (let i = 0; i < s.line; i++) charPos += lines[i].length + 1;
                  ta.focus();
                  ta.setSelectionRange(charPos, charPos);
                  ta.scrollTop =
                    (charPos / readme.length) * ta.scrollHeight;
                }}
                className="w-full text-left px-4 py-1.5 text-xs text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-colors truncate"
              >
                {s.heading}
              </button>
            ))}

            {/* Section regen buttons */}
            {sections.length > 0 && (
              <>
                <div className="mt-4 px-4 mb-2">
                  <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">
                    Regenerate
                  </p>
                </div>
                {sections.map((s) => (
                  <button
                    key={`regen-${s.line}`}
                    onClick={() => handleRegenSection(s.heading, s.content)}
                    className="w-full text-left px-4 py-1.5 text-xs text-indigo-500 hover:text-indigo-300 hover:bg-indigo-500/5 transition-colors truncate flex items-center gap-1.5"
                  >
                    <Wand2 className="w-3 h-3 shrink-0" />
                    {s.heading}
                  </button>
                ))}
              </>
            )}
          </aside>
        )}

        {/* Empty / Analyzing state */}
        {stage === "idle" && !readme && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-indigo-400" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">
                Ready to generate
              </h2>
              <p className="text-sm text-slate-500 mb-6">
                Click Generate README to analyze{" "}
                <span className="text-slate-300">{owner}/{repo}</span> and create
                professional documentation.
              </p>
              <button
                onClick={handleGenerate}
                disabled={!repoMeta}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all mx-auto disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                Generate README
              </button>
            </div>
          </div>
        )}

        {stage === "analyzing" && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">Analyzing repository</h2>
              <p className="text-sm text-slate-500">
                Cloning, parsing, and generating your README…
              </p>
              <div className="mt-6 flex flex-col gap-2 text-xs text-slate-600 items-start mx-auto w-fit">
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  Cloning repository
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/50" />
                  Running static analysis
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/50" />
                  Generating README with AI
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Editor + Preview */}
        {readme && (
          <>
            {/* Editor */}
            {viewMode !== "preview" && (
              <div
                className={`flex flex-col ${
                  viewMode === "split" ? "w-1/2 border-r border-white/5" : "flex-1"
                } overflow-hidden`}
              >
                <textarea
                  ref={textareaRef}
                  value={readme}
                  onChange={(e) => handleReadmeChange(e.target.value)}
                  className="flex-1 bg-transparent text-slate-300 editor-textarea p-6 w-full h-full"
                  spellCheck={false}
                />
              </div>
            )}

            {/* Preview */}
            {viewMode !== "edit" && (
              <div
                className={`${
                  viewMode === "split" ? "w-1/2" : "flex-1"
                } overflow-y-auto p-8`}
              >
                <div
                  className="markdown-preview max-w-3xl mx-auto"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(readme) }}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Commit Panel Modal ── */}
      {commitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setCommitOpen(false)}
          />
          <div className="relative glass rounded-2xl p-6 w-full max-w-md border border-white/10 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-white">Commit to GitHub</h3>
              <button onClick={() => setCommitOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* PR toggle */}
            <div className="flex items-center gap-3 mb-5 p-3 rounded-xl bg-white/5 border border-white/10">
              <button
                onClick={() => setPrMode(false)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  !prMode ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <GitCommit className="w-4 h-4 inline-block mr-1.5" />
                Direct Commit
              </button>
              <button
                onClick={() => setPrMode(true)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  prMode ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <GitPullRequest className="w-4 h-4 inline-block mr-1.5" />
                Pull Request
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  {prMode ? "Base Branch" : "Target Branch"}
                </label>
                <input
                  value={commitBranch}
                  onChange={(e) => setCommitBranch(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              </div>

              {prMode && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">
                    PR Branch Name
                  </label>
                  <input
                    value={prBranch}
                    onChange={(e) => setPrBranch(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-colors"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  Commit Message
                </label>
                <input
                  value={commitMsg}
                  onChange={(e) => setCommitMsg(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setCommitOpen(false)}
                className="flex-1 py-2 rounded-lg border border-white/10 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePush}
                disabled={pushing}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all disabled:opacity-60"
              >
                {pushing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Committing…
                  </>
                ) : (
                  <>
                    <GitCommit className="w-4 h-4" />
                    {prMode ? "Create PR" : "Commit README"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Section Regeneration Modal ── */}
      {regenSection && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setRegenSection(null)} />
          <div className="relative glass rounded-2xl p-6 w-full max-w-md border border-white/10 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-white">Regenerate Section</h3>
                <p className="text-xs text-slate-500 mt-0.5">{regenSection}</p>
              </div>
              <button onClick={() => setRegenSection(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Instruction (optional)
              </label>
              <textarea
                value={regenInstruction}
                onChange={(e) => setRegenInstruction(e.target.value)}
                placeholder='e.g. "Make this more beginner-friendly" or "Add Docker setup"'
                rows={3}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 resize-none transition-colors"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setRegenSection(null)}
                className="flex-1 py-2 rounded-lg border border-white/10 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeRegen}
                disabled={regenLoading}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all disabled:opacity-60"
              >
                {regenLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Regenerating…
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    Regenerate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
