# AI Training

A web platform for AI training courses: a public catalogue of courses by area and level, a
learner area with the materials of each learner's courses, and a trainer back-office to manage
courses, materials and users. Portuguese and English.

Built with Next.js (App Router) and Supabase (Auth, Postgres, Storage).

## Status

| Part                                                             | State                           |
| ---------------------------------------------------------------- | ------------------------------- |
| Database, access rules, file storage                             | Done, tested                    |
| Sign-in, invitations, password reset, bilingual emails           | Done, tested in the browser     |
| Logic behind every screen (queries, changes, validation, embeds) | Done, tested against a database |
| File downloads, security headers                                 | Done, tested in the browser     |
| Public site: landing page, catalogue, course page, request form  | Done, tested in the browser     |
| Learner area: my courses, materials, PDF and document viewers    | Not built yet                   |
| Back-office screens: courses, materials, users, requests         | Not built yet                   |

Signed-in learners and trainers currently land on placeholder pages. The interface text, the
privacy notice and the demo catalogue are placeholders to be replaced (see "Going live").

Everything was exercised against a local Supabase stack. The go-live steps at the end of this
file use the Supabase CLI as it documents itself; they have not been rehearsed against a hosted
project yet.

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

| Command                     | What it does                                               |
| --------------------------- | ---------------------------------------------------------- |
| `npm run dev`               | Start the development server                               |
| `npm run build`             | Production build                                           |
| `npm run start`             | Serve the production build                                 |
| `npm run lint`              | ESLint                                                     |
| `npm run format`            | Format with Prettier (`format:check` only checks)          |
| `npm run typecheck`         | Generate route types and type-check the app and e2e code   |
| `npm test`                  | Unit tests (Vitest)                                        |
| `npm run test:integration`  | Database and API rules against the local Supabase stack    |
| `npm run e2e`               | End-to-end tests (Playwright) against the production build |
| `npm run db:start`          | Start the local Supabase stack (`db:stop` stops it)        |
| `npm run db:reset`          | Rebuild the local database from migrations and seed        |
| `npm run db:types`          | Regenerate `src/lib/supabase/database.types.ts`            |
| `npm run env:local`         | Write the local stack's URL and keys to `.env.local`       |
| `npm run seed:dev`          | Create the demo accounts, enrolments and sample PDF        |
| `npm run bootstrap-trainer` | Create the first trainer and print their activation link   |
| `npm run verify-project`    | Check that a Supabase project is set up as the app expects |

## How the code is organised

```
supabase/migrations     tables, access rules, storage bucket: the source of truth for who sees what
supabase/templates      the bilingual emails
messages/               every piece of interface text, in pt.json and en.json
src/app/                pages and routes (thin: they call the layers below)
src/features/<area>/    one folder per subject (courses, materials, users, requests, ...)
  schemas.ts            what a form may contain, with messages in both languages
  operations.ts         what changes data; takes a Supabase client, returns a plain result
  actions.ts            the form handlers: check who is asking, validate, call an operation
src/lib/dal/            what reads data, for the public site, learners and trainers
src/lib/embeds/         turns a pasted YouTube, Vimeo or Google link into a safe frame address
src/lib/security/       security headers, route rules, safe redirects
src/config/site.ts      the name of the platform, area colours and icons
src/app/globals.css     colours, fonts and radii: the one place to change the look
```

Two rules hold everywhere:

- **The database decides access.** Reads and changes run with the visitor's own session, so
  Row Level Security applies even if a page forgets a check. The secret key is used in one
  module, only for what needs it (inviting and removing accounts, storing public information
  requests), and only after the code has confirmed the caller is a trainer.
- **Text is bilingual by column.** Catalogue names and titles are required in both languages;
  modules and materials need one, and the interface falls back to the other and says so.

## Sign-in and invitations

The platform is closed: there is no public sign-up. Accounts are created by trainers.

- A trainer invites a person by email. The email links to `/{language}/auth/confirm`, which
  shows a "Continue" button; the one-time token is only used when that button is pressed, so
  mail scanners that open links cannot use it up. The person then chooses a password.
- "Forgot password" follows the same path. A link that has expired or was already used leads
  to a screen where the person can ask for a new one.
- Emails are bilingual (`supabase/templates`), in the language stored for the user.
- When no email provider is set up, or sending fails, the back-office shows a link the trainer
  can copy and send by any other means.

To create the first trainer (or promote an existing account):

```bash
npm run bootstrap-trainer -- person@example.org --name "Full Name" --locale pt
```

It prints a one-time activation link to send to that person.

## Materials

| Kind            | How it is shown                                                                    |
| --------------- | ---------------------------------------------------------------------------------- |
| Uploaded file   | Private storage; PDFs open in the built-in viewer, other files download            |
| Video           | YouTube (cookie-free player) or Vimeo, loaded when the learner presses play        |
| Google document | Slides, Docs, Sheets or a Drive file, embedded from the normal sharing link        |
| Link            | Opens the other site in a new tab                                                  |
| Text page       | Written in Markdown in the back-office; raw HTML and remote images are not allowed |

Two things worth knowing:

- **Google files are protected by Google, not by this platform.** To be embedded, a file must
  be shared as "anyone with the link can view", so anyone who obtains the link can open it.
  Upload confidential material as a PDF instead: uploaded files can only be fetched by
  enrolled learners, through links that expire after a minute.
- Uploads go straight from the trainer's browser to storage, up to 50 MB per file (the limit of
  Supabase's Free plan; it can be raised on paid plans in the bucket settings and in
  `src/lib/files/rules.ts`).

## Database and access rules

All access rules live in the database, in `supabase/migrations`:

- Nothing in the `public` schema is reachable through the API without an explicit grant, and
  every table has Row Level Security.
- Visitors read areas, levels and published courses. Learners also read the modules and
  published materials of the courses they are enrolled in. Trainers manage everything.
- A course is a draft (trainers only), published (public site and enrolled learners) or
  unlisted (off the public site; enrolled learners keep access). A course with learners cannot
  be deleted, only unlisted.
- Uploaded files sit in a private bucket; a learner can only fetch files that belong to a
  published material of a course they may open.
- A user's role is never taken from data the user can edit, and the last trainer can be neither
  demoted nor deleted.

The app also sends a Content Security Policy and related headers with every response
(`src/lib/security/headers.ts`): scripts only from the site itself, frames only from the video
and Google hosts, and the site can never be shown inside another site.

## Tests

- `npm test`: unit tests for the pieces that need no database (address parsing, Markdown
  safety, form validation in both languages, colour contrast of the theme, security headers).
- `npm run test:integration`: every access rule and every data change, run against the local
  stack as a visitor, an enrolled learner, a learner who is not enrolled, and a trainer.
  They create and delete users, so they refuse to run against anything but a local stack.
- `npm run e2e`: the journeys in a real browser at desktop and phone sizes, reading emails
  from the local mail catcher. Run `npm run build` first.

## Going live

You need: a Supabase project, an email-sending provider (SMTP) for your domain, hosting for
the app (Vercel is the natural fit for Next.js), and a domain.

**Keys never go into the repository or into a chat.** They belong in your hosting provider's
environment settings and, on your own computer, in `.env.local` (which Git ignores).

### 1. Create the Supabase project

In the Supabase dashboard, create a project in an EU region. Keep the database password it
shows you. The project ref is the 20-letter name in the project's URL.

The Free plan is fine for trying things out. For real courses, the paid plan is the realistic
choice: Free projects are paused after a week without activity, hold 1 GB of files, and have no
automatic backups.

### 2. Create the database

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push --remote --dry-run    # lists what would be applied
npx supabase db push --remote
```

This creates the tables, the access rules and the storage bucket. It does not load the demo
catalogue: that is only for local development.

### 3. Sign-in settings and emails

The settings the app relies on are written in `supabase/config.toml`. At the end of that file
there is a commented block for the hosted project: uncomment it and fill in your project ref,
the public address of the app and your SMTP details. Then:

```bash
export SMTP_PASSWORD='...'       # in your own terminal; it is read from here, not from the file
npx supabase config diff         # shows what would change, changes nothing
npx supabase config push         # asks before applying
```

What this puts in place (all visible afterwards in the dashboard, under Authentication):

| Setting                          | Value                                            | Why                                                           |
| -------------------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| Allow new users to sign up       | Off                                              | Accounts only come from invitations                           |
| Confirm email                    | On                                               | An invitation only counts once accepted                       |
| Minimum password length          | 10                                               | Matches what the app asks for                                 |
| Email one-time code              | 10 characters, valid 24 hours                    | Invitation and reset links stay usable for a day              |
| Site URL and redirect allow-list | The public address of the app                    | Links in emails point to the right place                      |
| Email templates                  | Invite, reset password, magic link               | Bilingual, and every link opens the "Continue" page           |
| SMTP                             | Your provider                                    | The built-in mailer only writes to project members, 2 an hour |
| Rate limits                      | 150 sign-ins and 150 verifications per 5 minutes | A whole class signing in from one network at the same time    |

Until SMTP is set up, invitations still work through the "copy link" button.

### 4. Deploy the app

Import the repository into your hosting provider (Node.js 22) and set these environment
variables there. The two keys are in the Supabase dashboard under Project Settings, API keys.

| Variable                               | Value                                                     |
| -------------------------------------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://<your-project-ref>.supabase.co`                  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The publishable key (`sb_publishable_...`)                |
| `SUPABASE_SECRET_KEY`                  | The secret key (`sb_secret_...`). Server only.            |
| `NEXT_PUBLIC_SITE_URL`                 | The public address of the app, e.g. `https://your-domain` |

The build reads the public catalogue from the database, so the variables must be set before
the first build.

### 5. Create the first trainer

On your own computer, put the same four values in `.env.local`, then:

```bash
npm run bootstrap-trainer -- you@your-domain --name "Your Name" --locale pt
```

Open the link it prints, choose a password, and you are in the back-office. Further trainers
and all learners are invited from there.

### 6. Check

```bash
npm run verify-project
```

It reads the project's settings and tries what an anonymous visitor could try, without
changing anything, and lists what is in order and what to fix. When you are done, restore your
local values with `npm run env:local`.

### Before the first class

- Replace the placeholder name and copy: `src/config/site.ts`, `messages/pt.json` and
  `messages/en.json`, and the privacy notice.
- Send yourself an invitation and a password reset, in both languages.
- If a whole room will sign in at once from one network, keep the rate limits from step 3.
- Decide who backs up the database (automatic on paid plans).
