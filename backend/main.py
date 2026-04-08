import os
import sys
import time
import asyncio
import logging
import json

# Assure que backend/ est dans le path pour les imports internes
_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agent import run_agent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)

MAX_RETRIES = 3
RETRY_DELAY = 12  # secondes (backoff : 12s, 24s)

MSG_RATE_LIMIT = (
    "Le service Mistral est momentanément surchargé (limite de requêtes atteinte). "
    "Patientez une minute puis réessayez."
)


def _is_429(e: Exception) -> bool:
    return "429" in str(e) or "429" in repr(e)


async def run_agent_with_retry(message: str) -> dict:
    for attempt in range(MAX_RETRIES):
        logging.info(f"[AGENT] Tentative {attempt + 1}/{MAX_RETRIES} — '{message[:60]}'")
        try:
            result = await asyncio.to_thread(run_agent, message)
            logging.info(f"[AGENT] Succès — type={result['type']} visual={'oui' if result.get('visual') else 'non'}")
            return result
        except Exception as e:
            if _is_429(e):
                if attempt < MAX_RETRIES - 1:
                    delay = RETRY_DELAY * (attempt + 1)
                    logging.warning(f"[429] Rate limit Mistral — attente {delay}s avant retry...")
                    await asyncio.sleep(delay)
                    continue
                logging.error("[429] Toutes les tentatives épuisées.")
            else:
                logging.error(f"[ERREUR] {type(e).__name__}: {e}")
            raise


def run_agent_sync_with_retry(message: str, on_event=None) -> dict:
    """Version synchrone du retry (pour SSE dans un thread)."""
    def emit(evt_type, msg):
        if on_event:
            try:
                on_event(evt_type, msg)
            except Exception:
                pass

    for attempt in range(MAX_RETRIES):
        logging.info(f"[AGENT] Tentative {attempt + 1}/{MAX_RETRIES} — '{message[:60]}'")
        try:
            return run_agent(message, on_event)
        except Exception as e:
            if _is_429(e):
                if attempt < MAX_RETRIES - 1:
                    delay = RETRY_DELAY * (attempt + 1)
                    emit("retry", f"Limite de requêtes atteinte — nouvelle tentative dans {delay}s…")
                    logging.warning(f"[429] Rate limit — attente {delay}s...")
                    time.sleep(delay)
                    continue
                logging.error("[429] Toutes les tentatives épuisées.")
            else:
                logging.error(f"[ERREUR] {type(e).__name__}: {e}")
            raise


app = FastAPI(title="Géo-Twin Littoral API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    history: list = []


@app.post("/chat")
async def chat(req: ChatRequest):
    logging.info(f"[REQUEST] {req.message[:80]}")
    try:
        result = await run_agent_with_retry(req.message)
    except Exception as e:
        if _is_429(e):
            logging.warning("[RESPONSE] Rate limit renvoyé au frontend")
            return {"response": MSG_RATE_LIMIT, "type": "text", "visual": None}
        logging.error(f"[RESPONSE] Erreur non gérée : {e}")
        raise
    return {
        "response":    result["text"],
        "type":        result["type"],
        "visual":      result.get("visual"),
        "suggestions": result.get("suggestions", []),
    }


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    loop = asyncio.get_event_loop()
    aqueue: asyncio.Queue = asyncio.Queue()

    def on_event(evt_type: str, msg: str):
        loop.call_soon_threadsafe(aqueue.put_nowait, {"type": evt_type, "message": msg})

    async def agent_task():
        try:
            result = await asyncio.to_thread(run_agent_sync_with_retry, req.message, on_event)
            await aqueue.put({"type": "done", "result": result})
        except Exception as e:
            if _is_429(e):
                await aqueue.put({"type": "done", "result": {
                    "text": MSG_RATE_LIMIT, "type": "text", "suggestions": [],
                }})
            else:
                await aqueue.put({"type": "error", "message": str(e)})

    asyncio.create_task(agent_task())

    async def generate():
        while True:
            event = await aqueue.get()
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            if event["type"] in ("done", "error"):
                break

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/health")
async def health():
    return {"status": "ok"}
