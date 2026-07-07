# DocFlow AI 📚

> **Automated Repository Documentation & Intelligence Platform** — the "Vercel for Documentation" that analyzes your codebase architecture and generates professional, senior-engineer quality README files using local or hosted AI models.

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

Navigating the monorepo is straightforward. Code is separated into logical workspaces managed by `pnpm`:

```
docflow-ai/
├── apps/
│   └── web/               # Next.js SaaS Web App (Dashboard, Editor, API Routes)
├── packages/
│   ├── shared/            # Common TypeScript interfaces, crypto utilities & type definitions
│   ├── database/          # Prisma schema + PostgreSQL Client & Migrations
│   ├── parser/            # AST/regex codebase fact extractor (no AI, zero network calls)
│   ├── ai/                # Provider-agnostic LLM integration & prompt generator
│   └── queue/             # BullMQ + Redis job queue definitions & worker instantiation
├── docker-compose.yml     # Local Postgres + Redis services configuration
├── turbo.json             # Turborepo task pipeline configuration
└── pnpm-workspace.yaml
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (`npm install -g pnpm`)
- **Docker & Docker Compose** (for running local PostgreSQL and Redis)

### 1. Clone & Install

```bash
git clone https://github.com/lokesh-makam/Docflow-ai.git
cd Docflow-ai
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
- `AI_PROVIDER` — Set to `ollama`, `groq`, or `gemini`.

### 3. Start Infrastructure

Spin up local Postgres and Redis databases:
```bash
docker compose up -d
```

Push the database schema and synchronize migrations:
```bash
pnpm --filter @docflow/database db:push
```

### 4. Run Development Servers

```bash
pnpm dev
```

This starts:
- **Next.js Web App**: http://localhost:3000
- **BullMQ Background Worker**: Asynchronously executes repository cloning, code parsing, and AI generation tasks.

---

## 🧭 Step-by-Step Developer Guide

### 1. Sign In & Authentication Flow
- Launch the application and click **Continue with GitHub**.
- The authentication is powered by **NextAuth.js**. Once authorized, the access token is encrypted via **AES-256-GCM** using the `ENCRYPTION_KEY` and saved securely in the database.
- The user session JWT does not store the token, eliminating client-side token exposure.

### 2. The Repository Dashboard
- Upon signing in, the frontend queries `/api/repos`, which decrypts your GitHub token server-side and pulls your authorized repositories.
- You can filter, search, and page through public and private repositories using skeleton-loaded UI lists.

### 3. Triggering README Generation
- Clicking **Generate README** launches an asynchronous job:
  1. The API route creates an `AnalysisJob` row and queues the job in **Redis** via **BullMQ**.
  2. The background worker pulls the job, decrypts your access token, and does a shallow clone (`--depth=1`) of the repository to a temporary directory.
  3. The `@docflow/parser` package runs static code AST analysis (zero AI context exposure).
  4. The `@docflow/ai` prompt engine packages these facts, sends them to your configured AI provider (e.g. local Ollama running `qwen2.5-coder:7b`), parses the response with a hybrid parser (JSON parsing with markdown fallback), and caches the generated README.

### 4. Editing & Customizing
- The generated README is loaded into a split-screen editor where you can edit the markdown and view changes in real-time.
- Features include:
  - **Undo/Redo History**: Undo and redo button state controls.
  - **Draft Autosaving**: Uncommitted edits are automatically backed up to `localStorage` to avoid data loss.
  - **Section Regeneration**: Use the AI side-panel to update or refine specific sections dynamically.

### 5. Pushing Directly to GitHub
- Open the **Push Settings** panel to choose whether you want to do a **Direct Commit** to the default branch or open a **Pull Request**.
- Clicking submit fires a request to `/api/readme/push`, which retrieves the decrypted token server-side, leverages **Octokit**, and performs the direct commit or creates the PR.

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
