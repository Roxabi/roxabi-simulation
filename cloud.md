# Cloud & Déploiement

## Plateforme

Le projet est déployé sur **Cloudflare Pages**.

## Projet Pages

- Nom : `invest-sim`
- URL de production : `https://invest-sim-5m5.pages.dev`

## Prérequis

- Node.js + `wrangler` (via `npx`)
- Un **Cloudflare API token** avec la permission `Cloudflare Pages:Edit` sur le compte.

Le token est stocké dans `~/.roxabi/forge/.env` (hors repo, jamais commité).

## Déployer

```bash
cd ~/projects/roxabi-simulation
export CLOUDFLARE_ACCOUNT_ID="b5e90be971920ce406f7b679c4f1cd33"
export CLOUDFLARE_API_TOKEN="<token>"
npx wrangler pages deploy . --project-name=invest-sim --branch=main --commit-dirty=true
```

## Sécurité

- Aucun secret (token, clé API) n'est présent dans le code source ou le repo Git.
- `.gitignore` ignore `.env`, `.wrangler/`, logs et artefacts de build.
