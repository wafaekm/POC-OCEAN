import sys
import os

# Import agent.py from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agent import run_agent

MAX_RETRIES = 4
RETRY_DELAY = 2.5  # secondes


async def run_agent_with_retry(message: str) -> str:
    for attempt in range(MAX_RETRIES):
        try:
            return await asyncio.to_thread(run_agent, message)
        except Exception as e:
            if "429" in str(e) and attempt < MAX_RETRIES - 1:
                await asyncio.sleep(RETRY_DELAY * (attempt + 1))
                continue
            raise
    raise RuntimeError("Max retries exceeded")

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
    response = await run_agent_with_retry(req.message)
    return {"response": response, "type": "text"}


@app.get("/health")
async def health():
    return {"status": "ok"}
