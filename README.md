# roxabi-simulation

**Simulateurs patrimoniaux côté client.**  
Impôt. Immobilier. Placements. Tout dans le navigateur.

[![GitHub last commit](https://img.shields.io/github/last-commit/Roxabi/roxabi-simulation?style=flat-square)](https://github.com/Roxabi/roxabi-simulation)
[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare%20Pages-live-orange?style=flat-square)](https://invest-sim-5m5.pages.dev)

> [!TIP]
> **Zero serveur. Zero tracking. Zero compte.**
> Vos données restent locales. La logique est vérifiable. Le résultat est immédiat.

---

## Pourquoi

Prendre une décision patrimoniale à 300 k€ mérite des chiffres exacts, pas une règle de trois sur un tableur.

Roxabi Simulation fournit des moteurs de calcul fiscaux et patrimoniaux 100 % côté client. Particuliers, investisseurs et curieux de fiscalité : obtenez votre TMI réelle ou comparez acheteur vs locataire en quelques secondes.

---

## Démarrage rapide

> [!IMPORTANT]
> **En ligne** : [invest-sim-5m5.pages.dev](https://invest-sim-5m5.pages.dev)

Local :

```bash
open index.html
```

Deploy :

```bash
npx wrangler pages deploy . --project-name=invest-sim --branch=main --commit-dirty=true
```

> Voir [`cloud.md`](cloud.md) pour le token API.

---

## Comment ça marche

```mermaid
flowchart LR
    A[Données utilisateur] --> B[Moteur JS fiscal / patrimonial]
    B --> C[Affichage résultats]
    B --> D[Graphiques Chart.js]
```

Les simulateurs sont des pages HTML statiques. La logique métier (calcul IR, amortissement, plus-value) vit dans des modules ES purs (`fiscal.js`, `comparateur-immo.js`) sans dépendance serveur.

---

## Simulateurs

### Fiscalité

| Simulateur | Lien | Ce qu'il fait |
|---|---|---|
| **Calculateur d'impôt** | [`simulateur.html`](simulateur.html) | TMI, QF, IR — salaires, micro-entreprise, dividendes (flat tax ou régime réel) |

### Immobilier & Placements

| Simulateur | Lien | Ce qu'il fait |
|---|---|---|
| **Comparateur immobilier** | [`comparateur-immo.html`](comparateur-immo.html) | Acheter vs louer + investir sur un horizon donné |
| **Comparateur placements** | _à venir_ | ETF, SCPI, assurance-vie, PER... |

---

## Stack

| Couche | Tech |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JS (ES modules) |
| Graphiques | Chart.js via CDN |
| Hosting | Cloudflare Pages |

---

## Structure du projet

| Fichier | Rôle |
|---|---|
| `index.html` | Landing page |
| `simulateur.html` | Calculateur d'impôt |
| `comparateur-immo.html` | Comparateur immobilier |
| `css/main.css` | Styles globaux + simulateur impôt |
| `css/landing.css` | Styles landing |
| `css/comparateur-immo.css` | Styles comparateur immo |
| `js/main.js` | Orchestration calculateur impôt |
| `js/fiscal.js` | Moteur fiscal (IR, QF, TMI) |
| `js/ui.js` | DOM calculateur impôt |
| `js/data.js` | Loader JSON barèmes + abattements |
| `js/format.js` | Formatteurs (€, %) |
| `js/storage.js` | Persistance localStorage (5 sims max) |
| `js/theme.js` | Toggle dark/light |
| `js/comparateur-immo.js` | Logique + graphe comparateur immobilier |
| `docs/simulateurs.md` | Documentation métier détaillée |
| `docs/architecture.md` | Architecture technique |

---

## Déploiement

Voir [`cloud.md`](cloud.md).

---

## Contribuer

Voir [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Licence

Non spécifiée.
