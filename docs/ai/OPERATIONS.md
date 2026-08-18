# CVitae — Operations

## Production Branch
`feature/aws-migration`
Never touch `main`.

## Deploy Model
```
git push → Netlify Git build → production (automatic)
```
NO manual deploy after push. NO `netlify deploy`. NO `netlify deploy --prod`.

## Build Commands
```bash
pnpm dev          # local dev server localhost:3000
pnpm build        # Vite production build (local only)
pnpm preview      # preview local build
```

Production-context QA (runs Netlify CI behavior):
```bash
netlify build --context production
```

Post-build (Netlify CI only — do NOT run manually in dev):
```bash
node scripts/prerender.mjs
node scripts/generate-sitemap.mjs
node scripts/generate-robots.mjs
```

## DB
```bash
supabase db lint --linked    # lint without printing secrets
```
Never print secret env values. Verify existence only.

## Environment Layers
| Layer | How |
|---|---|
| local | `.env` (may point to local services) |
| production | Netlify env vars |
| dry-run | `SEO_DRY_RUN=true` / `SEO_GOOGLE_INDEXING=false` |

Always confirm which layer a command targets before running.

## Graphify — Graph Maintenance
```bash
graphify update .            # incremental AST rebuild (no LLM)
graphify update . --force    # force full rebuild
graphify query "..."         # BFS traversal
graphify path "A" "B"        # shortest path between nodes
graphify explain "X"         # focused concept explanation
```

Graph lives in `graphify-out/` (gitignored, local only).
Hook: post-commit and post-checkout hooks installed → auto-rebuild on code changes.
Code always wins over graph. When in doubt, read the source.

## Stack
React 19 + Vite + Wouter · Tailwind CSS v4
Supabase (Postgres + Auth + Edge Functions, Deno runtime)
Netlify Functions (TypeScript, Node.js)
AWS Bedrock (`global.anthropic.claude-sonnet-4-6`, us-east-1) via Netlify Functions
Resend (email)

## No Test Runner
No test runner configured. Manual QA via `scripts/verify-*.ts` scripts.
