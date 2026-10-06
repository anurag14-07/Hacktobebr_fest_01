# MediGuide AI

MediGuide AI helps you understand medical reports in everyday language, keep chat history under your account, and find nearby clinics from OpenStreetMap on an interactive map. It is an educational tool, not a medical device or a substitute for a clinician.

## Run the API

```powershell
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn main:app --reload --port 8000
```

Add a `GEMMA_API_KEY` in `backend/.env` if you want live Gemma answers. Without a key, MediAI still works with a safe educational fallback. Never put provider keys in the frontend.

## Run the frontend

```powershell
npm install
npm run dev
```

Vite serves the app at `http://localhost:5173` and proxies `/api` to port 8000.

Create an account, then upload a report, chat with MediAI, and search nearby care. Chat history and reports are stored per user in SQLite (`backend/mediguide.db`).

## What is real now

- Register / sign in, with chats and reports saved to your account
- PDF text extraction for report context (images stay as files you can discuss in chat)
- Nearby hospital and clinic listings with interactive OpenStreetMap markers and directions
- Optional Gemma answers when `GEMMA_API_KEY` is set

## Boundaries

- This MVP stores account data on the local API server. Add encrypted object storage before handling sensitive production health documents.
- MediGuide AI does not diagnose, prescribe medicines, recommend dosage changes, or replace professional medical advice. For a medical emergency, contact local emergency services.
