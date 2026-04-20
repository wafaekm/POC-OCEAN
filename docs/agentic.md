# Architecture Agentic - Géo-Twin Littoral

Couche d'intelligence du chatbot : comment une question utilisateur devient une réponse avec données réelles et visualisation.

---

## Flux général

```
Utilisateur (React)
       |
       | POST { message, history }
       v
  FastAPI /chat/stream
       |
       | run_agent_sync_with_retry(message, on_event)
       v
   Agent (agent.py)
       |
       |------ boucle agentic ----------------------------------------
       |                                                               |
       | chat.complete(messages, tools=[...])                         |
       v                                                               |
   Mistral AI                                                         |
       |                                                               |
       |-- tool_calls: [...]  -->  TOOL_DISPATCH[name](args)          |
       |                                  |                            |
       |                                  v                            |
       |                            Tools (tools.py)                  |
       |                                  |                            |
       |                                  v                            |
       |                         API SHOM / fichiers locaux / OSM     |
       |                                  |                            |
       |                       si VISUAL_TOOL --> stocke last_visual  |
       |                       sinon         --> JSON complet         |
       |                                  |                            |
       |<-- résumé texte seulement --------                           |
       |                                                               |
       |-- pas de tool_calls (réponse finale) -------------------------
       |
       | { type, text, visual, suggestions }
       v
  FastAPI /chat/stream
       |
       | SSE : thinking / tool_call / tool_result / done
       v
  Utilisateur (React)
       |
       v
  affiche texte + visualisation (chart ou map)
```

---

## Composants

### `main.py` - FastAPI

| Endpoint | Rôle |
|---|---|
| `POST /chat` | Appel synchrone, retourne JSON final |
| `POST /chat/stream` | SSE streaming - envoie les étapes en temps réel |
| `GET /health` | Healthcheck Docker |

Le stream envoie des événements `data: {...}` au format :

```json
{ "type": "thinking",    "message": "Interrogation de Mistral..." }
{ "type": "tool_call",   "message": "get_maree_actuelle" }
{ "type": "tool_result", "message": "get_maree_actuelle" }
{ "type": "retry",       "message": "Limite atteinte - retry dans 15s..." }
{ "type": "done",        "result": { "type": "chart", "text": "...", "visual": {}, "suggestions": [] } }
```

---

### `agent.py` - Boucle agentic

La boucle tourne tant que Mistral retourne des `tool_calls` :

```
messages = [system, user]

while True:
    response = mistral.chat.complete(messages, tools=TOOLS)

    if no tool_calls:
        return { type, text, visual, suggestions }

    for each tool_call:
        result = TOOL_DISPATCH[name](args)
        if name in VISUAL_TOOLS:
            last_visual = { type: "chart"|"map", data: {...} }
            messages += résumé texte seulement  <-- économie de tokens
        else:
            messages += JSON complet

    # reboucle
```

**Optimisation tokens** : pour les outils visuels (`chart` / `map`), seul le champ `summary` est renvoyé à Mistral. Les données brutes (labels, values, GeoJSON) sont gardées côté serveur dans `last_visual` et transmises directement au frontend.

---

### `tools.py` - Outils et données

#### Outils disponibles

| Outil | Type retour | Source données |
|---|---|---|
| `get_current_datetime` | texte | `datetime.now()` serveur |
| `get_maree_actuelle` | texte | API SHOM sources=2 (obs) -> fallback sources=1 (préd) |
| `get_maree_pour_date` | texte | API SHOM obs ou préd selon date |
| `get_maree_journee` | **chart** | API SHOM / fichiers JSON locaux (fallback année N-1) |
| `get_flood_scenarios` | **chart** | Données statiques HOMONIM/SHOM (5 scénarios) |
| `get_flood_zones` | **map** | Fichier GeoJSON PPRI local |
| `get_critical_networks` | **map** | Fichier GeoJSON OSM local |
| `get_xynthia_simulation` | **chart** | Simulation MNT HOMONIM 20m locale |

#### Sources de données accessibles

```
public/data/
├── maregraphie/
│   ├── 34_2020.json      <- observations SHOM horaires (ZH, m)
│   ├── 34_2021.json
│   ├── 34_2022.json
│   ├── 34_2023.json
│   ├── 34_2024.json
│   └── 34_2025.json
└── (GeoJSON PPRI, OSM chargés en mémoire au démarrage)

API SHOM (temps réel)
├── sources=1  -> prédictions harmoniques (toujours disponibles)
└── sources=2  -> observations mesurées (délai ~12-24h)
```

#### Logique de sélection des données marée

```
get_maree_actuelle()
  |-- fetch obs SHOM (2 derniers jours)
  |-- si obs la plus proche > 2h de retard
  |     +-- fetch prédictions SHOM (+/-1h)
  +-- retourne { hauteur_m, timestamp, phase, source }

get_maree_pour_date(date, heure)
  |-- si futur OU passé récent (<3h)   -> prédictions SHOM
  |-- si passé (>3h) et après jan 2026 -> observations SHOM
  +-- si avant jan 2026                -> fichiers JSON locaux
```

---

### `prompts.py` - Système de contraintes LLM

Règles injectées dans le `SYSTEM` prompt :

- **Interdit** : inventer des valeurs chiffrées (marées, scénarios, zones)
- **Interdit** : générer des URLs externes ou du markdown image
- **Obligatoire** : appeler `get_current_datetime` avant tout outil marée si la question contient une référence temporelle relative ("maintenant", "aujourd'hui", etc.)
- **Routage** : `maintenant` -> `get_maree_actuelle` | date précise -> `get_maree_pour_date` | graphique -> `get_maree_journee`

---

## Ce que le frontend reçoit

### Réponse finale (`/chat` ou event `done` du stream)

```json
{
  "response": "La marée actuelle est de 1,09 m...",
  "type": "text | chart | map",
  "visual": null,
  "suggestions": ["Prédiction demain à 14h", "Scénarios de submersion"]
}
```

### `visual` pour un chart

```json
{
  "labels":     ["00h", "01h", "23h"],
  "values":     [2.1, 2.4, 1.8],
  "chart_type": "line | bar",
  "unit":       "m ZH",
  "station":    "La Rochelle - 20/04/2026"
}
```

### `visual` pour une map

```json
{
  "geojson":    { "type": "FeatureCollection", "features": [] },
  "center":     [-1.15, 46.16],
  "zoom":       12,
  "layer_type": "polygon | point"
}
```

### `suggestions`

Liste de 4 questions contextuelles affichées comme boutons dans le chat, choisies en fonction du dernier outil appelé (`TOOL_SUGGESTIONS` dans `tools.py`).
