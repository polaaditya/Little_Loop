# Built with AI — LittleLoop

LittleLoop was designed and built using [Claude](https://claude.ai) via Anthropic's **Cowork** desktop tool. Every layer of the stack was co-created through an iterative conversation, not just code generation.

---

## What Claude helped build

### Product direction
- Reframed the target audience from "parents" to "working professionals and stay-at-home parents" — distinct pain points, distinct copy
- Named the core concept: "loops" (prompted moments), "memory jar" (private archive), "care steps" (engagement metric)
- Wrote all landing page copy, persona descriptions, and feature card text

### Visual design & logo
- Designed the **Family Loop logomark** from scratch: 5 circles on a ring, each a different size and colour representing different family members (parent, co-parent, big kid, little one, infant/grandparent)
- Built the full design system: colour palette (sage, coral, amber, blue-gray), typography scale, spacing tokens, animation (`gentlePulse`)
- Designed the hero section, phone mockup, dashboard layout, memory grid, and all modals

### Database schema
- Designed the relational schema: `families → members → loops → responses → memories → care_steps → users → settings`
- Chose Node.js 22 built-in `node:sqlite` (zero native compilation) for local dev; PostgreSQL via `pg` Pool for production
- Created a single `db.js` abstraction with `run/get/all` API, `?`-to-`$N` placeholder conversion for PostgreSQL
- Wrote all `CREATE TABLE IF NOT EXISTS` migrations and safe `ALTER TABLE` fallbacks

### Auth system
- Designed the full JWT flow: `bcryptjs` password hashing, 7-day tokens, `Authorization: Bearer` header
- Built `optionalAuth` (guests see demo data) and `requireAuth` (capture requires login) middleware
- Created family invite token system: 20-char hex token generated on registration, shareable URL with `#invite=TOKEN` hash detection
- Implemented join-via-invite: register and be added to an existing family, bypassing family creation

### Daily prompt rotation
- Built the `STAGE_PROMPTS` system: 7 prompts per age stage (Infant, Little Kid, Big Kid, Teen)
- Implemented day-index rotation: `Math.floor(Date.now() / 86400000) % pool.length`
- Auto-creates today's loop on dashboard load if none exists for the day, using the family's members' age stages to pick the right pool

### Onboarding wizard
- Designed the 3-step post-registration flow: add family members → choose first prompt → success with invite link
- Step 1 saves members via `POST /api/families/:id/members` in parallel
- Step 2 creates a custom first loop prompt overriding the seeded default
- Step 3 surfaces the family invite link so users can immediately share with partners/kids

### Memory capture
- Designed the capture modal: text + optional photo, 500-char limit, live char count
- Built client-side Canvas image compression (max 900px, JPEG 0.78 quality) before base64 storage
- Added drag-and-drop image upload with visual feedback

### Cloud architecture
- Designed the AWS deployment: ALB → ECS Fargate (multi-AZ, min 2 tasks) → RDS PostgreSQL Multi-AZ
- Wrote the `Dockerfile` (Node 22-alpine, no native deps)
- Documented environment variables: `DATABASE_URL`, `JWT_SECRET`, `PORT`, `SQLITE_PATH`

### README & documentation
- Wrote the full README: three run options (plain npm, Docker SQLite, Docker PostgreSQL), full API reference table, AWS deployment steps, environment variable reference

---

## Workflow

The entire build used a single Cowork session — no external IDE, no switching tools. The workflow was:

1. Describe intent in natural language ("add memory capture with camera upload")
2. Claude reads existing files, reasons about changes, writes diffs
3. Human reviews, requests adjustments, Claude iterates
4. Rinse and repeat — typically 2–3 rounds per feature

Key decisions Claude flagged proactively:
- Switched from `better-sqlite3` (requires native compilation, fails in restricted environments) to `node:sqlite` (built into Node 22)
- Used `optionalAuth` instead of `requireAuth` on dashboard so guests can see a live demo without signing up
- Separated `invite_token` generation into auth layer so it's available immediately after registration for onboarding step 3

---

## Models used

All code and copy was generated with **Claude Sonnet** (claude-sonnet-4-6) via the Cowork desktop tool.

---

## What's human

- Product vision: the core insight that families need a *low-pressure* daily touchpoint, not another notification
- UX testing: manually verifying the registration → onboarding → first loop → memory capture flow
- Final content review: checking that prompts feel warm, not clinical
- This file
