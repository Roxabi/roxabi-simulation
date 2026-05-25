# Patterns & utilitaires pour un simulateur Roxabi

## Vue d'ensemble

Le projet héberge plusieurs simulateurs patrimoniaux côté client (calculateur d'impôt, comparateur immobilier, à venir : comparateur multi-investissements). Pour éviter la duplication et garantir une UX cohérente, des **modules partagés** centralisent les comportements répétés. Ce document est la référence pour créer ou maintenir un simulateur.

Voir aussi `docs/architecture.md` pour la stack technique et les tokens CSS du design system.

## Carte des modules partagés

| Module | Export | Rôle |
|---|---|---|
| `js/format.js` | `fmtEUR(n)`, `fmtPct(n)` | Formatage EUR / pourcentage FR. Toujours utiliser ces helpers. |
| `js/theme.js` | (IIFE) | Toggle dark/light via `data-theme`. Inclure `<script src="js/theme.js">` dans tout HTML. |
| `js/modal.js` | `setupModal({ modalId, openBtnId, closeBtnId, onOpen })` | Wiring open/close/backdrop/Escape pour un modal "Détail du calcul". |
| `js/info-tooltip.js` | `setupTooltips(root?)` | Active les tooltips sur les `button.info-tooltip[data-tooltip]`. |
| `js/storage.js` | `createStorage(type, schemaVersion)` | Persistance localStorage versionnée (max 5 sims, LRU). |
| `js/data.js` | `loadData()` | Loader JSON avec fallback inline (pattern pour barèmes). |

## Pattern 1 — Tooltip d'information sur métrique ambiguë

**Quand l'utiliser** : sur toute métrique dont le calcul ou la définition n'est pas évident (TMI, patrimoine, différence, etc.).

**HTML** :
```html
<span class="metric-with-info">
  Patrimoine achat
  <button type="button" class="info-tooltip" data-tooltip="Valeur du bien × (1+plus-value)^t − CRD + épargne placée." aria-label="Aide patrimoine achat">i</button>
</span>
```

**JS** (une fois après chargement du DOM) :
```js
import { setupTooltips } from './info-tooltip.js';
setupTooltips();
```

Le popup s'ouvre au clic (mobile-safe), se ferme au clic hors zone ou via Escape. Idempotent — `setupTooltips()` peut être rappelé après un re-render : les boutons déjà câblés portent `data-wired="1"` et sont ignorés. Accepte un `root` optionnel (élément DOM) pour limiter le périmètre de scan.

## Pattern 2 — Badge de source de données

Sous chaque bloc de résultats, afficher la provenance des chiffres pour rassurer l'utilisateur.

**HTML** :
```html
<div class="source-badge">
  Barèmes IR 2024–2026 — DGFiP · Calcul 100 % local · Aucune donnée envoyée
</div>
```

**Règles** :
- Mentionner la **source réelle** (DGFiP, AMF, etc.) si elle existe
- Mentionner que tout reste local (rassurant côté vie privée)
- Pas plus d'une ligne

## Pattern 3 — Persistance localStorage versionnée

**API** :
```js
import { createStorage } from './storage.js';
const storage = createStorage('<type>', schemaVersion);

storage.initTab();          // URL hash → id ; crée un nouveau slot si nécessaire (LRU max 5)
storage.save(id, params);   // wrap en { version, params, savedAt }
storage.load(id);           // retourne params si version matche, null sinon (et supprime l'entry stale)
storage.remove(id);
storage.rename(id, name);
storage.getAllIds();         // tous les ids du type
storage.getAllSims();        // toutes les sims du type, triées par lastUsed desc
```

**Clés localStorage** : `roxabi-sim:data:<type>:<id>` (données) et `roxabi-sim:meta:<type>:<id>` (lastUsed, created, name).

**Conventions** :
- `type` = identifiant court du simulateur (`'tmi'`, `'immo'`, `'multi-invest'`)
- `schemaVersion` à incrémenter dès qu'on change la forme de `params` — en cas de mismatch, l'entry stale est supprimée silencieusement et `load()` retourne `null`
- L'enveloppe `{ version, params, savedAt }` est gérée par le module — `params` côté appelant reste un objet plat de valeurs d'entrée

**Deux usages** :
1. **Multi-sim avec UI** (cas TMI) : URL hash = id de simulation, dropdown pour switcher, bouton supprimer. Appeler `initTab()` au démarrage.
2. **Single-state implicite** (cas immo) : `storage.save('current', ...)` à chaque changement ; `storage.load('current')` à l'init. Pas d'UI de gestion de sims.

## Pattern 4 — Modal détail du calcul

**HTML** :
```html
<div id="modal" class="modal-overlay">
  <div class="modal-box">
    <div class="modal-header">
      <h3>Détail du calcul</h3>
      <button class="modal-close" id="modal-close">&times;</button>
    </div>
    <div id="modal-content"></div>
  </div>
</div>
```

Le bouton d'ouverture (n'importe où dans la page) a un id stable, ex. `btn-detail`.

**JS** :
```js
import { setupModal } from './modal.js';
setupModal({
  openBtnId: 'btn-detail',
  onOpen: () => buildModalContent(lastInputs, lastResult), // optionnel
});
```

Paramètres (tous optionnels sauf `openBtnId`) :

| Param | Défaut | Rôle |
|---|---|---|
| `modalId` | `'modal'` | Id de l'overlay |
| `openBtnId` | — | Id du bouton d'ouverture |
| `closeBtnId` | `'modal-close'` | Id du bouton de fermeture |
| `onOpen` | — | Callback exécuté avant l'ouverture (re-génère le contenu) |

`onOpen` permet de re-générer le contenu du modal à chaque ouverture, utile si l'état change entre deux ouvertures.

## Pattern 5 — Auto-recalc on change

Plutôt qu'un bouton "Calculer", déclencher le calcul à chaque modification d'input :

```js
const inputIds = ['prix', 'apport', 'duree'];
inputIds.forEach(id => {
  document.getElementById(id)?.addEventListener('change', run);
});
run(); // rendu initial avec valeurs par défaut HTML
```

- Préférer `change` (blur / spinner) à `input` (chaque touche) pour éviter de redraw le chart à chaque frappe
- Toujours appeler `run()` à la fin de `init()` pour rendre le chart/tableau au premier chargement

## Pattern 6 — Séparation logique pure / DOM

| Fichier | Rôle |
|---|---|
| `<sim>-logic.js` | Calculs purs, prend un objet d'inputs parsés, retourne un objet de résultats. Pas d'accès DOM. |
| `<sim>-ui.js` | Render des résultats. Lit le DOM (inputs), appelle la logique, écrit le DOM (résultats). |
| `main.js` (orchestrateur) | Wiring : init, event listeners, save/load. |

Cas immo actuel : tout est dans `comparateur-immo.js` (acceptable pour un simulateur page unique). À éclater quand la complexité grandit.

## Pattern 7 — Fallback de données

Tout fichier de barème (`data/*.json`) doit avoir un **fallback inline** dans le loader, au cas où le `fetch` échoue (offline, CORS, 404). Voir `js/data.js` : `loadData()` peuple `DATA.baremes` et `DATA.micro` depuis le réseau, ou depuis les objets inline du `catch`.

```js
export async function loadData() {
  try {
    // fetch data/*.json ...
  } catch (e) {
    DATA.baremes = { /* valeurs inline de secours */ };
    DATA.micro   = { /* valeurs inline de secours */ };
  }
}
```

## Checklist nouveau simulateur

1. [ ] Page HTML avec topbar partagée, container, modal (skeleton), source badge
2. [ ] `<script src="js/theme.js">` + `<script type="module" src="js/<sim>.js">`
3. [ ] Logique pure dans `js/<sim>-logic.js` (ou inline si petit)
4. [ ] Import `fmtEUR`, `fmtPct` depuis `format.js`
5. [ ] Persistance via `createStorage('<type>', 1)` (multi-sim avec UI ou single-state)
6. [ ] Modal via `setupModal({ openBtnId, onOpen })`
7. [ ] Tooltips via `setupTooltips()` sur métriques ambiguës
8. [ ] Auto-recalc on change + `run()` au bout d'`init()`
9. [ ] Source badge avec source réelle + "calcul 100% local"
10. [ ] Mise à jour `docs/simulateurs.md` (logique métier) et `docs/architecture.md` (structure modules)
