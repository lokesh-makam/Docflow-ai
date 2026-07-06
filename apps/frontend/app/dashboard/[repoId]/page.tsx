"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface Job {
  id: string;
  status: string;
  commitSha: string;
  prUrl: string | null;
  prNumber: number | null;
  docsChangedCount: number | null;
  usedFallback: boolean;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface RepoFacts {
  repoFullName: string;
  stack: Array<{ language: string; framework?: string }>;
  routes: Array<{ method: string; path: string; file: string }>;
  databases: Array<{ type: string; orm?: string }>;
  auth: Array<{ type: string; library: string }>;
  envVars: Array<{ name: string; isSensitive: boolean }>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string; dot: string }> = {
    COMPLETED: { cls: "badge-success", label: "Completed", dot: "timeline-dot-success" },
    FAILED: { cls: "badge-error", label: "Failed", dot: "timeline-dot-error" },
    ACTIVE: { cls: "badge-active", label: "Running", dot: "timeline-dot-active" },
    PENDING: { cls: "badge-pending", label: "Pending", dot: "timeline-dot-pending" },
    SKIPPED: { cls: "badge-pending", label: "Skipped", dot: "timeline-dot-pending" },
  };
  const info = map[status] ?? { cls: "badge-pending", label: status, dot: "timeline-dot-pending" };
  return <span className={`badge ${info.cls}`}>{info.label}</span>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function RepoDetailPage() {
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;

  const [jobs, setJobs] = useState<Job[]>([]);
  const [facts, setFacts] = useState<RepoFacts | null>(null);
  const [repoInfo, setRepoInfo] = useState<{ fullName: string; enabled: boolean; trackedBranch: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [activeTab, setActiveTab] = useState<"jobs" | "facts">("jobs");

  useEffect(() => {
    if (!repoId) return;
    Promise.all([
      fetch(`${API_URL}/api/repos/${repoId}`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${API_URL}/api/repos/${repoId}/jobs`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${API_URL}/api/repos/${repoId}/facts`, { credentials: "include" }).then((r) => r.json()),
    ]).then(([repoData, jobsData, factsData]) => {
      if (repoData.success) setRepoInfo(repoData.data);
      if (jobsData.success) setJobs(jobsData.data);
      if (factsData.success) setFacts(factsData.data);
    }).finally(() => setLoading(false));
  }, [repoId]);

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      const res = await fetch(`${API_URL}/api/repos/${repoId}/trigger`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        alert("✅ Analysis triggered! Check back in a minute for the PR.");
      } else {
        alert(`❌ ${data.error}`);
      }
    } catch {
      alert("❌ Failed to trigger analysis");
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh" }}>
        <nav className="navbar">
          <Link href="/dashboard" className="navbar-logo">
            <div className="navbar-logo-icon">📚</div>
            DocFlow AI
          </Link>
        </nav>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "60px 24px", textAlign: "center" }}>
          <div className="skeleton" style={{ height: 32, width: 300, margin: "0 auto 24px" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Navbar */}
      <nav className="navbar">
        <Link href="/dashboard" className="navbar-logo">
          <div className="navbar-logo-icon">📚</div>
          DocFlow AI
        </Link>
        <span style={{ color: "var(--color-text-muted)", margin: "0 8px" }}>›</span>
        <span style={{ color: "var(--color-text-secondary)", fontSize: "14px", fontFamily: "var(--font-mono)" }}>
          {repoInfo?.fullName ?? repoId}
        </span>
        <div style={{ flex: 1 }} />
        <button
          className="btn btn-primary"
          onClick={handleTrigger}
          disabled={triggering}
          id="trigger-analysis-btn"
        >
          {triggering ? "Triggering..." : "⚡ Trigger Analysis"}
        </button>
      </nav>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>
        {/* Repo info */}
        {repoInfo && (
          <div className="card" style={{ padding: "24px", marginBottom: "32px", display: "flex", alignItems: "center", gap: "24px" }}>
            <div className="repo-avatar" style={{ width: 56, height: 56, fontSize: "28px" }}>📁</div>
            <div>
              <h1 style={{ fontSize: "24px", fontWeight: 800, letterSpacing: "-0.01em", marginBottom: "6px" }}>
                {repoInfo.fullName}
              </h1>
              <div style={{ display: "flex", gap: "16px", fontSize: "14px", color: "var(--color-text-secondary)" }}>
                <span>
                  Status:{" "}
                  <strong style={{ color: repoInfo.enabled ? "var(--color-emerald-400)" : "var(--color-rose-400)" }}>
                    {repoInfo.enabled ? "Enabled" : "Disabled"}
                  </strong>
                </span>
                <span>
                  Tracking:{" "}
                  <code style={{ fontFamily: "var(--font-mono)", color: "var(--color-indigo-400)" }}>
                    {repoInfo.trackedBranch}
                  </code>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "24px", background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "4px", width: "fit-content" }}>
          {(["jobs", "facts"] as const).map((tab) => (
            <button
              key={tab}
              id={`tab-${tab}`}
              className="btn"
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "8px 20px",
                fontSize: "14px",
                borderRadius: 8,
                background: activeTab === tab ? "rgba(99,102,241,0.2)" : "transparent",
                color: activeTab === tab ? "var(--color-indigo-400)" : "var(--color-text-secondary)",
                border: activeTab === tab ? "1px solid rgba(99,102,241,0.3)" : "1px solid transparent",
              }}
            >
              {tab === "jobs" ? "📋 Job History" : "🧬 Parsed Facts"}
            </button>
          ))}
        </div>

        {/* Job History */}
        {activeTab === "jobs" && (
          <div>
            {jobs.length === 0 ? (
              <div className="card" style={{ padding: "48px", textAlign: "center" }}>
                <div style={{ fontSize: "40px", marginBottom: "16px" }}>📋</div>
                <p style={{ color: "var(--color-text-secondary)" }}>
                  No analysis jobs yet. Push code to your tracked branch or trigger manually.
                </p>
              </div>
            ) : (
              <div className="timeline">
                {jobs.map((job) => (
                  <div key={job.id} className="timeline-item">
                    <div className={`timeline-dot timeline-dot-${job.status.toLowerCase()}`} />
                    <div className="card" style={{ padding: "16px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                        <StatusBadge status={job.status} />
                        <code style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--color-text-secondary)" }}>
                          {job.commitSha.slice(0, 7)}
                        </code>
                        {job.docsChangedCount !== null && job.docsChangedCount > 0 && (
                          <span className="badge badge-success" style={{ fontSize: "11px" }}>
                            {job.docsChangedCount} section{job.docsChangedCount !== 1 ? "s" : ""} updated
                          </span>
                        )}
                        {job.usedFallback && (
                          <span className="badge badge-pending" style={{ fontSize: "11px" }}>Fallback template</span>
                        )}
                        <span style={{ flex: 1 }} />
                        <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                          {new Date(job.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {job.prUrl && (
                        <div style={{ marginTop: "8px" }}>
                          <a
                            href={job.prUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: "13px", color: "var(--color-indigo-400)", textDecoration: "none" }}
                          >
                            🔀 View PR #{job.prNumber} →
                          </a>
                        </div>
                      )}
                      {job.errorMessage && (
                        <div style={{ marginTop: "8px", fontSize: "13px", color: "var(--color-rose-400)", fontFamily: "var(--font-mono)" }}>
                          {job.errorMessage}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Parsed Facts */}
        {activeTab === "facts" && (
          <div>
            {!facts ? (
              <div className="card" style={{ padding: "48px", textAlign: "center" }}>
                <div style={{ fontSize: "40px", marginBottom: "16px" }}>🧬</div>
                <p style={{ color: "var(--color-text-secondary)" }}>
                  No cached facts yet. Run the first analysis to see parsed data here.
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "20px" }}>
                {/* Tech Stack */}
                <div className="card" style={{ padding: "24px" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", display: "flex", gap: "8px", alignItems: "center" }}>
                    <span>⚙️</span> Tech Stack
                  </h3>
                  {facts.stack.map((s, i) => (
                    <div key={i} style={{ display: "flex", gap: "10px", marginBottom: "8px", fontSize: "14px" }}>
                      <span className="badge badge-active">{s.language}</span>
                      {s.framework && <span style={{ color: "var(--color-text-secondary)", alignSelf: "center" }}>{s.framework}</span>}
                    </div>
                  ))}
                </div>

                {/* Databases */}
                <div className="card" style={{ padding: "24px" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", display: "flex", gap: "8px", alignItems: "center" }}>
                    <span>🗄️</span> Databases
                  </h3>
                  {facts.databases.length === 0 ? (
                    <p style={{ fontSize: "14px", color: "var(--color-text-muted)" }}>None detected</p>
                  ) : facts.databases.map((d, i) => (
                    <div key={i} style={{ display: "flex", gap: "10px", marginBottom: "8px", fontSize: "14px" }}>
                      <span className="badge badge-success">{d.type}</span>
                      {d.orm && <span style={{ color: "var(--color-text-secondary)", alignSelf: "center" }}>via {d.orm}</span>}
                    </div>
                  ))}
                </div>

                {/* Auth */}
                <div className="card" style={{ padding: "24px" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", display: "flex", gap: "8px", alignItems: "center" }}>
                    <span>🔒</span> Authentication
                  </h3>
                  {facts.auth.length === 0 ? (
                    <p style={{ fontSize: "14px", color: "var(--color-text-muted)" }}>None detected</p>
                  ) : facts.auth.map((a, i) => (
                    <div key={i} style={{ marginBottom: "8px" }}>
                      <div style={{ fontSize: "14px", fontWeight: 600 }}>{a.type}</div>
                      <div style={{ fontSize: "12px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>{a.library}</div>
                    </div>
                  ))}
                </div>

                {/* Routes */}
                <div className="card" style={{ padding: "24px", gridColumn: "1 / -1" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", display: "flex", gap: "8px", alignItems: "center" }}>
                    <span>🗺️</span> API Routes ({facts.routes.length})
                  </h3>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                          {["Method", "Path", "File"].map((h) => (
                            <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "var(--color-text-muted)", fontWeight: 600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {facts.routes.slice(0, 15).map((r, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            <td style={{ padding: "8px 12px" }}>
                              <span className={`badge ${
                                r.method === "GET" ? "badge-success" :
                                r.method === "POST" ? "badge-active" :
                                r.method === "DELETE" ? "badge-error" : "badge-pending"
                              }`} style={{ fontSize: "11px" }}>{r.method}</span>
                            </td>
                            <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>{r.path}</td>
                            <td style={{ padding: "8px 12px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>{r.file}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {facts.routes.length > 15 && (
                      <p style={{ fontSize: "13px", color: "var(--color-text-muted)", padding: "8px 12px" }}>
                        ...and {facts.routes.length - 15} more routes
                      </p>
                    )}
                  </div>
                </div>

                {/* Env Vars */}
                <div className="card" style={{ padding: "24px", gridColumn: "1 / -1" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", display: "flex", gap: "8px", alignItems: "center" }}>
                    <span>🔑</span> Environment Variables ({facts.envVars.length})
                  </h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {facts.envVars.map((ev, i) => (
                      <div key={i} style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "4px 12px",
                        background: ev.isSensitive ? "rgba(251,113,133,0.1)" : "rgba(255,255,255,0.05)",
                        border: `1px solid ${ev.isSensitive ? "rgba(251,113,133,0.2)" : "rgba(255,255,255,0.08)"}`,
                        borderRadius: "20px",
                        fontSize: "12px",
                        fontFamily: "var(--font-mono)",
                        color: ev.isSensitive ? "var(--color-rose-400)" : "var(--color-text-secondary)",
                      }}>
                        {ev.isSensitive && "🔒"}{ev.name}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
