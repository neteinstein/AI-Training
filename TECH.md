# Technical guide

Everything you need to run, change, test and deploy **AI Training**. For what the platform does
and how it looks, see the [README](README.md).

**Contents:** [Stack](#stack) · [Status](#status) · [Requirements](#requirements) ·
[Getting started](#getting-started) · [Scripts](#scripts) ·
[How the code is organised](#how-the-code-is-organised) · [The back-office](#the-back-office) ·
[Sign-in and invitations](#sign-in-and-invitations) · [Materials](#materials) ·
[Backups](#backups) · [Database and access rules](#database-and-access-rules) · [Tests](#tests) ·
[Screenshots](#screenshots) · [Going live](#going-live)

## Stack

| Layer     | Choice                                                                          |
| --------- | ------------------------------------------------------------------------------- |
| Framework | Next.js 16 (App Router, Server Actions) and React 19                            |
| Language  | TypeScript 6                                                                    |
| Data      | Supabase: Postgres with Row Level Security, Auth, Storage                       |
| Styling   | Tailwind CSS 4, Base UI and shadcn components, Lucide icons                     |
| i18n      | next-intl, with Portuguese and English message files in `messages/`             |
| Forms     | Server Actions validated with Zod, messages in both languages                   |
| Content   | react-markdown with `rehype-sanitize`, react-pdf for the PDF viewer             |
| Uploads   | tus-js-client: resumable uploads straight to Supabase Storage                   |
| Tests     | Vitest (unit and integration), Playwright with axe-core (end to end, WCAG)      |
| CI        | GitHub Actions: lint, formatting, types, unit, database rules and browser tests |
| Runtime   | Node.js 22                                                                      |

## Status

| Part                                                              | State                           |
| ----------------------------------------------------------------- | ------------------------------- |
| Database, access rules, file storage                              | Done, tested                    |
| Sign-in, invitations, password reset, bilingual emails            | Done, tested in the browser     |
| Logic behind every screen (queries, changes, validation, embeds)  | Done, tested against a database |
| File downloads, security headers                                  | Done, tested in the browser     |
| Public site: landing page, catalogue, course page, request form   | Done, tested in the browser     |
| Learner area: my courses, materials, PDF and document viewers     | Done, tested in the browser     |
| Back-office: courses, content, users, invitations, requests       | Done, tested in the browser     |
| Back-office backup: ZIP download of content, files and people     | Done, tested in the browser     |
| Editions of a course: own learners, own view of the content       | Done, tested in the browser     |
| Progress: what each learner has opened, for them and for trainers | Done, tested in the browser     |
| Quizzes: written by trainers, answered and graded, results kept   | Done, tested in the browser     |

The interface text, the privacy notice and the demo catalogue are placeholders to be replaced
(see "Going live").

Everything was exercised against a local Supabase stack, and the browser tests also against the
app running as a Cloudflare Worker. The hosted project has the migrations (applied and recorded
under the files' versions) and a first trainer; its sign-in settings and SMTP (step 3) are not
pushed yet.

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

The demo course "IA na sala de aula" has two editions: the general one, and a public "Turma
presencial" that starts six weeks after the day the database was built, with a page of its own
and one of the course's materials hidden.

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
| `npm run screens:frame`     | Frame the saved screens into the README's pictures         |
| `npm run og:image`          | Draw the link-preview picture, `public/og-image.png`       |
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
src/components/trainer/ the pieces every back-office screen shares (frame, rows, menus, messages)
src/lib/dal/            what reads data, for the public site, learners and trainers
src/lib/embeds/         turns a pasted YouTube, Vimeo or Google link into a safe frame address
src/lib/security/       security headers, route rules, safe redirects
src/config/site.ts      the name of the platform, area colours and icons
src/app/globals.css     colours (light and dark), heading weight, radii and shadows: the one place to change the look
src/lib/theme.ts        light or dark: the person's choice, else the device's, set before the page is drawn
src/app/fonts/          the typefaces (Manrope for headings, Inter for text), served by the site itself
```

Two rules hold everywhere:

- **The database decides access.** Reads and changes run with the visitor's own session, so
  Row Level Security applies even if a page forgets a check. The secret key is created in one
  module and used for two things only: inviting, re-inviting and removing accounts, after the
  code has confirmed the caller is a trainer; and storing a request sent through the public
  form, which visitors cannot write to the database themselves.
- **Text is bilingual by column.** Catalogue names and titles are required in both languages;
  modules and materials need one, and the interface falls back to the other and says so.

And one more for the back-office:

- **Every form handler checks who is calling.** A Server Action is an address anyone can post
  to, whatever the pages show them, so each one starts by confirming the caller is a trainer
  (`src/lib/actions/trainer.ts`). A unit test fails when a handler is added without that check,
  and a browser test posts to two of them as a visitor, a learner and a trainer.

## The back-office

Trainers sign in at the same address as learners and land on the back-office (`/trainer`):

- **Courses**: create and describe a course in both languages, order the list (it is the order
  of the public site), and set its status. A course needs both summaries before it can leave
  draft.
- **Content**: modules and their materials, with a switch that shows or hides each material
  for learners, "make everything visible" per module, and a menu to edit, move to another
  module or delete. A new material is visible unless the trainer unticks that option.
- **Editions** of a course: its runs, each with a name in both languages, optional dates, and
  whether it shows on the public page. One is the default, where new learners go when no
  other is chosen. An edition with learners cannot be deleted, nor can a course's last one.
  Once a course has two, the content tab offers a view per edition: a switch hides one of the
  course's materials in that edition only, and materials added there are that edition's own.
  Order, modules and deleting stay in the "whole course" view. "View as learner" follows the
  view, so a trainer sees exactly what each edition gets.
- **Learners** of a course: add people who have an account, remove them, or invite new ones.
  With several editions the list is grouped by edition, people are added to the one chosen,
  and a menu moves a person to another. Dates are information: they never open or close
  access; being in the course does.
- **Areas and levels**: the two lists courses are organised by. One in use cannot be deleted.
- **Users**: everyone with an account or a pending invitation; a person's page holds their
  details, role, courses, a new access link, and removal.
- **Invitations**: one or many addresses, by email or as links to pass on by hand. Someone who
  already has an account just gets the new courses.
- **Requests** from the public form: mark as contacted, archive, delete, or invite the person
  with what they wrote (name, address, language, course).
- **Backup**: download everything as a ZIP file (see [Backups](#backups)).

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

| Kind            | How it is shown                                                                        |
| --------------- | -------------------------------------------------------------------------------------- |
| Uploaded file   | Private storage; PDFs open in the built-in viewer, other files download                |
| Video           | YouTube (cookie-free player) or Vimeo, loaded when the learner presses play            |
| Google document | Slides, Docs, Sheets or a Drive file, embedded from the normal sharing link            |
| Link            | Opens the other site in a new tab                                                      |
| Text page       | Written in Markdown in the back-office; raw HTML and remote images are not allowed     |
| Quiz            | Questions with answers to choose; graded when handed in, as often as the learner likes |

Two things worth knowing:

- **Google files are protected by Google, not by this platform.** To be embedded, a file must
  be shared as "anyone with the link can view", so anyone who obtains the link can open it.
  Upload confidential material as a PDF instead: uploaded files can only be fetched by
  enrolled learners, through links that expire after a minute.
- Uploads go straight from the trainer's browser to storage, in pieces that are retried when
  the connection drops, up to 50 MB per file (the limit of Supabase's Free plan; it can be
  raised on paid plans in the bucket settings and in `src/lib/files/rules.ts`). The browser is
  given a token that is good for that one file only; the file's type and size are checked
  before the upload, by the storage service during it, and again when the material is saved.

## Backups

The back-office's **Backup** page (`/trainer/backup`) downloads the platform as a ZIP file. Its
form posts to `src/app/api/trainer/backup/route.ts`, and the archive is laid out by
`src/features/backup/archive.ts`:

```
README.txt             what follows, in Portuguese and English
data/<table>.json      every row of each table, every column, as the database holds it
files/<course>/<name>  the uploaded files, one folder per course slug, under their original names
manifest.json          when and by whom, what was included, rows per table, and for each file
                       its material and storage path (plus any file storage did not have)
```

- **Always in it:** areas, levels, courses and their editions, modules and materials (so text
  pages, links and the addresses of videos and Google documents), what each edition hides, and
  the quizzes' questions with their right answers and explanations.
- **Ticked by default:** the uploaded files. Untick them for a small, text-only backup.
- **Unticked by default:** people (`profiles`, `enrollments`, `info_requests`), what each of
  them has opened (`material_progress`) and the quizzes they handed in (`quiz_attempts`). It is
  personal data, and the page says so.
- **Never in it:** passwords (accounts live in Supabase Auth; after a restore people would be
  invited again) and the content of videos and Google documents, which stays with those
  services.

How it works, and what follows from it:

- It reads with the trainer's own session, like every page, so Row Level Security applies; the
  secret key is not used. The route checks the form's origin and that the caller is a trainer
  before reading anything (a unit test reads the route and fails if that order changes).
- The archive is written while it downloads. The rows are read first (page by page, as the API
  returns at most 1,000 rows per request), then each file is fetched from storage only when the
  archive reaches it. The server holds a chunk at a time, not the archive, so the size of the
  backup does not matter to the Worker's memory. Files are stored uncompressed (they mostly are
  already); the JSON is compressed.
- The tables are read one after another, not as one snapshot: an edit made by someone else
  during those few seconds may show in one table and not yet in another.
- Files are fetched with the trainer's access token, which lasts an hour. A download slower
  than that fails rather than leaving files out; so does any storage error other than a missing
  file. A missing file is skipped and listed under `missingFiles` in the manifest.
- The ZIP format needs its ZIP64 extension past 4 GB, which the library used (fflate) does not
  write. A backup whose files add up to more than that is refused with a message suggesting a
  backup without files. On the Free plan, storage holds 1 GB.

There is no restore button. The rows are exactly what the database holds, so a restore inserts
the tables in the order of `data/` above (areas, levels, courses, editions, modules, materials,
what each edition hides, the quizzes' questions, options and keys, then profiles once the
accounts exist again, enrolments, requests, progress and quiz attempts) and uploads each file
back to the `course-materials` bucket under its `storagePath`.
On a paid Supabase plan, the project's own daily database backups cover the database as well;
they do not cover stored files.

**A new table** goes into one of the two lists in `src/lib/dal/backup.ts`: the content, or the
people when it holds personal data. A table that should stay out is named there too, with the
reason. A unit test compares the three with the tables of the database and fails for a table
nobody has decided about, so a backup cannot go on leaving out something new unnoticed.

## Database and access rules

All access rules live in the database, in `supabase/migrations`:

- Nothing in the `public` schema is reachable through the API without an explicit grant, and
  every table has Row Level Security.
- Visitors read areas, levels, published courses and the editions of those courses that a
  trainer marked as public. Learners also read the modules of the courses they are enrolled
  in, and the published materials their edition shows. Trainers manage everything.
- Which materials a learner may see is defined once, in two views of the `private` schema
  that no API role can read (`edition_materials`: what an edition shows; `learner_materials`:
  what each learner gets). The rule on materials and the rule on stored files both read them,
  so a page and a download can never disagree. A learner is in one edition of a course at a
  time; moving them changes what they see at once.
- A course is a draft (trainers only), published (public site and enrolled learners) or
  unlisted (off the public site; enrolled learners keep access). A course with learners cannot
  be deleted, only unlisted.
- Uploaded files sit in a private bucket; a learner can only fetch files that belong to a
  published material of a course they may open.
- What a learner has opened is kept in `material_progress`, one row per person and material.
  Nobody writes it directly: the function `record_material_open` notes an opening, and only
  for a learner and a material their edition shows. A learner reads their own rows, a trainer
  everyone's. Progress is counted against what the learner's edition shows now, so hiding a
  material or moving someone changes the count at once. Opening is noted on the server, where
  the material's page is drawn, where a file is fetched (`/api/materials/[id]/download`) and
  where a link is followed (`/api/materials/[id]/open`, which then sends the browser on).
  Deleting a material deletes what was noted about it.
- A quiz is a material whose questions and answers are in `quiz_questions` and `quiz_options`,
  readable by whoever may open the quiz. **Which answers are right, and the explanations, are
  in a table of their own (`quiz_question_keys`) that only trainers can read.** A learner gets
  them in one place only: the answer of `submit_quiz`, which grades what was handed in, keeps
  the attempt (`quiz_attempts`, with a copy of what was asked, chosen and right) and marks the
  quiz as done. Nothing is kept when a trainer tries a quiz. Quizzes are written through
  `save_quiz`, which replaces all questions at once; the app only calls it when the questions
  changed, because a form opened before the change has to be opened again. A quiz without
  questions is shown to no learner. Deleting a quiz deletes its attempts.
- A user's role is never taken from data the user can edit, and the last trainer can be neither
  demoted nor deleted.

The app also sends a Content Security Policy and related headers with every response
(`src/lib/security/headers.ts`): scripts only from the site itself, frames only from the video
and Google hosts, and the site can never be shown inside another site.

## Tests

- `npm test`: unit tests for the pieces that need no database (address parsing, Markdown
  safety, form validation in both languages, colour contrast of both themes, security headers),
  and checks that read the source: every form handler has its access check, the secret key is
  used only where decided, the validation library stays out of the browser.
- `npm run test:integration`: every access rule and every data change, run against the local
  stack as a visitor, an enrolled learner, a learner who is not enrolled, and a trainer.
  They create and delete users, so they refuse to run against anything but a local stack.
  Both this suite and the next first wait until the stack sends the project's own emails: for
  about ten seconds after it starts, the local sign-in service still uses its built-in ones.
- `npm run e2e`: the journeys in a real browser at desktop and phone sizes, reading emails
  from the local mail catcher. Run `npm run build` first. Besides the journeys (building a
  course, uploading a file, inviting someone who then activates the account and reads the
  materials, a request becoming an invitation, a backup downloaded and unpacked) they include:
  - the automated accessibility rules (WCAG 2.1 A and AA) on every main screen, in the light
    and in the dark theme;
  - the back-office used with the keyboard alone (menus, dialogs, switches, reordering);
  - no sideways scrolling at 320 px;
  - the security policy blocking nothing the pages need, and back-office form handlers
    refusing a visitor and a learner who post to them directly.

CI (`.github/workflows/ci.yml`) runs all of this on every pull request and on `main`, in three
jobs. Besides the tests:

- the database job regenerates `src/lib/supabase/database.types.ts` and fails when the
  committed file is out of date; the right file is kept with the run (artifact
  `database-types`);
- one job can be started on its own, on any branch: Actions → CI → Run workflow.

## Screenshots

The pictures in the [README](README.md) live in `docs/screenshots/`. They are the real screens
of the app, captured against the demo data and then framed in a browser window or a phone.

The captures come from `e2e/screens.spec.ts`, which is not a test of behaviour: with
`SCREENS=1` it saves a picture of every main screen, at desktop and phone size and in both
themes, into `e2e-screens/` (ignored by Git). CI does this on every run and keeps the pictures
for a week.

To refresh the README's pictures, first put the captures in `e2e-screens/`, either by saving
them yourself:

```bash
npm run db:start && npm run env:local && npm run seed:dev
npm run build
SCREENS=1 npx playwright test e2e/screens.spec.ts
```

or by taking them from a CI run (the run's number is in its address on GitHub):

```bash
rm -rf e2e-screens && gh run download <run number> -n screens -D e2e-screens
```

Then frame them. This rewrites every picture in `docs/screenshots/`; name some, such as
`npm run screens:frame -- hero mobile`, to redo only those.

```bash
npm run screens:frame
```

Which screen goes in which picture, and how far down each one is cut, is set at the bottom of
`scripts/frame-screens.mjs`. When a screen grows or a caption in the README changes, adjust it
there. The demo data is in Portuguese, the default language, so that is what the pictures show.

## Going live

You need: a Supabase project, an email-sending provider (SMTP) for your domain, hosting for
the app, and a domain. This installation runs on Cloudflare Workers at
<https://training.pedrovicente.pt> (step 4), with the Supabase project `wsyxnxtinvhnecmwkhzt`.

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

#### Later changes to the database

After that first time, GitHub applies new migrations: the workflow **Database**
(`.github/workflows/database.yml`) runs the same `supabase db push` against the hosted project.
The host rebuilds the site from every push to `main` but knows nothing about the database, and
code that needs a new table must not go live before the table exists. So a change to the
database goes out in this order:

1. On the pull request's branch, start the workflow by hand (Actions, Database, Run workflow).
   Left as it is, it only lists what would be applied.
2. Start it again with "apply" ticked, and wait for it to succeed.
3. Merge. The run that follows on `main` finds nothing left to do. Had the first two steps been
   skipped, that run would apply the change, a little after the site was rebuilt.

For a short while the code that is live meets the new database, so write migrations that the
running site can live with: add first, and remove only in a later change, once nothing uses
what is removed.

The workflow needs two repository secrets (GitHub: Settings, Secrets and variables, Actions).
The project it writes to is named at the top of the workflow file.

| Secret                  | What it is                                                   |
| ----------------------- | ------------------------------------------------------------ |
| `SUPABASE_ACCESS_TOKEN` | A token from the Supabase dashboard (Account, Access Tokens) |
| `SUPABASE_DB_PASSWORD`  | The database password of the project                         |

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

The public values are written into the browser code at build time, so set them before the
first build.

#### On Cloudflare (training.pedrovicente.pt)

The repository is set up to run as a Cloudflare Worker through the OpenNext adapter:
`wrangler.jsonc` (name, domain, public values, cache storage) and `open-next.config.ts`.
Cloudflare builds and deploys every push to `main` itself (Workers Builds, connected to this
repository: Cloudflare dashboard, Workers, ai-training, Settings, Build). The build runs
`npm run cf:build` with the three `NEXT_PUBLIC_` values set as build variables there, then
`npx opennextjs-cloudflare deploy`. The cache storage (a KV namespace and a D1 database)
exists on the Cloudflare account.

Public pages read the catalogue from the database on every visit: the app does not use
Next.js Cache Components, which the Cloudflare adapter does not yet run reliably
([opennextjs/opennextjs-cloudflare#1464](https://github.com/opennextjs/opennextjs-cloudflare/issues/1464),
[#1318](https://github.com/opennextjs/opennextjs-cloudflare/pull/1318)). The build reads nothing
from the database.

The secret key is a Worker secret, set once (and again whenever the key is rotated) in the
Cloudflare dashboard (Workers, ai-training, Settings, Variables and Secrets) or with:

```bash
npx wrangler secret put SUPABASE_SECRET_KEY     # paste the secret key when asked
```

To try the Worker on your own computer against the local stack, put the local values in
`.dev.vars` (same format as `.env.local`, with `NEXT_PUBLIC_SITE_URL=http://localhost:3000`):

```bash
npm run cf:build
npx opennextjs-cloudflare populateCache local
npx wrangler dev --port 3000
npm run e2e        # in another terminal; it uses the Worker already listening on port 3000
```

`npm run cf:deploy` builds and deploys from your own computer.

#### Keeping a Free-plan project awake

Supabase pauses Free-plan projects after a week without activity.
`.github/workflows/keep-alive.yml` reads from the hosted project on odd days of the month, at
an hour that changes from day to day. Delete it once the project is on a paid plan.

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
