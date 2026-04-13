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
import logging
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta

DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data", "maregraphie"
)
PUBLIC_DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "public", "data"
)

# ── Constantes marée ────────────────────────────────────────────────────────

MAREE_BASSE   = 2.07
MAREE_MOYENNE = 4.00
MAREE_HAUTE   = 5.63

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

    bins: dict = defaultdict(list)
    for e in entries:
        bins[e["ts"].replace(minute=0, second=0, microsecond=0)].append(e["value"])

    return [
        {"timestamp": ts.strftime("%Y/%m/%d %H:%M:%S"), "value": sum(v) / len(v)}
        for ts, v in sorted(bins.items())
    ]


def _read_local_files() -> list[dict]:
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


def _geojson_to_points(geojson: dict) -> dict:
    """Normalise un FeatureCollection en points (centroïde pour les polygones)."""
    point_features = []
    for feat in geojson.get("features", []):
        geom = feat.get("geometry", {})
        gtype = geom.get("type", "")
        if gtype == "Point":
            coords = geom["coordinates"]
        elif gtype == "Polygon":
            ring = geom["coordinates"][0]
            coords = [sum(c[0] for c in ring) / len(ring), sum(c[1] for c in ring) / len(ring)]
        elif gtype == "MultiPolygon":
            ring = geom["coordinates"][0][0]
            coords = [sum(c[0] for c in ring) / len(ring), sum(c[1] for c in ring) / len(ring)]
        else:
            continue
        point_features.append({
            "type": "Feature",
            "properties": feat.get("properties", {}),
            "geometry": {"type": "Point", "coordinates": coords},
        })
    return {"type": "FeatureCollection", "features": point_features}


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


# ── Fonctions outils : données géo réelles ───────────────────────────────────

def get_flood_scenarios() -> dict:
    """
    Scénarios de submersion marine pour La Rochelle.
    Source : public/data/scenarios/index.json (données réelles).
    Retourne un graphique comparatif des niveaux d'eau par scénario.
    """
    path = os.path.join(PUBLIC_DATA_DIR, "scenarios", "index.json")
    try:
        with open(path, encoding="utf-8") as f:
            scenarios = json.load(f)
    except Exception as e:
        return {"error": f"Impossible de lire les scénarios : {e}"}

    labels = [s["label"] for s in scenarios]
    values = [round(s["niveau_m"], 3) for s in scenarios]

    descriptions = []
    for s in scenarios:
        descriptions.append(f"{s['label']} : {s['niveau_m']} m NGF")

    return {
        "labels": labels,
        "values": values,
        "chart_type": "bar",
        "unit": "m NGF",
        "station": "La Rochelle",
        "summary": (
            f"{len(scenarios)} scénarios de submersion marine disponibles pour La Rochelle. "
            f"Du niveau le plus bas ({min(values)} m NGF — {labels[values.index(min(values))]}) "
            f"au plus élevé ({max(values)} m NGF — {labels[values.index(max(values))]}). "
            "Données issues du modèle HOMONIM (SHOM/Météo-France)."
        ),
    }


def get_flood_zones() -> dict:
    """
    Zones de risque PPRI (Plan de Prévention des Risques d'Inondation) de La Rochelle.
    Source : public/data/ppri.geojson (données officielles approuvées).
    Retourne une carte des périmètres PPRI submersion marine.
    """
    path = os.path.join(PUBLIC_DATA_DIR, "ppri.geojson")
    try:
        with open(path, encoding="utf-8") as f:
            geojson = json.load(f)
    except Exception as e:
        return {"error": f"Impossible de lire le PPRI : {e}"}

    features = geojson.get("features", [])
    communes = list({f["properties"].get("libelle_commune", "") for f in features})
    noms_ppr = [f["properties"].get("nom_ppr", "") for f in features]

    return {
        "geojson": geojson,
        "center": [-1.15, 46.17],
        "zoom": 11,
        "layer_type": "fill",
        "summary": (
            f"{len(features)} périmètres PPRI approuvés couvrant La Rochelle et communes limitrophes "
            f"({', '.join(c for c in communes if c)}). "
            "Tous classés risques littoraux — érosion côtière et submersion marine. "
            "Source : GASPAR / DDTM 17."
        ),
    }


def get_critical_networks() -> dict:
    """
    Réseaux et infrastructures critiques de La Rochelle (données OSM réelles).
    Source : public/data/critical_networks.geojson.
    Retourne une carte des équipements sensibles (eau, énergie, transports).
    """
    path = os.path.join(PUBLIC_DATA_DIR, "critical_networks.geojson")
    try:
        with open(path, encoding="utf-8") as f:
            geojson = json.load(f)
    except Exception as e:
        return {"error": f"Impossible de lire les réseaux critiques : {e}"}

    raw_points = _geojson_to_points(geojson)

    # Normalise les propriétés pour le popup MapView (name / type / risk)
    point_features = []
    for feat in raw_points["features"]:
        p = feat["properties"]
        tags = p.get("tags", {})
        name = (
            tags.get("name")
            or tags.get("operator")
            or tags.get("man_made", "").replace("_", " ")
            or p.get("category", "infrastructure")
        )
        infra_type = tags.get("man_made", p.get("category", "autre")).replace("_", " ")
        point_features.append({
            "type": "Feature",
            "properties": {"name": name.capitalize(), "type": infra_type, "risk": "modéré"},
            "geometry": feat["geometry"],
        })

    point_geojson = {"type": "FeatureCollection", "features": point_features}
    features = point_features

    categories = defaultdict(int)
    for feat in features:
        cat = feat["properties"].get("type", "autre")
        categories[cat] += 1

    cat_summary = ", ".join(f"{v} {k}" for k, v in sorted(categories.items()))

    return {
        "geojson": point_geojson,
        "center": [-1.16, 46.16],
        "zoom": 12,
        "layer_type": "circle",
        "summary": (
            f"{len(features)} infrastructures critiques identifiées sur La Rochelle ({cat_summary}). "
            "Données OpenStreetMap. Ces équipements sont prioritaires dans l'évaluation "
            "du risque de submersion."
        ),
    }


def get_xynthia_simulation() -> dict:
    """
    Simulation de la tempête Xynthia sur La Rochelle Nord (MNT HOMONIM 20m, WGS84).
    Source : public/data/larochelle_xynthia/ (simulation hydraulique réelle).
    Retourne un graphique de la progression de la submersion frame par frame.
    """
    meta_path   = os.path.join(PUBLIC_DATA_DIR, "larochelle_xynthia", "flood_metadata.json")
    frames_path = os.path.join(PUBLIC_DATA_DIR, "larochelle_xynthia", "water_mesh_frames.json")

    try:
        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)
        with open(frames_path, encoding="utf-8") as f:
            frames_data = json.load(f)
    except Exception as e:
        return {"error": f"Impossible de lire la simulation Xynthia : {e}"}

    frames = frames_data.get("frames", [])
    labels = [fr.get("ts", f"t={fr['t']:.2f}") for fr in frames]
    values = [fr.get("n_flooded", 0) for fr in frames]

    bbox = meta.get("bbox", {})
    wse  = meta.get("wse_range", {})

    return {
        "labels": labels,
        "values": values,
        "chart_type": "line",
        "unit": "cellules inondées",
        "station": "La Rochelle Nord — Xynthia",
        "summary": (
            f"Simulation hydraulique Xynthia sur La Rochelle Nord "
            f"(emprise : lon [{bbox.get('lon_min')} → {bbox.get('lon_max')}], "
            f"lat [{bbox.get('lat_min')} → {bbox.get('lat_max')}]). "
            f"{len(frames)} frames — de {values[0]} cellules inondées initialement "
            f"à {max(values)} au pic. "
            f"Niveau d'eau simulé : {wse.get('min')} m à {wse.get('max')} m NGF. "
            f"Maillage : {meta.get('n_cells', '?')} cellules HOMONIM 20m."
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
            "description": "Retourne la hauteur actuelle de la marée à La Rochelle (données SHOM réelles).",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_maree_pour_date",
            "description": (
                "Retourne la hauteur de marée à La Rochelle pour une date et heure précises. "
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
            "name": "get_flood_scenarios",
            "description": (
                "Affiche un graphique comparatif des scénarios de submersion marine pour La Rochelle : "
                "grande marée, Xynthia, IPCC 2050/2100, pire cas. "
                "Données réelles issues du modèle HOMONIM (SHOM/Météo-France)."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_flood_zones",
            "description": (
                "Affiche la carte des zones PPRI (Plan de Prévention des Risques d'Inondation) "
                "approuvées sur La Rochelle et communes limitrophes. "
                "Données officielles GASPAR/DDTM 17 — risques littoraux réels."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_critical_networks",
            "description": (
                "Affiche la carte des infrastructures et réseaux critiques de La Rochelle "
                "(eau, énergie, transports…) issues des données OpenStreetMap. "
                "Utile pour évaluer les enjeux exposés à la submersion."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_xynthia_simulation",
            "description": (
                "Affiche la simulation hydraulique de la tempête Xynthia sur La Rochelle Nord. "
                "Graphique de progression de la submersion frame par frame, "
                "basé sur le MNT HOMONIM 20m (simulation réelle, coordonnées WGS84)."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]

# ── Dispatcher ───────────────────────────────────────────────────────────────

TOOL_DISPATCH = {
    "get_current_datetime":  lambda args: get_current_datetime(),
    "get_maree_actuelle":    lambda args: get_maree_actuelle(),
    "get_maree_pour_date":   lambda args: get_maree_pour_date(args["date"], args.get("heure", "12:00")),
    "get_flood_scenarios":   lambda args: get_flood_scenarios(),
    "get_flood_zones":       lambda args: get_flood_zones(),
    "get_critical_networks": lambda args: get_critical_networks(),
    "get_xynthia_simulation": lambda args: get_xynthia_simulation(),
}

VISUAL_TOOLS = {"get_flood_scenarios", "get_flood_zones", "get_critical_networks", "get_xynthia_simulation"}

# ── Suggestions contextuelles ────────────────────────────────────────────────

DEFAULT_SUGGESTIONS = [
    "Quelle est la marée actuelle ?",
    "Scénarios de submersion",
    "Zones à risque PPRI",
    "Infrastructures critiques",
    "Simulation Xynthia",
]

TOOL_SUGGESTIONS = {
    "get_maree_actuelle":     ["Prédiction marée demain à 14h", "Scénarios de submersion", "Zones à risque PPRI", "Simulation Xynthia"],
    "get_maree_pour_date":    ["Quelle est la marée actuelle ?", "Scénarios de submersion", "Zones à risque PPRI", "Simulation Xynthia"],
    "get_flood_scenarios":    ["Zones à risque PPRI", "Simulation Xynthia", "Infrastructures critiques", "Quelle est la marée actuelle ?"],
    "get_flood_zones":        ["Infrastructures critiques", "Scénarios de submersion", "Simulation Xynthia", "Quelle est la marée actuelle ?"],
    "get_critical_networks":  ["Zones à risque PPRI", "Scénarios de submersion", "Simulation Xynthia", "Quelle est la marée actuelle ?"],
    "get_xynthia_simulation": ["Scénarios de submersion", "Zones à risque PPRI", "Infrastructures critiques", "Quelle est la marée actuelle ?"],
}
