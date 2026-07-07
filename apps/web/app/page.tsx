"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Github, Zap, GitBranch, FileText, ArrowRight, Check } from "lucide-react";

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="min-h-screen grid-bg">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 glass">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-white">DocFlow AI</span>
          </div>
          <button
            onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-all"
          >
            <Github className="w-4 h-4" />
            Sign in
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-8">
            <Zap className="w-3.5 h-3.5" />
            AI-Powered README Generation
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl font-bold text-white leading-tight mb-6 tracking-tight">
            Your repositories deserve{" "}
            <span className="gradient-text">better documentation</span>
          </h1>

          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
            DocFlow AI analyzes your GitHub repositories and generates professional,
            accurate READMEs that you can edit and commit directly — without ever
            leaving the browser.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
              className="group flex items-center gap-3 px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-base transition-all hover:shadow-lg hover:shadow-indigo-500/25 hover:-translate-y-0.5"
            >
              <Github className="w-5 h-5" />
              Continue with GitHub
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <span className="text-sm text-slate-500">
              Free to use · No credit card required
            </span>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white mb-4">How it works</h2>
            <p className="text-slate-400">Three steps to a professional README</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                icon: <Github className="w-6 h-6" />,
                title: "Connect GitHub",
                desc: "Sign in with your GitHub account. DocFlow AI securely accesses your public and private repositories.",
              },
              {
                step: "02",
                icon: <Zap className="w-6 h-6" />,
                title: "Analyze & Generate",
                desc: "Select a repository. Our parser analyzes the codebase and AI generates accurate documentation.",
              },
              {
                step: "03",
                icon: <GitBranch className="w-6 h-6" />,
                title: "Edit & Commit",
                desc: "Review and edit in our live editor. Commit the README directly to GitHub with one click.",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="glass rounded-2xl p-8 hover:border-indigo-500/20 transition-colors"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    {item.icon}
                  </div>
                  <span className="text-4xl font-bold text-white/10">{item.step}</span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white mb-4">Built for developers</h2>
            <p className="text-slate-400">Everything you need for great documentation</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              "Analyzes project structure and dependencies",
              "Detects frameworks, databases, and auth systems",
              "Generates Mermaid architecture diagrams",
              "Live Markdown editor with preview",
              "Commit directly to GitHub",
              "Create pull requests from the UI",
              "Works with public and private repositories",
              "Supports monorepos and multi-service projects",
              "Section-level AI regeneration",
            ].map((feature, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-5 py-4 glass rounded-xl text-sm text-slate-300"
              >
                <Check className="w-4 h-4 text-indigo-400 shrink-0" />
                {feature}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center">
              <FileText className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm text-slate-400">DocFlow AI</span>
          </div>
          <p className="text-sm text-slate-600">
            © {new Date().getFullYear()} DocFlow AI. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
