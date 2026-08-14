# Recipe Collector web foundation

This directory contains the web foundation for Recipe Collector. It is intentionally self-contained while the coordinator reconciles the canonical cross-platform data contracts.

## Stack

- React + TypeScript + Vite
- TanStack Router with file-based route files under `src/routes/`
- TanStack Query for server-state access
- Tailwind CSS v4 with shadcn/ui-style components under `src/components/ui/`
- Supabase JS through a small typed adapter in `src/lib/supabase.ts`
- Vitest + Testing Library for fast unit and component checks

## Commands

Run commands from `apps/web`:

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

The TanStack Router Vite plugin keeps the file-based route tree in sync during Vite commands. Routes currently include:

- `/` — recipe library
- `/import` — legacy redirect to the library import form
- `/recipes/$recipeId` — recipe detail, portion scaling, source link, and guided cooking

## Environment

Copy `.env.example` to `.env.local` when connecting a Supabase project:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Both values must be valid for remote mode. If either value is missing or invalid, the app deliberately uses a local demo adapter: sample recipes render, URL submissions remain in memory, and no network calls are made. This keeps UI work and tests safe without exposing or requiring secrets.

For a local Supabase stack, `.env.local` can also enable development-only automatic sign-in with the account seeded by `supabase/seed.sql`:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=your-local-anon-key
VITE_LOCAL_AUTO_SIGN_IN=true
VITE_LOCAL_DEMO_EMAIL=dev@example.com
VITE_LOCAL_DEMO_PASSWORD=devpassword123
```

Production builds ignore the automatic sign-in configuration. Run the real local persistence scenario with `pnpm test:e2e:local` from `apps/web` after starting Supabase and serving `import-recipe-v2`.

The adapter's recipe, ingredient, step, and import types are local contracts for this scaffold. They are deliberately small and should be reconciled with the canonical Supabase/mobile contracts before expanding the remote data surface.
