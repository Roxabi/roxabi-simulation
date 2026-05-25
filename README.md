# roxabi-simulation

Simulateur fiscal et comparateur d'investissements — calcul de la Tranche Marginale d'Imposition (TMI) et comparaison de scénarios (immobilier vs placement fixe).

## Stack

- HTML5 / CSS3 / Vanilla JavaScript (ES modules)
- Hébergement : Cloudflare Pages

## Structure

| Fichier | Description |
|---|---|
| `index.html` | Shell principal |
| `css/main.css` | Styles |
| `js/main.js` | Point d'entrée (events, orchestration) |
| `js/data.js` | Données : barèmes IR, abattements micro-entreprise |
| `js/format.js` | Formatteurs (€, %) |
| `js/fiscal.js` | Moteur fiscal : calcul de la TMI |
| `js/ui.js` | DOM : rendu des résultats, modal, toggle |

## Déploiement

Voir [`cloud.md`](cloud.md).
