# Sanity CMS — Execora Setup Guide

This integrates **Sanity CMS** into the Execora website. Content is authored in a
standalone Sanity Studio and shown live on the site (client-side, real-time).

> ⚠️ **Web framework note:** This is a **vanilla Vite** static multi-page site, not
> Next.js. It has no `web/` app and no `studio/` + `web/` monorepo. The Studio
> lives in `studio/` and the public site stays at the repo root. The frontend
> integration uses the official `@sanity/client` (the same Sanity backend and API
> used by Next.js projects — just without the React/Next wrappers).

---

## 1. What was added / changed

| File | Purpose |
|------|---------|
| `studio/` | Standalone Sanity Studio (config, schema, structure) |
| `studio/package.json` | Studio dependencies + scripts (`sanity dev`, `sanity deploy`) |
| `studio/sanity.config.ts` | Studio config (project `p0mpfgmr`, dataset `production`) |
| `studio/sanity.cli.ts` | CLI config |
| `studio/structure.ts` | Simple client-friendly sidebar (Blog posts + Settings) |
| `studio/schemaTypes/blogPost.ts` | Blog schema (**one featured image per post**) |
| `studio/schemaTypes/siteSettings.ts` | Editable homepage/footer strings (singleton) |
| `studio/schemaTypes/blogAutomationSettings.ts` | Editable automatic-blog image style (singleton) |
| `src/sanity/client.js` | Sanity client + image URL builder (client-side) |
| `src/sanity/queries.js` | GROQ queries for settings + blog |
| `src/sanity/site.js` | Homepage text hydration (falls back to hard-coded copy) |
| `src/sanity/portable.js` | Portable Text → HTML renderer for article bodies |
| `src/main.js` | Calls `hydrateHomepage()` |
| `blog.html` | Blog page (index + article, rendered client-side) |
| `src/blog.js` | Blog controller (routes, index grid, article view, SEO) |
| `src/blog.css` | Editorial blog styles (matches brand) |
| `index.html` | Added **Blog** link to footer |
| `vite.config.js` | Added `blog` build input + dev-server `/blog` rewrite |
| `vercel.json` | `/blog` + `/blog/:slug*` rewrites + `/admin` redirect to Sanity Studio |
| `.env.example` / `.env` | Added Sanity env vars |
| `.gitignore` | Ignores `.sanity/` and `studio/dist` |

**Unchanged:** existing site design, styling, animations, URLs, SEO, enquiry
form / Google Sheets / Stripe flows, and `thank-you.html`.

---

## 2. Environment variables

All Sanity values are **public-safe** (no secrets). No API token is required for
public, client-side reads.

```
NEXT_PUBLIC_SANITY_PROJECT_ID=p0mpfgmr
NEXT_PUBLIC_SANITY_DATASET=production
```

There is **no** `SANITY_API_READ_TOKEN`; it is only needed if the dataset is made
private (not the case here).

The Studio reads the same project via fallback defaults in
`studio/sanity.config.ts` / `studio/sanity.cli.ts` (`p0mpfgmr` / `production`).
To override, export `SANITY_STUDIO_PROJECT_ID` / `SANITY_STUDIO_DATASET`.

---

## 3. One-time Sanity setup (needs the project owner's login)

These steps require your authenticated Sanity account. Run from the repo root.

**a. Log in**

```bash
npx sanity@latest login
```

**b. Allow the site to read content (CORS).** Without this, the browser blocks
the requests. Add your dev + production origins:

```bash
npx sanity cors add http://localhost:5173 --project p0mpfgmr
npx sanity cors add https://www.execora.work --project p0mpfgmr
npx sanity cors add https://execora.work --project p0mpfgmr
```

**c. Deploy the Studio** so you and the client can edit content:

```bash
cd studio
npx sanity deploy   # publishes to e.g. https://<your-studio>.sanity.studio
```

**d. (Optional) Seed a Starter/site first.** Either add a "Site settings"
document in the Studio, or run the CLI after login.

---

## 4. Vercel deployment

The existing Vercel project (`execora.work`) is unchanged. Set the two public env
vars in **Vercel → Project → Settings → Environment Variables**:

- `NEXT_PUBLIC_SANITY_PROJECT_ID=p0mpfgmr`
- `NEXT_PUBLIC_SANITY_DATASET=production`

Also add the production URL to the Sanity **CORS** list (step 3b) so published
requests aren't blocked.

Deploy as normal (`git push`). The blog routes (`/blog`, `/blog/<slug>`) are
handled by the rewrites in `vercel.json`.

---

## 5. How to invite the client as an authorized Sanity user

1. Open **sanity.io/manage → p0mpfgmr → Project → Members**.
2. **Invite member**, enter the client's email.
3. Choose role **Editor** (can create/edit/publish content, cannot change
   project settings). Keep **Administrator** for your own account only.

Only invited, signed-in users can open the Studio and edit content
(Sanity handles authentication — no custom login needed).

---

## 6. How the client accesses /admin

The Studio is kept **standalone** (not mounted into the site bundle) and is
deployed to Sanity's hosting. Visiting `/admin` on `execora.work` **redirects**
to the Studio's own URL (via `vercel.json`), which requires the invited Sanity
login:

```
/admin  →  https://execora.sanity.studio   (302 redirect)
```

In local dev (`npm run dev`), `/admin` also redirects to the Studio URL. For a
full editing environment, run the Studio directly: `cd studio && npx sanity dev`.

**Set the redirect target:** the destination in `vercel.json` uses the hostname
chosen when you run `sanity deploy` inside `studio/` (e.g. `execora.sanity.studio`).
Update the `/admin` redirects there if your deployed hostname differs.

There is no public nav link to the CMS — access is by `/admin` (redirect) or the
Studio URL, plus authentication.

---

## 7. What the client can edit

**Blog posts** (`blogPost`) — create / edit / publish / unpublish:
- Title, slug, category, excerpt
- **Featured image (one per post)** + alt text, inline body images
- Published date, reading time (minutes)
- Rich-text body (headings, paragraphs, bullet/numbered lists, links, images)
- SEO title & SEO description (drives page title/meta for each article)

**Site settings** (`siteSettings`) — homepage/footer strings:
- Business name, hero eyebrow / title / rotating words / subtitle
- Primary call-to-action, contact heading/subtitle, footer tagline
- **Pricing:** one-time setup fee and monthly fee for the Essential and Growth
  plans (in £, entered as numbers). Leave any field empty to keep the
  hard-coded default (Essential £299/£49, Growth £499/£79). The "12 months"
  wording stays fixed in code.

Everything else (layout, design, animations, prices, FAQ text, form logic, SEO
structure) intentionally stays in code so the site's look and behavior are never
broken by content edits.

---

## 8. How to test the integration

1. `cd studio && npx sanity dev` — open the Studio, add a "Blog post" with an
   image and a "Site settings" document, then **Publish**.
2. In another terminal run the site: `npm run dev` → `http://localhost:5173/`.
3. The homepage text you set in "Site settings" appears; `/blog` lists the post;
   `/blog/<slug>` shows the article with its image.
4. Edit/publish in the Studio and refresh — the live (client-side) reads update
   the site.

**Offline / unconfigured fallback:** if Sanity is unreachable, missing, or CORS
isn't configured, the homepage keeps its original hard-coded copy and the blog
shows a graceful empty/"not found" state — nothing breaks.

---

## 9. Blog draft endpoint — `POST /api/create-blog-draft`

A protected Vercel serverless function that lets you (or an automated caller)
create a **blog post as a draft** for manual review. It **never publishes** —
a human reviews and publishes it in Sanity Studio.

> ⚠️ The endpoint only creates **drafts**. It does not call any Sanity publish
> operation and it will never overwrite an existing draft or published article.

### Required Vercel environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (and add to
your local `.env` for local testing). None of them are `NEXT_PUBLIC_`:

| Variable | Purpose |
|----------|---------|
| `SANITY_WRITE_TOKEN` | Sanity API token with **Editor** role — used to create draft documents |
| `BLOG_DRAFT_API_SECRET` | Secret the caller sends as `Authorization: Bearer <...>` to authenticate |

Public vars already required (also set in Vercel):

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | `p0mpfgmr` |
| `NEXT_PUBLIC_SANITY_DATASET` | `production` |

### How to generate a secure `BLOG_DRAFT_API_SECRET`

```bash
openssl rand -hex 32
```

Add the output as `BLOG_DRAFT_API_SECRET` in Vercel. Store a copy somewhere
safe (e.g. your password manager) — the caller needs the same value.

### How to create the `SANITY_WRITE_TOKEN`

1. Open **sanity.io/manage → p0mpfgmr → API → Tokens**.
2. **Add API token**, give it a name (e.g. `Blog draft endpoint`).
3. Set the role to **Editor** (needed to `create` documents; less than
   Administrator).
4. Copy the token (shown only once) and set it as `SANITY_WRITE_TOKEN` in Vercel.

> Never put this token in a `NEXT_PUBLIC_` variable and never commit it.

### Sample request (placeholder credentials)

Replace `<BLOG_DRAFT_API_SECRET>` with your real secret before running:

```bash
curl -X POST https://www.execora.work/api/create-blog-draft \
  -H "Authorization: Bearer <BLOG_DRAFT_API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "10 Website Tips for Local Businesses",
    "category": "Website Tips",
    "excerpt": "A short summary of the post.",
    "seoTitle": "10 Website Tips for Local Businesses",
    "seoDescription": "Practical website tips for local businesses.",
    "body": [
      { "style": "normal", "text": "Introductory paragraph." },
      { "style": "h2", "text": "Main section heading" },
      { "style": "normal", "text": "Section content." },
      { "style": "normal", "listItem": "bullet", "text": "Practical action." }
    ]
  }'
```

Supported payload fields:

- `title` (required), `slug` (optional, generated from title), `category`
  (required — one of `Website Tips`, `Local Business`, `Google & SEO`,
  `Customer Experience`, `Business Growth`), `excerpt` (required)
- `seoTitle` (required), `seoDescription` (required)
- `publishedDate` (optional, defaults to now), `readingTime` (optional,
  auto-calculated at ~220 wpm)
- `body` (required — array of Portable-Text-style blocks supporting `normal`,
  `h2`, `h3`, `blockquote`, bullet and numbered lists)
- `imageAssetId` (optional — reference to an existing Sanity image asset),
  `imageAlt` (optional alt text)

### Reviewing & publishing the draft

1. The endpoint creates a document with id `drafts.blogPost-<slug>`.
2. Open Sanity Studio (the `/admin` redirect or your `*.sanity.studio` URL).
3. Under **Blog posts** you'll see the draft (badged "Draft").
4. Edit / add images as needed, then click **Publish** to make it live on the
   site.

---

## 10. Daily blog automation — `/api/generate-daily-blog`

A protected Vercel serverless function scheduled by **native Vercel Cron**. It
runs every day at **8:00 AM Europe/London**, generates a full SEO-optimised
blog article plus a featured image using OpenAI, uploads the image to Sanity,
and creates the article as an **unpublished draft** for human review. It
**never publishes** automatically.

> ⚠️ This endpoint is protected by a bearer token (`CRON_SECRET`). Vercel Cron
> authenticates with it automatically; a manual `POST` with the same token lets
> you trigger a generation for testing. Do not expose the endpoint without the
> token.

### Workflow

1. Vercel Cron calls `/api/daily-blog-0700` and `/api/daily-blog-0800` via GET.
2. Each wrapper delegates to the shared `/api/generate-daily-blog` handler.
3. For GET requests, the handler first checks the current **Europe/London** hour.
   If it is not **8 AM**, it returns HTTP 200 `{ skipped: true }` **without**
   calling OpenAI — so the extra 07:00 UTC trigger (used to keep a single cron
   path) never generates or charges.
4. The handler checks for an existing post for **today's date** (Europe/London)
   — both `drafts.blogPost-auto-YYYY-MM-DD` and `blogPost-auto-YYYY-MM-DD` — and
   skips with HTTP 200 if one exists, so retries never duplicate or double-charge.
5. It reads the latest 60 Sanity blog posts (titles + categories) to avoid
   repeating topics.
6. It calls the OpenAI Responses API (Structured Outputs) for a 1,200–1,500 word
   UK-local-business article, then OpenAI image generation for a branded
   featured image.
7. It uploads the image to Sanity and creates a draft document with id
   `drafts.blogPost-auto-YYYY-MM-DD`.
8. You review and publish the draft in Sanity Studio.

### Required Vercel environment variables

Set these in **Vercel → Project → Settings → Environment Variables**. None of
the secrets should ever be prefixed with `NEXT_PUBLIC_`.

| Variable | Purpose | Required |
|----------|---------|----------|
| `OPENAI_API_KEY` | OpenAI API key (text + image generation) | Yes |
| `OPENAI_TEXT_MODEL` | Article model (default `gpt-5.4-mini`) | No |
| `OPENAI_IMAGE_MODEL` | Image model (default `gpt-image-1-mini`) | No |
| `SANITY_WRITE_TOKEN` | Sanity Editor token (creates draft documents) | Yes |
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | Sanity project ID (`p0mpfgmr`) | Yes |
| `NEXT_PUBLIC_SANITY_DATASET` | Sanity dataset (`production`) | Yes |
| `CRON_SECRET` | Secret for `Authorization: Bearer` auth (GET + POST) | Yes |

### Generate a secure `CRON_SECRET`

```bash
openssl rand -hex 32
```

Store the output as `CRON_SECRET` in Vercel. Vercel Cron uses it automatically
to authenticate its GET calls; you use the same value for manual POST tests.
Store a copy somewhere safe.

### Vercel Cron setup

Two cron schedules are declared in `vercel.json` so a single path can host two
UTC times (Vercel allows one schedule per path):

```json
{
  "crons": [
    { "path": "/api/daily-blog-0700", "schedule": "0 7 * * *" },
    { "path": "/api/daily-blog-0800", "schedule": "0 8 * * *" }
  ]
}
```

Both are **UTC** schedules:

- `0 7 * * *` (07:00 UTC) → **08:00 London** during British Summer Time
- `0 8 * * *` (08:00 UTC) → **08:00 London** during Greenwich Mean Time (winter)

**Europe/London daylight-saving guard:** the handler independently checks the
current hour in `Europe/London` and returns 200 `{ skipped: true }` unless it is
exactly 8 AM there. This means whichever UTC trigger fires, the real generation
happens only at 8 AM local UK time, and the other trigger is a harmless no-op —
so only **one** OpenAI generation can occur per day.

### Confirm Cron Jobs in the Vercel dashboard

1. Deploy the changes (git push).
2. In **Vercel → Project → Settings → Cron Jobs**, you should see two entries:
   - `/api/daily-blog-0700` — `0 7 * * *`
   - `/api/daily-blog-0800` — `0 8 * * *`
3. If the list is empty or shows a warning, redeploy or check that the `crons`
   field is present in `vercel.json` and that the project plan supports Cron
   Jobs (some projects require the Cron Jobs feature enabled).

### Response behaviour

| Case | HTTP | Body |
|------|------|------|
| Success | 200 | `{ ok, draftId, slug, date }` |
| Already exists (draft or published) for today | 200 | `{ skipped: true, reason }` |
| GET outside Europe/London 8 AM window | 200 | `{ skipped: true, reason }` |
| Invalid/missing token | 401 | `{ error }` |
| Wrong method | 405 | `{ error }` |
| Not configured / internal failure | 5xx | `{ error }` (safe, no secrets) |

### Safe manual POST test (bypasses the time-window check)

A manual `POST` with a valid `CRON_SECRET` runs the full generation regardless
of the local hour, so you can verify the endpoint at any time. Replace
`<CRON_SECRET>` with your real secret (never commit it):

```bash
# Manual full generation (bypasses 8 AM window, still idempotent per day)
curl -X POST https://www.execora.work/api/generate-daily-blog \
  -H "Authorization: Bearer <CRON_SECRET>"
```

This generates only if no post exists for today; running it again the same day
returns `{ "skipped": true }` with no extra cost.

To test auth/validation/date guards without incurring OpenAI charges:

```bash
# Wrong token -> 401
curl -X POST https://www.execora.work/api/generate-daily-blog \
  -H "Authorization: Bearer wrong"
```

### Reviewing & publishing the generated draft

1. The function creates a document with id `drafts.blogPost-auto-YYYY-MM-DD`.
2. Open Sanity Studio (the `/admin` redirect or your `*.sanity.studio` URL).
3. Under **Blog posts** you'll see the new draft (badged "Draft").
4. Review the article, edit as needed, then click **Publish**.

The endpoint never calls any publish operation and never overwrites a manual
post or an existing draft for the same date.

### Featured-image style — `blogAutomationSettings` (singleton)

A single document named **Blog Automation Settings** controls the visual style
used for automatic blog images. It sits in the Studio sidebar and contains two
fields:

| Field | Purpose |
| --- | --- |
| `imageStylePrompt` | Styles the generated image (large multi-line input). |
| `imageNegativePrompt` | Visual elements, colours and styles to avoid. |

Only the **published** document affects automatic generation. Unpublished edits
are ignored by production. If the document is missing, unpublished, empty or
cannot be fetched, the automation silently falls back to the hard-coded
`IMAGE_PREFIX` style — it never fails the whole run.

Recommended starting value for `imageStylePrompt` (paste into the text field):

> Premium hand-drawn crayon editorial illustration with subtle embossed 3D depth for an Execora business article. Use rounded dimensional forms, visible wax-pencil grain, soft paper texture, imperfect handcrafted edges and gentle grounded shadows. Colour palette: dominant warm off-white or ivory background, near-black and deep charcoal for main objects, muted antique gold for highlights, important symbols and small accents, and optional soft warm-grey or muted beige for secondary details. Aim for roughly 75% ivory, 20% near-black or charcoal and 5% muted gold. No bright green, red, orange, yellow, blue or rainbow colours. Show one simple visual metaphor that communicates the article topic, such as a damaged website screen losing a customer, a smartphone connecting a customer to a shop, an enquiry moving through a simple follow-up journey, a local shop becoming easier to find, a booking calendar filling with appointments, or reviews helping customers trust a business. Set it within a subtle UK local-business environment with independent shopfronts, cafés, salons, tradespeople, clinics, brick buildings, pavements or neighbourhood high streets, without tourist clichés. Sophisticated and editorial, not like a children's book. Avoid exaggerated cartoon faces unless the expression is necessary to communicate the article problem. No text, letters, numbers, logos, brand names or watermarks inside the image. No generic robots, futuristic dashboards, purple gradients, neon colours, glossy plastic materials or visual clutter.

Recommended starting value for `imageNegativePrompt` (optional):

> No text, letters, numbers, logos, brand names or watermarks inside the image. No generic robots, futuristic dashboards, purple gradients, neon colours, glossy plastic materials or visual clutter.

The final prompt sent to OpenAI is composed as:

1. Sanity `imageStylePrompt` (or `IMAGE_PREFIX` if unavailable)
2. The article-specific `imagePrompt`
3. Sanity `imageNegativePrompt` (if present)

### Article guidance — `blogAutomationSettings` (singleton)

The same **Blog Automation Settings** document also controls the **article
content** the automation writes. It contains five additional fields:

| Field | Purpose |
| --- | --- |
| `articleContentPrompt` | Focus/editorial direction for the article. |
| `articleTonePrompt` | Writing style and tone. |
| `articleAvoidPrompt` | Subjects, claims, phrases and styles to avoid. |
| `articleCtaPrompt` | How Execora is mentioned and the call to action. |
| `nextArticleTopic` | **One-time** topic for the next normal daily article. Leave empty to let the automation choose. |
| `textModel` | OpenAI **article** model. Leave empty for the default. |
| `imageModel` | OpenAI **image** model. Leave empty for the default. |

**Model selection:** `textModel` and `imageModel` let the owner change which
OpenAI models the automation uses, from the dashboard. Only allowlisted values
are accepted; anything invalid/empty falls back to the `OPENAI_TEXT_MODEL` /
`OPENAI_IMAGE_MODEL` env vars (or their hard-coded defaults), so an unknown
model can never break generation.

Allowlisted article models: `gpt-5-mini`, `gpt-5.4`, `gpt-5.4-mini` (default),
`gpt-4o-mini`.

Allowlisted image models: `gpt-image-1-mini` (default), `gpt-image-1`.

When a field is filled in, it is appended to the article-generation prompt as a
labelled section, in this order:

1. `EDITORIAL FOCUS:`
2. `WRITING STYLE:`
3. `AVOID:`
4. `CALL TO ACTION:`
5. `NEXT ARTICLE TOPIC:`

These are **supplements only**. The hard-coded rules (British English, UK
local-business audience, practical/accurate advice, no fabricated stats,
SEO title/description limits, category validation, structured JSON schema,
1,200–1,500 word target, Portable Text conversion, draft-only workflow,
duplicate protection, auth/cron) can **never** be overridden.

**`nextArticleTopic` behaviour:**

- Used on the **next normal daily article only**; OpenAI derives the SEO title
  from it.
- Cleared from the settings automatically **after a successful normal (non-test)
  draft is created**.
- Not cleared on failure and not cleared during a `?test=true` test run.

If the field is empty (or the settings document is missing/unpublished/empty/
unfetchable), the automation continues with its existing hard-coded prompts and
never fails the run.

As with the image fields, only the **published** document affects automatic
generation.

### Local / automated testing

Run the unit tests (these mock OpenAI and Sanity — no real API calls, no cost):

```bash
npm test
```

---

## 11. Google Analytics 4

The site uses **GA4 via `gtag.js`** (Google Tag Manager is **not** used). It's a
vanilla Vite multi-page site, so analytics live in one shared module
(`src/analytics.js`) imported by every entry point (`src/main.js`, `src/blog.js`,
`src/thank-you.js`) — each reports a single, correct `page_view`.

### How it works

- **Consent-first (UK-friendly):** all storage (`analytics_storage`,
  `ad_storage`, `ad_user_data`, `ad_personalization`) is denied **before**
  analytics loads. A banner lets the visitor **Accept analytics** or **Reject**.
  Accepting grants **only** `analytics_storage`; advertising consent always stays
  denied because Execora isn't running ad tracking.
- The banner shows only until the visitor makes a choice (stored in
  `localStorage` under `execora_ga_consent`) and is never shown again after a
  choice.
- **No personal data is ever sent.** Event params are allow-listed (`location`,
  `page_location`). Names, emails, phone/WhatsApp numbers and form messages stay
  on the site and are never passed to Google Analytics.
- Events tracked: standard `page_view` for `/`, `/blog`, `/blog/<slug>` and
  `/thank-you`; plus `generate_lead` (once, after the enquiry form succeeds),
  `whatsapp_click` (with a `location` such as `homepage_quick_contact`,
  `enquiry_success` or `thank_you`), and `prototype_checkout_click` (when a user
  starts the £5 prototype checkout — **not** a completed purchase).
- If GA is blocked, the ID is missing/invalid, the script fails, or the visitor
  rejects, the site keeps working normally (events silently no-op).

### Setup

1. Create a GA4 property in the Google Analytics admin console and copy its
   **Measurement ID** (format `G-XXXXXXXXXX`).
2. Add it to your local `.env`:

   ```
   VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
   ```

3. Add the same public-var to **Vercel → Project → Settings → Environment
   Variables** (`VITE_GA_MEASUREMENT_ID`).
4. **Local development:** analytics is disabled unless you also set
   `VITE_GA_ENABLE_DEV=true` in your `.env`.
5. Leave `VITE_GA_MEASUREMENT_ID` empty/absent to disable GA4 entirely
   (production included).

### Verification

1. **Production:**
   - Open Google Analytics → **Reports → Realtime** (or the **DebugView**).
   - Visit `https://www.execora.work/`, `/blog`, `/blog/<some-article>`, and
     `/thank-you` — each should appear as a single `page_view` on its own path.
   - Accept the consent banner, then submit the enquiry form → `generate_lead`;
     click a WhatsApp button → `whatsapp_click`; start the £5 checkout →
     `prototype_checkout_click`.
   - Reload a page after choosing “Reject” — the banner must **not** reappear
     and no events should send.

2. **Local:** set `VITE_GA_MEASUREMENT_ID` and `VITE_GA_ENABLE_DEV=true` in your
   `.env`, run `npm run dev`, and confirm the same events in GA4 **DebugView**
   (enable the DebugView extension/ga_debug in the browser).

> Only TS/JS files under `src/` are involved. The Sanity CMS, Stripe checkout,
> contact form, Vercel Cron and daily blog automation are untouched by analytics.
