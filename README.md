# MediGuide AI

MediGuide AI is a responsive healthcare-information MVP for understanding medical reports and exploring a sensible next step. It is an educational tool, not a medical device or a substitute for a clinician.

## Run the frontend

```powershell
npm install
npm run dev
```

Vite serves the app at `http://localhost:5173`. The complete demo flow works without credentials. Select **Explore with a sample report** to see the fictional blood panel, then review its analysis, ask MediAI a question, explore nearby demo care, and request a demo appointment.

## Run the API

In another terminal:

```powershell
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API is available at `http://localhost:8000`; interactive docs are at `/docs`. SQLite initializes on startup. Vite proxies `/api` to port 8000.

## MVP boundaries

- Browser demo uploads retain only filename and metadata in the current session. The API currently saves file metadata only and does not persist report contents. Add private, encrypted object storage and authentication before handling real health documents.
- The included sample report and provider profiles are fictional. The map is illustrative; provider details, ratings, availability, and appointment requests are not real.
- `GEMMA_API_URL`, `GEMMA_API_KEY`, and `GEMMA_MODEL` configure the optional server-side Google Generative Language (Gemma) chat adapter. Without a key, the API returns a safe, labeled educational fallback. Never expose provider keys to the browser. The included demo frontend does not require the API to be running.
- MediGuide AI does not diagnose, prescribe medicines, recommend dosage changes, or replace professional medical advice. For a medical emergency, contact local emergency services.