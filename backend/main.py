import sys
import os

# Import agent.py from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
        "response": result["text"],
        "type":     result["type"],
        "visual":   result.get("visual"),
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
