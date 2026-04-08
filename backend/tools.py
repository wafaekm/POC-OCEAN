"""
Outils disponibles pour l'agent Géo-Twin Littoral.

Pour ajouter un outil :
  1. Écrire la fonction Python ci-dessous
  2. Ajouter son schéma dans TOOLS
  3. Ajouter son dispatcher dans TOOL_DISPATCH
  4. Si elle produit une carte ou un graphique, l'ajouter dans VISUAL_TOOLS
     et gérer son format de retour dans run_agent (backend/agent.py)
"""

import os
import json
import glob
import math
import random
import logging
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta

# Données SHOM locales (fichiers JSON pré-téléchargés)
DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data", "maregraphie"
)

# ── Constantes marée ────────────────────────────────────────────────────────

MAREE_BASSE   = 2.07
MAREE_MOYENNE = 4.00
MAREE_HAUTE   = 5.63

# Données locales validées jusqu'au 31/12/2025 ; au-delà → API SHOM
CUTOFF = datetime(2026, 1, 1)

SHOM_OBS     = "https://services.data.shom.fr/maregraphie/observation/json/34?sources=2&dtStart={start}&dtEnd={end}"
SHOM_PREDICT = "https://services.data.shom.fr/maregraphie/observation/json/34?sources=1&dtStart={start}&dtEnd={end}"

# ── Helpers internes ─────────────────────────────────────────────────────────

def _phase(h: float) -> str:
    if h <= MAREE_BASSE + 0.3:
        return "basse mer"
    if h >= MAREE_HAUTE - 0.3:
        return "haute mer"
    if h > MAREE_MOYENNE:
        return "flot (montante)"
    return "jusant (descendante)"


def _fetch_shom(date_start: datetime, date_end: datetime, predict: bool = False) -> list[dict]:
    """Appelle l'API SHOM et rééchantillonne à l'heure."""
    template = SHOM_PREDICT if predict else SHOM_OBS
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
            logging.warning(f"[SHOM API] erreur : {e}")
            cursor = chunk_end + timedelta(days=1)
            continue

        for rec in raw.get("data", []):
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

    # Rééchantillonnage horaire
    bins: dict = defaultdict(list)
    for e in entries:
        bins[e["ts"].replace(minute=0, second=0, microsecond=0)].append(e["value"])

    return [
        {"timestamp": ts.strftime("%Y/%m/%d %H:%M:%S"), "value": sum(v) / len(v)}
        for ts, v in sorted(bins.items())
    ]


def _read_local_files() -> list[dict]:
    """Lit les fichiers JSON locaux (données ≤ 2025)."""
    entries = []
    for filepath in sorted(glob.glob(os.path.join(DATA_DIR, "34_*.json")), reverse=True):
        try:
            with open(filepath, encoding="utf-8") as f:
                entries.extend(json.load(f)["data"])
        except Exception:
            continue
    return entries


def _closest_entry(entries: list[dict], target: datetime) -> dict | None:
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
    return best


# ── Cache marée actuelle ─────────────────────────────────────────────────────

_maree_cache: dict | None = None
_maree_cache_ts: datetime | None = None
CACHE_TTL = timedelta(minutes=30)


# ── Fonction outil : date/heure ──────────────────────────────────────────────

JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
MOIS  = ["janvier", "février", "mars", "avril", "mai", "juin",
         "juillet", "août", "septembre", "octobre", "novembre", "décembre"]

def get_current_datetime() -> dict:
    """
    Retourne la date et l'heure exactes du serveur.
    À appeler avant get_maree_actuelle ou get_maree_pour_date si l'utilisateur
    mentionne 'aujourd'hui', 'maintenant', 'hier', 'demain', etc.
    """
    now = datetime.now()
    return {
        "datetime":     now.strftime("%Y-%m-%d %H:%M:%S"),
        "date":         now.strftime("%Y-%m-%d"),
        "heure":        now.strftime("%H:%M"),
        "jour_semaine": JOURS[now.weekday()],
        "jour":         now.day,
        "mois":         MOIS[now.month - 1],
        "annee":        now.year,
        "source_donnees": (
            "Fichiers locaux SHOM (2020–2025)"
            if now < CUTOFF
            else "API SHOM temps réel (observations ou prédictions)"
        ),
    }


# ── Fonctions outils : marée ─────────────────────────────────────────────────

def get_maree_actuelle() -> dict:
    """Hauteur de marée la plus proche de maintenant (fichiers locaux ou API SHOM)."""
    global _maree_cache, _maree_cache_ts
    now = datetime.now()

    if _maree_cache and _maree_cache_ts and now - _maree_cache_ts < CACHE_TTL:
        return _maree_cache

    if now >= CUTOFF:
        entries = _fetch_shom(now - timedelta(days=2), now)
        source = "API SHOM observations (sources=2)"
    else:
        entries = _read_local_files()
        source = "Fichiers JSON SHOM validés"

    if not entries:
        return {"error": "Aucune donnée marégraphique disponible"}

    best = _closest_entry(entries, now)
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
    """Hauteur de marée pour une date et heure précises (passé ou futur)."""
    try:
        target = datetime.strptime(f"{date} {heure}", "%Y-%m-%d %H:%M")
    except ValueError:
        return {"error": "Format invalide. Utiliser date=YYYY-MM-DD, heure=HH:MM"}

    now = datetime.now()
    futur = target > now

    if futur:
        entries = _fetch_shom(target - timedelta(days=1), target + timedelta(days=1), predict=True)
        source = "API SHOM prédictions (sources=1)"
    elif target >= CUTOFF:
        entries = _fetch_shom(target - timedelta(days=1), target + timedelta(days=1))
        source = "API SHOM observations (sources=2)"
    else:
        entries = _read_local_files()
        source = "Fichiers JSON SHOM validés"

    if not entries:
        return {"error": "Aucune donnée disponible pour cette date"}

    best = _closest_entry(entries, target)
    if best is None:
        return {"error": "Impossible de trouver un point pour cette date"}

    h = best["value"]
    return {
        "hauteur_m": round(h, 3),
        "timestamp": best["timestamp"],
        "phase": _phase(h),
        "reference": "zéro hydrographique SHOM",
        "source": source,
        "type": "prédiction" if futur else "observation",
    }


# ── Fonctions outils : visualisation ─────────────────────────────────────────


def get_coastal_infrastructure(radius_km: float) -> dict:
    """
    Infrastructures côtières (ports, digues, stations) autour de La Rochelle.
    Retourne GeoJSON points + métadonnées carte.
    """
    all_infra = [
        {"name": "Port de La Pallice",           "type": "Port industriel",             "lon": -1.227, "lat": 46.167, "risk": "élevé"},
        {"name": "Tour de la Lanterne",           "type": "Monument côtier",             "lon": -1.154, "lat": 46.157, "risk": "modéré"},
        {"name": "Station marégraphique SHOM",    "type": "Station de mesure",           "lon": -1.232, "lat": 46.155, "risk": "faible"},
        {"name": "Digue de Chef-de-Baie",         "type": "Ouvrage de protection",       "lon": -1.196, "lat": 46.164, "risk": "élevé"},
        {"name": "Port des Minimes",              "type": "Port de plaisance",           "lon": -1.168, "lat": 46.148, "risk": "modéré"},
        {"name": "Station météo La Rochelle",     "type": "Station de mesure",           "lon": -1.195, "lat": 46.178, "risk": "faible"},
        {"name": "Écluse du Gabut",               "type": "Ouvrage de protection",       "lon": -1.150, "lat": 46.159, "risk": "modéré"},
        {"name": "Terminal pétrolier La Pallice", "type": "Infrastructure industrielle", "lon": -1.219, "lat": 46.161, "risk": "élevé"},
        {"name": "Plage de La Concurrence",       "type": "Zone de loisirs",             "lon": -1.162, "lat": 46.153, "risk": "élevé"},
        {"name": "Vieux-Port de La Rochelle",     "type": "Port historique",             "lon": -1.151, "lat": 46.157, "risk": "modéré"},
    ]
    cx, cy = -1.15, 46.16
    features = [
        {
            "type": "Feature",
            "properties": {"name": i["name"], "type": i["type"], "risk": i["risk"]},
            "geometry": {"type": "Point", "coordinates": [i["lon"], i["lat"]]},
        }
        for i in all_infra
        if math.sqrt(
            ((i["lon"] - cx) * 111 * math.cos(math.radians(cy))) ** 2
            + ((i["lat"] - cy) * 111) ** 2
        ) <= radius_km
    ]
    return {
        "geojson": {"type": "FeatureCollection", "features": features},
        "center": [-1.18, 46.16],
        "zoom": 12,
        "layer_type": "circle",
        "summary": f"{len(features)} infrastructures côtières dans un rayon de {radius_km}km autour de La Rochelle.",
    }


def get_sea_level_trend(station: str, years: int, chart_type: str = "line") -> dict:
    """
    Tendance d'élévation du niveau marin (données simulées).
    chart_type : type Chart.js — "line", "bar", "radar", "pie", "doughnut", "polarArea", etc.
    Choisir le type le plus adapté à la question posée.
    """
    rng = random.Random(42)
    current_year = 2025
    start_year = max(current_year - years, 1960)
    trend_mm_per_year = 3.2

    labels, values = [], []
    for y in range(start_year, current_year + 1):
        labels.append(str(y))
        anomaly = (y - start_year) * trend_mm_per_year + rng.gauss(0, 8)
        values.append(round(anomaly, 1))

    total_rise = (current_year - start_year) * trend_mm_per_year
    return {
        "labels": labels,
        "values": values,
        "chart_type": chart_type,
        "unit": "mm",
        "station": station,
        "summary": (
            f"Tendance du niveau marin à {station} sur {current_year - start_year} ans : "
            f"+{trend_mm_per_year}mm/an en moyenne, soit +{total_rise:.0f}mm au total."
        ),
    }


# ── Schémas Mistral (TOOLS) ──────────────────────────────────────────────────

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_current_datetime",
            "description": (
                "Retourne la date et l'heure exactes du serveur. "
                "À appeler en premier si l'utilisateur mentionne 'aujourd'hui', 'maintenant', "
                "'hier', 'demain', ou toute référence temporelle relative."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_maree_actuelle",
            "description": "Retourne la hauteur actuelle de la marée à La Rochelle (données SHOM).",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_maree_pour_date",
            "description": (
                "Retourne la hauteur de marée à La Rochelle pour une date et heure précises. "
                "Utiliser pour 'hier', 'demain', ou toute date spécifique. "
                "Passé : données réelles SHOM. Futur : prédictions SHOM."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "date":  {"type": "string", "description": "Date YYYY-MM-DD"},
                    "heure": {"type": "string", "description": "Heure HH:MM (défaut : 12:00)"},
                },
                "required": ["date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_coastal_infrastructure",
            "description": (
                "Affiche une carte des infrastructures côtières (ports, digues, stations) "
                "autour de La Rochelle avec leur niveau de risque de submersion."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "radius_km": {
                        "type": "number",
                        "description": "Rayon de recherche en kilomètres (ex: 10)",
                    },
                },
                "required": ["radius_km"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_sea_level_trend",
            "description": (
                "Affiche un graphique de la tendance d'élévation du niveau de la mer "
                "sur plusieurs années pour une station marégraphique."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "station":    {"type": "string", "description": "Nom de la station (ex: 'La Rochelle')"},
                    "years":      {"type": "integer", "description": "Nombre d'années (ex: 10, 20, 30)"},
                    "chart_type": {
                        "type": "string",
                        "description": (
                            "Type de graphique Chart.js. Choisir librement selon ce qui est le plus "
                            "pertinent pour les données et la question : 'line' pour une tendance "
                            "temporelle, 'bar' pour comparer des années, 'radar' pour une vue "
                            "polaire, 'pie' ou 'doughnut' pour une répartition, 'polarArea' pour "
                            "des magnitudes radiales. Défaut : 'line'."
                        ),
                    },
                },
                "required": ["station", "years"],
            },
        },
    },
]

# ── Dispatcher ───────────────────────────────────────────────────────────────

TOOL_DISPATCH = {
    "get_current_datetime":       lambda args: get_current_datetime(),
    "get_maree_actuelle":         lambda args: get_maree_actuelle(),
    "get_maree_pour_date":        lambda args: get_maree_pour_date(args["date"], args.get("heure", "12:00")),
    "get_coastal_infrastructure": lambda args: get_coastal_infrastructure(args["radius_km"]),
    "get_sea_level_trend":        lambda args: get_sea_level_trend(args["station"], args["years"], args.get("chart_type", "line")),
}

# Outils qui produisent une visualisation frontend (carte ou graphique)
VISUAL_TOOLS = {"get_coastal_infrastructure", "get_sea_level_trend"}

# ── Suggestions contextuelles ────────────────────────────────────────────────

DEFAULT_SUGGESTIONS = [
    "Quelle est la marée actuelle ?",
    "Prédiction marée demain à 14h",
    "Afficher la carte des infrastructures côtières",
    "Tendance du niveau marin sur 30 ans",
]

TOOL_SUGGESTIONS = {
    "get_maree_actuelle": DEFAULT_SUGGESTIONS,
    "get_maree_pour_date": DEFAULT_SUGGESTIONS,
    "get_sea_level_trend": DEFAULT_SUGGESTIONS,
    "get_coastal_infrastructure": DEFAULT_SUGGESTIONS,
}
