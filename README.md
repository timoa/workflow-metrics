# Workflow Metrics

[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/timoa/workflow-metrics/badge)](https://securityscorecards.dev/viewer/?uri=github.com/timoa/workflow-metrics)
[![Coverage Status](https://codecov.io/gh/timoa/workflow-metrics/branch/main/graph/badge.svg)](https://codecov.io/gh/timoa/workflow-metrics)
[![CI (Tests, Lint & Security)](https://github.com/timoa/workflow-metrics/actions/workflows/pull-request.yml/badge.svg)](https://github.com/timoa/workflow-metrics/actions/workflows/pull-request.yml)
[![Dependency Review](https://github.com/timoa/workflow-metrics/actions/workflows/dependency-review.yml/badge.svg)](https://github.com/timoa/workflow-metrics/actions/workflows/dependency-review.yml)
[![CodeQL](https://github.com/timoa/workflow-metrics/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/timoa/workflow-metrics/actions/workflows/codeql-analysis.yml)
[![OpenSSF Scorecard](https://github.com/timoa/workflow-metrics/actions/workflows/scorecard.yml/badge.svg)](https://github.com/timoa/workflow-metrics/actions/workflows/scorecard.yml)
[![Release](https://github.com/timoa/workflow-metrics/actions/workflows/release.yml/badge.svg)](https://github.com/timoa/workflow-metrics/actions/workflows/release.yml)
[![Deploy](https://github.com/timoa/workflow-metrics/actions/workflows/deploy.yml/badge.svg)](https://github.com/timoa/workflow-metrics/actions/workflows/deploy.yml)
[![License](https://img.shields.io/github/license/timoa/workflow-metrics)](LICENSE)


An open-source dashboard for GitHub Actions metrics with AI-powered optimization suggestions.

![Workflow Metrics demo](https://workflow-metrics.com/images/demo/workflow-metrics-26-03-02.gif)

## Features

- **GitHub OAuth login** — Sign in with GitHub using `repo` and `read:org` scopes to access your workflows
- **Repository overview dashboard** — Total runs, success rate, average duration, active workflows, and 7→30 day progressive loading
- **DORA metrics** — Deployment Frequency, Lead Time for Changes, Change Failure Rate, and Mean Time to Recovery over the last 30 days
- **Run history + workflow-change markers** — Visual breakdown of success/failure/cancelled runs plus commit markers when workflow files changed
- **Duration by workflow** — Bar chart comparing average duration across all workflows
- **Build minutes + billable minutes** — Raw build minutes with billable estimate using GitHub-hosted runner multipliers (Linux ×1, Windows ×2, macOS ×10)
- **Minutes analytics** — Minutes by workflow, daily build-minutes trend, per-workflow minutes by job, and daily workflow minutes trend
- **Efficiency insights** — Wasted minutes on failures, most expensive workflow, costliest branch, and frequency × duration table
- **Skip analytics** — Global skip rate, per-workflow skip rate, and top skipped workflows table
- **Recent runs table** — Filterable list of the latest runs with status, branch, actor, and duration
- **Workflow list** — All workflows with live success rate and quick navigation
- **Workflow detail dashboard** — Deep dive into a single workflow: P50/P95 duration, build minutes, billable minutes, skip rate, and cost efficiency
- **Workflow structure flow chart** — Interactive workflow graph (trigger + job dependency DAG) with runner labels and step counts
- **Job + step breakdowns** — Per-job timing analysis (avg/min/max) and slowest-job step-level breakdown from recent completed runs
- **AI optimization with Mistral** — Click "Optimize with AI" on any workflow to get streaming, actionable suggestions (caching, parallelization, runner optimization, cost, etc.)
- **Apply as PR** — Push AI optimization suggestions directly as a pull request via the GitHub App integration
- **Settings page** — Manage GitHub connections, tracked repositories, Mistral API key, and theme
- **Dark / light mode** — Dark by default, persisted per user preference

## Workflow Flow Chart

Workflow detail pages include an interactive flow chart that visualizes trigger-to-job execution order and `needs` dependencies.

```mermaid
flowchart LR
    T([Trigger])
    L[lint]
    U[unit-tests]
    B[build]
    D[deploy]

    T --> L
    T --> U
    L --> B
    U --> B
    B --> D
```

## Tech Stack

- **Framework**: Svelte 5 + SvelteKit 2
- **Styling**: TailwindCSS 4 + `@tailwindcss/vite`
- **Auth & Database**: Supabase (GitHub OAuth + PostgreSQL)
- **GitHub API**: `@octokit/rest`
- **AI**: Vercel AI SDK + `@ai-sdk/mistral` (streaming)
- **Deployment**: Cloudflare Pages via `@sveltejs/adapter-cloudflare`
- **Package manager**: PNPM

## Design

The UI design and color system are inspired by the free template **"Dark Admin Dashboard"** by [Malik Ali](https://www.figma.com/@malik_ali).  
Figma template: [Dark Admin Dashboards](https://www.figma.com/community/file/1325597018063319916/free-dark-admin-dashboards).

## Getting Started

### Prerequisites

- Node.js >= 24
- PNPM >= 10

### 1. Clone and install

```bash
git clone https://github.com/timoa/workflow-metrics.git
cd workflow-metrics
pnpm install
```

### 2. Create a Supabase project

1. Create a new project at [supabase.com](https://supabase.com).
2. **Run database migrations** (choose one method):
   - **With Supabase CLI:**
     ```bash
     supabase link --project-ref YOUR_PROJECT_REF
     supabase db push
     ```
     Your project ref is in the Supabase dashboard URL: `https://supabase.com/dashboard/project/YOUR_PROJECT_REF`.
   - **Without CLI:** In **Supabase Dashboard → SQL Editor**, run each file in `supabase/migrations/` in numerical order, from `001_initial.sql` through `008_github_app_installations_avatar_name.sql`.
3. **Enable GitHub OAuth** (use a GitHub OAuth App, not a GitHub App):
   - Go to [GitHub → Settings → Developer settings → OAuth Apps → New OAuth App](https://github.com/settings/applications/new).
   - Set **Authorization callback URL** to your Supabase callback: `https://<your-project-ref>.supabase.co/auth/v1/callback`.
   - Copy the **Client ID** and **Client secret**, then in **Supabase → Authentication → Providers → GitHub**, paste them and enable GitHub.
   - In **Supabase → Authentication → URL Configuration → Redirect URLs**, add:
     ```
     http://localhost:5173/auth/callback
     https://your-project.pages.dev/auth/callback
     ```
4. From **Supabase → Project Settings → API**, copy:
   - **Project URL** → `PUBLIC_SUPABASE_URL`
   - **anon / public** key → `PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` *(server-only; bypasses RLS for cache writes — never expose this key to the browser or commit it to source control)*

### 3. Create a GitHub App (for "Apply as PR")

The "Apply as PR" feature — which pushes AI optimization suggestions directly as a pull request — requires a GitHub App (separate from the OAuth App used for login).

1. Go to [GitHub → Settings → Developer settings → GitHub Apps → New GitHub App](https://github.com/settings/apps/new).
2. Fill in the details:
   - **GitHub App name**: e.g. `workflow-metrics-bot`
   - **Homepage URL**: your app URL (e.g. `https://your-project.pages.dev`)
   - **Callback URL**: `https://your-project.pages.dev/auth/github-app/callback`
     - For local dev, also add: `http://localhost:5173/auth/github-app/callback`
   - **Webhook**: uncheck **Active** (not needed)
3. Under **Repository permissions**, set:
   - **Contents**: Read & Write
   - **Pull requests**: Read & Write
   - **Workflows**: Read & Write
   - **Actions**: Read
4. Click **Create GitHub App**.
5. On the App settings page, note the **App ID** → `GITHUB_APP_ID`.
6. Note the **App slug** from the URL (`github.com/apps/<slug>`) → `GITHUB_APP_SLUG`.
7. Scroll to **Private keys** → **Generate a private key**. A `.pem` file will download.
   - Collapse the newlines for use as a single-line secret:
     ```bash
     awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' your-app.pem
     ```
   - Use the output as `GITHUB_APP_PRIVATE_KEY`.

### 4. Get a Mistral AI API key (for AI optimization)

The "Optimize with AI" feature streams actionable suggestions (caching, parallelization, runner optimization, cost reduction) powered by Mistral AI. The key is **per-user** and entered in the app Settings page — it is not a server environment variable.

1. Sign up or log in at [console.mistral.ai](https://console.mistral.ai).
2. Go to **API Keys** → **Create new key**.
3. Copy the key — you will not be able to see it again.
4. After logging into the app, go to **Settings** and paste the key into the **Mistral API key** field.

The key is stored encrypted in Supabase and is only used server-side. AI optimization is simply unavailable without one — the rest of the app works normally.

### 5. Configure environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in the values:

```env
# ── Supabase ──────────────────────────────────────────────────────────────────
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ── App URL (production only) ─────────────────────────────────────────────────
# Required in production so OAuth redirects back to the correct URL.
# Leave commented out for local dev — the app uses the request origin automatically.
# PUBLIC_APP_URL=https://your-project.pages.dev

# ── GitHub App (for "Apply as PR") ───────────────────────────────────────────
GITHUB_APP_ID=your-numeric-app-id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_APP_SLUG=your-github-app-slug
```

| Variable | Required | Description |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key — bypasses RLS for server-side cache writes. Never expose this to the browser or commit it to source control |
| `PUBLIC_APP_URL` | Production only | Your deployed app URL (e.g. `https://your-project.pages.dev`), no trailing slash |
| `GITHUB_APP_ID` | Yes | Numeric App ID from GitHub App settings |
| `GITHUB_APP_PRIVATE_KEY` | Yes | RSA private key from GitHub App settings (full PEM, newlines as `\n`) |
| `GITHUB_APP_SLUG` | Yes | URL slug of your GitHub App (e.g. `workflow-metrics-bot`) |

### 6. Run locally

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

## Deployment (Cloudflare Pages)

### 1. Connect to Cloudflare Pages

Connect your GitHub repository to Cloudflare Pages with these build settings:

- **Build command**: `pnpm run build`
- **Build output directory**: `.svelte-kit/cloudflare`
- **Node.js version**: 24

### 2. Set environment variables

In **Cloudflare Pages → Settings → Environment Variables**, add all variables from the table above, including `PUBLIC_APP_URL` set to your production URL.

| Variable | Description |
|---|---|
| `PUBLIC_SUPABASE_URL` | Supabase project URL |
| `PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `PUBLIC_APP_URL` | Your production app URL (e.g. `https://your-project.pages.dev`) |
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App RSA private key (full PEM, newlines as `\n`) |
| `GITHUB_APP_SLUG` | GitHub App URL slug |

### 3. Update Supabase OAuth redirect URLs

In **Supabase → Authentication → URL Configuration → Redirect URLs**, ensure all URLs are listed:

```
http://localhost:5173/auth/callback
https://your-project.pages.dev/auth/callback
https://your-custom-domain.com/auth/callback   ← if using a custom domain
```

## Database Schema

See `supabase/migrations/001_initial.sql` for the full schema with RLS policies.

Tables:

- `github_connections` — GitHub OAuth tokens per user
- `repositories` — Tracked repositories per user
- `user_settings` — Mistral API key (encrypted), theme, default repo
- `workflow_runs_cache` — Cached workflow run data to reduce GitHub API calls
- `workflow_detail_runs_cache` — Cached per-workflow run details
- `optimization_history` — History of AI optimization suggestions per workflow
- `github_app_installations` — GitHub App installation records per repository

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, coding standards, and the PR process.

## License

MIT
