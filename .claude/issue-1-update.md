Everything on this list has to come from the project owner: accounts, secrets, content and decisions that cannot be made or created in the code. The platform itself is built and merged: the public site, the learner area and the trainer back-office, in the "Clean & modern" look.

> **Keys and passwords never go into an issue, a commit or a chat.** They belong in the hosting provider's environment settings and, on your own computer, in `.env.local` (which Git ignores).

The step-by-step instructions for the technical items are in TECH.md, section "Going live".

**Status on 27 Nov 2026:** the site is live at https://training.pedrovicente.pt, the hosted project has the sign-in settings, and `npm run verify-project` passes against it. What is left is SMTP (which also unblocks the email templates), backups, and the confirmations below.

## Accounts and services

- [x] **A Supabase project in an EU region.** "AI Training", eu-west-1 (Ireland), on the Free plan. `.github/workflows/keep-alive.yml` stops it from pausing.
- [ ] **An email-sending provider (SMTP) for your domain**: host, port, user, password, sender address and sender name. Until this exists, invitations still work through the "copy link" button, but no email is sent (the built-in mailer only writes to project members, two emails an hour). On the Free plan it also blocks the bilingual email templates: Supabase refuses them without a custom SMTP provider.
- [x] **Hosting for the app**: Cloudflare Workers instead of Vercel, built and deployed by Workers Builds on every push to `main`, Node.js 22.
- [x] **The domain**: training.pedrovicente.pt.

## Set-up only you can do (it involves secrets)

- [x] Set the four environment variables at the host. The three public ones are in `wrangler.jsonc` and in the Workers Builds build variables; `SUPABASE_SECRET_KEY` is a Worker secret.
- [x] Link the project and `npx supabase db push --remote`: the migrations are applied.
- [x] `npx supabase config push` of the sign-in settings: site address and redirect list, sign-up off, 10-character codes valid 24 hours, minimum password length 10, two-factor off, classroom rate limits.
- [ ] SMTP block at the end of `supabase/config.toml`, then `npx supabase config push` again: this also uploads the email templates and their subjects (waits on SMTP).
- [x] Create the first trainer: there are two.
- [x] Run `npm run verify-project`: everything it checks is in order.
- [x] ~~Optional: a **development** Supabase project for rehearsing the go-live steps.~~ Dropped: testing stays on the local stack.

## Content and brand

- [x] **Name and logo**: "AI Training" and the blue circle with a teal arc are final.
- [x] **Public contact email**: none on purpose. Visitors use the information-request form; the privacy notice gives the Mindera data protection address.
- [ ] **Landing-page wording** in Portuguese and English (`messages/pt.json`, `messages/en.json`): reworked since (post-training framing, trainers, FAQ); tick when final.
- [ ] **Privacy notice**: the placeholders and the "provisional" note are gone. It names Mindera as the responsible organisation, gives dpo@mindera.com, says the data is kept by Supabase in Ireland, and keeps it for one year. Still to do: legal validation.
- [x] **The real catalogue**: the live site has its first real course, "AI Training for Teachers" (20 Feb 2027, Porto). Add more from the back-office.
- [ ] **Email wording**: the invitation and password-reset emails in `supabase/templates`, and their subjects in `supabase/config.toml`, are written in both languages but not on the hosted project yet (waits on SMTP).

## Decisions and confirmations

- [x] **Design**: you chose the "Clean & modern" look, and it is applied to the whole site. The mockups at https://claude.ai/artifact/SKxDNPP9rAXYGNVar5ziD9 still show the earlier look; say if you want them redrawn.
- [ ] **Confirm the assumptions** the platform is built on:
  - all trainers have the same full rights (no per-course trainers);
  - course materials are visible only to enrolled learners; the public page shows title, area, level, duration and description;
  - invitation and password-reset links are valid for 24 hours (now true on the hosted project);
  - uploaded files up to 50 MB each;
  - Google Slides, Docs and Sheets must be shared as "anyone with the link" to be embedded, so confidential material should be uploaded as a PDF instead.
- [ ] **Confirm what is out of scope** for this version: payments, quizzes, certificates, progress tracking, course editions, email notifications to trainers, cover photos, dark theme. The list has moved since: a dark theme is in review (#10), courses now have a date and a location, and quizzes are planned.
- [ ] **Largest class** that will sign in at the same time from one network (a school or hospital Wi-Fi). The live limit is now 150 sign-ins per five minutes; confirm it is enough.
- [ ] **Backups**: who looks after them. The project is on the Free plan, which has no automatic backups (Supabase's paid plans have daily ones).
