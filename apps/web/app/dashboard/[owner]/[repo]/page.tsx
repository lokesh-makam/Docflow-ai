"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Undo2, 
  Redo2, 
  Settings, 
  Play, 
  CheckCircle2, 
  GitPullRequest, 
  GitBranch, 
  Github, 
  AlertCircle,
  FileText,
  Save,
  RotateCcw
} from "lucide-react";

interface PageProps {
  params: { owner: string; repo: string };
}

type Stage = "idle" | "analyzing" | "done" | "pushing" | "pushed" | "error";

interface GithubRepo {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  private: boolean;
  stars: number;
  defaultBranch: string;
  updatedAt: string;
  url: string;
  owner: string;
  ownerAvatar: string;
}

export default function GeneratePage({ params }: PageProps) {
  const { owner, repo } = params;
  const { data: session, status } = useSession();
  const router = useRouter();

  // Page Stages
  const [stage, setStage] = useState<Stage>("idle");
  const [loadingRepo, setLoadingRepo] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);
  const [readme, setReadme] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successInfo, setSuccessInfo] = useState<{ prUrl?: string; prNumber?: number; commitUrl?: string; sha?: string } | null>(null);

  // Repository metadata loaded from GitHub user list
  const [repoMeta, setRepoMeta] = useState<GithubRepo | null>(null);

  // Settings / Generation Configuration
  const [docStyle, setDocStyle] = useState<"standard" | "minimal" | "detailed">("standard");
  const [aiProvider, setAiProvider] = useState<"ollama" | "groq" | "gemini">("ollama");

  // Push Options Configuration
  const [pushAction, setPushAction] = useState<"commit" | "pr">("commit");
  const [targetBranch, setTargetBranch] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Editor History / Buffer
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isHistoryUpdateRef = useRef(false);

  // Autosave Draft Notification
  const [hasAutosaveDraft, setHasAutosaveDraft] = useState(false);

  // Tab mode for mobile / responsive layout
  const [editorMode, setEditorMode] = useState<"split" | "edit" | "preview">("split");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  // 1. Fetch user repos to find this specific repository
  useEffect(() => {
    if (status !== "authenticated") return;
    setLoadingRepo(true);
    fetch(`/api/user/repos`)
      .then((r) => r.json())
      .then((data) => {
        const found = data.repos?.find((r: GithubRepo) => r.owner === owner && r.name === repo);
        if (found) {
          setRepoMeta(found);
          setTargetBranch(found.defaultBranch || "main");
          setCommitMessage(`docs: update README via DocFlow AI 📚`);
          
          // Check for existing facts or job status
          checkExistingJob(found.fullName);
        } else {
          setErrorMsg("Repository not found in your authorized list");
        }
      })
      .catch((e) => setErrorMsg("Failed to load repository details: " + e.message))
      .finally(() => setLoadingRepo(false));
  }, [status, owner, repo]);

  // Check if there's already cached facts or a completed job for this repository
  const checkExistingJob = async (fullName: string) => {
    try {
      const res = await fetch(`/api/analyze/status?fullName=${encodeURIComponent(fullName)}`);
      const data = await res.json();
      if (data.cachedFacts && data.cachedFacts.factJson?.generatedReadme) {
        const existingReadme = data.cachedFacts.factJson.generatedReadme;
        setReadme(existingReadme);
        
        // Push initial history state
        setHistory([existingReadme]);
        setHistoryIndex(0);
        setStage("done");
        
        // Check for local storage draft override
        const draft = localStorage.getItem(`docflow-autosave-${owner}-${repo}`);
        if (draft && draft !== existingReadme) {
          setHasAutosaveDraft(true);
        }
      }
    } catch (e) {
      console.warn("Could not check existing job status:", e);
    }
  };

  // Autosave to localStorage on readme edit
  useEffect(() => {
    if (readme && stage === "done") {
      localStorage.setItem(`docflow-autosave-${owner}-${repo}`, readme);
    }
  }, [readme, stage, owner, repo]);

  // Handle manual/prompted draft restoration
  const restoreDraft = () => {
    const draft = localStorage.getItem(`docflow-autosave-${owner}-${repo}`);
    if (draft) {
      setReadme(draft);
      pushHistory(draft);
      setHasAutosaveDraft(false);
    }
  };

  const discardDraft = () => {
    localStorage.removeItem(`docflow-autosave-${owner}-${repo}`);
    setHasAutosaveDraft(false);
  };

  // 2. Start Asynchronous Analysis Job
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
          repoFullName: repoMeta.fullName,
          branch: repoMeta.defaultBranch || "main",
          docStyle,
          aiProvider,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Failed to enqueue analysis job");

      setJobId(data.jobId);
      // Start polling status
      pollJobStatus(data.jobId);
    } catch (err: any) {
      setErrorMsg(err.message);
      setStage("error");
    }
  };

  // 3. Poll BullMQ Analysis Job Status
  const pollJobStatus = (id: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/analyze/status?jobId=${id}`);
        const data = await res.json();

        if (data.error) {
          clearInterval(interval);
          throw new Error(data.error);
        }

        const job = data.job;
        if (job) {
          if (job.status === "COMPLETED") {
            clearInterval(interval);
            const generated = data.cachedFacts?.factJson?.generatedReadme || "";
            setReadme(generated);
            setHistory([generated]);
            setHistoryIndex(0);
            setStage("done");
          } else if (job.status === "FAILED") {
            clearInterval(interval);
            setErrorMsg(job.errorMessage || "Asynchronous readme generation failed.");
            setStage("error");
          }
        }
      } catch (e: any) {
        clearInterval(interval);
        setErrorMsg(e.message || "Error polling analysis status");
        setStage("error");
      }
    }, 2000);
  };

  // 4. Commit or PR Push
  const handlePush = async () => {
    if (!readme.trim()) return;
    setStage("pushing");
    setErrorMsg("");
    setIsSettingsOpen(false);

    try {
      const res = await fetch("/api/user/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          branch: targetBranch,
          baseBranch: repoMeta?.defaultBranch || "main",
          content: readme,
          message: commitMessage,
          action: pushAction,
          path: "README.md",
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Push failed");
      
      setSuccessInfo(data);
      setStage("pushed");
      // Clear autosave draft on successful push
      localStorage.removeItem(`docflow-autosave-${owner}-${repo}`);
    } catch (err: any) {
      setErrorMsg(err.message);
      setStage("done");
    }
  };

  // History Buffer Management for Undo/Redo
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setReadme(text);
    pushHistory(text);
  };

  const pushHistory = (text: string) => {
    if (isHistoryUpdateRef.current) {
      isHistoryUpdateRef.current = false;
      return;
    }
    const newHist = history.slice(0, historyIndex + 1);
    newHist.push(text);
    if (newHist.length > 50) newHist.shift(); // Max undo steps: 50
    setHistory(newHist);
    setHistoryIndex(newHist.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      isHistoryUpdateRef.current = true;
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setReadme(history[prevIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      isHistoryUpdateRef.current = true;
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setReadme(history[nextIndex]);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg-primary)", display: "flex", flexDirection: "column", color: "var(--color-text-primary)" }}>
      {/* ── Navbar ── */}
      <nav style={{
        display: "flex", alignItems: "center", gap: "12px",
        padding: "0 24px", height: "56px",
        borderBottom: "1px solid var(--color-border)",
        background: "rgba(5,8,20,0.9)", backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 50, flexShrink: 0,
      }}>
        <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--color-text-muted)", textDecoration: "none", fontSize: "14px", fontWeight: 500 }}>
          <span>←</span> Dashboard
        </Link>
        <span style={{ color: "var(--color-border)" }}>/</span>
        <span style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>{owner}</span>
        <span style={{ color: "var(--color-border)" }}>/</span>
        <span style={{ color: "var(--color-text-primary)", fontWeight: 600, fontSize: "14px" }}>{repo}</span>
        
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{ width: 24, height: 24, borderRadius: 5, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📚</div>
          <span style={{ fontWeight: 700, fontSize: "15px" }}>DocFlow AI</span>
        </span>
      </nav>

      {/* ── Main Layout View ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        
        {/* Error Toast */}
        {errorMsg && (
          <div style={{ padding: "14px 24px", background: "rgba(239,68,68,0.12)", borderBottom: "1px solid rgba(239,68,68,0.3)", color: "#f87171", display: "flex", alignItems: "center", gap: "10px" }}>
            <AlertCircle size={18} />
            <span style={{ fontSize: "14px", fontWeight: 500 }}>{errorMsg}</span>
            <button onClick={() => setErrorMsg("")} style={{ marginLeft: "auto", background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "18px" }}>&times;</button>
          </div>
        )}

        {/* Draft Notice */}
        {hasAutosaveDraft && (
          <div style={{ padding: "12px 24px", background: "rgba(99,102,241,0.15)", borderBottom: "1px solid rgba(99,102,241,0.3)", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <Save size={16} className="text-indigo-400" />
            <span style={{ fontSize: "13px", fontWeight: 500 }}>You have an unsaved local draft that differs from the server version.</span>
            <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
              <button onClick={restoreDraft} className="btn" style={{ padding: "4px 12px", background: "var(--color-indigo-600)", color: "white", fontSize: "12px", border: "none" }}>Restore Draft</button>
              <button onClick={discardDraft} className="btn btn-ghost" style={{ padding: "4px 12px", fontSize: "12px" }}>Discard</button>
            </div>
          </div>
        )}

        {/* ── Stage 1: IDLE Setup View ── */}
        {stage === "idle" && (
          <div style={{ maxWidth: "640px", margin: "60px auto", width: "100%", padding: "0 24px" }}>
            <div className="card" style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "24px", background: "rgba(10,15,30,0.4)" }}>
              <div>
                <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "8px" }}>Generate README.md</h1>
                <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
                  Analyze code patterns, stack signatures, and route mappings of <strong>{owner}/{repo}</strong> to write structured documentation.
                </p>
              </div>

              {loadingRepo ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div className="skeleton" style={{ height: "40px", borderRadius: "10px" }} />
                  <div className="skeleton" style={{ height: "40px", borderRadius: "10px" }} />
                </div>
              ) : (
                <>
                  {/* Style Settings */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-secondary)" }}>README Style</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                      {(["standard", "minimal", "detailed"] as const).map((style) => (
                        <button
                          key={style}
                          onClick={() => setDocStyle(style)}
                          style={{
                            padding: "12px", borderRadius: "10px", border: "1px solid var(--color-border)",
                            background: docStyle === style ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.02)",
                            borderColor: docStyle === style ? "var(--color-indigo-500)" : "var(--color-border)",
                            color: docStyle === style ? "var(--color-indigo-400)" : "var(--color-text-secondary)",
                            cursor: "pointer", transition: "all 0.2s", fontWeight: 600, textTransform: "capitalize",
                          }}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* AI Provider Settings */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-secondary)" }}>AI Generator Model</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                      {(["ollama", "groq", "gemini"] as const).map((provider) => (
                        <button
                          key={provider}
                          onClick={() => setAiProvider(provider)}
                          style={{
                            padding: "12px", borderRadius: "10px", border: "1px solid var(--color-border)",
                            background: aiProvider === provider ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.02)",
                            borderColor: aiProvider === provider ? "var(--color-indigo-500)" : "var(--color-border)",
                            color: aiProvider === provider ? "var(--color-indigo-400)" : "var(--color-text-secondary)",
                            cursor: "pointer", transition: "all 0.2s", fontWeight: 600, textTransform: "uppercase",
                          }}
                        >
                          {provider}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleGenerate}
                    className="btn btn-primary"
                    style={{
                      padding: "14px", borderRadius: "10px", background: "var(--color-indigo-600)",
                      border: "none", color: "white", cursor: "pointer", fontWeight: 600, fontSize: "15px",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "12px",
                    }}
                  >
                    <Play size={16} /> Generate Documentation
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Stage 2: Analyzing Loader ── */}
        {stage === "analyzing" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", maxWidth: "600px", margin: "0 auto", textAlign: "center" }}>
            <div className="spinner" style={{ width: "48px", height: "48px", borderWidth: "3px", borderColor: "var(--color-indigo-500) transparent transparent transparent", marginBottom: "24px" }} />
            <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "8px" }}>Analyzing repository...</h2>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", lineHeight: "1.5" }}>
              Cloning {owner}/{repo}, running static code analysis parser, detecting frameworks, and generating the documentation.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "32px", flexWrap: "wrap" }}>
              {["Cloning Repo", "Parsing Files", "Extracting Facts", "AI Generation"].map((step, idx) => (
                <div key={step} style={{
                  padding: "6px 14px", borderRadius: "100px", fontSize: "12px", fontWeight: 500,
                  background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
                  color: "var(--color-indigo-400)",
                  animation: `pulse 1.8s ease-in-out ${idx * 0.4}s infinite`
                }}>
                  {step}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Stage 3: Markdown Editor & Preview View ── */}
        {(stage === "done" || stage === "pushing" || stage === "pushed" || stage === "error") && readme && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            
            {/* Editor Toolbar */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 20px", borderBottom: "1px solid var(--color-border)",
              background: "rgba(10,15,30,0.6)", backdropFilter: "blur(8px)",
              flexWrap: "wrap", gap: "12px",
            }}>
              {/* Tab Mode Control */}
              <div style={{ display: "flex", gap: "4px", background: "rgba(255,255,255,0.03)", padding: "4px", borderRadius: "8px" }}>
                {(["split", "edit", "preview"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setEditorMode(mode)}
                    style={{
                      padding: "6px 14px", borderRadius: "6px", fontSize: "13px", fontWeight: 500,
                      border: "none", cursor: "pointer",
                      background: editorMode === mode ? "rgba(99,102,241,0.15)" : "transparent",
                      color: editorMode === mode ? "var(--color-indigo-400)" : "var(--color-text-muted)",
                      transition: "all 0.15s", textTransform: "capitalize",
                    }}
                  >
                    {mode === "split" ? "🖥 Split" : mode === "edit" ? "✏️ Edit" : "👁 Preview"}
                  </button>
                ))}
              </div>

              {/* History Undo/Redo & Save Status */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button
                  onClick={handleUndo}
                  disabled={historyIndex <= 0}
                  style={{
                    background: "rgba(255,255,255,0.04)", border: "1px solid var(--color-border)",
                    borderRadius: "6px", padding: "6px 10px", color: historyIndex > 0 ? "white" : "var(--color-text-muted)",
                    cursor: historyIndex > 0 ? "pointer" : "not-allowed", display: "flex", alignItems: "center"
                  }}
                  title="Undo"
                >
                  <Undo2 size={15} />
                </button>
                
                <button
                  onClick={handleRedo}
                  disabled={historyIndex >= history.length - 1}
                  style={{
                    background: "rgba(255,255,255,0.04)", border: "1px solid var(--color-border)",
                    borderRadius: "6px", padding: "6px 10px", color: historyIndex < history.length - 1 ? "white" : "var(--color-text-muted)",
                    cursor: historyIndex < history.length - 1 ? "pointer" : "not-allowed", display: "flex", alignItems: "center"
                  }}
                  title="Redo"
                >
                  <Redo2 size={15} />
                </button>

                <div style={{ width: "1px", height: "20px", background: "var(--color-border)" }} />

                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="btn"
                  style={{
                    padding: "6px 12px", border: "1px solid var(--color-border)", borderRadius: "6px",
                    background: "rgba(255,255,255,0.03)", color: "white", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 500
                  }}
                >
                  <Settings size={14} /> Commit Settings
                </button>

                {stage === "done" && (
                  <button
                    onClick={handlePush}
                    className="btn"
                    style={{
                      padding: "6px 16px", borderRadius: "6px", border: "none",
                      background: "var(--color-indigo-600)", color: "white", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600
                    }}
                  >
                    Push to GitHub
                  </button>
                )}

                {stage === "pushing" && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--color-text-secondary)" }}>
                    <div className="spinner" style={{ width: "14px", height: "14px", borderWidth: "1.5px" }} />
                    Pushing...
                  </div>
                )}

                {stage === "pushed" && (
                  <span style={{ fontSize: "13px", color: "#10b981", background: "rgba(16,185,129,0.1)", padding: "4px 10px", borderRadius: "100px", border: "1px solid rgba(16,185,129,0.2)", display: "flex", alignItems: "center", gap: "4px" }}>
                    <CheckCircle2 size={14} /> Pushed
                  </span>
                )}
              </div>
            </div>

            {/* Split Screen Workspace */}
            <div style={{ flex: 1, display: "flex", overflow: "hidden", background: "#02040a" }}>
              
              {/* Left Side: Markdown Raw Textarea Editor */}
              {(editorMode === "split" || editorMode === "edit") && (
                <textarea
                  value={readme}
                  onChange={handleTextChange}
                  readOnly={stage === "pushing" || stage === "pushed"}
                  spellCheck={false}
                  placeholder="# Enter your README markdown..."
                  style={{
                    flex: 1, padding: "24px", background: "transparent",
                    border: "none", borderRight: editorMode === "split" ? "1px solid var(--color-border)" : "none",
                    outline: "none", color: "#e2e8f0", fontFamily: "var(--font-mono)",
                    fontSize: "13px", lineHeight: 1.75, resize: "none", height: "100%",
                    display: "block", overflowY: "auto", boxSizing: "border-box"
                  }}
                />
              )}

              {/* Right Side: Markdown HTML Live Preview */}
              {(editorMode === "split" || editorMode === "preview") && (
                <div
                  className="markdown-preview"
                  style={{
                    flex: 1, padding: "32px", overflowY: "auto",
                    height: "100%", background: "#050814", boxSizing: "border-box"
                  }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(readme) }}
                />
              )}

            </div>

            {/* Push Success State Banner */}
            {stage === "pushed" && successInfo && (
              <div style={{
                padding: "16px 24px", borderTop: "1px solid rgba(16,185,129,0.2)",
                background: "rgba(16,185,129,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between",
                flexWrap: "wrap", gap: "12px", zIndex: 10
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#10b981", fontSize: "14px", fontWeight: 500 }}>
                  <CheckCircle2 size={16} />
                  <span>
                    README successfully committed to <strong>{owner}/{repo}</strong>!
                  </span>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  {successInfo.prUrl ? (
                    <a href={successInfo.prUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: "13px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--color-border)", borderRadius: "6px", textDecoration: "none", padding: "6px 12px", color: "white", display: "flex", alignItems: "center", gap: "6px" }}>
                      <GitPullRequest size={14} /> Open Pull Request ↗
                    </a>
                  ) : (
                    <a href={successInfo.commitUrl || `https://github.com/${owner}/${repo}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: "13px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--color-border)", borderRadius: "6px", textDecoration: "none", padding: "6px 12px", color: "white", display: "flex", alignItems: "center", gap: "6px" }}>
                      <GitBranch size={14} /> View Commit ↗
                    </a>
                  )}
                  <Link href="/dashboard" className="btn btn-ghost" style={{ fontSize: "13px", textDecoration: "none", padding: "6px 12px", color: "var(--color-text-muted)" }}>
                    Back to dashboard
                  </Link>
                </div>
              </div>
            )}

          </div>
        )}

      </div>

      {/* ── Settings Commit Modal Dialog ── */}
      {isSettingsOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(2,4,10,0.8)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
        }}>
          <div className="card animate-fade-in" style={{
            maxWidth: "500px", width: "100%", padding: "28px",
            background: "var(--color-bg-secondary)", border: "1px solid var(--color-border)",
            borderRadius: "16px", display: "flex", flexDirection: "column", gap: "20px"
          }}>
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "4px" }}>Commit & Push Settings</h2>
              <p style={{ color: "var(--color-text-muted)", fontSize: "13px" }}>Configure how the generated README.md will be pushed to GitHub.</p>
            </div>

            {/* Commit vs PR Toggle */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-secondary)" }}>Action Type</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", background: "rgba(255,255,255,0.02)", padding: "4px", borderRadius: "8px", border: "1px solid var(--color-border)" }}>
                <button
                  onClick={() => setPushAction("commit")}
                  style={{
                    padding: "8px", borderRadius: "6px", border: "none", cursor: "pointer",
                    background: pushAction === "commit" ? "rgba(99,102,241,0.15)" : "transparent",
                    color: pushAction === "commit" ? "var(--color-indigo-400)" : "var(--color-text-muted)",
                    fontWeight: 600, fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px"
                  }}
                >
                  <GitBranch size={14} /> Direct Commit
                </button>
                <button
                  onClick={() => setPushAction("pr")}
                  style={{
                    padding: "8px", borderRadius: "6px", border: "none", cursor: "pointer",
                    background: pushAction === "pr" ? "rgba(99,102,241,0.15)" : "transparent",
                    color: pushAction === "pr" ? "var(--color-indigo-400)" : "var(--color-text-muted)",
                    fontWeight: 600, fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px"
                  }}
                >
                  <GitPullRequest size={14} /> Pull Request
                </button>
              </div>
            </div>

            {/* Target Branch Input */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                {pushAction === "commit" ? "Target Branch" : "Target PR Branch"}
              </label>
              <input
                type="text"
                placeholder={pushAction === "commit" ? "main" : `docflow-readme-${Date.now()}`}
                value={targetBranch}
                onChange={(e) => setTargetBranch(e.target.value)}
                style={{
                  padding: "10px 14px", background: "rgba(255,255,255,0.02)",
                  border: "1px solid var(--color-border)", borderRadius: "8px",
                  color: "white", fontSize: "14px", outline: "none"
                }}
              />
              <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                {pushAction === "commit" 
                  ? "Commits directly to this branch in the repository." 
                  : "Creates a new branch and opens a Pull Request against the default branch."}
              </span>
            </div>

            {/* Commit Message */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-secondary)" }}>Commit Message</label>
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                style={{
                  padding: "10px 14px", background: "rgba(255,255,255,0.02)",
                  border: "1px solid var(--color-border)", borderRadius: "8px",
                  color: "white", fontSize: "14px", outline: "none", resize: "none", height: "60px"
                }}
              />
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="btn btn-ghost"
                style={{ padding: "8px 16px", borderRadius: "8px", border: "none", fontSize: "13px", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="btn"
                style={{
                  padding: "8px 16px", borderRadius: "8px", border: "none", fontSize: "13px", cursor: "pointer",
                  background: "var(--color-indigo-600)", color: "white", fontWeight: 600
                }}
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Simple, safe Markdown → HTML renderer (no external deps)
function renderMarkdown(md: string): string {
  if (!md) return "";
  return md
    // Code blocks
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre class="md-code-block"><code class="language-${lang}">${escHtml(code.trim())}</code></pre>`)
    // Inline code
    .replace(/`([^`]+)`/g, `<code class="md-inline-code">$1</code>`)
    // H1-H3
    .replace(/^### (.*$)/gm, `<h3 class="md-h3">$1</h3>`)
    .replace(/^## (.*$)/gm, `<h2 class="md-h2">$1</h2>`)
    .replace(/^# (.*$)/gm, `<h1 class="md-h1">$1</h1>`)
    // Bold / italic
    .replace(/\*\*(.+?)\*\*/g, `<strong>$1</strong>`)
    .replace(/\*(.+?)\*/g, `<em>$1</em>`)
    // Horizontal rule
    .replace(/^---$/gm, `<hr class="md-hr" />`)
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>`)
    // Tables
    .replace(/(\|.*\|)\n(\|[-:| ]+\|)\n((?:\|.*\|\n?)*)/g, (_, header, _sep, rows) => {
      const ths = header.split("|").filter((c: string) => c.trim()).map((c: string) => `<th>${c.trim()}</th>`).join("");
      const trs = rows.trim().split("\n").map((row: string) =>
        `<tr>${row.split("|").filter((c: string) => c.trim()).map((c: string) => `<td>${c.trim()}</td>`).join("")}</tr>`
      ).join("");
      return `<table class="md-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
    })
    // Bullet lists
    .replace(/^- (.+)/gm, `<li class="md-li">$1</li>`)
    .replace(/(<li class="md-li">.*<\/li>\n?)+/g, (m) => `<ul class="md-ul">${m}</ul>`)
    // Paragraphs
    .replace(/^(?!<[a-z]).+$/gm, (line) => line.trim() ? `<p class="md-p">${line}</p>` : "")
    // Clean up extra blank lines
    .replace(/\n{3,}/g, "\n\n");
}

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
