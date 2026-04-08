import os
import sys
import json
import glob
import math
import random
import logging
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
# Outils marée (inchangés)
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
    """Appelle l'API SHOM et rééchantillonne à l'heure."""
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
    """Retourne la hauteur de marée la plus proche de maintenant."""
    global _maree_cache, _maree_cache_ts
    now = datetime.now()

    if _maree_cache is not None and _maree_cache_ts is not None:
        if now - _maree_cache_ts < CACHE_TTL:
            return _maree_cache

    if now >= CUTOFF:
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
    """Retourne la hauteur de marée pour une date et heure données."""
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
# Outils visualisation (nouveaux)
# ---------------------------------------------------------------------------

def get_flood_zones(scenario: str, water_level: float) -> dict:
    """Zones submergées simulées autour de La Rochelle pour un scénario donné."""
    scenarios = {
        "Xynthia": {
            "polys": [
                [[-1.228, 46.172], [-1.185, 46.172], [-1.185, 46.152], [-1.228, 46.152], [-1.228, 46.172]],
                [[-1.132, 46.133], [-1.100, 46.133], [-1.100, 46.113], [-1.132, 46.113], [-1.132, 46.133]],
                [[-1.200, 46.166], [-1.170, 46.166], [-1.170, 46.150], [-1.200, 46.150], [-1.200, 46.166]],
            ],
            "desc": "Scénario Xynthia (2010) — submersion exceptionnelle, coeff. 102"
        },
        "centennal": {
            "polys": [
                [[-1.215, 46.170], [-1.178, 46.170], [-1.178, 46.158], [-1.215, 46.158], [-1.215, 46.170]],
                [[-1.120, 46.127], [-1.102, 46.127], [-1.102, 46.115], [-1.120, 46.115], [-1.120, 46.127]],
            ],
            "desc": "Événement centennal (T=100 ans)"
        },
        "SSP4.5_2050": {
            "polys": [
                [[-1.221, 46.171], [-1.182, 46.171], [-1.182, 46.154], [-1.221, 46.154], [-1.221, 46.171]],
                [[-1.128, 46.131], [-1.102, 46.131], [-1.102, 46.116], [-1.128, 46.116], [-1.128, 46.131]],
                [[-1.197, 46.164], [-1.172, 46.164], [-1.172, 46.151], [-1.197, 46.151], [-1.197, 46.164]],
            ],
            "desc": "Scénario SSP4.5 à l'horizon 2050 (+30cm élévation)"
        }
    }
    sc = scenarios.get(scenario, scenarios["Xynthia"])
    features = [
        {
            "type": "Feature",
            "properties": {"scenario": scenario, "water_level_m": water_level, "description": sc["desc"]},
            "geometry": {"type": "Polygon", "coordinates": [poly]}
        }
        for poly in sc["polys"]
    ]
    return {
        "geojson": {"type": "FeatureCollection", "features": features},
        "center": [-1.16, 46.16],
        "zoom": 12,
        "layer_type": "fill",
        "summary": (
            f"{len(features)} zones submergées pour le scénario {scenario} "
            f"(niveau {water_level}m ZH SHOM). {sc['desc']}."
        )
    }


def get_coastal_infrastructure(radius_km: float) -> dict:
    """Points d'infrastructure côtière autour de La Rochelle avec niveau de risque."""
    all_infra = [
        {"name": "Port de La Pallice",            "type": "Port industriel",             "lon": -1.227, "lat": 46.167, "risk": "élevé"},
        {"name": "Tour de la Lanterne",            "type": "Monument côtier",             "lon": -1.154, "lat": 46.157, "risk": "modéré"},
        {"name": "Station marégraphique SHOM",     "type": "Station de mesure",           "lon": -1.232, "lat": 46.155, "risk": "faible"},
        {"name": "Digue de Chef-de-Baie",          "type": "Ouvrage de protection",       "lon": -1.196, "lat": 46.164, "risk": "élevé"},
        {"name": "Port des Minimes",               "type": "Port de plaisance",           "lon": -1.168, "lat": 46.148, "risk": "modéré"},
        {"name": "Station météo La Rochelle",      "type": "Station de mesure",           "lon": -1.195, "lat": 46.178, "risk": "faible"},
        {"name": "Écluse du Gabut",                "type": "Ouvrage de protection",       "lon": -1.150, "lat": 46.159, "risk": "modéré"},
        {"name": "Terminal pétrolier La Pallice",  "type": "Infrastructure industrielle", "lon": -1.219, "lat": 46.161, "risk": "élevé"},
        {"name": "Plage de La Concurrence",        "type": "Zone de loisirs",             "lon": -1.162, "lat": 46.153, "risk": "élevé"},
        {"name": "Vieux-Port de La Rochelle",      "type": "Port historique",             "lon": -1.151, "lat": 46.157, "risk": "modéré"},
    ]

    cx, cy = -1.15, 46.16
    features = []
    for infra in all_infra:
        dx = (infra["lon"] - cx) * 111 * math.cos(math.radians(cy))
        dy = (infra["lat"] - cy) * 111
        if math.sqrt(dx**2 + dy**2) <= radius_km:
            features.append({
                "type": "Feature",
                "properties": {"name": infra["name"], "type": infra["type"], "risk": infra["risk"]},
                "geometry": {"type": "Point", "coordinates": [infra["lon"], infra["lat"]]}
            })

    return {
        "geojson": {"type": "FeatureCollection", "features": features},
        "center": [-1.18, 46.16],
        "zoom": 12,
        "layer_type": "circle",
        "summary": f"{len(features)} infrastructures côtières dans un rayon de {radius_km}km autour de La Rochelle."
    }


def get_sea_level_trend(station: str, years: int) -> dict:
    """Série temporelle de la tendance du niveau marin (données simulées)."""
    rng = random.Random(42)          # seed fixe → résultats reproductibles
    current_year = 2025
    start_year = max(current_year - years, 1960)
    trend_mm_per_year = 3.2          # tendance atlantique nord observée

    labels, values = [], []
    for y in range(start_year, current_year + 1):
        labels.append(str(y))
        elapsed = y - start_year
        anomaly_mm = elapsed * trend_mm_per_year + rng.gauss(0, 8)
        values.append(round(anomaly_mm, 1))

    total_rise = (current_year - start_year) * trend_mm_per_year
    return {
        "labels": labels,
        "values": values,
        "chart_type": "line",
        "unit": "mm",
        "station": station,
        "summary": (
            f"Tendance du niveau marin à {station} sur {current_year - start_year} ans : "
            f"+{trend_mm_per_year}mm/an en moyenne, soit +{total_rise:.0f}mm au total."
        )
    }


# ---------------------------------------------------------------------------
# Définition des outils Mistral
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
    {
        "type": "function",
        "function": {
            "name": "get_flood_zones",
            "description": (
                "Retourne les zones géographiques submergées (carte) pour un scénario de submersion marine "
                "autour de La Rochelle. Utiliser quand l'utilisateur demande à voir les zones inondées, "
                "submergées ou à risque pour un scénario Xynthia, centennal ou climatique."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "scenario": {
                        "type": "string",
                        "description": "Scénario de submersion : 'Xynthia', 'centennal', ou 'SSP4.5_2050'",
                        "enum": ["Xynthia", "centennal", "SSP4.5_2050"]
                    },
                    "water_level": {
                        "type": "number",
                        "description": "Niveau d'eau en mètres ZH SHOM (ex: 7.13 pour Xynthia, 5.63 pour centennal)"
                    }
                },
                "required": ["scenario", "water_level"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_coastal_infrastructure",
            "description": (
                "Retourne les infrastructures côtières (ports, digues, stations de mesure) autour de "
                "La Rochelle avec leur niveau de risque de submersion. Utiliser pour afficher une carte "
                "des points d'infrastructure côtière à risque."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "radius_km": {
                        "type": "number",
                        "description": "Rayon de recherche en kilomètres autour de La Rochelle (ex: 10)"
                    }
                },
                "required": ["radius_km"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_sea_level_trend",
            "description": (
                "Retourne une série temporelle de la tendance d'élévation du niveau de la mer pour "
                "une station marégraphique. Utiliser pour afficher un graphique d'évolution du niveau "
                "marin sur plusieurs années."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "station": {
                        "type": "string",
                        "description": "Nom de la station marégraphique (ex: 'La Rochelle', 'La Pallice')"
                    },
                    "years": {
                        "type": "integer",
                        "description": "Nombre d'années d'historique à analyser (ex: 10, 20, 30)"
                    }
                },
                "required": ["station", "years"]
            }
        }
    },
]

SYSTEM = (
    "Tu es un assistant expert en submersion marine et gestion des risques côtiers pour La Rochelle. "
    "Tu réponds UNIQUEMENT en français. "
    "Tu utilises les outils disponibles pour répondre précisément aux questions. "
    "Tes réponses sont claires et utiles pour les gestionnaires de crise. "
    "Quand tu utilises get_flood_zones, get_coastal_infrastructure ou get_sea_level_trend, "
    "décris en quelques phrases ce que la visualisation montre : étendues des zones, points clés, "
    "tendances observées. La carte ou le graphique sera affiché automatiquement à côté de ta réponse."
)

TOOL_DISPATCH = {
    "get_maree_actuelle":         lambda _args: get_maree_actuelle(),
    "get_maree_pour_date":        lambda args: get_maree_pour_date(args["date"], args.get("heure", "12:00")),
    "get_flood_zones":            lambda args: get_flood_zones(args["scenario"], args["water_level"]),
    "get_coastal_infrastructure": lambda args: get_coastal_infrastructure(args["radius_km"]),
    "get_sea_level_trend":        lambda args: get_sea_level_trend(args["station"], args["years"]),
}

# Outils qui produisent une visualisation frontend
VISUAL_TOOLS = {"get_flood_zones", "get_coastal_infrastructure", "get_sea_level_trend"}


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------

def run_agent(question: str) -> dict:
    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user",   "content": question},
    ]
    last_visual = None  # {"type": "map"|"chart", "data": {...}}

    call_index = 0
    while True:
        call_index += 1
        logging.info(f"  [MISTRAL #{call_index}] Envoi de {len(messages)} messages...")
        response = client.chat.complete(model=MODEL, messages=messages, tools=TOOLS)
        msg = response.choices[0].message
        logging.info(f"  [MISTRAL #{call_index}] Réponse reçue — tool_calls={len(msg.tool_calls) if msg.tool_calls else 0}")

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
            text = msg.content or ""
            result_type = last_visual["type"] if last_visual else "text"
            logging.info(f"  [FINAL] type={result_type}, texte={len(text)} chars, visual={'oui' if last_visual else 'non'}")
            if last_visual:
                return {"type": last_visual["type"], "text": text, "visual": last_visual["data"]}
            return {"type": "text", "text": text}

        for call in msg.tool_calls:
            name = call.function.name
            args = call.function.arguments
            if isinstance(args, str):
                args = json.loads(args) if args else {}
            print(f"  → outil : {name}({args})")

            fn = TOOL_DISPATCH.get(name)
            result = fn(args) if fn else {"error": f"Outil inconnu : {name}"}
            logging.info(f"  [TOOL] {name} → {'erreur' if 'error' in result else 'ok'}")

            if name in VISUAL_TOOLS:
                # Stocke les données visuelles complètes pour le frontend
                # Envoie seulement un résumé texte à l'agent (économie de tokens)
                if name in ("get_flood_zones", "get_coastal_infrastructure"):
                    last_visual = {
                        "type": "map",
                        "data": {
                            "geojson":    result["geojson"],
                            "center":     result["center"],
                            "zoom":       result["zoom"],
                            "layer_type": result["layer_type"],
                        }
                    }
                else:  # get_sea_level_trend
                    last_visual = {
                        "type": "chart",
                        "data": {
                            "labels":     result["labels"],
                            "values":     result["values"],
                            "chart_type": result["chart_type"],
                            "unit":       result.get("unit", ""),
                            "station":    result.get("station", ""),
                        }
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


# ---------------------------------------------------------------------------
# Test CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
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
