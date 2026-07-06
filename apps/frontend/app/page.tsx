"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

const FEATURES = [
  {
    icon: "🧠",
    iconClass: "feature-icon-indigo",
    title: "Parser-First Architecture",
    desc: "Raw source code never reaches the AI. AST/regex parsers extract facts first — making it prompt-injection safe by design.",
  },
  {
    icon: "⚡",
    iconClass: "feature-icon-emerald",
    title: "Diff-Only Analysis",
    desc: "On every push, only changed files are re-analyzed. Full facts are merged from cache — no re-analyzing the entire codebase.",
  },
  {
    icon: "✂️",
    iconClass: "feature-icon-cyan",
    title: "Surgical README Edits",
    desc: "Only the sections that changed get updated. Your custom prose, badges, and notes are never touched.",
  },
  {
    icon: "🔌",
    iconClass: "feature-icon-violet",
    title: "Pluggable AI Providers",
    desc: "Groq (Llama 3), Gemini, or local Ollama — switch via a single env var. Same codebase, hosted or fully self-hosted.",
  },
  {
    icon: "🛡️",
    iconClass: "feature-icon-rose",
    title: "Deterministic Fallback",
    desc: "AI provider down or rate-limited? DocFlow falls back to a template engine and still opens the PR.",
  },
  {
    icon: "🏗️",
    iconClass: "feature-icon-amber",
    title: "Monorepo-Aware",
    desc: "Detects workspaces, generates isolated docs per service, plus a root overview. Works with pnpm, Turborepo, Nx, Lerna.",
  },
];

const PIPELINE_STEPS = [
  { step: "01", label: "Git Push", icon: "↑" },
  { step: "02", label: "Probot Webhook", icon: "🔐" },
  { step: "03", label: "BullMQ Queue", icon: "⚡" },
  { step: "04", label: "Parser (AST/Regex)", icon: "🧬" },
  { step: "05", label: "AI Generation", icon: "🤖" },
  { step: "06", label: "PR Opened", icon: "✅" },
];

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* ── Navbar ── */}
      <nav className="navbar">
        <div className="navbar-logo">
          <div className="navbar-logo-icon">📚</div>
          DocFlow AI
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <a
            href="https://github.com/your-org/docflow-ai"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost"
            style={{ fontSize: "14px" }}
          >
            GitHub
          </a>
          <Link href="/dashboard" className="btn btn-secondary">
            Dashboard
          </Link>
          <a href="/api/auth/signin" className="btn btn-primary">
            Sign in with GitHub
          </a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero page-container">
        <div
          className="hero-eyebrow"
          style={{ opacity: mounted ? 1 : 0, transition: "opacity 0.5s" }}
        >
          <span>🚀</span>
          Zero cost · Parser-First · Prompt-Injection Safe
        </div>

        <h1
          className="hero-title"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "none" : "translateY(20px)",
            transition: "all 0.7s cubic-bezier(0.4,0,0.2,1) 0.1s",
          }}
        >
          <span className="text-gradient-hero">Documentation</span>
          <br />
          that writes itself
        </h1>

        <p
          className="hero-subtitle"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "none" : "translateY(20px)",
            transition: "all 0.7s cubic-bezier(0.4,0,0.2,1) 0.2s",
          }}
        >
          DocFlow AI watches your repos and automatically opens PRs to keep your
          READMEs and technical docs in sync — on every push.
        </p>

        <div
          className="hero-actions"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "none" : "translateY(20px)",
            transition: "all 0.7s cubic-bezier(0.4,0,0.2,1) 0.3s",
          }}
        >
          <a href="/api/auth/signin" className="btn btn-primary" style={{ padding: "14px 28px", fontSize: "16px" }}>
            Get Started Free →
          </a>
          <a
            href="https://github.com/your-org/docflow-ai"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ padding: "14px 28px", fontSize: "16px" }}
          >
            ⭐ Star on GitHub
          </a>
        </div>
      </section>

      {/* ── Pipeline Visualization ── */}
      <section className="page-container section" style={{ paddingTop: "40px" }}>
        <div
          className="card"
          style={{
            padding: "32px",
            background: "rgba(99,102,241,0.04)",
            borderColor: "rgba(99,102,241,0.2)",
          }}
        >
          <p style={{ textAlign: "center", color: "var(--color-text-muted)", fontSize: "12px", marginBottom: "28px", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
            The Pipeline
          </p>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            flexWrap: "wrap",
          }}>
            {PIPELINE_STEPS.map((step, i) => (
              <div key={step.step} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  padding: "16px 20px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "12px",
                  minWidth: "110px",
                }}>
                  <span style={{ fontSize: "24px" }}>{step.icon}</span>
                  <span style={{ fontSize: "11px", color: "var(--color-indigo-400)", fontWeight: 700 }}>{step.step}</span>
                  <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", textAlign: "center", lineHeight: 1.3 }}>{step.label}</span>
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <span style={{ color: "var(--color-indigo-400)", fontSize: "20px", opacity: 0.5 }}>→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="page-container section" style={{ paddingTop: "40px" }}>
        <div style={{ textAlign: "center", marginBottom: "56px" }}>
          <h2 style={{ fontSize: "40px", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "16px" }}>
            Built for real-world repos
          </h2>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "18px", maxWidth: "520px", margin: "0 auto" }}>
            Every edge case handled. Every free tier respected.
          </p>
        </div>

        <div className="feature-grid">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="feature-card"
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? "none" : "translateY(16px)",
                transition: `all 0.5s cubic-bezier(0.4,0,0.2,1) ${i * 0.08}s`,
              }}
            >
              <div className={`feature-icon ${f.iconClass}`}>{f.icon}</div>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="page-container section">
        <div className="card" style={{ padding: "64px 32px" }}>
          <div className="stats-row">
            {[
              { value: "8+", label: "Languages Supported", gradient: "linear-gradient(135deg, #818cf8, #67e8f9)" },
              { value: "0", label: "Raw Source to AI", gradient: "linear-gradient(135deg, #34d399, #10b981)" },
              { value: "100%", label: "Free to Run", gradient: "linear-gradient(135deg, #fbbf24, #fb923c)" },
              { value: "3", label: "AI Providers", gradient: "linear-gradient(135deg, #c084fc, #818cf8)" },
            ].map((stat) => (
              <div key={stat.label} className="stat-item">
                <div
                  className="stat-value"
                  style={{
                    background: stat.gradient,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  {stat.value}
                </div>
                <div className="stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="page-container section" style={{ textAlign: "center" }}>
        <div
          className="card"
          style={{
            padding: "80px 32px",
            background: "linear-gradient(135deg, rgba(99,102,241,0.1), rgba(6,182,212,0.05))",
            borderColor: "rgba(99,102,241,0.25)",
          }}
        >
          <h2 style={{ fontSize: "48px", fontWeight: 900, letterSpacing: "-0.02em", marginBottom: "20px" }}>
            Ready to automate your docs?
          </h2>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "18px", marginBottom: "40px" }}>
            Free forever. No credit card required.
          </p>
          <a
            href="/api/auth/signin"
            className="btn btn-primary"
            style={{ padding: "16px 40px", fontSize: "18px" }}
          >
            Sign in with GitHub — it&apos;s free →
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: "1px solid var(--color-border)",
        padding: "40px 24px",
        textAlign: "center",
        color: "var(--color-text-muted)",
        fontSize: "14px",
      }}>
        <p>
          DocFlow AI — Open source &amp; free.{" "}
          <a
            href="https://github.com/your-org/docflow-ai"
            style={{ color: "var(--color-indigo-400)", textDecoration: "none" }}
          >
            View on GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
