import { fmtEUR, fmtPct } from './format.js';
import { setupModal } from './modal.js';
import { setupTooltips } from './info-tooltip.js';
import { createStorage } from './storage.js';

const storage = createStorage('immo', 1);
const SAVED_ID = 'current';

let chartInstance = null;

function getInputs() {
  const val = id => {
    const el = document.getElementById(id);
    return el ? parseFloat(el.value.replace(',', '.')) || 0 : 0;
  };
  const prix = val('prix');
  const notairePct = val('notaire-pct');
  const notaire = Math.round(prix * notairePct / 100);
  return {
    prix,
    notaire,
    notairePct,
    apport: val('apport'),
    tauxCredit: val('taux-credit') / 100,
    dureeCredit: val('duree-credit'),
    travaux: val('travaux'),
    entretien: val('entretien'),
    taxe: val('taxe'),
    plusValue: val('plus-value') / 100,
    loyer: val('loyer'),
    chargesLoc: val('charges-loc'),
    rendement: val('rendement') / 100,
    horizon: val('horizon'),
    inflGlobale: val('inflation-globale') / 100,
    inflAvance: document.getElementById('inflation-avance')?.checked || false,
    inflLoyer: val('infl-loyer') / 100,
    inflCharges: val('infl-charges') / 100,
    inflTaxe: val('infl-taxe') / 100,
    inflEntretien: val('infl-entretien') / 100,
    flatTaxe: document.getElementById('flat-taxe')?.checked || false,
  };
}

function updateNotaireDisplay() {
  const prix = parseFloat(document.getElementById('prix')?.value) || 0;
  const pct = parseFloat(document.getElementById('notaire-pct')?.value) || 0;
  const montant = Math.round(prix * pct / 100);
  const display = document.getElementById('notaire-display');
  if (display) display.textContent = '≈ ' + fmtEUR(montant);
}

function computeMensualite(K, tauxAnnuel, dureeAnnees) {
  if (K <= 0 || tauxAnnuel <= 0 || dureeAnnees <= 0) return 0;
  const i = tauxAnnuel / 12;
  const n = dureeAnnees * 12;
  return (K * i) / (1 - Math.pow(1 + i, -n));
}

function capitalRestantDu(K, tauxAnnuel, dureeAnnees, anneesEcoulees) {
  if (anneesEcoulees >= dureeAnnees) return 0;
  const i = tauxAnnuel / 12;
  const n = dureeAnnees * 12;
  const k = anneesEcoulees * 12;
  return (K * (Math.pow(1 + i, n) - Math.pow(1 + i, k))) / (Math.pow(1 + i, n) - 1);
}

function computeScenarios(d) {
  const capitalEmprunte = d.prix + d.notaire + d.travaux - d.apport;
  const mensualite = computeMensualite(capitalEmprunte, d.tauxCredit, d.dureeCredit);

  const TAUX_PFU = 0.30;
  const annees = [];
  let potAchat = 0; // épargne secondaire côté acheteur
  let potLoc = d.apport; // même cash que l'acheteur sort au signing (apples-to-apples)
  let capitalAchat = 0;
  let capitalLoc = d.apport;

  const ifLoyer = d.inflAvance ? d.inflLoyer : d.inflGlobale;
  const ifCharges = d.inflAvance ? d.inflCharges : d.inflGlobale;
  const ifTaxe = d.inflAvance ? d.inflTaxe : d.inflGlobale;
  const ifEntretien = d.inflAvance ? d.inflEntretien : d.inflGlobale;

  for (let t = 0; t <= d.horizon; t++) {
    const mensualiteT = t < d.dureeCredit ? mensualite : 0;
    const loyerT = d.loyer * Math.pow(1 + ifLoyer, t);
    const chargesT = d.chargesLoc * Math.pow(1 + ifCharges, t);
    const taxeT = d.taxe * Math.pow(1 + ifTaxe, t);
    const entretienT = d.entretien * Math.pow(1 + ifEntretien, t);

    const depenseAchatT = mensualiteT * 12 + entretienT + taxeT;
    const depenseLocT = loyerT * 12 + chargesT * 12;

    // Achat — valeur nette du bien moins CRD
    const valeurBien = (d.prix + d.travaux) * Math.pow(1 + d.plusValue, t);
    const crd = capitalRestantDu(capitalEmprunte, d.tauxCredit, d.dureeCredit, t);

    // Flat tax sur les gains des pots de placement (pas sur la plus-value immobilière)
    const gainsAchat = Math.max(0, potAchat - capitalAchat);
    const gainsLoc = Math.max(0, potLoc - capitalLoc);
    const taxAchat = d.flatTaxe ? gainsAchat * TAUX_PFU : 0;
    const taxLoc = d.flatTaxe ? gainsLoc * TAUX_PFU : 0;
    const potAchatNet = potAchat - taxAchat;
    const potLocNet = potLoc - taxLoc;

    const patrimoineAchat = (valeurBien - crd) + potAchatNet;
    const patrimoineLoc = potLocNet;

    annees.push({
      annee: t,
      patrimoineAchat,
      patrimoineLoc,
      diff: patrimoineAchat - patrimoineLoc,
      meilleure: patrimoineAchat >= patrimoineLoc ? 'achat' : 'location',
      mensualite: mensualiteT,
      depenseAchatAnnuelle: depenseAchatT,
      depenseLocAnnuelle: depenseLocT,
      valeurBien,
      crd,
      potAchat,
      potLoc,
      capitalAchat,
      capitalLoc,
      taxAchat,
      taxLoc,
    });

    if (t >= d.horizon) break; // pas de projection après la dernière année

    // Placement de la différence de cash-flow du côté qui économise
    const diffDepense = depenseAchatT - depenseLocT;
    if (diffDepense > 0) {
      // Locataire dépense moins → il place la différence
      capitalLoc += diffDepense;
      potLoc = (potLoc + diffDepense) * (1 + d.rendement);
      potAchat = potAchat * (1 + d.rendement);
    } else if (diffDepense < 0) {
      // Acheteur dépense moins → il place la différence
      capitalAchat += Math.abs(diffDepense);
      potAchat = (potAchat + Math.abs(diffDepense)) * (1 + d.rendement);
      potLoc = potLoc * (1 + d.rendement);
    } else {
      potLoc = potLoc * (1 + d.rendement);
      potAchat = potAchat * (1 + d.rendement);
    }
  }

  const depenseAchatAnnuelle0 = mensualite * 12 + d.entretien + d.taxe;
  const depenseLocAnnuelle0 = d.loyer * 12 + d.chargesLoc * 12;
  const epargneAnnuelle = Math.abs(depenseAchatAnnuelle0 - depenseLocAnnuelle0);
  const gagnantEconomie = depenseAchatAnnuelle0 < depenseLocAnnuelle0 ? 'achat' : 'location';

  return {
    annees,
    capitalEmprunte,
    mensualite,
    depenseAchatAnnuelle: depenseAchatAnnuelle0,
    depenseLocAnnuelle: depenseLocAnnuelle0,
    epargneAnnuelle,
    gagnantEconomie,
    inflRates: { ifLoyer, ifCharges, ifTaxe, ifEntretien },
    flatTaxe: d.flatTaxe,
  };
}

function renderChart(annees) {
  const ctx = document.getElementById('patrimoine-chart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  const labels = annees.map(a => 'A' + a.annee);
  const dataAchat = annees.map(a => Math.round(a.patrimoineAchat));
  const dataLoc = annees.map(a => Math.round(a.patrimoineLoc));
  const dataRevente = annees.map(a => Math.round(a.valeurBien));
  const dataCRD = annees.map(a => Math.round(a.crd));

  const rootStyle = getComputedStyle(document.documentElement);
  const accent = rootStyle.getPropertyValue('--accent').trim() || '#f0b429';
  const cyan = rootStyle.getPropertyValue('--cyan').trim() || '#22d3ee';
  const success = rootStyle.getPropertyValue('--success').trim() || '#34d399';
  const danger = rootStyle.getPropertyValue('--danger').trim() || '#f87171';
  const textMuted = rootStyle.getPropertyValue('--text-muted').trim() || '#9ca3af';
  const border = rootStyle.getPropertyValue('--border').trim() || '#21262d';

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Patrimoine achat',
          data: dataAchat,
          borderColor: accent,
          backgroundColor: accent,
          borderWidth: 3,
          fill: false,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
        },
        {
          label: 'Patrimoine location + placement',
          data: dataLoc,
          borderColor: cyan,
          backgroundColor: cyan,
          borderWidth: 3,
          fill: false,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
        },
        {
          label: 'Valeur de revente',
          data: dataRevente,
          borderColor: success,
          backgroundColor: success,
          borderWidth: 2,
          fill: false,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5,
        },
        {
          label: 'Capital restant dû',
          data: dataCRD,
          borderColor: danger,
          backgroundColor: danger,
          borderWidth: 2,
          fill: false,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: textMuted, font: { size: 12 } },
        },
        tooltip: {
          backgroundColor: 'rgba(13,17,23,0.95)',
          titleColor: textMuted,
          bodyColor: '#f0ede6',
          borderColor: border,
          borderWidth: 1,
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${fmtEUR(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: border },
          ticks: { color: textMuted, maxTicksLimit: 12 },
        },
        y: {
          grid: { color: border },
          ticks: {
            color: textMuted,
            callback: v => fmtEUR(v),
          },
        },
      },
    },
  });
}

function renderTable(annees) {
  const tbody = document.querySelector('#result-table tbody');
  tbody.innerHTML = '';
  for (const a of annees) {
    const tr = document.createElement('tr');
    const diffClass = a.diff >= 0 ? 'positive' : 'negative';
    tr.innerHTML = `
      <td>${a.annee === 0 ? 'Départ' : 'Année ' + a.annee}</td>
      <td>${fmtEUR(a.patrimoineAchat)}</td>
      <td>${fmtEUR(a.patrimoineLoc)}</td>
      <td class="${diffClass}">${a.diff >= 0 ? '+' : ''}${fmtEUR(a.diff)}</td>
      <td>${a.meilleure === 'achat' ? 'Acheter' : 'Louer + investir'}</td>
    `;
    tbody.appendChild(tr);
  }
}

let lastResult = null;
let lastInputs = null;

function buildModal(d, res) {
  const { capitalEmprunte, mensualite, depenseAchatAnnuelle, depenseLocAnnuelle, epargneAnnuelle, gagnantEconomie } = res;
  const totalAcquisition = d.prix + d.notaire + d.travaux;
  const diffSign = depenseAchatAnnuelle - depenseLocAnnuelle;
  const diffLabel = diffSign > 0 ? 'Locataire économise' : (diffSign < 0 ? 'Acheteur économise' : 'Égalité');

  document.getElementById('modal-content').innerHTML = `
    <h4 style="margin:0 0 8px; color:var(--accent);">Hypothèses achat</h4>
    <div class="detail-step">
      <div class="expr">Prix du bien + Frais de notaire (${fmtPct(d.notairePct)}) + Travaux</div>
      <div class="res">${fmtEUR(d.prix)} + ${fmtEUR(d.notaire)} + ${fmtEUR(d.travaux)} = ${fmtEUR(totalAcquisition)}</div>
    </div>
    <div class="detail-step">
      <div class="expr">Apport personnel</div>
      <div class="res">${fmtEUR(d.apport)}</div>
    </div>
    <div class="detail-step">
      <div class="expr">Capital emprunté</div>
      <div class="res">${fmtEUR(totalAcquisition)} - ${fmtEUR(d.apport)} = ${fmtEUR(capitalEmprunte)}</div>
    </div>

    <h4 style="margin:16px 0 8px; color:var(--accent);">Crédit</h4>
    <div class="detail-step">
      <div class="expr">Mensualité (amortissement) — taux ${fmtPct(d.tauxCredit)} sur ${d.dureeCredit} ans</div>
      <div class="res">${fmtEUR(mensualite)} / mois</div>
    </div>

    <h4 style="margin:16px 0 8px; color:var(--accent);">Dépenses annuelles comparées</h4>
    <div class="detail-step">
      <div class="expr">Achat : mensualités + entretien + taxe foncière</div>
      <div class="res">${fmtEUR(mensualite * 12)} + ${fmtEUR(d.entretien)} + ${fmtEUR(d.taxe)} = ${fmtEUR(depenseAchatAnnuelle)}</div>
    </div>
    <div class="detail-step">
      <div class="expr">Location : loyer + charges</div>
      <div class="res">${fmtEUR(d.loyer * 12)} + ${fmtEUR(d.chargesLoc * 12)} = ${fmtEUR(depenseLocAnnuelle)}</div>
    </div>
    <div class="detail-step">
      <div class="expr">Différence de cash-flow — ${diffLabel}</div>
      <div class="res">${fmtEUR(Math.abs(depenseAchatAnnuelle - depenseLocAnnuelle))} / an → placé côté ${gagnantEconomie === 'achat' ? 'acheteur' : 'locataire'}</div>
    </div>
    <div class="detail-step">
      <div class="expr">Note : après ${d.dureeCredit} ans, la mensualité s&apos;arrête. Le cash-flow acheteur se réduit à entretien + taxe foncière.</div>
      <div class="res"></div>
    </div>
    <div class="detail-step">
      <div class="expr">Indexation annuelle (loyer / charges / taxe / entretien)</div>
      <div class="res">${d.inflAvance
        ? `Loyer ${fmtPct(res.inflRates.ifLoyer)} · Charges ${fmtPct(res.inflRates.ifCharges)} · Taxe ${fmtPct(res.inflRates.ifTaxe)} · Entretien ${fmtPct(res.inflRates.ifEntretien)}`
        : `Globale ${fmtPct(d.inflGlobale)} appliquée aux 4 variables`}</div>
    </div>

    <h4 style="margin:16px 0 8px; color:var(--accent);">Patrimoine achat</h4>
    <div class="detail-step">
      <div class="expr">Valeur de revente(t) = (Prix + Travaux) × (1 + plus-value)^t</div>
      <div class="res">(${fmtEUR(d.prix)} + ${fmtEUR(d.travaux)}) × (1 + ${fmtPct(d.plusValue)})^t — frais de notaire (${fmtEUR(d.notaire)}) sont sunk costs, exclus.</div>
    </div>
    <div class="detail-step">
      <div class="expr">Capital restant dû (CRD) à l'année t — remboursé à la revente</div>
      <div class="res">Formule d'amortissement standard sur ${d.dureeCredit} ans à ${fmtPct(d.tauxCredit)}.</div>
    </div>
    <div class="detail-step">
      <div class="expr">Valeur nette du bien(t) = Revente(t) − CRD(t)</div>
      <div class="res">À t=0 : ${fmtEUR(d.prix + d.travaux)} − ${fmtEUR(capitalEmprunte)} = ${fmtEUR(d.prix + d.travaux - capitalEmprunte)} (apport − notaire − travaux financés).</div>
    </div>
    <div class="detail-step">
      <div class="expr">Patrimoine net achat = Valeur nette du bien + épargne placée</div>
      <div class="res">Si l'acheteur dépense moins que le locataire (après crédit), la différence est placée au rendement ${fmtPct(d.rendement)}.</div>
    </div>

    <h4 style="margin:16px 0 8px; color:var(--accent);">Patrimoine location + placement</h4>
    <div class="detail-step">
      <div class="expr">Capital initial placé = Apport (même cash que l'acheteur sort au signing)</div>
      <div class="res">${fmtEUR(d.apport)}</div>
    </div>
    <div class="detail-step">
      <div class="expr">Chaque année : on ajoute l'économie au pot du côté gagnant, puis on capitalise</div>
      <div class="res">Pot(t) = (Pot(t-1) + économie annuelle) × (1 + ${fmtPct(d.rendement)})</div>
    </div>
    <h4 style="margin:16px 0 8px; color:var(--accent);">Fiscalité du placement</h4>
    <div class="detail-step">
      <div class="expr">${d.flatTaxe ? 'Flat tax (PFU 30 %) sur les plus-values cumulées des deux pots' : 'Aucune fiscalité appliquée sur les placements'}</div>
      <div class="res">${d.flatTaxe ? 'Tax(t) = max(0, pot(t) − capital_investi(t)) × 30 %' : '—'}</div>
    </div>
    <p class="muted">Calcul théorique avant fiscalité immobilière et frais de revente. Le crédit et le placement sont supposés constants. La différence de cash-flow est placée du côté qui dépense le moins.</p>
  `;
}

function snapshotRawInputs() {
  const ids = ['prix','notaire-pct','apport','taux-credit','duree-credit','travaux','entretien','taxe','plus-value','loyer','charges-loc','rendement','horizon','inflation-globale','inflation-avance','infl-loyer','infl-charges','infl-taxe','infl-entretien','flat-taxe'];
  const out = {};
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    out[id] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return out;
}

function restoreInputs(params) {
  if (!params) return;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el == null) return;
    if (el.type === 'checkbox') el.checked = !!val;
    else if (val != null) el.value = val;
  };
  for (const [k, v] of Object.entries(params)) setVal(k, v);
}

function run() {
  try {
    const inputs = getInputs();
    const result = computeScenarios(inputs);
    lastInputs = inputs;
    lastResult = result;

    renderChart(result.annees);
    renderTable(result.annees);
    buildModal(inputs, result);
    storage.save(SAVED_ID, snapshotRawInputs());
  } catch (e) {
    console.error('Run failed:', e);
  }
}

function init() {
  const saved = storage.load(SAVED_ID);
  if (saved) restoreInputs(saved);

  // Live update notaire display when prix or pct changes
  document.getElementById('prix')?.addEventListener('input', updateNotaireDisplay);
  document.getElementById('notaire-pct')?.addEventListener('input', updateNotaireDisplay);
  updateNotaireDisplay();

  // Inflation advanced mode toggle
  const advCheckbox = document.getElementById('inflation-avance');
  const detailBlock = document.getElementById('inflation-detail');
  advCheckbox?.addEventListener('change', () => {
    detailBlock.classList.toggle('hidden', !advCheckbox.checked);
    if (advCheckbox.checked) {
      const g = document.getElementById('inflation-globale')?.value;
      ['infl-loyer','infl-charges','infl-taxe','infl-entretien'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = g;
      });
    }
    run();
  });

  // Fiscalité info-button toggle
  const fiscaliteInfoBtn = document.getElementById('flat-taxe-info-btn');
  const fiscaliteDetail = document.getElementById('flat-taxe-detail');
  fiscaliteInfoBtn?.addEventListener('click', () => {
    const willShow = fiscaliteDetail.classList.contains('hidden');
    fiscaliteDetail.classList.toggle('hidden');
    fiscaliteInfoBtn.setAttribute('aria-expanded', String(willShow));
  });

  // Auto-recalc on change (blur or spinner — avoids redraw on every keystroke)
  const inputIds = ['prix','notaire-pct','apport','taux-credit','duree-credit','travaux','entretien','taxe','plus-value','loyer','charges-loc','rendement','horizon','inflation-globale','infl-loyer','infl-charges','infl-taxe','infl-entretien','flat-taxe'];
  inputIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', run);
  });

  setupModal({
    openBtnId: 'btn-detail',
    onOpen: () => { if (lastInputs && lastResult) buildModal(lastInputs, lastResult); },
  });
  setupTooltips();
  run(); // initial render
}

init();
