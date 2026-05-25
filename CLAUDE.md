# roxabi-simulation — Instructions Claude Code

## Projet

Suite de simulateurs patrimoniaux côté client (HTML/CSS/JS vanilla).

| Simulateur | Page | État |
|---|---|---|
| Calculateur d'impôt (TMI) | `simulateur.html` | Live |
| Comparateur immobilier (acheter vs louer + investir) | `comparateur-immo.html` | Live |
| Comparateur multi-investissements (ETF, SCPI, PER...) | _placeholder_ | Bientôt |

## Stack

- HTML5 / CSS3 / Vanilla JavaScript ES modules (`type="module"`)
- Pas de framework frontend ni de build step
- Chart.js via CDN pour les graphes (`comparateur-immo.html`)
- Hébergement : Cloudflare Pages (projet `invest-sim`)

## Structure des fichiers

```
roxabi-simulation/
├── index.html                  Landing page (3 CTAs)
├── simulateur.html             Calculateur d'impôt
├── comparateur-immo.html       Comparateur immobilier
├── css/
│   ├── main.css                Styles globaux + simulateur impôt + modal + topbar/footer
│   ├── landing.css             Styles landing page
│   └── comparateur-immo.css    Styles comparateur immo (two-col, chart, table)
├── js/
│   ├── main.js                 Orchestration calculateur impôt
│   ├── fiscal.js               Logique fiscale pure (IR, QF, TMI)
│   ├── ui.js                   DOM calculateur impôt (résultats, modal, toggle)
│   ├── data.js                 Loader JSON barèmes IR + abattements micro
│   ├── format.js               Formatteurs EUR / pourcentage
│   ├── storage.js              Persistance localStorage (max 5 sims nommées)
│   ├── theme.js                Toggle dark/light (data-theme)
│   └── comparateur-immo.js     Logique + graphe comparateur immobilier
├── data/
│   ├── baremes.json            Barèmes IR 2024–2026
│   └── micro-abattements.json  Abattements micro-entreprise
├── docs/
│   ├── simulateurs.md          Documentation métier de chaque simulateur
│   └── architecture.md         Architecture technique
├── cloud.md                    Instructions déploiement Cloudflare
└── README.md                   Vue d'ensemble projet
```

## Règles de code

- **Pas de JS/CSS inline** dans le HTML — tout passe par les fichiers dédiés.
- **Logique pure séparée de l'UI** : `fiscal.js` / `comparateur-immo.js` ne manipulent pas le DOM.
- **Modules ES** : utiliser `import`/`export`. Pas de variables globales.
- **Barèmes IR** (2024–2026) et **abattements micro** (71% / 50% / 34%) dans `js/data.js` avec fallback inline.

## Patterns partagés

Pour créer ou maintenir un simulateur, voir `docs/simulator-patterns.md` — référence des modules partagés (modal, tooltip, storage versionné, format, theme) et de la checklist nouveau simulateur.

## Déploiement

```bash
cd ~/projects/roxabi-simulation
export CLOUDFLARE_ACCOUNT_ID="b5e90be971920ce406f7b679c4f1cd33"
export CLOUDFLARE_API_TOKEN="<token>"   # depuis ~/.roxabi/forge/.env — jamais commité
npx wrangler pages deploy . --project-name=invest-sim --branch=main --commit-dirty=true
```

## Sécurité

- **Aucun secret** (token, clé, mot de passe) ne doit être commité.
- `.gitignore` est configuré pour ignorer `.env`, `.wrangler/`, logs.
- Si un fichier sensible est créé par erreur, le retirer immédiatement de l'historage git (`git filter-repo` ou force-push rebase).

## Workflow

1. Modifier les fichiers source (HTML, CSS, JS).
2. Déployer sur Cloudflare Pages pour tester en live.
3. `git add`, `git commit`, `git push` vers `origin/main`.
4. Mettre à jour `docs/simulateurs.md` si la logique métier change.

## Notes métier — Calculateur d'impôt

- **TMI** = dernière tranche active du barème IR appliquée au QF.
- Dividendes en **flat tax** (PFU) ne sont pas intégrés au revenu imposable pour le calcul de la TMI.
- Dividendes en **régime réel** : intégration avec abattement de 40%.
- Calcul théorique avant décote et réductions éventuelles.
- Persistance : 5 simulations max par onglet (URL hash), LRU pruning.

## Notes métier — Comparateur immobilier

- **Patrimoine achat(t)** = `(Prix + Travaux) × (1 + plus-value)^t - CRD(t) + potAcheteur(t)`
- **Patrimoine loc(t)** = `potLoc(t)` (apport initial + épargnes accumulées — apples-to-apples avec le cash que l'acheteur sort au signing)
- **CRD** : formule d'amortissement standard, capital restant dû déduit de la valeur de revente.
- **Différence de cash-flow** : `depenseAchat - depenseLoc` → placée du côté qui **dépense le moins**, au rendement défini.
- **Inflation** : loyer, charges, taxe foncière et entretien indexés chaque année. Taux global ou par paramètre (mode avancé). Mensualité, plus-value et rendement placement indépendants.
- **Fiscalité placement** : case "Flat tax PFU 30 %" applique 30 % sur `gains(t) = max(0, pot(t) − capital_investi(t))` côté locataire ET acheteur. Tooltip "?" rappelle PEA / AV / donation / PER comme dispositifs de purge.
- **Frais de notaire** : auto-calculés (% du prix) avec affichage live du montant €.
- Crédit à taux fixe sur la durée du prêt — mensualités nulles au-delà de `dureeCredit`. Rendement de placement constant sur l'horizon. Pas de fiscalité ni inflation modélisées.
