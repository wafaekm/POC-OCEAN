# POC Géo-Twin Littoral

Démonstrateur technique de simulation de submersion marine.  
Zone pilote : **La Rochelle (Charente-Maritime)**

---

## Modules

### Agent IA (`backend/`)

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

```env
MISTRAL_API_KEY=ta_cle_ici
```

Lancement :

```bash
py backend/main.py
```

---

### Visualisation cartographique (`src/`)

Démonstrateur de simulation de submersion marine en 2D et 3D.

**Prérequis :**
- Node.js >= 18
- Compte [MapTiler](https://www.maptiler.com/) (free tier)
- Compte [Cesium Ion](https://cesium.com/ion/) (free tier)
- Compte [AISStream](https://aisstream.io/) pour la vue AIS live

#### Installation (frontend)

```bash
npm install
```

Créer un `.env.local` à la racine :

```env
VITE_MAPTILER_KEY=ta_cle_maptiler
VITE_CESIUM_TOKEN=ton_token_cesium_ion
```

Lancement :

```bash
npm run dev
```

L'application est disponible sur http://localhost:5173

Build production :

```bash
npm run build
npm run preview
```

**Fonctionnalités :**
- Vue 2D (MapLibre) : carte interactive de submersion
- Vue 3D (CesiumJS) : globe avec animation des zones inondées
- Vue 3D LiDAR : nuages de points 3D Tiles
- Vue AIS live : visualisation temps réel des navires autour de La Rochelle
- Affichage du balisage maritime à partir de couches GeoJSON

---

### AIS Live (Cesium + AISStream)

Le frontend ne se connecte pas directement à AISStream.  
Un serveur relais WebSocket local est utilisé entre le frontend et AISStream.

**Architecture :**

```
Frontend React/Cesium  -->  ws://localhost:8787
                                 |
                                 v
                        ais-relay.mjs
                                 |
                                 v
                 wss://stream.aisstream.io/v0/stream
```

#### Configuration AIS

Créer ou compléter un fichier `.env` à la racine :

```env
AISSTREAM_API_KEY=ta_cle_aisstream
```

> ⚠️ Cette clé est utilisée uniquement par le serveur relais. Elle ne doit pas être exposée dans le frontend avec une variable `VITE_*`.

#### Lancer la connexion AIS

**Étape 1 — démarrer le frontend**
```bash
npm run dev
```

**Étape 2 — démarrer le relais WebSocket local**

Sous PowerShell (Windows) :
```powershell
$env:AISSTREAM_API_KEY="ta_cle_aisstream"
node .\ais-relay.mjs
```

Sous macOS / Linux :
```bash
AISSTREAM_API_KEY=ta_cle_aisstream node ./ais-relay.mjs
```

Si tout est correct, le terminal affiche :
```
Relay listening on ws://localhost:8787
Frontend connected
Connected to AISStream
Subscription sent to AISStream
```

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
├── public/
│   ├── data/
│   │   └── balisage/         # GeoJSON de balisage
│   ├── models/
│   │   └── boat.glb          # Modèle 3D navire pour AIS
│   └── flood_animation/
├── frontend/                 # Interface chat agent IA (Vite)
│   └── src/
├── data/
│   └── maregraphie/          # Données SHOM 2020–2025 (JSON)
├── scripts/
├── ais-relay.mjs             # Relais WebSocket local pour AISStream
├── requirements.txt
├── package.json
└── .env.example
```

---

## Résumé du démarrage

| Service | Commande |
|---|---|
| Backend IA | `py backend/main.py` |
| Frontend | `npm run dev` |
| Relais AIS (Windows) | `$env:AISSTREAM_API_KEY="..." ; node .\ais-relay.mjs` |
| Relais AIS (Linux/Mac) | `AISSTREAM_API_KEY=... node ./ais-relay.mjs` |

---

## Notes

- La clé AISStream doit rester côté relais backend uniquement.
- Le frontend se connecte au relais local via `ws://localhost:8787`.
- Si le relais n'est pas lancé, la vue AIS ne pourra pas recevoir de données temps réel.
- Si le modèle `boat.glb` est absent, les navires ne pourront pas être affichés correctement en 3D.