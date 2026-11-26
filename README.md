# FMGE Prep

A full-stack medical exam preparation platform for the **Foreign Medical Graduate Examination (FMGE)** in India. Built with React, Tailwind CSS, Node.js + Express, MongoDB Atlas (Mongoose), and server-side Gemini AI.

## Features

- **Authentic FMGE Structure (19 Subjects, 2 Papers)**:
  - **Morning Paper (12 subjects, 150 MCQs, 3 hours)**: Anatomy, Physiology, Biochemistry, Pathology, Microbiology, Pharmacology, Dermatology, Pediatrics, Psychiatry, PSM (Community Medicine), Anaesthesia, Orthopedics.
  - **Afternoon Paper (7 subjects, 150 MCQs, 3 hours)**: Medicine, General Surgery, Obstetrics & Gynaecology, Radiology, Ophthalmology, ENT, Forensic Medicine.
  - 4 options (`A`–`D`), zero negative marking, and **150/300 combined pass-mark** tracking across Morning + Afternoon papers.
- **Practice Mode**: Filter by Paper, Subject(s), Topic, PYQ-only, AI-generated, Unattempted, Previously Incorrect, Bookmarked, Difficulty, and Keyword Search. Keyboard shortcuts (`A`–`D` or `1`–`4` to answer, `N` for next).
- **Strict Answer Secrecy & Quality Gating**: `correctKey` and `explanation` are never sent to the client until submitted, and `flagged: true` questions are automatically excluded from Practice and Mock Tests until approved by an admin.
- **Deep Clinical Explanations & Gemini Tutor**: Every answered question reveals Why Correct, Why Each Other Option Is Wrong, Core Concept Tested, High-Yield Takeaway, and Mnemonic—plus **Explain more**, **Explain like I'm a beginner**, and **Give me a similar question** via `/api/explain`.
- **Mock Test Mode**: Full 150-question / 3-hour subject-weighted papers plus Quick 30-question / 36-minute Mini-Mocks, live countdown timer, question palette, mark-for-review, and full post-exam review.
- **Admin Quality & Quota Tools**:
  - `/admin/flagged` — Admin-only queue to review, edit, approve, or delete questions flagged by the second-pass verifier.
  - `/admin/stats` — Admin-only dashboard showing live question counts per subject and per topic versus the **10,100-question FMGE quota**.

---

## 1. Install

```bash
npm install
```

## 2. Environment Setup

Create a `.env` file in the project root (copy from `.env.example`):

```env
MONGODB_URI="mongodb+srv://<username>:<password>@<cluster>.mongodb.net/fmge_prep?retryWrites=true&w=majority"
GEMINI_API_KEY="your-gemini-api-key"
ADMIN_PASSCODE="choose-a-strong-admin-password"
```

- `MONGODB_URI`, `GEMINI_API_KEY`, and `ADMIN_PASSCODE` are read strictly on the server and never exposed to the browser.
- No `GEMINI_MODEL` or `JWT_SECRET` environment variables are required: the app and scripts automatically use the fast Gemini Flash model (`gemini-4-hydrogen`) and auto-generate a cryptographically random signing key (persisted in MongoDB Atlas on first boot).
- If `MONGODB_URI` is left blank, the web app boots in Preview Mode with 30 curated sample MCQs (plus 2 sample flagged items in `/admin/flagged`).

Run the full-stack server on port `3000`:

```bash
npm run dev
```

Build and run for production:

```bash
npm run build
npm start
```

---

## 3. Bulk 10,100-MCQ & FMGE PYQ Generator (`fmge_prep` Database)

All server routes and scripts explicitly target the **`fmge_prep`** database in MongoDB Atlas. The generator uses `/scripts/topics.js` covering **20–26 high-yield MBBS/FMGE topics per subject** summing to **10,100 MCQs** — including **~20% FMGE Previous Year Questions (2018–2025)** alongside **~80% clinical/recall FMGE MCQs**:
- **Morning Paper (6,000)**: Anatomy 600, Physiology 600, Biochemistry 500, Pathology 700, Microbiology 600, Pharmacology 700, Dermatology 250, Pediatrics 450, Psychiatry 300, PSM 700, Anaesthesia 250, Orthopedics 350.
- **Afternoon Paper (4,100)**: Medicine 1,000, General Surgery 800, Obstetrics & Gynaecology 800, Radiology 300, Ophthalmology 400, ENT 400, Forensic Medicine 400.

You can run generation either **directly in the browser** via `/admin/stats` (sign in with `ADMIN_PASSCODE` and click **Start Generation**) or from the CLI:

Built-in reliability safeguards:
- 10 MCQs per Gemini call in strict JSON (`responseMimeType: "application/json"`), randomized option keys `A`–`D`, ~60% clinical vignette / 30% recall / 10% investigation-based, 30% easy / 50% medium / 20% hard.
- Passes the last 15 stems for each topic into the prompt as `"do not repeat"`, validates all fields & option uniqueness, and deduplicates via SHA-256 normalized `questionHash` plus an 80-character prefix similarity check.
- Configurable concurrency (default `3`), rate-limit delay, exponential backoff retries, `insertMany(..., { ordered: false })`, and automatic resume via `seed_progress`.

### A. Dry Run (prints 3 validated sample questions without saving to MongoDB)

```bash
node scripts/bulk-generate.js --subject=Anatomy --dry-run
```

### B. 200-Question Test Run (or PYQ-only run)

```bash
node scripts/bulk-generate.js --subject=Anatomy --limit=200 --concurrency=3 --delay-ms=1000
node scripts/bulk-generate.js --pyq-only --concurrency=3 --delay-ms=1000
```

*(Aliases like `--subject=PSM`, `--subject=OBG`, `--subject=Surgery`, and `--subject=FMT` are supported.)*

### C. Full 10,100-Question Run (PYQs + AI; Ctrl+C safe; re-running resumes via `seed_progress`)

```bash
node scripts/bulk-generate.js --concurrency=3 --delay-ms=1000
```

Progress logs print in real time:
```text
Anatomy > Brachial plexus and upper limb nerve injuries [PYQ]: 34/35 | total 1,230/10,100
```

---

## 4. Second-Pass Quality Verification (`/scripts/verify-pass.js`)

Independently asks Gemini to answer every unverified question **without seeing the stored `correctKey` or explanation**. Any discrepancy automatically sets `flagged: true` and `flagReason`, excluding the question from Practice and Mock Tests until reviewed on `/admin/flagged`.

```bash
# Test verify pass on 20 questions first
node scripts/verify-pass.js --limit=20 --concurrency=3 --delay-ms=800

# Run verify pass across a single subject
node scripts/verify-pass.js --subject=Anatomy --concurrency=3 --delay-ms=800

# Run full verify pass across all unverified questions (resumes automatically)
node scripts/verify-pass.js --concurrency=3 --delay-ms=800
```

Then open `/admin/flagged` to review, edit, approve, or delete flagged questions, and `/admin/stats` to monitor subject-by-subject counts against the 10,100 target.

---

## 5. Previous Year Questions & Sample Seeding

```bash
# Seed the 30 curated sample questions into an empty MongoDB Atlas cluster
npm run seed:sample

# Import your own PYQ CSV/JSON file (generates missing explanations via Gemini)
node scripts/import-pyq.js --file=scripts/sample-pyqs.csv --delay-ms=1000
```
