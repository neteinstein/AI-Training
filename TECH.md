# Technical guide

Everything you need to run, change, test and deploy **AI Training**. For what the platform does
and how it looks, see the [README](README.md).

**Contents:** [Stack](#stack) · [Status](#status) · [Requirements](#requirements) ·
[Getting started](#getting-started) · [Scripts](#scripts) ·
[How the code is organised](#how-the-code-is-organised) · [The back-office](#the-back-office) ·
[Sign-in and invitations](#sign-in-and-invitations) · [Materials](#materials) ·
[Trainers and messages](#trainers-and-messages) · [Backups](#backups) ·
[Database and access rules](#database-and-access-rules) · [Tests](#tests) ·
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
| Restore of a backup: rows, accounts and files, by script          | Done, tested against a database |
| Editions of a course: own learners, own view of the content       | Done, tested in the browser     |
| Progress: what each learner has opened, for them and for trainers | Done, tested in the browser     |
| Quizzes: written by trainers, answered and graded, results kept   | Done, tested in the browser     |
| Trainers of a course, and messages between learners and trainers  | Done, tested in the browser     |

The interface text, the privacy notice and the demo catalogue are placeholders to be replaced
(see "Going live").

Everything was exercised against a local Supabase stack, and the browser tests also against the
app running as a Cloudflare Worker. The hosted project has the migrations (applied and recorded
under the files' versions), two trainers and the sign-in settings of step 3, and
`npm run verify-project` passes against it. It has no SMTP provider yet, and so still sends
Supabase's own emails: on the Free plan, Supabase only accepts custom email templates once a
custom SMTP provider is set.

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

The demo trainer teaches four of the six courses; nobody teaches the other two yet. There are
two conversations: Ana's, about "IA na sala de aula", is waiting for an answer, and John's,
about "IA na prática clínica", has an answer he has not opened.

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
| `npm run og:image`          | Draw the link-preview pictures, `public/og-image-*.png`    |
| `npm run db:start`          | Start the local Supabase stack (`db:stop` stops it)        |
| `npm run db:reset`          | Rebuild the local database from migrations and seed        |
| `npm run db:types`          | Regenerate `src/lib/supabase/database.types.ts`            |
| `npm run env:local`         | Write the local stack's URL and keys to `.env.local`       |
| `npm run seed:dev`          | Create the demo accounts, enrolments, messages and PDF     |
| `npm run bootstrap-trainer` | Create the first trainer and print their activation link   |
| `npm run verify-project`    | Check that a Supabase project is set up as the app expects |
| `npm run restore-backup`    | Put a backup back into an empty project (see Backups)      |

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
  draft. Its details page also says who teaches it: every trainer with a tick box. Whoever
  creates a course starts as its trainer.
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
  and a menu moves a person to another. Dates never open access, being in the course does;
  but they close it: see "Access expiry and data retention" below.
- **Areas and levels**: the two lists courses are organised by. One in use cannot be deleted.
- **Users**: everyone with an account or a pending invitation; a person's page holds their
  details, role, courses, a new access link, and removal.
- **Invitations**: one or many addresses, by email or as links to pass on by hand. Someone who
  already has an account just gets the new courses.
- **Messages**: what learners wrote to the trainers of their courses (see
  [Trainers and messages](#trainers-and-messages)). The list opens on what is waiting for an
  answer from the trainer looking; a conversation's page shows it as a chat, with a box to
  answer in, "needs no answer" to take it off the list, and deletion. The dashboard lists the
  ones that have waited longest.
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

## Trainers and messages

**Who teaches a course** is a list of trainers per course (`course_trainers`), chosen on the
course's details page. It gives no rights and takes none away: every trainer still manages
every course. What it decides is whose course it is:

- the course's learners are shown its trainers' names, in the learner area;
- what those learners write falls to those trainers first (below).

A row only counts while its person is a trainer, as an enrolment only counts while its person
is a learner. Nothing is deleted when a role changes, so nothing has to be put back when it
changes again.

**Messages** are one conversation per learner and course (`conversations`, with its
`conversation_messages`). The learner writes from the course's page in the learner area
(`/learn/courses/<course>/messages`); trainers read and answer in the back-office
(`/trainer/messages`). It is drawn as a chat, but nothing in it is live: no page watches for
new messages, each is there the next time the page is opened. What is waiting is kept on the
conversation, in two marks:

| Mark               | Set when           | Cleared when                                        | Shown as                                             |
| ------------------ | ------------------ | --------------------------------------------------- | ---------------------------------------------------- |
| `unanswered_since` | the learner writes | a trainer answers, or says it needs no answer       | "To answer" in the back-office, and the menu's count |
| `unread_since`     | a trainer answers  | the learner opens the conversation, or writes again | "New answer" on the learner's course list and course |

Choices worth knowing:

- **Trainers share a conversation.** Any trainer can read and answer any conversation, also
  one of a course they do not teach, and the learner sees the name of whoever answered. The
  page tells the learner that the trainers see what they write, and it is true of all of them.
- **A trainer's list is their own.** By default **Messages** shows, and the menu counts, the
  conversations of the courses the trainer teaches, plus those of courses nobody teaches: a
  question is never left without a reader because a course has no trainer yet. "Show every
  course" is one click away, and only offered when it would show something more.
- **Learners write, trainers answer.** A conversation starts with a learner's first message.
  Only someone enrolled in a course that is open to them (not a draft) can write about it; a
  trainer looking at a course as a learner is sent to the back-office instead. Someone taken
  out of a course keeps their conversation but can add nothing to it, and the back-office
  says an answer will only be seen if they come back.
- **Plain text**, up to 4,000 characters a message, shown as written with its line breaks.
- **No emails.** Nobody is told by email that a message or an answer arrived: the platform
  only sends the sign-in service's emails (invitations, password links). The marks above are
  how people find out, when they next sign in.
- A conversation shows its latest 200 messages (`THREAD_LIMIT` in
  `src/lib/dal/conversation-queries.ts`) and says so when there are older ones.
- A trainer can delete a whole conversation. A learner's conversations go with their account;
  when a trainer's account is removed their answers stay, without a name.

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
  them has opened (`material_progress`), the quizzes they handed in (`quiz_attempts`), who
  teaches each course (`course_trainers`, which points at accounts) and the messages between
  learners and trainers (`conversations`, `conversation_messages`). It is personal data, and
  the page says so.
- **Never in it:** passwords (accounts live in Supabase Auth; after a restore people are
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

On a paid Supabase plan, the project's own daily database backups cover the database as well;
they do not cover stored files.

### Restoring

There is no restore button: a restore writes with the secret key, so the operator runs it from
a terminal, against the project named in `.env.local`. The code is in
`src/features/backup/restore.ts` (nothing in the app imports it, and a unit test keeps it so),
the command in `scripts/restore-backup.ts`.

```bash
npm run restore-backup -- ai-training-backup-2026-11-27-1530.zip --dry-run
npm run restore-backup -- ai-training-backup-2026-11-27-1530.zip
```

`--dry-run` opens the archive, checks it and the project, and says what it would write.

**Where it writes.**

- Only into the local stack, unless `--allow-remote` is given. For a hosted project, put its
  URL and secret key in `.env.local` (as for `bootstrap-trainer`) and add the flag.
- Only into an empty database: a new project with every migration applied and no account yet,
  not even a first trainer, since the restore brings the trainers back. The two levels every
  database starts with do not count: the backup's own take their place (same slugs, the
  backup's ids), as long as no course uses them.
- `--allow-existing` lets it write into a database that has content. A row whose primary key
  is already there is left as it is, never overwritten. It is also how a restore that stopped
  half-way carries on: run the same command again with it.

**What it does, in order.** Nothing is written until the first step has passed.

1. It opens the archive and checks that it is whole: the manifest's format and version, one
   data file per table with the number of rows the manifest gives, and every file the manifest
   lists. A table it does not know (a backup from a newer version) stops it too.
2. The content, in the order of `data/`: areas, levels, courses, editions, modules, materials,
   what each edition hides, the quizzes' questions, options and keys. Rows go back exactly as
   stored, ids and dates included, through the Data API with the secret key. The database
   gives every new course an edition as the course is written; once the backup's editions are
   in, that one is removed again, so each course ends with exactly the editions it had, and the
   same default.
3. The accounts, when the backup holds people (below).
4. What belongs to people: enrolments, requests, progress, quiz attempts, the trainers of
   each course, and the conversations with their messages (what was waiting stays waiting).
5. The files, each uploaded to the `course-materials` bucket under its `storagePath`, with its
   material's type. A file listed under `missingFiles` (storage did not have it when the
   backup was made) is named in the report: its material comes back without a file, to be
   uploaded again in the back-office. A backup made without files says how many file
   materials have none.

**How people come back.** A backup holds no passwords, so nobody can come back exactly as they
were. The choice made:

- Each account is created again through the Auth admin API with **the same id and email**, so
  every enrolment, request, progress row, quiz attempt and message points at it again. It is
  **unconfirmed and has no password**; it carries the person's name and language. Nothing is
  emailed.
- The profile then gets the backup's role, name, language and creation date. Two of its
  columns do not come back as they were: `email_confirmed_at` is empty (the back-office lists
  the person as invited, not yet active), and `updated_at` is the time of the restore.
- For each trainer the command prints a one-time link to choose a password (24 hours), as
  `bootstrap-trainer` does. Once in, a trainer gives everyone else a new invitation or access
  link from **Users**, when their courses are ready for them.
- The database refuses to demote or delete its last trainer. A restore only creates accounts
  and gives roles, never takes one away, so that rule never stands in its way. With
  `--allow-existing`, an account already there keeps its role, and becomes a trainer if the
  backup says it was one.
- An email that already has an account under another id (only possible with
  `--allow-existing`, say after `bootstrap-trainer`) keeps that account, password included,
  and what the backup holds for the person is attached to it.
- A backup without people brings back no accounts: create the first trainer afterwards with
  `npm run bootstrap-trainer`.

**A backup is not a snapshot** (see above), so it may hold a row that points at one deleted
while it was being made. The restore treats that row as the database would have: left out
where the deletion would have taken it along, or with the reference emptied where it would have
been set to null, and the report names each one. It follows the foreign keys listed in
`REFERENCES` in `restore.ts`; an integration test compares that list with the database, so a
new table or link fails it until it is added there (as well as to `src/lib/dal/backup.ts`).

**Proved by a round trip.** `tests/integration/restore.test.ts` makes a backup of the local
database as the back-office does (a trainer's session, every file, the people), empties the
database completely (every table, account and stored file, leaving only the two starter levels,
as in a new project), restores the backup, and compares every row of every table and every file
byte for byte. Then it restores again with `--allow-existing` and checks that nothing changes.
It runs in CI with the other integration tests.

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
- Who teaches a course is in `course_trainers`, which only trainers can read or change. A
  learner gets their trainers' names from one function, `course_trainer_names`, which answers
  for a course the caller may open and gives the names of people who are trainers now, nothing
  else: learners still cannot read anyone else's profile.
- A conversation and its messages are readable by the learner whose conversation it is and by
  trainers. **Nobody writes them through the API**: `send_course_message` (a learner, about a
  course they may open), `answer_conversation` (a trainer), `mark_conversation_read` (that
  learner) and `mark_conversation_answered` (a trainer) do, each after checking who is
  calling, so the two marks always agree with the messages. They are functions, not triggers,
  so that a restore can put a backup's rows back exactly as they were; a test fails if a
  trigger is added to these tables. `conversation_thread` reads a conversation with the name
  of each author, which is how the name of the trainer who answered reaches the learner. The
  one direct write is a trainer deleting a whole conversation.
- **Access expiry and data retention** (`20261128120000_learner_retention.sql`). A learner's
  last training day is the latest day among their enrolments: the edition's last day, else its
  first, else the course's start. Access is open up to two months after it, and closed from
  the day after, on Lisbon's clock. It is worked out on every query, inside the helpers that
  say which courses and editions a learner may open and inside `learner_materials`, so pages,
  downloads, progress, quizzes and messages all close together, and enrolling the person in a
  later edition opens access again at once. A year after that day, a nightly `pg_cron` job
  (`purge-expired-learners`, 03:17 UTC) deletes the account, which takes the profile,
  enrolments, progress, quiz attempts and conversations with it, and the information requests
  sent from the same address. A learner removed from every course is deleted the same way a year
  after the removal: a trigger on `enrollments` notes it in `profiles.unenrolled_at` and clears
  it when they are enrolled again. A learner never in any course is deleted a year after the
  account was created, and a trainer made a learner while in no course a year after that
  change (learners in no course when this was added count from then).
  `learner_access` tells the person, or a trainer, both dates. Trainers are never affected, nor
  are learners whose enrolments have no day at all. A restored backup brings back the people
  it holds; the job deletes those already due the following night.
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
  One of them empties the whole database and restores it from a backup (see
  [Backups](#backups)); if it fails half-way, `npm run db:reset` gives a clean stack again.
  Both this suite and the next first wait until the stack sends the project's own emails: for
  about ten seconds after it starts, the local sign-in service still uses its built-in ones.
- `npm run e2e`: the journeys in a real browser at desktop and phone sizes, reading emails
  from the local mail catcher. Run `npm run build` first. Besides the journeys (building a
  course, uploading a file, inviting someone who then activates the account and reads the
  materials, a learner asking a question and a trainer answering it, a request becoming an
  invitation, a backup downloaded and unpacked) they include:
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

Should a run say "IPv6 is not supported on your current network": the command line finds the
project's IPv4 address through Supabase's API, and that lookup failed, before anything was
connected to. The workflow tries such a command again by itself (`scripts/supabase-remote.sh`);
a migration that fails is never tried twice.

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

On the Free plan, Supabase refuses the email templates (and the whole push with them) until
a custom SMTP provider is set. To push the other settings before then, run the push from a copy
of the `supabase` folder whose `config.toml` leaves out the three `[auth.email.template.*]`
sections, with `--workdir` pointing at that copy. Once SMTP is in the block, push from the
repository as usual and the templates go in with it.

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
