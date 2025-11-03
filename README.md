# movi Monorepo (Scaffold)

Structure:
- apps/web: Next.js frontend (SSR)
- apps/api: Express + Socket.IO backend (REST + realtime)
- packages/types: shared TypeScript types used by frontend and backend

Quick start (requires pnpm):
1. Install pnpm: https://pnpm.io/installation
2. From repo root: `pnpm install`
3. Run api: `pnpm --filter api dev`
4. Run web: `pnpm --filter web dev`
5. Open http://localhost:3000

Notes:
- This is a minimal scaffold to start development quickly.
- Replace in-memory demo data with Postgres + Prisma as next step.
