# Workflow Metrics

An open-source dashboard for GitHub Actions metrics with AI-powered optimization suggestions.

## Features

- **GitHub OAuth login** — Sign in with GitHub using `repo` and `read:org` scopes to access your workflows
- **Repository overview dashboard** — Total runs, success rate, average duration, and active workflows with 30-day trends
- **Run history chart** — Visual breakdown of success, failure, and cancelled runs over time
- **Duration by workflow** — Bar chart comparing average duration across all workflows
- **Recent runs table** — Filterable list of the latest runs with status, branch, actor, and duration
- **Workflow list** — All workflows with live success rate and quick navigation
- **Workflow detail dashboard** — Deep dive into a single workflow: P50/P95 duration, job breakdown, duration trend
- **Job breakdown** — Per-job timing analysis (avg, min, max) from recent completed runs
- **AI optimization with Mistral** — Click "Optimize with AI" on any workflow to get streaming, actionable suggestions (caching, parallelization, runner optimization, etc.)
- **Settings page** — Manage GitHub connections, tracked repositories, Mistral API key, and theme
- **Dark / light mode** — Dark by default, persisted per user preference

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

## Setup

### 1. Clone and install

```bash
git clone https://github.com/your-org/workflow-metrics.git
cd workflow-metrics
pnpm install
```

### 2. Create a Supabase project

1. Create a new project at [supabase.com](https://supabase.com)
2. Run the migration in `supabase/migrations/001_initial.sql` via the Supabase SQL editor
3. **GitHub OAuth (use an OAuth App, not a GitHub App):**
  - Create a **GitHub OAuth App** at [GitHub → Settings → Developer settings → OAuth Apps → New OAuth App](https://github.com/settings/applications/new)
  - Set **Authorization callback URL** to your **Supabase** callback: `https://<your-project-ref>.supabase.co/auth/v1/callback` (find your project ref in Supabase Dashboard → Settings → API)
  - Copy the Client ID and Client secret, then in **Supabase → Authentication → Providers → GitHub** paste them and enable GitHub
  - In **Supabase → Authentication → URL Configuration**, add your app’s callback to **Redirect URLs**: `http://localhost:5173/auth/callback` (local) and `https://your-domain.com/auth/callback` (production)

### 3. Configure environment variables

Copy `.env.example` to `.env` and fill in:

```env
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run locally

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

## Deployment (Cloudflare Pages)

### 1. Deploy to Cloudflare Pages

Connect your GitHub repository to Cloudflare Pages with these build settings:

- **Build command**: `pnpm run build`
- **Build output directory**: `.svelte-kit/cloudflare`
- **Node.js version**: 20+

### 2. Set environment variables

In the Cloudflare Pages dashboard → Settings → Environment Variables:


| Variable                   | Description                              |
| -------------------------- | ---------------------------------------- |
| `PUBLIC_SUPABASE_URL`      | Your Supabase project URL                |
| `PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key (publishable key) |


### 3. Update Supabase OAuth redirect URLs

Add your Cloudflare Pages URL to the allowed redirect URLs in Supabase:

```
https://your-project.pages.dev/auth/callback
https://your-custom-domain.com/auth/callback
```

## AI Optimization (Optional)

The "Optimize with AI" feature requires a Mistral AI API key:

1. Get a key at [console.mistral.ai](https://console.mistral.ai)
2. Add it in the app **Settings** page
3. Click "Optimize with AI" on any workflow detail page

The key is stored encrypted in Supabase and is only used server-side.

## Database Schema

See `supabase/migrations/001_initial.sql` for the full schema with RLS policies.

Tables:

- `github_connections` — GitHub OAuth tokens per user
- `repositories` — Tracked repositories per user
- `user_settings` — Mistral API key, theme, default repo

## Contributing

Contributions welcome! Please open an issue or PR.

## License

MIT