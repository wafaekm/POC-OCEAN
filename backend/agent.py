import os
import sys
import json
import time
import logging

# Permet d'importer tools.py et prompts.py depuis le même dossier,
# que ce fichier soit lancé directement ou importé comme module.
_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from dotenv import load_dotenv
load_dotenv()

from mistralai.client import Mistral
from tools import TOOLS, TOOL_DISPATCH, VISUAL_TOOLS, TOOL_SUGGESTIONS, DEFAULT_SUGGESTIONS
from prompts import SYSTEM

MODEL = "mistral-small-latest"
client = Mistral(api_key=os.environ["MISTRAL_API_KEY"])
CALL_RETRY_DELAY = 15  # secondes entre chaque retry d'appel LLM


def _chat_complete(messages: list, emit=None) -> object:
    """Appelle Mistral avec retry par appel en cas de 429."""
    for attempt in range(6):
        try:
            return client.chat.complete(model=MODEL, messages=messages, tools=TOOLS)
        except Exception as e:
            if "429" in str(e) or "429" in repr(e):
                delay = CALL_RETRY_DELAY * (attempt + 1)
                logging.warning(f"[429] Appel Mistral — attente {delay}s (tentative {attempt+1}/6)...")
                if emit:
                    emit("retry", f"Limite atteinte — nouvelle tentative dans {delay}s…")
                time.sleep(delay)
                continue
            raise
    raise Exception("[429] Impossible d'appeler Mistral après 6 tentatives.")


def run_agent(question: str, on_event=None) -> dict:
    """
    Envoie une question à Mistral avec tool calling.
    Retourne : {"type": "text"|"map"|"chart", "text": str, "visual": dict|None}
    on_event(type, message) est appelé à chaque étape pour le streaming SSE.
    """
    def emit(evt_type: str, msg: str):
        if on_event:
            try:
                on_event(evt_type, msg)
            except Exception:
                pass

    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user",   "content": question},
    ]
    last_visual = None
    last_tool_name = None
    call_index = 0

    while True:
        call_index += 1
        emit("thinking", "Interrogation de Mistral…")
        logging.info(f"  [MISTRAL #{call_index}] Envoi de {len(messages)} messages...")
        response = _chat_complete(messages, emit)
        msg = response.choices[0].message
        logging.info(f"  [MISTRAL #{call_index}] Réponse — tool_calls={len(msg.tool_calls) if msg.tool_calls else 0}")

        assistant_msg = {"role": "assistant", "content": msg.content or ""}
        if msg.tool_calls:
            assistant_msg["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in msg.tool_calls
            ]
        messages.append(assistant_msg)

        if not msg.tool_calls:
            text = msg.content or ""
            result_type = last_visual["type"] if last_visual else "text"
            suggestions = TOOL_SUGGESTIONS.get(last_tool_name, DEFAULT_SUGGESTIONS)
            logging.info(f"  [FINAL] type={result_type}, texte={len(text)} chars, visual={'oui' if last_visual else 'non'}")
            if last_visual:
                return {"type": last_visual["type"], "text": text, "visual": last_visual["data"], "suggestions": suggestions}
            return {"type": "text", "text": text, "suggestions": suggestions}

        for call in msg.tool_calls:
            name = call.function.name
            args = call.function.arguments
            if isinstance(args, str):
                args = json.loads(args) if args else {}
            logging.info(f"  [TOOL] {name}({args})")

            emit("tool_call", name)
            fn = TOOL_DISPATCH.get(name)
            result = fn(args) if fn else {"error": f"Outil inconnu : {name}"}
            last_tool_name = name
            emit("tool_result", name)
            logging.info(f"  [TOOL] {name} → {'erreur' if 'error' in result else 'ok'}")

            if name in VISUAL_TOOLS:
                # N'envoie qu'un résumé texte à l'agent (économie de tokens)
                if name in ("get_flood_zones", "get_critical_networks"):  # → carte
                    last_visual = {
                        "type": "map",
                        "data": {
                            "geojson":    result["geojson"],
                            "center":     result["center"],
                            "zoom":       result["zoom"],
                            "layer_type": result["layer_type"],
                        },
                    }
                else:  # get_flood_scenarios, get_xynthia_simulation
                    last_visual = {
                        "type": "chart",
                        "data": {
                            "labels":     result["labels"],
                            "values":     result["values"],
                            "chart_type": result["chart_type"],
                            "unit":       result.get("unit", ""),
                            "station":    result.get("station", ""),
                        },
                    }
                tool_content = result["summary"]
            else:
                tool_content = json.dumps(result, ensure_ascii=False)

            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "name": name,
                "content": tool_content,
            })


# ── Test CLI ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys as _sys
    _sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
    print("Agent Géo-Twin Littoral — La Rochelle (tape 'exit' pour quitter)\n")
    while True:
        question = input("Question : ").strip()
        if not question or question.lower() in ("exit", "quit", "q"):
            break
        print()
        result = run_agent(question)
        print(result["text"])
        if result["type"] != "text":
            print(f"\n[Visualisation : type={result['type']}]")
        print()
