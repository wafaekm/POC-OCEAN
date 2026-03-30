# POC Géo-Twin Littoral

Démonstrateur technique de simulation de submersion marine en 2D et 3D.  
Zone pilote : **La Rochelle (Charente-Maritime)** — 

## Prérequis

- Node.js >= 18
- Compte [Maptiler](https://maptiler.com) (free tier)
- Compte [Cesium Ion](https://ion.cesium.com) (free tier)

## Installation
```bash
git clone <url-du-repo>
cd POC-Geo-Twin-littoral
npm install
```

## Configuration

Crée un fichier `.env.local` à la racine du projet :
```env
VITE_MAPTILER_KEY=ta_clé_maptiler
VITE_CESIUM_TOKEN=ton_token_cesium_ion
```

### Obtenir les clés

**Maptiler** : [maptiler.com](https://maptiler.com) → Créer un compte → Account → API Keys  
**Cesium Ion** : [ion.cesium.com](https://ion.cesium.com) → Créer un compte → Access Tokens → Default Token

## Lancer en local
```bash
npm run dev
```

L'application est disponible sur [http://localhost:5173](http://localhost:5173)

## Build production
```bash
npm run build
npm run preview
```

## Fonctionnalités

### Vue 2D (MapLibre)


### Vue 3D (CesiumJS)

## Structure du projet
```
src/
  components/
    Map2D/          Carte MapLibre 2D
    Map3D/          Globe Cesium 3D
    LayerControl/   Panel couches cartographiques
    Legend/         Légende submersion
    ViewToggle/     Bascule 2D / 3D
  types/
    layers.types.ts Types partagés
```
## Données

