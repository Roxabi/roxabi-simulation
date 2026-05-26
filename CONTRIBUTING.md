# Contribuer

## Environnement de développement

Aucune dépendance build. Un navigateur moderne et un éditeur de texte suffisent.

Node.js + `npx` sont nécessaires uniquement pour le déploiement Cloudflare Pages :

```bash
npx wrangler pages deploy . --project-name=invest-sim --branch=main --commit-dirty=true
```

## Tests

Pas de suite de tests automatisée actuellement. La validation se fait par usage manuel des simulateurs dans le navigateur.

## Format des commits

[Conventional Commits](https://www.conventionalcommits.org/) :

```
<type>(<scope>): <description>

Types  : feat, fix, chore, docs, refactor, test
Scopes : impôt, immo, renta, ui
```

Exemples :

```
feat(immo): add TRI display in comparateur
fix(ui): dark mode toggle on mobile
chore(links): update GitHub repo URL after org migration
```

## Processus de Pull Request

1. Branchez depuis `main`.
2. Ouvrez une PR avec un titre explicite en Conventional Commits.
3. Merge en **merge-commit uniquement** (pas de squash).

## Revue de code

Pas de processus formel. Les PR sont bienvenues — surtout sur la justesse des calculs fiscaux et patrimoniaux.
