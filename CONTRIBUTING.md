# Contributing to Workflow Metrics

Thank you for your interest in contributing. Please read this guide before opening a pull request.

## How to contribute

1. **Fork** the repository by clicking the "Fork" button on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/workflow-metrics.git
   cd workflow-metrics
   ```
3. **Create a branch** for your change:
   ```bash
   git checkout -b feat/my-feature
   # or
   git checkout -b fix/my-bug
   ```
4. **Install dependencies** and set up the project (see [Setup](#setup) below).
5. **Make your changes**, following the [coding standards](#coding-standards).
6. **Test** your changes locally (see [Test](#test) below).
7. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/):
   ```bash
   git commit -m "feat: add DORA metrics export to CSV"
   git commit -m "fix: resolve crash when repository has no workflow runs"
   ```
8. **Push** your branch to your fork:
   ```bash
   git push origin feat/my-feature
   ```
9. **Open a Pull Request** against the `main` branch of this repository. Fill in the PR template that appears automatically.

The CI pipeline will run lint, tests, and a build check on your PR. All checks must pass before the PR can be merged.

## Coding standards

- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages — this drives automated versioning and changelog generation.
- Write strict TypeScript; avoid `any`.
- Keep server-side logic (GitHub API, Supabase, AI calls) in `src/lib/server/`. Keep UI logic in `src/lib/components/` and route files. Do not mix them.
- Add or update tests for any logic change in `src/lib/server/` or `src/lib/utils.ts`.
- Maintain coverage thresholds: lines/functions/statements ≥ 80%, branches ≥ 70%.
- Update `README.md` if your change adds a feature or modifies existing behaviour.

## Prerequisites

- Node.js >= 24
- PNPM >= 10
- A [Supabase](https://supabase.com/) project (for auth and database)
- A GitHub OAuth App (for GitHub login)

## Setup

```bash
pnpm install
```

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

Required environment variables:

| Variable | Description |
|---|---|
| `PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `GITHUB_APP_ID` | GitHub App ID (for server-side API calls) |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key |
| `MISTRAL_API_KEY` | Mistral API key (for AI optimization features) |

## Development

```bash
pnpm dev
```

The app will be available at `http://localhost:5173`.

## Build

```bash
pnpm build
```

## Test

```bash
pnpm test
pnpm lint
pnpm check
```

To run tests with coverage:

```bash
pnpm test:coverage
```

Coverage is enforced at: lines/functions/statements ≥ 80%, branches ≥ 70%.

## CI (Pull request checks)

On every pull request to `main`, GitHub Actions runs:

- **Lint**: ESLint (TypeScript + Svelte)
- **Test**: Vitest with v8 coverage, uploaded to [Codecov](https://codecov.io/)
- **Build**: SvelteKit build check
- **Security**: `pnpm audit --audit-level=high` (fails on high or critical vulnerabilities)
- **Dependency Review**: Scans dependency manifest changes for known vulnerabilities

Workflow file: [.github/workflows/pull-request.yml](.github/workflows/pull-request.yml).

## Security (Harden Runner)

All GitHub Actions workflows use [step-security/harden-runner](https://github.com/step-security/harden-runner) with **egress blocking** to mitigate supply chain attacks. Only explicitly allowed endpoints can be reached.

**What it does:**
- Monitors network egress to detect unauthorized outbound calls
- Tracks file integrity to detect tampering
- Monitors process activity for suspicious behavior

**Workflows protected:**
- [.github/workflows/pull-request.yml](.github/workflows/pull-request.yml) — CI checks
- [.github/workflows/release.yml](.github/workflows/release.yml) — Release automation
- [.github/workflows/deploy.yml](.github/workflows/deploy.yml) — Cloudflare Pages deployment
- [.github/workflows/codeql-analysis.yml](.github/workflows/codeql-analysis.yml) — CodeQL static analysis
- [.github/workflows/scorecard.yml](.github/workflows/scorecard.yml) — OpenSSF Scorecard

Audit results and insights are available at the [Step Security dashboard](https://app.stepsecurity.io/).

## Release & Publishing

### Automated Release

Releases are automated with [Semantic Release](https://semantic-release.gitbook.io/). On every **push to `main`**:

1. **Test** job runs: lint, unit tests (Vitest), and build.
2. **Release** job runs only if tests pass: Semantic Release analyzes commits, bumps the version, updates `package.json` and `CHANGELOG.md`, pushes a release commit, and creates a GitHub release.
3. **Deploy** job runs if a new release was created: builds and deploys to Cloudflare Pages.

Use [Conventional Commits](https://www.conventionalcommits.org/) so versions and changelog are derived from commit messages:

- `feat: ...` → minor release (e.g. 1.1.0)
- `fix: ...` → patch (e.g. 1.0.1)
- `feat!: ...` or `fix!: ...` → major (e.g. 2.0.0)
- `docs:`, `chore:`, etc. → no release (included in changelog when relevant)

Workflow: [.github/workflows/release.yml](.github/workflows/release.yml).

### Deployment

Deployment to [Cloudflare Pages](https://pages.cloudflare.com/) is triggered automatically after a successful release. The build adapter is `@sveltejs/adapter-cloudflare`.

**Required Secrets** (in GitHub repository settings):

| Secret | Description |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Pages deploy permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `SUPABASE_URL` | Supabase project URL (production) |
| `SUPABASE_ANON_KEY` | Supabase anon key (production) |
| `GITHUB_APP_ID` | GitHub App ID (production) |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key (production) |
| `MISTRAL_API_KEY` | Mistral API key (production) |

## Stack

- **Framework**: Svelte 5 + SvelteKit 2
- **Styling**: Tailwind CSS 4
- **UI Components**: [bits-ui](https://www.bits-ui.com/), [lucide-svelte](https://lucide.dev/), [layerchart](https://layerchart.com/)
- **Auth & Database**: [Supabase](https://supabase.com/) (GitHub OAuth + PostgreSQL)
- **GitHub API**: [@octokit/rest](https://github.com/octokit/rest.js)
- **AI**: [Vercel AI SDK](https://sdk.vercel.ai/) + [@ai-sdk/mistral](https://sdk.vercel.ai/providers/ai-sdk-providers/mistral)
- **Graph Visualization**: [@xyflow/svelte](https://svelteflow.dev/)
- **Deployment**: Cloudflare Pages via [@sveltejs/adapter-cloudflare](https://kit.svelte.dev/docs/adapter-cloudflare) + Wrangler
- **Testing**: [Vitest 3](https://vitest.dev/) + v8 coverage + [Codecov](https://codecov.io/)
- **Linting**: ESLint 9 + `eslint-plugin-svelte` + `typescript-eslint`
- **Packaging**: PNPM 10
