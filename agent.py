import os
import sys
import json
import glob
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
load_dotenv()

from mistralai.client import Mistral

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "maregraphie")
MODEL = "mistral-small-latest"

client = Mistral(api_key=os.environ["MISTRAL_API_KEY"])

MAREE_BASSE   = 2.07
MAREE_MOYENNE = 4.00
MAREE_HAUTE   = 5.63

# Données validées disponibles jusqu'au 31/12/2025 ; au-delà on appelle l'API
CUTOFF = datetime(2026, 1, 1)
SHOM_API         = "https://services.data.shom.fr/maregraphie/observation/json/34?sources=2&dtStart={start}&dtEnd={end}"
SHOM_API_PREDICT = "https://services.data.shom.fr/maregraphie/observation/json/34?sources=1&dtStart={start}&dtEnd={end}"

# ---------------------------------------------------------------------------
# Outil
# ---------------------------------------------------------------------------

def _phase(h: float) -> str:
    if h <= MAREE_BASSE + 0.3:
        return "basse mer"
    if h >= MAREE_HAUTE - 0.3:
        return "haute mer"
    if h > MAREE_MOYENNE:
        return "flot (montante)"
    return "jusant (descendante)"


def _fetch_api(date_start: datetime, date_end: datetime, predict: bool = False) -> list[dict]:
    """Appelle l'API SHOM et rééchantillonne à l'heure.
    predict=True → sources=1 (prédictions), sinon sources=2 (observations)."""
    template = SHOM_API_PREDICT if predict else SHOM_API
    entries = []
    cursor = date_start
    while cursor <= date_end:
        chunk_end = min(cursor + timedelta(days=30), date_end)
        url = template.format(
            start=cursor.strftime("%Y-%m-%d"),
            end=chunk_end.strftime("%Y-%m-%d"),
        )
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:
                raw = json.loads(resp.read())
        except Exception as e:
            print(f"  [API] erreur : {e}")
            cursor = chunk_end + timedelta(days=1)
            continue

        # L'API SHOM renvoie {"data": [{"value": float, "timestamp": "YYYY/MM/DD HH:MM:SS"}, ...]}
        records = raw.get("data", [])
        for rec in records:
            ts_str = rec.get("timestamp", "")
            val    = rec.get("value")
            if not ts_str or val is None:
                continue
            try:
                ts = datetime.strptime(ts_str, "%Y/%m/%d %H:%M:%S")
            except ValueError:
                continue
            entries.append({"ts": ts, "value": float(val)})

        cursor = chunk_end + timedelta(days=1)

    # Rééchantillonnage : moyenne par tranche HH:00–HH:59
    bins: dict = defaultdict(list)
    for e in entries:
        hour_key = e["ts"].replace(minute=0, second=0, microsecond=0)
        bins[hour_key].append(e["value"])

    return [
        {
            "timestamp": ts.strftime("%Y/%m/%d %H:%M:%S"),
            "value": sum(vals) / len(vals),
        }
        for ts, vals in sorted(bins.items())
    ]


def _read_files() -> list[dict]:
    """Lit les fichiers JSON locaux (données ≤ 2025)."""
    files = sorted(glob.glob(os.path.join(DATA_DIR, "34_*.json")), reverse=True)
    entries = []
    for filepath in files:
        try:
            with open(filepath, encoding="utf-8") as f:
                entries.extend(json.load(f)["data"])
        except Exception:
            continue
    return entries


_maree_cache: dict | None = None
_maree_cache_ts: datetime | None = None
CACHE_TTL = timedelta(minutes=30)


def get_maree_actuelle() -> dict:
    """Retourne la hauteur de marée la plus proche de maintenant (fichiers ou API SHOM)."""
    global _maree_cache, _maree_cache_ts
    now = datetime.now()

    if _maree_cache is not None and _maree_cache_ts is not None:
        if now - _maree_cache_ts < CACHE_TTL:
            return _maree_cache

    if now >= CUTOFF:
        # Données brutes API : fenêtre de 2 jours pour être sûr d'avoir un point récent
        entries = _fetch_api(now - timedelta(days=2), now)
        source = "API SHOM temps différé (sources=2, rééchantillonné à l'heure)"
    else:
        entries = _read_files()
        source = "Fichiers JSON SHOM validés"

    if not entries:
        return {"error": "Aucune donnée marégraphique disponible"}

    best, best_diff = None, None
    for entry in entries:
        try:
            ts = datetime.strptime(entry["timestamp"], "%Y/%m/%d %H:%M:%S")
        except ValueError:
            continue
        diff = abs((now - ts).total_seconds())
        if best_diff is None or diff < best_diff:
            best_diff = diff
            best = entry

    if best is None:
        return {"error": "Impossible de trouver un point marégraphique"}

    h = best["value"]
    _maree_cache = {
        "hauteur_m": round(h, 3),
        "timestamp": best["timestamp"],
        "phase": _phase(h),
        "reference": "zéro hydrographique SHOM",
        "source": source,
    }
    _maree_cache_ts = now
    return _maree_cache


def get_maree_pour_date(date: str, heure: str = "12:00") -> dict:
    """Retourne la hauteur de marée pour une date et heure données (passé ou futur).

    Args:
        date:  format YYYY-MM-DD  (ex: "2026-03-31")
        heure: format HH:MM       (ex: "18:00"), défaut midi
    """
    try:
        target = datetime.strptime(f"{date} {heure}", "%Y-%m-%d %H:%M")
    except ValueError:
        return {"error": f"Format invalide. Utiliser date=YYYY-MM-DD et heure=HH:MM"}

    now = datetime.now()
    futur = target > now

    if futur:
        entries = _fetch_api(target - timedelta(days=1), target + timedelta(days=1), predict=True)
        source = "API SHOM prédictions (sources=1)"
    elif target >= CUTOFF:
        entries = _fetch_api(target - timedelta(days=1), target + timedelta(days=1), predict=False)
        source = "API SHOM observations (sources=2)"
    else:
        entries = _read_files()
        source = "Fichiers JSON SHOM validés"

    if not entries:
        return {"error": "Aucune donnée marégraphique disponible pour cette date"}

    best, best_diff = None, None
    for entry in entries:
        try:
            ts = datetime.strptime(entry["timestamp"], "%Y/%m/%d %H:%M:%S")
        except ValueError:
            continue
        diff = abs((target - ts).total_seconds())
        if best_diff is None or diff < best_diff:
            best_diff = diff
            best = entry

    if best is None:
        return {"error": "Impossible de trouver un point marégraphique pour cette date"}

    h = best["value"]
    return {
        "hauteur_m": round(h, 3),
        "timestamp": best["timestamp"],
        "phase": _phase(h),
        "reference": "zéro hydrographique SHOM",
        "source": source,
        "type": "prédiction" if futur else "observation",
    }


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_maree_actuelle",
            "description": "Retourne la hauteur actuelle de la marée à La Rochelle depuis les données marégraphiques SHOM.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_maree_pour_date",
            "description": (
                "Retourne la hauteur de marée à La Rochelle pour une date et heure précises (passé ou futur). "
                "Utiliser pour 'hier', 'demain', ou toute date spécifique. "
                "Pour le passé : données réelles SHOM. Pour le futur : prédictions SHOM."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "date":  {"type": "string", "description": "Date au format YYYY-MM-DD (ex: '2026-03-31')"},
                    "heure": {"type": "string", "description": "Heure au format HH:MM (ex: '14:00'). Défaut: '12:00'"},
                },
                "required": ["date"],
            },
        },
    },
]

SYSTEM = (
    "Tu es un assistant expert en submersion marine et gestion des risques côtiers pour La Rochelle. "
    "Tu réponds UNIQUEMENT en français. "
    "Tu utilises les outils disponibles pour répondre précisément aux questions. "
    "Tes réponses sont claires et utiles pour les gestionnaires de crise."
)

TOOL_DISPATCH = {
    "get_maree_actuelle":   lambda _args: get_maree_actuelle(),
    "get_maree_pour_date":  lambda args: get_maree_pour_date(args["date"], args.get("heure", "12:00")),
}


def run_agent(question: str) -> str:
    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user",   "content": question},
    ]

    while True:
        response = client.chat.complete(model=MODEL, messages=messages, tools=TOOLS)
        msg = response.choices[0].message

        # Reconstruire le message assistant sous forme de dict sérialisable
        assistant_msg = {"role": "assistant", "content": msg.content or ""}
        if msg.tool_calls:
            assistant_msg["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in msg.tool_calls
            ]
        messages.append(assistant_msg)

        if not msg.tool_calls:
            return msg.content

        for call in msg.tool_calls:
            name = call.function.name
            args = call.function.arguments
            if isinstance(args, str):
                args = json.loads(args) if args else {}
            print(f"  → outil : {name}({args})")

            fn = TOOL_DISPATCH.get(name)
            result = fn(args) if fn else {"error": f"Outil inconnu : {name}"}

            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "name": name,
                "content": json.dumps(result, ensure_ascii=False),
            })


# ---------------------------------------------------------------------------
# Test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("Agent Géo-Twin Littoral - La Rochelle (tape 'exit' pour quitter)\n")
    while True:
        question = input("Question : ").strip()
        if not question or question.lower() in ("exit", "quit", "q"):
            break
        print()
        print(run_agent(question))
        print()
