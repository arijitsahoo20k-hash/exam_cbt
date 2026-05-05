# ExamCBT — BITSAT CBT Platform

A full-featured Computer Based Test platform. 14 preloaded BITSAT mocks, universal ZIP format support, strict fullscreen lock, and Supabase-backed history with per-question answer review.

---

## Quick Start

Extract the ZIP and serve via a local server (required for BITSAT mock loading):
```
npx serve .
# or
python3 -m http.server 8080
```
Then open `http://localhost:8080` and click any mock test card.

> Direct file:// open won't work for preloaded mocks — use a server.

---

## Supabase Setup (History + Answer Review)

Without Supabase the app works fully — history is just disabled.

**1. Create project** at supabase.com

**2. Run schema** — paste `supabase-schema.sql` into Supabase SQL Editor and run it.

**3. Add credentials** to `js/config.js`:
```js
SUPABASE_URL:      'https://YOUR_PROJECT.supabase.co',
SUPABASE_ANON_KEY: 'your-anon-key',
```

**4. Enable Email Auth** — Supabase Dashboard > Authentication > Providers > Email.

Once done: scores + per-question responses are saved automatically. The History section on the dashboard shows all attempts with a "Review Answers" button that opens the full answer review for that attempt.

---

## Custom ZIP Formats

Drop any compatible ZIP into the upload zone. Four formats auto-detected:

### A — BITSAT/NTA Official
```
data.json: { pdfCropperData: { Subject: { Subject: { "1": {que,type} } } },
             testAnswerKey:  { Subject: { Subject: { "1": 2 } } } }  // 1=A 2=B 3=C 4=D
Images:    Subject__--__QNum__--__PartIdx.png
```

### B — Generic CBT (most flexible)
```json
{ "questions": [{ "section":"Physics","text":"...","options":["A","B","C","D"],"answer":"A","image":"q1.png" }] }
```

### C — NTA Flat
```json
{ "questions": [{ "subject":"Chemistry","questionText":"...","options":{"A":"...","B":"..."},"correctOption":"B" }] }
```

### D — Simple text-only (no images)
```json
{ "sections": [{ "name":"Biology","questions":[{ "question":"...","options":["..."],"answer":"C" }] }] }
```

---

## Deployment (Vercel)
Push to GitHub, import on Vercel, add env vars `SUPABASE_URL` + `SUPABASE_ANON_KEY`.
