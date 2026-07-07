"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, Star, Lock, Globe, Clock, Code2, LogOut, FileText,
  RefreshCw, AlertCircle, ChevronDown, GitFork, Zap
} from "lucide-react";

interface Repo {
  id: number;
  name: string;
  owner: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  private: boolean;
  updatedAt: string;
  defaultBranch: string;
  topics: string[];
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6", JavaScript: "#f1e05a", Python: "#3572A5",
  Rust: "#dea584", Go: "#00ADD8", Java: "#b07219", "C++": "#f34b7d",
  C: "#555555", "C#": "#178600", Ruby: "#701516", PHP: "#4F5D95",
  Swift: "#F05138", Kotlin: "#A97BFF", Dart: "#00B4AB", HTML: "#e34c26",
  CSS: "#563d7c", Shell: "#89e051", Vue: "#41b883", Svelte: "#ff3e00",
};

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [langFilter, setLangFilter] = useState("All");
  const [visFilter, setVisFilter] = useState<"all" | "public" | "private">("all");
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  const fetchRepos = async () => {
    try {
      setError(null);
      const res = await fetch("/api/repos");
      if (!res.ok) throw new Error(`Failed to load repositories (${res.status})`);
      const data = await res.json();
      setRepos(data.repos ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") fetchRepos();
  }, [status]);

  const retry = () => {
    setRetrying(true);
    setLoading(true);
    fetchRepos();
  };

  const languages = useMemo(() => {
    const langs = new Set(repos.map((r) => r.language).filter(Boolean) as string[]);
    return ["All", ...Array.from(langs).sort()];
  }, [repos]);

  const filtered = useMemo(() => {
    return repos.filter((r) => {
      const matchSearch =
        !search ||
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        (r.description ?? "").toLowerCase().includes(search.toLowerCase());
      const matchLang = langFilter === "All" || r.language === langFilter;
      const matchVis =
        visFilter === "all" ||
        (visFilter === "public" && !r.private) ||
        (visFilter === "private" && r.private);
      return matchSearch && matchLang && matchVis;
    });
  }, [repos, search, langFilter, visFilter]);

  const user = session?.user as any;

  return (
    <div className="min-h-screen grid-bg">
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 border-b border-white/5 glass">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-white hidden sm:block">DocFlow AI</span>
          </Link>

          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Search repositories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:bg-white/8 transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user?.avatarUrl && (
              <img
                src={user.avatarUrl}
                alt={user.username}
                className="w-8 h-8 rounded-full border border-white/10"
              />
            )}
            <span className="text-sm text-slate-400 hidden sm:block">
              {user?.username ?? user?.name}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Main ── */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">Repositories</h1>
          <p className="text-slate-500 text-sm">
            Select a repository to generate its README
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Visibility */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-lg overflow-hidden">
            {(["all", "public", "private"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVisFilter(v)}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  visFilter === v
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Language */}
          <div className="relative">
            <select
              value={langFilter}
              onChange={(e) => setLangFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-slate-400 cursor-pointer focus:outline-none focus:border-indigo-500/50 transition-colors"
            >
              {languages.map((l) => (
                <option key={l} value={l} className="bg-[#0d1117]">
                  {l}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
          </div>

          <span className="text-xs text-slate-600 ml-auto">
            {!loading && `${filtered.length} of ${repos.length} repositories`}
          </span>

          <button
            onClick={retry}
            disabled={retrying}
            className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${retrying ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-3 p-4 mb-6 rounded-xl bg-red-500/5 border border-red-500/20 text-red-400">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Failed to load repositories</p>
              <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
            </div>
            <button
              onClick={retry}
              className="ml-auto text-xs font-medium px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading skeletons */}
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="glass rounded-2xl p-5 space-y-3">
                <div className="skeleton h-4 w-1/2 rounded" />
                <div className="skeleton h-3 w-4/5 rounded" />
                <div className="skeleton h-3 w-3/5 rounded" />
                <div className="flex gap-2 pt-2">
                  <div className="skeleton h-5 w-16 rounded-full" />
                  <div className="skeleton h-5 w-12 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
              <Code2 className="w-8 h-8 text-slate-600" />
            </div>
            <h3 className="text-base font-semibold text-slate-400 mb-2">
              {search || langFilter !== "All" || visFilter !== "all"
                ? "No repositories match your filters"
                : "No repositories found"}
            </h3>
            <p className="text-sm text-slate-600 max-w-xs">
              {search || langFilter !== "All" || visFilter !== "all"
                ? "Try adjusting your search or filters."
                : "Make sure your GitHub account has repositories accessible."}
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((repo) => (
              <RepoCard key={repo.id} repo={repo} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function RepoCard({ repo }: { repo: Repo }) {
  const langColor = LANG_COLORS[repo.language ?? ""] ?? "#94a3b8";

  return (
    <Link
      href={`/editor/${repo.owner}/${repo.name}`}
      className="group block glass rounded-2xl p-5 hover:border-indigo-500/25 hover:shadow-lg hover:shadow-indigo-500/5 hover:-translate-y-0.5 transition-all duration-200"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {repo.private ? (
            <Lock className="w-4 h-4 text-amber-400/70 shrink-0" />
          ) : (
            <Globe className="w-4 h-4 text-slate-500 shrink-0" />
          )}
          <span className="font-semibold text-white text-sm truncate group-hover:text-indigo-300 transition-colors">
            {repo.name}
          </span>
        </div>
        {repo.private && (
          <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-400">
            Private
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-xs text-slate-500 line-clamp-2 mb-4 leading-relaxed min-h-[2.5rem]">
        {repo.description || (
          <span className="italic">No description provided</span>
        )}
      </p>

      {/* Topics */}
      {repo.topics && repo.topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {repo.topics.slice(0, 3).map((t) => (
            <span
              key={t}
              className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Meta */}
      <div className="flex items-center gap-4 text-xs text-slate-600">
        {repo.language && (
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: langColor }}
            />
            <span>{repo.language}</span>
          </div>
        )}
        {repo.stars > 0 && (
          <div className="flex items-center gap-1">
            <Star className="w-3 h-3" />
            <span>{repo.stars.toLocaleString()}</span>
          </div>
        )}
        {repo.forks > 0 && (
          <div className="flex items-center gap-1">
            <GitFork className="w-3 h-3" />
            <span>{repo.forks}</span>
          </div>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <Clock className="w-3 h-3" />
          <span>{timeAgo(repo.updatedAt)}</span>
        </div>
      </div>

      {/* Generate hint */}
      <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
        <span className="text-xs text-slate-600">
          Generate README
        </span>
        <div className="flex items-center gap-1 text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
          <Zap className="w-3 h-3" />
          <span>Generate</span>
        </div>
      </div>
    </Link>
  );
}
