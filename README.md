# AI Training

A web platform for AI training courses: a public catalogue of courses by area and level, a
learner area with the materials of each learner's courses, and a trainer back-office to manage
courses, materials and users. Portuguese and English.

Built with Next.js (App Router) and Supabase (Auth, Postgres, Storage).

> Work in progress. Setup and go-live instructions are completed as the build advances.

## Requirements

- Node.js 22 (`.nvmrc`) and npm
- Docker, for the local Supabase stack

## Getting started

```bash
npm install
npm run db:start      # local Supabase: database, auth, storage, mail catcher
npm run env:local     # writes the local URL and keys to .env.local
npm run seed:dev      # demo accounts, enrolments and a sample PDF
npm run dev
```

`npm run db:start` applies the migrations in `supabase/migrations` and loads the demo catalogue
from `supabase/seed.sql`. `npm run db:reset` rebuilds the database from scratch; run
`npm run seed:dev` again afterwards.

Demo accounts (local only, password `demo-password-123`):

| Role    | Email                   |
| ------- | ----------------------- |
| Trainer | `formador@example.test` |
| Learner | `ana@example.test`      |
| Learner | `john@example.test`     |

Emails sent locally (invitations, password resets) are caught at <http://127.0.0.1:54324>.

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
| `npm run test:integration` | Database and API rules against the local Supabase stack    |
| `npm run e2e`              | End-to-end tests (Playwright) against the production build |
| `npm run db:start`         | Start the local Supabase stack (`db:stop` stops it)        |
| `npm run db:reset`         | Rebuild the local database from migrations and seed        |
| `npm run db:types`         | Regenerate `src/lib/supabase/database.types.ts`            |
| `npm run env:local`        | Write the local stack's URL and keys to `.env.local`       |
| `npm run seed:dev`         | Create the demo accounts, enrolments and sample PDF        |

## Sign-in and invitations

The platform is closed: there is no public sign-up. Accounts are created by trainers.

- A trainer invites a person by email. The email links to `/{language}/auth/confirm`, which
  shows a "Continue" button; the one-time token is only used when that button is pressed, so
  mail scanners that open links cannot use it up. The person then chooses a password.
- "Forgot password" follows the same path. A link that has expired or was already used leads
  to a screen where the person can ask for a new one.
- Emails are bilingual (`supabase/templates`), in the language stored for the user.

To create the first trainer (or promote an existing account):

```bash
npm run bootstrap-trainer -- person@example.org --name "Full Name" --locale pt
```

It prints a one-time activation link to send to that person.

## Database and access rules

All access rules live in the database, in `supabase/migrations`:

- Nothing in the `public` schema is reachable through the API without an explicit grant, and
  every table has Row Level Security.
- Visitors read areas, levels and published courses. Learners also read the modules and
  published materials of the courses they are enrolled in. Trainers manage everything.
- Uploaded files sit in a private bucket; a learner can only fetch files that belong to a
  published material of a course they may open.
- A user's role is never taken from data the user can edit, and the last trainer can be neither
  demoted nor deleted.

`npm run test:integration` checks each of these rules as a visitor, an enrolled learner, a
learner who is not enrolled, and a trainer. The tests create and delete users, so they refuse to
run against anything but a local stack.
