"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Repo {
  id: string;
  fullName: string;
  trackedBranch: string;
  enabled: boolean;
  lastJobStatus: string | null;
  lastJobAt: string | null;
  prUrl: string | null;
  docsGenerated: number;
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="badge" style={{ background: "rgba(255,255,255,0.05)", color: "var(--color-text-muted)" }}>No runs yet</span>;

  const map: Record<string, { cls: string; label: string }> = {
    completed: { cls: "badge-success", label: "✓ Done" },
    failed: { cls: "badge-error", label: "✗ Failed" },
    active: { cls: "badge-active", label: "Running" },
    pending: { cls: "badge-pending", label: "Queued" },
    skipped: { cls: "badge-pending", label: "Skipped" },
  };

  const info = map[status] ?? { cls: "badge-pending", label: status };
  return <span className={`badge ${info.cls}`}>{info.label}</span>;
}

function SkeletonCard() {
  return (
    <div className="repo-card" style={{ gap: "16px" }}>
      <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="skeleton" style={{ height: 16, width: "40%" }} />
        <div className="skeleton" style={{ height: 13, width: "60%" }} />
      </div>
      <div className="skeleton" style={{ height: 24, width: 80, borderRadius: 20 }} />
    </div>
  );
}

export default function DashboardPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    fetch(`${apiUrl}/api/repos`, { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          router.push("/api/auth/signin");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.success) {
          setRepos(data.data);
        } else if (data) {
          setError(data.error ?? "Failed to load repositories");
        }
      })
      .catch(() => setError("Could not connect to the backend API"))
      .finally(() => setLoading(false));
  }, [router]);

  const totalDocs = repos.reduce((sum, r) => sum + r.docsGenerated, 0);
  const enabledRepos = repos.filter((r) => r.enabled).length;
  const recentPRs = repos.filter((r) => r.prUrl).length;

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Navbar */}
      <nav className="navbar">
        <Link href="/" className="navbar-logo">
          <div className="navbar-logo-icon">📚</div>
          DocFlow AI
        </Link>
        <div style={{ flex: 1 }} />
        <a href="/api/auth/signout" className="btn btn-ghost" style={{ fontSize: "14px" }}>
          Sign out
        </a>
      </nav>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>
        {/* Header */}
        <div style={{ marginBottom: "40px" }}>
          <h1 style={{ fontSize: "32px", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "8px" }}>
            Dashboard
          </h1>
          <p style={{ color: "var(--color-text-secondary)" }}>
            Monitor your automated documentation workflows
          </p>
        </div>

        {/* Stats */}
        {!loading && repos.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
            marginBottom: "40px",
          }}>
            {[
              { label: "Repos Connected", value: repos.length, icon: "🔗", color: "var(--color-indigo-400)" },
              { label: "Docs Enabled", value: enabledRepos, icon: "✅", color: "var(--color-emerald-400)" },
              { label: "Docs Generated", value: totalDocs, icon: "📄", color: "var(--color-cyan-400)" },
              { label: "PRs Opened", value: recentPRs, icon: "🔀", color: "var(--color-amber-400)" },
            ].map((stat) => (
              <div key={stat.label} className="card" style={{ padding: "20px 24px" }}>
                <div style={{ fontSize: "28px", marginBottom: "8px" }}>{stat.icon}</div>
                <div style={{ fontSize: "32px", fontWeight: 800, color: stat.color }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Repos list */}
        <div style={{ marginBottom: "24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700 }}>Connected Repositories</h2>
          <a
            href="https://github.com/apps/docflow-ai/installations/new"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ fontSize: "13px" }}
          >
            + Add Repository
          </a>
        </div>

        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {error && (
          <div className="card" style={{
            padding: "48px",
            textAlign: "center",
            borderColor: "rgba(251,113,133,0.3)",
          }}>
            <div style={{ fontSize: "40px", marginBottom: "16px" }}>⚠️</div>
            <p style={{ color: "var(--color-rose-400)", fontWeight: 600, marginBottom: "8px" }}>
              {error}
            </p>
            <p style={{ color: "var(--color-text-muted)", fontSize: "14px" }}>
              Make sure the backend API is running at{" "}
              <code style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}
              </code>
            </p>
          </div>
        )}

        {!loading && !error && repos.length === 0 && (
          <div className="card" style={{ padding: "64px 32px", textAlign: "center" }}>
            <div style={{ fontSize: "56px", marginBottom: "20px" }}>🔗</div>
            <h3 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px" }}>
              No repositories connected yet
            </h3>
            <p style={{ color: "var(--color-text-secondary)", marginBottom: "32px" }}>
              Install the DocFlow AI GitHub App on your repositories to get started.
            </p>
            <a
              href="https://github.com/apps/docflow-ai/installations/new"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              Install GitHub App →
            </a>
          </div>
        )}

        {!loading && !error && repos.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {repos.map((repo) => (
              <Link
                key={repo.id}
                href={`/dashboard/${repo.id}`}
                className="repo-card"
              >
                <div className="repo-avatar">📁</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                    <span style={{ fontWeight: 600, fontSize: "15px" }}>{repo.fullName}</span>
                    {!repo.enabled && (
                      <span className="badge" style={{ background: "rgba(255,255,255,0.05)", color: "var(--color-text-muted)" }}>Disabled</span>
                    )}
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                    <span>Branch: <code style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>{repo.trackedBranch}</code></span>
                    <span>Docs generated: <strong style={{ color: "var(--color-text-primary)" }}>{repo.docsGenerated}</strong></span>
                    {repo.lastJobAt && (
                      <span>Last run: {new Date(repo.lastJobAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <StatusBadge status={repo.lastJobStatus} />
                <span style={{ color: "var(--color-text-muted)", fontSize: "18px" }}>›</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
