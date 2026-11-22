# AI Training

A web platform for AI training courses: a public catalogue of courses by area and level, a
learner area with the materials of each learner's courses, and a trainer back-office to manage
courses, materials and users. Portuguese and English.

Built with Next.js (App Router) and Supabase (Auth, Postgres, Storage).

> Work in progress. Setup and go-live instructions are completed as the build advances.

## Requirements

- Node.js 22 (`.nvmrc`)
- npm

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Scripts

| Command                    | What it does                                               |
| -------------------------- | ---------------------------------------------------------- |
| `npm run dev`              | Start the development server                               |
| `npm run build`            | Production build                                           |
| `npm run start`            | Serve the production build                                 |
| `npm run lint`             | ESLint                                                     |
| `npm run format`           | Format with Prettier (`format:check` only checks)          |
| `npm run typecheck`        | Generate route types and type-check the app and e2e code   |
| `npm test`                 | Unit tests (Vitest)                                        |
| `npm run test:integration` | Database and API rules against a local Supabase stack      |
| `npm run e2e`              | End-to-end tests (Playwright) against the production build |
