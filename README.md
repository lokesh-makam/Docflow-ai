# DocFlow AI 📚

> **Automated Repository Documentation & Intelligence Platform** — the "Vercel for Documentation" that analyzes your codebase architecture and generates professional, senior-engineer quality README files using local or hosted AI models.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg)](https://pnpm.io/)

---

## ⚡ How It Works

```
OAuth Log In → Select Repository → Trigger Analysis (Shallow Clone)
    → Parser Engine (AST/regex analysis, zero AI) → Structured JSON Facts
    → AI Generator (only sees facts, never raw code) → Rich Live Editor (Markdown split-view)
    → Push to GitHub (Direct Commit or Pull Request)
```

**Parser-First Architecture** — raw source code **never** enters the LLM context window. This provides:
- ✅ **Prompt-Injection Resistance**: Malicious code comments cannot influence the AI prompt.
- ✅ **Low Context Usage**: Small structured JSON facts instead of huge codebases.
- ✅ **Deterministic Fallback**: Generates documentation even if AI providers are rate-limited or down.

---

## ✨ Features

- 🔄 **Continue with GitHub** — One-click GitHub OAuth authentication with secure, encrypted tokens.
- 🧠 **AST-Powered Parser** — Auto-detects frameworks, routes, databases, authentication, environment variables, and Docker configurations.
- 🤖 **Pluggable AI** — Groq (hosted), Gemini (hosted), or local Ollama (`qwen2.5-coder:7b`).
- 📝 **Split-View Live Editor** — Real-time markdown rendering with Undo/Redo buffers and local draft autosave.
- 🚀 **Commit & PR Workflow** — Push generated docs directly to a target branch or open a Pull Request directly from the UI.
- 🏗️ **Monorepo-Aware** — Supports monorepo workspaces and projects natively.

---

## 📂 Project Structure

```
docflow-ai/
├── apps/
│   └── web/               # Next.js SaaS Web App (Dashboard, Editor, API Routes)
├── packages/
│   ├── shared/            # Common TypeScript interfaces & utilities
│   ├── database/          # Prisma schema + PostgreSQL Client
│   ├── parser/            # AST/regex codebase fact extractor (no AI)
│   ├── ai/                # Provider-agnostic LLM integration & prompt generator
│   └── queue/             # BullMQ + Redis job queue definitions
├── docker-compose.yml     # Local Postgres + Redis services
├── turbo.json             # Turborepo task pipeline
└── pnpm-workspace.yaml
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- Docker & Docker Compose (for local Postgres + Redis)

### 1. Clone & Install

```bash
git clone https://github.com/your-org/docflow-ai.git
cd docflow-ai
pnpm install
```

### 2. Configure Environment

Copy the example environment file:
```bash
cp .env.example .env
```

And configure:
- `DATABASE_URL` — PostgreSQL connection string.
- `REDIS_URL` — Redis connection string.
- `ENCRYPTION_KEY` — 32-byte hex key for securing GitHub OAuth tokens (AES-256-GCM).
- `GITHUB_CLIENT_ID` & `GITHUB_CLIENT_SECRET` — From your GitHub OAuth application.
- `NEXTAUTH_SECRET` & `NEXTAUTH_URL` — NextAuth credentials.
- `AI_PROVIDER` — `ollama`, `groq`, or `gemini`.

### 3. Start Infrastructure

Spin up local Postgres and Redis databases:
```bash
docker compose up -d
```

Push the database schema:
```bash
pnpm --filter @docflow/database db:push
```

### 4. Run Development Servers

```bash
pnpm dev
```

This starts:
- **Next.js Web App**: http://localhost:3000
- **BullMQ Background Worker**: Asynchronously executes clones and static analyses.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend/SaaS App** | Next.js 14 + Tailwind CSS + Framer Motion |
| **Authentication** | NextAuth.js + GitHub OAuth |
| **Database** | PostgreSQL + Prisma ORM |
| **Task Queue** | BullMQ + Redis |
| **Parsing** | web-tree-sitter + ts-morph |
| **AI Integration** | Ollama (local) / Groq & Gemini (hosted) |

---

## 🛡 Security & Token Protection

All user access tokens are encrypted using **AES-256-GCM** before being persisted in the database. Tokens are never exposed in the client-side session JWT; decryption only occurs on the secure backend during git operations (cloning, committing, and opening PRs).

---

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.
