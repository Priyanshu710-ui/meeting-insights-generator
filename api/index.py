"""Meeting Insights Generator - FastAPI backend (runs locally and on Vercel).

One free Groq API key powers both steps:
  1. Speech-to-Text  -> Whisper (whisper-large-v3-turbo)
  2. LLM             -> Llama 3.3 70B with JSON output
"""
import json
import os
import time

import requests
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

try:  # optional: loads .env when running locally
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

GROQ_URL = "https://api.groq.com/openai/v1"
STT_MODEL = os.getenv("GROQ_STT_MODEL", "whisper-large-v3-turbo")
LLM_MODEL = os.getenv("GROQ_LLM_MODEL", "openai/gpt-oss-120b")
CHUNK_CHARS = 18000

app = FastAPI(title="Meeting Insights Generator")

SYSTEM_PROMPT = """You turn meeting transcripts into structured notes.
Return ONLY a JSON object with exactly these keys:
{
  "title": "short descriptive meeting title",
  "summary": "3-5 sentence summary of what the meeting covered and concluded",
  "key_points": ["main discussion points"],
  "decisions": [{"decision": "what was decided", "context": "why, in one short line"}],
  "action_items": [{"task": "what needs to be done", "owner": "person's name or 'Unassigned'", "deadline": "date/timeframe as said, or null", "priority": "high|medium|low"}],
  "deadlines": [{"item": "what is due", "date": "when"}],
  "participants": ["names mentioned as speaking or assigned work"],
  "open_questions": ["unresolved questions or blockers"]
}
Rules: use only information in the transcript, never invent names or dates.
Use empty arrays when nothing applies. Keep each item to one clear sentence."""

MERGE_PROMPT = """You receive JSON notes extracted from consecutive parts of ONE meeting.
Merge them into a single JSON object with the same keys and structure. Remove duplicates,
write one coherent summary, and keep every distinct decision, action item and deadline."""


def _key() -> str:
    key = os.getenv("GROQ_API_KEY")
    if not key:
        raise HTTPException(500, "GROQ_API_KEY is not set. Add it to .env (local) or Vercel Environment Variables.")
    return key


def _post(path: str, retries: int = 2, **kwargs):
    headers = {"Authorization": f"Bearer {_key()}"}
    for attempt in range(retries + 1):
        r = requests.post(f"{GROQ_URL}{path}", headers=headers, timeout=120, **kwargs)
        if r.status_code == 429 and attempt < retries:
            time.sleep(6 * (attempt + 1))  # free tier rate limit: wait and retry
            continue
        if not r.ok:
            try:
                msg = r.json()["error"]["message"]
            except Exception:
                msg = r.text[:300]
            raise HTTPException(r.status_code if r.status_code in (400, 401, 413, 429) else 502, msg)
        return r.json()


def _chat_json(system: str, user: str) -> dict:
    data = _post("/chat/completions", json={
        "model": LLM_MODEL,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    })
    try:
        return json.loads(data["choices"][0]["message"]["content"])
    except (KeyError, ValueError):
        raise HTTPException(502, "The model returned an unreadable answer. Please try again.")


def _chunks(text: str):
    parts, current = [], ""
    for line in text.splitlines(keepends=True):
        if len(current) + len(line) > CHUNK_CHARS and current:
            parts.append(current)
            current = ""
        current += line
    if current.strip():
        parts.append(current)
    return parts or [text]


def _clean(d: dict) -> dict:
    lists = ["key_points", "decisions", "action_items", "deadlines", "participants", "open_questions"]
    out = {"title": d.get("title") or "Untitled meeting", "summary": d.get("summary") or ""}
    for k in lists:
        v = d.get(k)
        out[k] = v if isinstance(v, list) else []
    for a in out["action_items"]:
        if isinstance(a, dict):
            a["owner"] = a.get("owner") or "Unassigned"
            a["priority"] = str(a.get("priority") or "medium").lower()
    return out


class AnalyzeIn(BaseModel):
    transcript: str


@app.get("/api/health")
def health():
    return {"ok": True, "key_configured": bool(os.getenv("GROQ_API_KEY")), "stt": STT_MODEL, "llm": LLM_MODEL}


@app.post("/api/transcribe")
async def transcribe(file: UploadFile = File(...)):
    audio = await file.read()
    if not audio:
        raise HTTPException(400, "The audio file is empty.")
    data = _post("/audio/transcriptions",
                 data={"model": STT_MODEL, "response_format": "verbose_json", "temperature": "0"},
                 files={"file": (file.filename or "audio.webm", audio, file.content_type or "audio/webm")})
    return {"transcript": (data.get("text") or "").strip(), "duration": data.get("duration")}


@app.post("/api/analyze")
def analyze(body: AnalyzeIn):
    text = body.transcript.strip()
    if len(text) < 40:
        raise HTTPException(400, "The transcript is too short to analyse.")
    parts = _chunks(text)
    results = [_chat_json(SYSTEM_PROMPT, f"Transcript:\n\n{p}") for p in parts]
    merged = results[0] if len(results) == 1 else _chat_json(MERGE_PROMPT, json.dumps(results))
    return _clean(merged)


# Local development: serve the UI from /public (on Vercel the CDN serves it instead)
_public = os.path.join(os.path.dirname(__file__), "..", "public")
if os.path.isdir(_public):
    app.mount("/", StaticFiles(directory=_public, html=True), name="public")
