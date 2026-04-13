# POC Géo-Twin Littoral

Démonstrateur technique de simulation de submersion marine.  
Zone pilote : **La Rochelle (Charente-Maritime)**

---

## Modules

### Agent IA (backend/)

Agent conversationnel (en français) spécialisé sur la submersion marine et les risques côtiers à La Rochelle. Il s'appuie sur les données marégraphiques du SHOM et un LLM Mistral.

**Niveaux d'implémentation :**
- **Niveau 1** : l'agent lit les données marégraphiques et répond en texte aux questions posées.
- **Niveau 2** : l'agent génère des graphiques et visualisations renvoyés directement dans le chat (SSE streaming).

**Outils de l'agent :**
- `get_maree_actuelle` : retourne la hauteur de marée en ce moment
- `get_maree_pour_date` : retourne la hauteur pour n'importe quelle date/heure (passé ou futur)

**Données :** Station La Rochelle (id 34) — SHOM, référence Zéro hydrographique  
Repères : basse mer ≈ 2.07 m · mer moyenne ≈ 4.00 m · haute mer ≈ 5.63 m

#### Installation (backend)

```bash
pip install -r requirements.txt
```

Créer un `.env` à la racine :
```
MISTRAL_API_KEY=ta_clé_ici
```

Lancement :
```bash
py backend/main.py
```

---

### Visualisation cartographique (src/)

Démonstrateur de simulation de submersion marine en 2D et 3D.

**Prérequis :**
- Node.js >= 18
- Compte [Maptiler](https://maptiler.com) (free tier)
- Compte [Cesium Ion](https://ion.cesium.com) (free tier)

#### Installation (frontend)

```bash
npm install
```

Créer un `.env.local` à la racine :
```env
VITE_MAPTILER_KEY=ta_clé_maptiler
VITE_CESIUM_TOKEN=ton_token_cesium_ion
```

Lancement :
```bash
npm run dev
```

L'application est disponible sur [http://localhost:5173](http://localhost:5173)

Build production :
```bash
npm run build
npm run preview
```

**Fonctionnalités :**
- Vue 2D (MapLibre) : carte interactive de submersion
- Vue 3D (CesiumJS) : globe avec animation des zones inondées

---

## Structure du projet

```
.
├── backend/                  # Agent IA Python (FastAPI + Mistral)
│   ├── main.py
│   ├── agent.py
│   ├── tools.py
│   └── prompts.py
├── src/                      # App cartographique (React/TypeScript)
│   └── components/
│       ├── Map2D/
│       ├── Map3D/
│       ├── LayerControl/
│       ├── Legend/
│       └── ViewToggle/
├── public/                   # Données géo (GeoJSON, flood frames...)
│   └── data/
├── frontend/                 # Interface chat agent IA (Vite)
│   └── src/
├── data/
│   └── maregraphie/          # Données SHOM 2020–2025 (JSON)
├── scripts/
├── requirements.txt
└── .env.example
```
