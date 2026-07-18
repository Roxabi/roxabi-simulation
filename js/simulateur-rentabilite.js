import { fmtEUR, fmtPct } from './format.js';
import { setupModal } from './modal.js';
import { setupTooltips } from './info-tooltip.js';
import { createStorage } from './storage.js';

const storage = createStorage('renta', 2);
const SAVED_ID = 'current';
let chartInstance = null;
let lastInputs = null;
let lastResult = null;

const SYNTHESE_BASE_ANNEES = [2, 5, 15, 20];
const DEFAULT_HORIZON = 20;
const MAX_HORIZON = 40;
const MODE_KEY = 'roxabi-sim:renta-mode';

function getMode() {
  const stored = localStorage.getItem(MODE_KEY);
  return stored === 'advanced' ? 'advanced' : 'simple';
}

function applyMode(mode) {
  document.body.dataset.rentaMode = mode;
  localStorage.setItem(MODE_KEY, mode);
  const btnS = document.getElementById('mode-simple');
  const btnA = document.getElementById('mode-advanced');
  if (btnS) { btnS.classList.toggle('active', mode === 'simple'); btnS.setAttribute('aria-selected', mode === 'simple'); }
  if (btnA) { btnA.classList.toggle('active', mode === 'advanced'); btnA.setAttribute('aria-selected', mode === 'advanced'); }
}

function val(id) {
  const el = document.getElementById(id);
  return el ? parseFloat(el.value.replace(',', '.')) || 0 : 0;
}

function getInputs() {
  // Bien
  const prix = val('prix');
  const notairePct = val('notaire-pct');
  const notaire = Math.round(prix * notairePct / 100);
  const agencePct = val('agence-pct');
  const agence = Math.round(prix * agencePct / 100);

  // Charges : mode simple = champ unique ; mode avancé = grille détaillée
  const mode = getMode();
  const chargeIds = ['copro','pno','compta','cga','banque','eau','elec','gaz','internet','cfe','taxe-fonciere','divers'];
  const charges = {};
  for (const id of chargeIds) {
    const raw = val(`charge-${id}`);
    const unit = document.getElementById(`unit-${id}`)?.value || 'mois';
    charges[id] = unit === 'an' ? raw : raw * 12;
  }
  const chargesDetail = Object.values(charges).reduce((a, b) => a + b, 0);
  const chargesAnnuelles = mode === 'simple' ? val('charge-simple') : chargesDetail;

  // Crédit
  const apport = val('apport');
  const dureeMois = val('duree-credit');
  const tauxCredit = val('taux-credit') / 100;
  const tauxAssurance = val('taux-assurance') / 100;
  const differe = document.getElementById('differe')?.value || 'aucun';
  const differeDuree = val('differe-duree');
  const fraisDossier = val('frais-dossier');
  const garantie = val('garantie');

  // Revenus
  const loyer = val('loyer');
  const vacance = val('vacance');
  const vacanceUnit = document.getElementById('vacance-unit')?.value || 'mois';
  const vacancePct = vacanceUnit === 'mois' ? vacance / 12 : vacance;
  const augmentationLoyer = val('augmentation-loyer') / 100;
  const inflationCharges = val('inflation-charges') / 100;

  // Revente + investisseur
  const inflationRevente = val('inflation-revente') / 100;
  const cashflowRate = val('cashflow-rate') / 100;
  const horizonGraphRaw = Math.round(val('chart-horizon')) || DEFAULT_HORIZON;
  const horizonGraph = Math.max(1, Math.min(MAX_HORIZON, horizonGraphRaw));
  // En mode simple : horizon d'évaluation = horizon graphique (KPI = état final)
  const horizonRendement = mode === 'simple'
    ? horizonGraph
    : Math.max(0, Math.min(horizonGraph, Math.round(val('horizon-rendement'))));

  return {
    prix, notairePct, notaire, agencePct, agence,
    travaux: val('travaux'),
    meubles: val('meubles'),
    superficie: val('superficie'),
    charges,
    chargesAnnuelles,
    apport,
    dureeMois,
    tauxCredit,
    tauxAssurance,
    differe,
    differeDuree,
    fraisDossier,
    garantie,
    loyer,
    vacancePct,
    augmentationLoyer,
    inflationCharges,
    inflationRevente,
    cashflowRate,
    horizonGraph,
    horizonRendement,
  };
}

// IRR via bisection. Returns NaN if no sign change or single cashflow.
function computeIRR(cashflows, maxIter = 100, tol = 1e-7) {
  if (cashflows.length < 2) return NaN;
  const hasPos = cashflows.some(cf => cf > 0);
  const hasNeg = cashflows.some(cf => cf < 0);
  if (!hasPos || !hasNeg) return NaN;

  const npv = rate => {
    let sum = 0;
    for (let s = 0; s < cashflows.length; s++) {
      sum += cashflows[s] / Math.pow(1 + rate, s);
    }
    return sum;
  };

  let lo = -0.999, hi = 10;
  let npvLo = npv(lo), npvHi = npv(hi);
  if (npvLo * npvHi > 0) return NaN;

  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const npvMid = npv(mid);
    if (Math.abs(npvMid) < tol) return mid;
    if (npvMid * npvLo < 0) { hi = mid; }
    else { lo = mid; npvLo = npvMid; }
  }
  return (lo + hi) / 2;
}

// Mensualité totale (intérêt + assurance + capital), constante, telle que K_n = 0 exactement.
// Utilise r = (tauxAnnuel + tauxAssurance) / 12 pour rester cohérent avec assurance dégressive.
function computeMensualite(K, tauxAnnuel, dureeMois, tauxAssurance = 0) {
  if (K <= 0 || dureeMois <= 0) return 0;
  const r = (tauxAnnuel + tauxAssurance) / 12;
  if (r <= 0) return K / dureeMois;
  return (K * r) / (1 - Math.pow(1 + r, -dureeMois));
}

function computeRentabilite(d) {
  const totalAcquisition = d.prix + d.travaux + d.meubles + d.notaire + d.agence + d.fraisDossier + d.garantie;
  const K0 = Math.max(0, totalAcquisition - d.apport);
  const i = d.tauxCredit / 12;
  const n = d.dureeMois;
  const dDiff = d.differe === 'aucun' ? 0 : Math.min(d.differeDuree, n);

  let K = K0;
  let mensualite = 0;
  let totalInterets = 0;
  let totalAssurance = 0;

  // Simulation mois par mois pour gérer différé et capitalisation
  const moisData = [];
  for (let m = 1; m <= n; m++) {
    const assuranceMois = K * d.tauxAssurance / 12;
    totalAssurance += assuranceMois;

    if (dDiff > 0 && m <= dDiff) {
      if (d.differe === 'total') {
        // Intérêts capitalisés ; l'assurance reste due chaque mois dès le déblocage
        const interetMois = K * i;
        totalInterets += interetMois;
        K += interetMois;
        mensualite = assuranceMois;
      } else {
        // Partiel = intérêts seuls
        const interetMois = K * i;
        totalInterets += interetMois;
        mensualite = interetMois + assuranceMois;
      }
    } else {
      // Phase normale : recalcul si on sort du différé
      if (dDiff > 0 && m === dDiff + 1) {
        // Recalcul mensualité sur capital restant et durée restante
        const remainingMois = n - dDiff;
        mensualite = computeMensualite(K, d.tauxCredit, remainingMois, d.tauxAssurance);
      } else if (dDiff === 0 && m === 1) {
        mensualite = computeMensualite(K, d.tauxCredit, n, d.tauxAssurance);
      }
      const interetMois = K * i;
      const amortissement = mensualite - interetMois - assuranceMois;
      totalInterets += interetMois;
      K = Math.max(0, K - amortissement);
    }

    moisData.push({ mensualite, assuranceMois, capital: K });
  }

  // Dossier + garantie sont déjà dans K0 (financés via totalAcquisition) — ne pas les recompter
  const coutTotalPret = K0 + totalInterets + totalAssurance;

  // Projection annuelle + TRI mono-projet
  // baseCF[0] = -apport (cash out au signing) ; baseCF[s≥1] = cashflow net annuel de l'année [s-1, s)
  const baseCF = [-d.apport];
  const annees = [];
  const HORIZON = d.horizonGraph ?? DEFAULT_HORIZON;
  let cashFlowCumuleAcc = 0;
  // Cumul des CF positifs uniquement (revenus locatifs nets, encaissés). Sert au patrimoine immo —
  // les CF négatifs sont déjà comptés côté placement alternatif (dépôts).
  let cashFlowPosCumuleAcc = 0;
  // Placement alternatif : on commence avec l'apport déposé, on compound chaque année et on ajoute
  // un dépôt égal à max(0, -CF_y(t-1)) à chaque transition (cash qu'on aurait dû sortir pour l'immo).
  let placementAltAcc = d.apport;
  for (let t = 0; t <= HORIZON; t++) {
    const loyerMensuel = d.loyer * Math.pow(1 + d.augmentationLoyer, t);
    const loyerAnnuel = loyerMensuel * 12;
    const loyerEffectifAnnuel = loyerAnnuel * (1 - d.vacancePct);

    const chargesAnnuelles = d.chargesAnnuelles * Math.pow(1 + (d.inflationCharges ?? 0), t);
    const chargesMensuelles = chargesAnnuelles / 12;

    // Mensualité moyenne de l'année t (pour affichage)
    const startMois = t * 12;
    const endMois = Math.min(startMois + 12, n);
    let mensualiteMoyenne = 0;
    let count = 0;
    for (let m = startMois; m < endMois && m < moisData.length; m++) {
      mensualiteMoyenne += moisData[m].mensualite;
      count++;
    }
    if (count > 0) mensualiteMoyenne /= count;

    const cashFlowMensuel = loyerMensuel * (1 - d.vacancePct) - chargesMensuelles - mensualiteMoyenne;

    // Cashflow annuel exact (somme des 12 mois — gère propre la transition fin de crédit)
    let mensualiteSumYear = 0;
    for (let m = startMois; m < startMois + 12; m++) {
      mensualiteSumYear += m < moisData.length ? moisData[m].mensualite : 0;
    }
    const cashFlowAnnuel = loyerEffectifAnnuel - chargesAnnuelles - mensualiteSumYear;

    // Revente basée sur (prix + travaux) — les frais (notaire, dossier, agence) sont sunk costs
    const revente = (d.prix + d.travaux) * Math.pow(1 + d.inflationRevente, t);

    const rentabiliteBrute = totalAcquisition > 0 ? (loyerEffectifAnnuel / totalAcquisition) * 100 : 0;
    const rentabiliteNette = totalAcquisition > 0 ? ((loyerEffectifAnnuel - chargesAnnuelles) / totalAcquisition) * 100 : 0;

    const crd = t === 0
      ? K0
      : (moisData[t * 12 - 1]?.capital ?? 0);

    // Perspective investisseur : si revente à l'année t
    // saleStream = baseCF avec le dernier élément augmenté du cash de vente (revente - CRD)
    const cashFromSale = revente - crd;
    const saleStream = baseCF.slice();
    saleStream[saleStream.length - 1] = saleStream[saleStream.length - 1] + cashFromSale;
    const rendementAnnualise = computeIRR(saleStream);

    // Cashflow cumulé AVANT revente à l'année t : Σ CF(s) pour s = 0..t−1
    // (à t=0 : 0 ; à t=1 : CF_y0 ; … ; à t=T : somme de T cashflows annuels)
    const cashFlowCumule = cashFlowCumuleAcc;
    // Cumul des CF positifs uniquement (revenus locatifs nets encaissés, années post-crédit)
    const cashFlowPosCumule = cashFlowPosCumuleAcc;

    // Stratégie 1 (Immo) — patrimoine si revente à T :
    //   = Revente(t) − CRD(t) + Σ max(0, CF(s)) pour s=0..t−1
    // Les CF négatifs sont EXCLUS — ils sont déjà comptés côté placement alternatif (dépôts).
    // Apples-to-apples : les deux courbes "voient" le même cash sortant, mais valorisent
    // différemment ce qui en sort (équité immo + loyers nets vs. solde du placement compoundé).
    const patrimoineImmo = revente - crd + cashFlowPosCumule;

    // Stratégie 2 (Placement alternatif) — apport déposé à t=0 + dépôts annuels = max(0, −CF(s)).
    // Récurrence : alt(t) = alt(t−1) × (1+r) + max(0, −CF(t−1)).
    // À t=0 : pas de croissance ni dépôt — c'est juste l'apport fraîchement déposé.
    const placementAlternatif = placementAltAcc;

    annees.push({
      annee: t,
      loyerMensuel,
      loyerAnnuel,
      loyerEffectifAnnuel,
      chargesAnnuelles,
      chargesMensuelles,
      mensualiteMoyenne,
      cashFlowMensuel,
      cashFlowAnnuel,
      cashFlowCumule,
      cashFlowPosCumule,
      revente,
      rentabiliteBrute,
      rentabiliteNette,
      crd,
      cashFromSale,
      patrimoineImmo,
      placementAlternatif,
      ecart: patrimoineImmo - placementAlternatif,
      rendementAnnualise,
    });

    cashFlowCumuleAcc += cashFlowAnnuel;
    cashFlowPosCumuleAcc += Math.max(0, cashFlowAnnuel);
    // Update placement alternatif accumulator pour l'itération suivante :
    // grow by r, then deposit |CF| only if it was negative (sortie de cash pour l'immo).
    placementAltAcc = placementAltAcc * (1 + d.cashflowRate) + Math.max(0, -cashFlowAnnuel);

    // Append cashflow année [t, t+1) au stream pour les itérations suivantes
    if (t < HORIZON) baseCF.push(cashFlowAnnuel);
  }

  const h = d.horizonRendement ?? 0;
  const horizonRow = annees[h] || annees[0];

  return {
    totalAcquisition,
    montantEmprunte: K0,
    mensualite: moisData[0]?.mensualite || 0,
    totalInterets,
    totalAssurance,
    coutTotalPret,
    chargesMensuelles: d.chargesAnnuelles / 12,
    rentabiliteBrute: horizonRow.rentabiliteBrute,
    rentabiliteNette: horizonRow.rentabiliteNette,
    cashFlowMensuel: horizonRow.cashFlowMensuel,
    horizonRendement: h,
    annees,
    differe: d.differe,
    differeDuree: d.differeDuree,
    moisData,
  };
}

function renderKPIs(res) {
  const h = res.horizonRendement ?? 0;
  const yearSuffix = ` (A${h})`;
  document.getElementById('kpi-renta-brute').textContent = fmtPct(res.rentabiliteBrute / 100);
  document.getElementById('kpi-renta-nette').textContent = fmtPct(res.rentabiliteNette / 100);
  document.getElementById('kpi-mensualite').textContent = fmtEUR(res.mensualite);
  document.getElementById('kpi-cashflow').textContent = fmtEUR(res.cashFlowMensuel);

  const lblBrute = document.getElementById('lbl-renta-brute');
  if (lblBrute) lblBrute.textContent = 'Rentabilité brute' + yearSuffix;
  const lblNette = document.getElementById('lbl-renta-nette');
  if (lblNette) lblNette.textContent = 'Rentabilité nette' + yearSuffix;
  const lblCf = document.getElementById('lbl-cashflow');
  if (lblCf) lblCf.textContent = 'Cash-flow mensuel' + yearSuffix;

  const cfEl = document.getElementById('kpi-cashflow');
  cfEl.classList.toggle('positive', res.cashFlowMensuel >= 0);
  cfEl.classList.toggle('negative', res.cashFlowMensuel < 0);

  document.getElementById('kpi-emprunt').textContent = fmtEUR(res.montantEmprunte);
  document.getElementById('kpi-cout-pret').textContent = fmtEUR(res.coutTotalPret);

  const mensualiteDisplay = document.getElementById('credit-mensualite-display');
  if (mensualiteDisplay) mensualiteDisplay.textContent = fmtEUR(res.mensualite);

  const chargesDisplay = document.getElementById('charges-totales-display');
  if (chargesDisplay) chargesDisplay.textContent = fmtEUR(res.chargesMensuelles);
}

function renderChart(annees, cashflowRate) {
  const ctx = document.getElementById('renta-chart')?.getContext('2d');
  if (!ctx) return;
  if (chartInstance) chartInstance.destroy();

  const labels = annees.map(a => 'A' + a.annee);
  const dataImmo = annees.map(a => Math.round(a.patrimoineImmo));
  const dataPlacement = annees.map(a => Math.round(a.placementAlternatif));
  const dataRendement = annees.map(a => Number.isFinite(a.rendementAnnualise) ? a.rendementAnnualise : null);

  const rootStyle = getComputedStyle(document.documentElement);
  const accent = rootStyle.getPropertyValue('--accent').trim() || '#f0b429';
  const cyan = rootStyle.getPropertyValue('--cyan').trim() || '#22d3ee';
  const textMuted = rootStyle.getPropertyValue('--text-muted').trim() || '#9ca3af';
  const border = rootStyle.getPropertyValue('--border').trim() || '#21262d';
  const altColor = '#a78bfa'; // violet — placement alternatif

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Patrimoine immo (€)',
          data: dataImmo,
          yAxisID: 'yMoney',
          borderColor: accent,
          backgroundColor: accent,
          borderWidth: 3,
          fill: false,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
        },
        {
          label: 'Placement alternatif (€)',
          data: dataPlacement,
          yAxisID: 'yMoney',
          borderColor: altColor,
          backgroundColor: altColor,
          borderWidth: 3,
          borderDash: [6, 4],
          fill: false,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
        },
        {
          label: 'Rendement annualisé (TRI)',
          data: dataRendement,
          yAxisID: 'yPercent',
          borderColor: cyan,
          backgroundColor: cyan,
          borderWidth: 3,
          fill: false,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(13,17,23,0.97)',
          titleColor: accent,
          titleFont: { weight: '700', size: 13 },
          bodyColor: '#f0ede6',
          bodyFont: { size: 12 },
          borderColor: border,
          borderWidth: 1,
          padding: 12,
          boxPadding: 6,
          callbacks: {
            title: items => {
              if (!items.length) return '';
              const a = annees[items[0].dataIndex];
              return `Année ${a.annee} — si revente`;
            },
            label: ctx => {
              const v = ctx.parsed.y;
              if (v == null) return `${ctx.dataset.label}: —`;
              return ctx.dataset.yAxisID === 'yPercent'
                ? `${ctx.dataset.label}: ${fmtPct(v)}`
                : `${ctx.dataset.label}: ${fmtEUR(v)}`;
            },
            afterBody: items => {
              if (!items.length) return [];
              const a = annees[items[0].dataIndex];
              const ecart = a.ecart;
              const ecartSign = ecart >= 0 ? '+' : '−';
              return [
                '',
                `Écart immo − placement : ${ecartSign}${fmtEUR(Math.abs(ecart))}`,
                '',
                `Revente brute : ${fmtEUR(a.revente)}`,
                `CRD restant : ${fmtEUR(a.crd)}`,
                `Cash net de vente : ${fmtEUR(a.cashFromSale)}`,
                `Cashflow année : ${fmtEUR(a.cashFlowAnnuel)}`,
                `Cashflow cumulé : ${fmtEUR(a.cashFlowCumule)}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: border },
          ticks: { color: textMuted, maxTicksLimit: 12 },
        },
        yMoney: {
          type: 'linear',
          position: 'left',
          grid: { color: border },
          ticks: { color: textMuted, callback: v => fmtEUR(v) },
          title: { display: true, text: 'Patrimoine (€)', color: textMuted },
        },
        yPercent: {
          type: 'linear',
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: cyan, callback: v => fmtPct(v) },
          title: { display: true, text: 'Rendement annualisé', color: cyan },
        },
      },
    },
  });

  renderChartLegend(cashflowRate);
}

function renderChartLegend(cashflowRate) {
  const container = document.getElementById('chart-legend');
  if (!container) return;
  const pctLabel = Number.isFinite(cashflowRate) ? fmtPct(cashflowRate) : '5 %';
  const immoTip = `Patrimoine si revente à l'année T = Revente(T) − CRD(T) + Σ max(0, CF(s)) pour s=0..T−1. On compte la valeur du bien net de crédit + les loyers nets encaissés (CF positifs uniquement). Les CF négatifs ne sont pas soustraits ici — ils sont déjà comptés côté placement alternatif comme cash dépensé. Apples-to-apples : les deux courbes partagent le même cash sortant. À T=0 vaut Apport − Frais (équité initiale).`;
  const placementTip = `Stratégie alternative : on place l'apport au taux ${pctLabel}, puis chaque année où l'immo aurait demandé du cash (CF négatif), on dépose le même montant dans ce placement. Si l'immo génère du cash (CF positif), aucun dépôt — cette stratégie n'a pas accès à ce revenu locatif. Évolution = solde du compte à T. L'écart entre les deux courbes = surperformance immo vs placement à même cash sortant.`;
  const triTip = `Taux Interne de Rentabilité (IRR) : taux r tel que NPV du stream [−apport, CF années 0..T−1 + cash de vente] = 0. Rendement annualisé intrinsèque du projet. Indépendant du taux de placement alternatif.`;
  container.innerHTML = `
    <div class="chart-legend-item">
      <span class="legend-swatch" style="background: var(--accent);"></span>
      <span>Patrimoine immo (€)</span>
      <button type="button" class="info-tooltip" data-tooltip="${immoTip.replace(/"/g,'&quot;')}" aria-label="Aide patrimoine immo">i</button>
    </div>
    <div class="chart-legend-item">
      <span class="legend-swatch legend-swatch--dashed" style="background: #a78bfa;"></span>
      <span>Placement alternatif (€)</span>
      <button type="button" class="info-tooltip" data-tooltip="${placementTip.replace(/"/g,'&quot;')}" aria-label="Aide placement alternatif">i</button>
    </div>
    <div class="chart-legend-item">
      <span class="legend-swatch" style="background: var(--cyan);"></span>
      <span>Rendement annualisé (TRI)</span>
      <button type="button" class="info-tooltip" data-tooltip="${triTip.replace(/"/g,'&quot;')}" aria-label="Aide TRI">i</button>
    </div>
  `;
  setupTooltips(container);
}

function renderTable(annees, horizonGraph) {
  const tbody = document.querySelector('#synthese-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const H = horizonGraph ?? annees.length - 1;
  const targets = SYNTHESE_BASE_ANNEES.filter(y => y <= H);
  if (H > 0 && !targets.includes(H)) targets.push(H);

  for (const target of targets) {
    const a = annees.find(x => x.annee === target);
    if (!a) continue;
    const tr = document.createElement('tr');
    const cfClass = a.cashFlowMensuel >= 0 ? 'positive' : 'negative';
    tr.innerHTML = `
      <td>Année ${a.annee}</td>
      <td>${fmtEUR(a.mensualiteMoyenne)}</td>
      <td class="${cfClass}">${a.cashFlowMensuel >= 0 ? '+' : ''}${fmtEUR(a.cashFlowMensuel)}</td>
      <td>${fmtEUR(a.revente)}</td>
      <td>${fmtPct(a.rentabiliteNette / 100)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function buildCfCumuleSummary(annees, horizonRendement) {
  const targets = [2, 5, 10, 15, 20]
    .filter(t => t > 0 && t < annees.length)
    .filter(t => t !== horizonRendement);
  if (horizonRendement > 0 && horizonRendement < annees.length) targets.push(horizonRendement);
  targets.sort((a, b) => a - b);
  return targets.map(t => {
    const v = annees[t]?.cashFlowCumule ?? 0;
    const sign = v < 0 ? '−' : '+';
    const cls = v >= 0 ? 'positive' : 'negative';
    const star = t === horizonRendement ? ' ★' : '';
    return `<span class="${cls}">A${t}${star}: ${sign}${fmtEUR(Math.abs(v))}</span>`;
  }).join(' · ');
}

function buildModal(d, res) {
  const { totalAcquisition, montantEmprunte, mensualite, totalInterets, totalAssurance, coutTotalPret, rentabiliteBrute, rentabiliteNette, cashFlowMensuel } = res;
  const h = res.horizonRendement ?? 0;
  const annHorizon = res.annees[h] || res.annees[0];
  const loyerEffAnnuelH = annHorizon.loyerEffectifAnnuel;
  const chargesAnnuellesH = annHorizon.chargesAnnuelles;
  const chargesMensuellesH = annHorizon.chargesMensuelles;
  const mensualiteMoyH = annHorizon.mensualiteMoyenne;
  const loyerMensuelEffH = annHorizon.loyerMensuel * (1 - d.vacancePct);
  const loyerAnnuel0 = d.loyer * 12 * (1 - d.vacancePct);

  const differeLabel = {
    aucun: 'Aucun',
    partiel: 'Partiel (intérêts seuls)',
    total: 'Total (assurance seule, intérêts capitalisés)',
  }[d.differe] || 'Aucun';

  document.getElementById('modal-content').innerHTML = `
    <h4 style="margin:0 0 8px; color:var(--accent);">Bien & Acquisition</h4>
    <div class="detail-step">
      <div class="expr">Prix du bien + Travaux + Meubles + Notaire + Agence + Frais dossier + Garantie</div>
      <div class="res">${fmtEUR(d.prix)} + ${fmtEUR(d.travaux)} + ${fmtEUR(d.meubles)} + ${fmtEUR(d.notaire)} + ${fmtEUR(d.agence)} + ${fmtEUR(d.fraisDossier)} + ${fmtEUR(d.garantie)} = ${fmtEUR(totalAcquisition)}</div>
    </div>
    <div class="detail-step">
      <div class="expr">Apport personnel</div>
      <div class="res">${fmtEUR(d.apport)}</div>
    </div>
    <div class="detail-step">
      <div class="expr">Montant à emprunter</div>
      <div class="res">${fmtEUR(totalAcquisition)} − ${fmtEUR(d.apport)} = ${fmtEUR(montantEmprunte)}</div>
    </div>

    <h4 style="margin:16px 0 8px; color:var(--accent);">Revenus locatifs</h4>
    <div class="detail-step">
      <div class="expr">Loyer mensuel × 12 × (1 − vacance) — année 0</div>
      <div class="res">${fmtEUR(d.loyer)} × 12 × (1 − ${fmtPct(d.vacancePct)}) = ${fmtEUR(loyerAnnuel0)} / an</div>
    </div>
    <div class="detail-step">
      <div class="expr">Indexation : loyer(t) = loyer × (1 + ${fmtPct(d.augmentationLoyer)})^t — à A${h}</div>
      <div class="res">${fmtEUR(d.loyer)} × (1 + ${fmtPct(d.augmentationLoyer)})^${h} = ${fmtEUR(annHorizon.loyerMensuel)} / mois → ${fmtEUR(loyerEffAnnuelH)} / an</div>
    </div>

    <h4 style="margin:16px 0 8px; color:var(--accent);">Charges annuelles</h4>
    <div class="detail-step">
      <div class="expr">Total des charges (converties en annuel) — année 0</div>
      <div class="res">${fmtEUR(d.chargesAnnuelles)} / an</div>
    </div>
    <div class="detail-step">
      <div class="expr">Indexation : charges(t) = charges × (1 + ${fmtPct(d.inflationCharges)})^t — à A${h}</div>
      <div class="res">${fmtEUR(d.chargesAnnuelles)} × (1 + ${fmtPct(d.inflationCharges)})^${h} = ${fmtEUR(chargesAnnuellesH)} / an</div>
    </div>

    <h4 style="margin:16px 0 8px; color:var(--accent);">Crédit</h4>
    <div class="detail-step">
      <div class="expr">Mensualité totale (intérêt + assurance + capital) — formule auto-cohérente</div>
      <div class="res">K × r / (1 − (1+r)<sup>−n</sup>) avec r = (taux + assurance)/12 = ${fmtEUR(mensualite)} / mois</div>
    </div>
    <div class="detail-step">
      <div class="expr">Différé</div>
      <div class="res">${differeLabel} — ${d.differe !== 'aucun' ? d.differeDuree + ' mois' : '—'}</div>
    </div>
    <div class="detail-step">
      <div class="expr">Coût total du prêt</div>
      <div class="res">${fmtEUR(montantEmprunte)} + ${fmtEUR(totalInterets)} (intérêts) + ${fmtEUR(totalAssurance)} (assurance) = ${fmtEUR(coutTotalPret)} — dossier (${fmtEUR(d.fraisDossier)}) et garantie (${fmtEUR(d.garantie)}) déjà inclus dans le capital emprunté.</div>
    </div>

    <h4 style="margin:16px 0 8px; color:var(--accent);">Rentabilité (à A${h})</h4>
    <div class="detail-step">
      <div class="expr">Rentabilité brute = Loyers annuels(A${h}) / Total acquisition</div>
      <div class="res">${fmtEUR(loyerEffAnnuelH)} / ${fmtEUR(totalAcquisition)} = ${fmtPct(rentabiliteBrute / 100)}</div>
    </div>
    <div class="detail-step">
      <div class="expr">Rentabilité nette = (Loyers(A${h}) − Charges(A${h})) / Total acquisition</div>
      <div class="res">(${fmtEUR(loyerEffAnnuelH)} − ${fmtEUR(chargesAnnuellesH)}) / ${fmtEUR(totalAcquisition)} = ${fmtPct(rentabiliteNette / 100)}</div>
    </div>

    <h4 style="margin:16px 0 8px; color:var(--accent);">Cash-flow (à A${h})</h4>
    <div class="detail-step">
      <div class="expr">Cash-flow mensuel = Loyer effectif(A${h}) − Charges mensuelles(A${h}) − Mensualité moyenne(A${h})</div>
      <div class="res">${fmtEUR(loyerMensuelEffH)} − ${fmtEUR(chargesMensuellesH)} − ${fmtEUR(mensualiteMoyH)} = ${fmtEUR(cashFlowMensuel)}</div>
    </div>
    <div class="detail-step">
      <div class="expr">Cash-flow cumulé = Σ CF(s) pour s = 0 à T−1 — somme nominale (pas de capitalisation)</div>
      <div class="res">Si revente à A${h} : <strong>${fmtEUR(annHorizon.cashFlowCumule)}</strong> ${annHorizon.cashFlowCumule < 0 ? '(cash net sorti de la poche)' : '(cash net empoché)'}</div>
    </div>
    <div class="detail-step">
      <div class="expr">Progression du cumul aux paliers</div>
      <div class="res">${buildCfCumuleSummary(res.annees, h)}</div>
    </div>

    <h4 style="margin:16px 0 8px; color:var(--accent);">Revente</h4>
    <div class="detail-step">
      <div class="expr">Valeur de revente(t) = (Prix + Travaux) × (1 + inflation)^t</div>
      <div class="res">(${fmtEUR(d.prix)} + ${fmtEUR(d.travaux)}) × (1 + ${fmtPct(d.inflationRevente)})^t — frais notaire/dossier/agence sont sunk costs, exclus.</div>
    </div>
    <div class="detail-step">
      <div class="expr">Cash de vente(t) = Revente(t) − CRD(t)</div>
      <div class="res">Net empoché à la revente, après remboursement du capital restant dû.</div>
    </div>

    <h4 style="margin:16px 0 8px; color:var(--accent);">Performance investisseur (chart)</h4>
    <div class="detail-step">
      <div class="expr">Capital initialement bloqué = Apport</div>
      <div class="res">${fmtEUR(d.apport)} (les frais notaire/dossier/agence sont sunk costs au signing).</div>
    </div>
    <div class="detail-step">
      <div class="expr">Courbe 1 — Patrimoine immo(t) = Revente(t) − CRD(t) + Σ max(0, CF(s)) pour s=0..t−1</div>
      <div class="res">À A${h} : ${fmtEUR(annHorizon.revente)} − ${fmtEUR(annHorizon.crd)} + ${fmtEUR(annHorizon.cashFlowPosCumule)} = <strong>${fmtEUR(annHorizon.patrimoineImmo)}</strong><br>Vue nominale, pas de capitalisation. On somme la valeur du bien net de crédit + les loyers nets encaissés (CF positifs uniquement). Les CF négatifs sont EXCLUS d'ici car déjà comptés côté placement alternatif comme dépôts. À t=0 : ${fmtEUR(d.prix)} − ${fmtEUR(res.montantEmprunte)} = ${fmtEUR(d.prix - res.montantEmprunte)} (équité initiale = apport − frais).</div>
    </div>
    <div class="detail-step">
      <div class="expr">Courbe 2 — Placement alternatif(t) = Apport × (1+r)^t + Σ max(0, −CF(s)) × (1+r)^(t−1−s)</div>
      <div class="res">À A${h} : <strong>${fmtEUR(annHorizon.placementAlternatif)}</strong> au taux ${fmtPct(d.cashflowRate)}.<br>Stratégie alternative : on place l'apport au taux r, puis on dépose chaque année où l'immo aurait demandé du cash (CF négatif). Si CF positif (post-crédit), pas de dépôt — cette stratégie n'a pas accès au revenu locatif. Équivaut à "même cash sortant de la poche, mais investi sur les marchés à r %".</div>
    </div>
    <div class="detail-step">
      <div class="expr">Écart = Patrimoine immo − Placement alternatif</div>
      <div class="res">À A${h} : ${fmtEUR(annHorizon.patrimoineImmo)} − ${fmtEUR(annHorizon.placementAlternatif)} = <strong class="${annHorizon.ecart >= 0 ? 'positive' : 'negative'}">${annHorizon.ecart >= 0 ? '+' : '−'}${fmtEUR(Math.abs(annHorizon.ecart))}</strong>${annHorizon.ecart >= 0 ? ' (immo bat le placement)' : ' (immo en retard sur le placement)'}<br>L'écart visible sur le chart = surperformance nette de l'immo vs un placement classique au même taux pour le même cash sortant.</div>
    </div>
    <div class="detail-step">
      <div class="expr">Rendement annualisé(T) = TRI/IRR résolu sur le stream</div>
      <div class="res">Stream = [−apport, CF(0), …, CF(T−1) + cashVente(T)] · TRI = taux r tel que NPV = 0. Indépendant du taux de placement alternatif — c'est le rendement intrinsèque du projet locatif.</div>
    </div>

    <p class="muted">Calcul théorique mono-projet. Pas de fiscalité (revenus locatifs / plus-value immobilière) modélisée. Frais de revente (agence, PV) non déduits.</p>
  `;
}

function updateLiveDisplays() {
  const prix = val('prix');
  const notairePct = val('notaire-pct');
  const notaire = Math.round(prix * notairePct / 100);
  const agencePct = val('agence-pct');
  const agence = Math.round(prix * agencePct / 100);

  const elNotaire = document.getElementById('notaire-display');
  if (elNotaire) elNotaire.textContent = '≈ ' + fmtEUR(notaire);
  const elAgence = document.getElementById('agence-display');
  if (elAgence) elAgence.textContent = '≈ ' + fmtEUR(agence);
}

function snapshotRawInputs() {
  const ids = [
    'prix','notaire-pct','agence-pct','travaux','meubles','superficie','inflation-revente','cashflow-rate','horizon-rendement','chart-horizon',
    'loyer','vacance','vacance-unit','augmentation-loyer','inflation-charges',
    'charge-simple',
    'charge-copro','unit-copro','charge-pno','unit-pno','charge-compta','unit-compta',
    'charge-cga','unit-cga','charge-banque','unit-banque','charge-eau','unit-eau',
    'charge-elec','unit-elec','charge-gaz','unit-gaz','charge-internet','unit-internet',
    'charge-cfe','unit-cfe','charge-taxe-fonciere','unit-taxe-fonciere','charge-divers','unit-divers',
    'apport','duree-credit','taux-credit','taux-assurance','differe','differe-duree','frais-dossier','garantie',
  ];
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
  for (const [k, v] of Object.entries(params)) {
    const el = document.getElementById(k);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!v;
    else if (v != null) el.value = v;
  }
}

function run() {
  try {
    const inputs = getInputs();
    const result = computeRentabilite(inputs);
    lastInputs = inputs;
    lastResult = result;

    renderKPIs(result);
    renderChart(result.annees, inputs.cashflowRate);
    renderTable(result.annees, inputs.horizonGraph);
    buildModal(inputs, result);
    storage.save(SAVED_ID, snapshotRawInputs());
  } catch (e) {
    console.error('Run failed:', e);
  }
}

function init() {
  applyMode(getMode());

  const saved = storage.load(SAVED_ID);
  if (saved) restoreInputs(saved);

  // Mode toggle
  document.getElementById('mode-simple')?.addEventListener('click', () => { applyMode('simple'); run(); });
  document.getElementById('mode-advanced')?.addEventListener('click', () => { applyMode('advanced'); run(); });

  // Live displays
  document.getElementById('prix')?.addEventListener('input', updateLiveDisplays);
  document.getElementById('notaire-pct')?.addEventListener('input', updateLiveDisplays);
  document.getElementById('agence-pct')?.addEventListener('input', updateLiveDisplays);
  updateLiveDisplays();

  // Différé toggle
  const differeSelect = document.getElementById('differe');
  const differeDureeWrap = document.getElementById('differe-duree-wrap');
  differeSelect?.addEventListener('change', () => {
    differeDureeWrap?.classList.toggle('hidden', differeSelect.value === 'aucun');
    run();
  });
  differeDureeWrap?.classList.toggle('hidden', differeSelect?.value === 'aucun');

  // Auto-recalc on change
  const inputIds = [
    'prix','notaire-pct','agence-pct','travaux','meubles','superficie','inflation-revente','cashflow-rate','horizon-rendement','chart-horizon',
    'loyer','vacance','vacance-unit','augmentation-loyer','inflation-charges',
    'charge-simple',
    'charge-copro','charge-pno','charge-compta','charge-cga','charge-banque',
    'charge-eau','charge-elec','charge-gaz','charge-internet','charge-cfe',
    'charge-taxe-fonciere','charge-divers',
    'apport','duree-credit','taux-credit','taux-assurance','differe-duree','frais-dossier','garantie',
  ];
  inputIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', run);
  });

  // Unit selects also trigger recalc
  const unitIds = [
    'unit-copro','unit-pno','unit-compta','unit-cga','unit-banque','unit-eau','unit-elec',
    'unit-gaz','unit-internet','unit-cfe','unit-taxe-fonciere','unit-divers',
  ];
  unitIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', run);
  });

  setupModal({
    openBtnId: 'btn-detail',
    onOpen: () => { if (lastInputs && lastResult) buildModal(lastInputs, lastResult); },
  });
  setupTooltips();
  run();
}

init();
