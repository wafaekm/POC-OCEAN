# POC Géo-Twin Littoral

POC d'un agent IA capable de répondre à des questions sur la marée à La Rochelle, en s'appuyant sur les données marégraphiques du SHOM et un LLM Mistral.

---

## Niveaux

**Niveau 1 (ce POC)** — L'agent lit les données marégraphiques et répond en texte aux questions posées.

**Niveau 2 (à venir)** — L'agent génère des cartes et visualisations qu'il renvoie directement dans le chat.

---

## Ce que fait ce POC

- Un agent conversationnel (en français) spécialisé sur la submersion marine et les risques côtiers à La Rochelle
- L'agent dispose de deux outils :
  - **`get_maree_actuelle`** : retourne la hauteur de marée en ce moment
  - **`get_maree_pour_date`** : retourne la hauteur pour n'importe quelle date/heure (passé ou futur)
- Pour le passé (≤ 2025) : données réelles SHOM en fichiers JSON locaux
- Pour le futur ou le temps réel : appel à l'API publique SHOM

---

## Installation

```bash
pip install mistralai python-dotenv
```

---

## Configuration

1. Créer un compte sur [https://console.mistral.ai](https://console.mistral.ai)
2. Générer une clé API
3. Copier le fichier `.env.example` en `.env` et renseigner la clé :

```bash
cp .env.example .env
```

```
MISTRAL_API_KEY=ta_clé_ici
```

---

## Lancement

```bash
py agent.py
```

L'agent démarre en mode interactif. Tape `exit` pour quitter.

**Exemples de questions :**
- *"Quelle est la marée en ce moment ?"*
- *"À quelle hauteur était la mer le 15 janvier 2024 à 8h ?"*
- *"Est-ce qu'il y a un risque de submersion demain matin ?"*

---

## Structure

```
.
├── agent.py                  # Agent IA Mistral + outils marégraphie
├── data/
│   └── maregraphie/          # Données SHOM 2020–2025 (JSON)
├── .env                      # Clé API (non commité)
└── .env.example              # Modèle de configuration
```

---

## Données

- **Source** : SHOM (Service Hydrographique et Océanographique de la Marine)
- **Station** : La Rochelle (id 34)
- **Référence** : Zéro hydrographique SHOM
- **Repères** : basse mer ≈ 2.07 m · mer moyenne ≈ 4.00 m · haute mer ≈ 5.63 m
