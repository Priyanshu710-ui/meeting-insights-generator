# Meeting Insights Generator

A polished meeting workspace with a redesigned responsive interface, dark/light themes, recording or transcript input, AI-generated notes, task tracking, and report export.

Turn a meeting recording or transcript into a summary, decisions, action items, task owners and deadlines.

**Stack:** Python (FastAPI) · Groq Whisper (speech-to-text) · Groq Llama 3.3 70B (LLM, JSON output) · responsive HTML/CSS/JS dashboard · Vercel

One **free** Groq key covers both the speech-to-text and the LLM.

## 1. Get the free API key
1. Sign up at https://console.groq.com (no credit card).
2. Open **API Keys** and create a key.

## 2. Run locally in VS Code
```bash
python -m venv .venv
# Windows: .venv\Scripts\activate      Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # Windows: copy .env.example .env
# open .env and paste your key after GROQ_API_KEY=
uvicorn api.index:app --reload --port 8000
```
Open http://localhost:8000. (Or press F5 in VS Code and pick "Run Meeting Insights".)

Check the key is loaded: http://localhost:8000/api/health

## 3. Deploy to Vercel
**Option A: CLI**
```bash
npm i -g vercel
vercel            # follow prompts
vercel env add GROQ_API_KEY     # paste your key, select all environments
vercel --prod
```
**Option B: GitHub**
1. Push this folder to a GitHub repo (`.env` is git-ignored).
2. On vercel.com choose **Add New > Project**, import the repo.
3. Under **Environment Variables** add `GROQ_API_KEY`, then **Deploy**.

## Project layout
```
api/index.py      FastAPI backend: /api/transcribe, /api/analyze, /api/health
public/           index.html, style.css, app.js (the UI)
vercel.json       routes /api/* to the Python function
requirements.txt  Python dependencies
```

## Limits to know about
- **Vercel accepts request bodies up to about 4.5 MB**, so hosted audio is capped at 4 MB (roughly 4 minutes of MP3). Locally the cap is 25 MB (Groq's limit). For long meetings, paste the transcript or run locally.
- Groq's free tier is rate limited; the backend retries automatically on 429 errors. Long transcripts are split into chunks and merged.
- History and task check-marks are stored in your browser (localStorage) only.
- Change models with `GROQ_STT_MODEL` / `GROQ_LLM_MODEL` in `.env` if Groq renames them.
