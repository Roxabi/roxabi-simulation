import { fmtEUR, fmtPct } from './format.js';
import { setupModal } from './modal.js';
import { setupTooltips } from './info-tooltip.js';
import { createStorage } from './storage.js';

const storage = createStorage('renta', 1);
const SAVED_ID = 'current';
let chartInstance = null;
let lastInputs = null;
let lastResult = null;

const SYNTHESE_ANNEES = [2, 5, 15, 20];
const HORIZON = 20;

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

  // Charges : parser chaque poste avec son unité
  const chargeIds = ['copro','pno','compta','cga','banque','eau','elec','gaz','internet','cfe','taxe-fonciere','divers'];
  const charges = {};
  for (const id of chargeIds) {
    const raw = val(`charge-${id}`);
    const unit = document.getElementById(`unit-${id}`)?.value || 'mois';
    charges[id] = unit === 'an' ? raw : raw * 12;
  }
  const chargesAnnuelles = Object.values(charges).reduce((a, b) => a + b, 0);

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

  // Revente + investisseur
  const inflationRevente = val('inflation-revente') / 100;
  const cashflowRate = val('cashflow-rate') / 100;

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
    inflationRevente,
    cashflowRate,
  };
}

// Future value of a cashflow stream at year T, compounded at `rate`.
function computeFV(cashflows, rate, T) {
  let sum = 0;
  for (let s = 0; s < cashflows.length; s++) {
    sum += cashflows[s] * Math.pow(1 + rate, T - s);
  }
  return sum;
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

function computeMensualite(K, tauxAnnuel, dureeMois) {
  if (K <= 0 || tauxAnnuel <= 0 || dureeMois <= 0) return 0;
  const i = tauxAnnuel / 12;
  const n = dureeMois;
  return (K * i) / (1 - Math.pow(1 + i, -n));
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
        // Intérêts capitalisés
        const interetMois = K * i;
        totalInterets += interetMois;
        K += interetMois;
        mensualite = 0;
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
        mensualite = computeMensualite(K, d.tauxCredit, remainingMois) + assuranceMois;
      } else if (dDiff === 0 && m === 1) {
        mensualite = computeMensualite(K, d.tauxCredit, n) + assuranceMois;
      }
      const interetMois = K * i;
      const amortissement = mensualite - interetMois - assuranceMois;
      totalInterets += interetMois;
      K = Math.max(0, K - amortissement);
    }

    moisData.push({ mensualite, assuranceMois, capital: K });
  }

  const coutTotalPret = K0 + totalInterets + totalAssurance + d.fraisDossier + d.garantie;

  // Projection annuelle + TRI mono-projet
  // baseCF[0] = -apport (cash out au signing) ; baseCF[s≥1] = cashflow net annuel de l'année [s-1, s)
  const baseCF = [-d.apport];
  const annees = [];
  for (let t = 0; t <= HORIZON; t++) {
    const loyerMensuel = d.loyer * Math.pow(1 + d.augmentationLoyer, t);
    const loyerAnnuel = loyerMensuel * 12;
    const loyerEffectifAnnuel = loyerAnnuel * (1 - d.vacancePct);

    const chargesAnnuelles = d.chargesAnnuelles; // simplifié : pas d'inflation charges pour l'instant
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
    const montantRecupere = computeFV(saleStream, d.cashflowRate, t);
    const rendementAnnualise = computeIRR(saleStream);

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
      revente,
      rentabiliteBrute,
      rentabiliteNette,
      crd,
      cashFromSale,
      montantRecupere,
      rendementAnnualise,
    });

    // Append cashflow année [t, t+1) au stream pour les itérations suivantes
    if (t < HORIZON) baseCF.push(cashFlowAnnuel);
  }

  return {
    totalAcquisition,
    montantEmprunte: K0,
    mensualite: moisData[0]?.mensualite || 0,
    totalInterets,
    totalAssurance,
    coutTotalPret,
    rentabiliteBrute: annees[0].rentabiliteBrute,
    rentabiliteNette: annees[0].rentabiliteNette,
    cashFlowMensuel: annees[0].cashFlowMensuel,
    annees,
    differe: d.differe,
    differeDuree: d.differeDuree,
    moisData,
  };
}

function renderKPIs(res) {
  document.getElementById('kpi-renta-brute').textContent = fmtPct(res.rentabiliteBrute / 100);
  document.getElementById('kpi-renta-nette').textContent = fmtPct(res.rentabiliteNette / 100);
  document.getElementById('kpi-mensualite').textContent = fmtEUR(res.mensualite);
  document.getElementById('kpi-cashflow').textContent = fmtEUR(res.cashFlowMensuel);

  const cfEl = document.getElementById('kpi-cashflow');
  cfEl.classList.toggle('positive', res.cashFlowMensuel >= 0);
  cfEl.classList.toggle('negative', res.cashFlowMensuel < 0);

  document.getElementById('kpi-emprunt').textContent = fmtEUR(res.montantEmprunte);
  document.getElementById('kpi-cout-pret').textContent = fmtEUR(res.coutTotalPret);
}

function renderChart(annees) {
  const ctx = document.getElementById('renta-chart')?.getContext('2d');
  if (!ctx) return;
  if (chartInstance) chartInstance.destroy();

  const labels = annees.map(a => 'A' + a.annee);
  const dataMontant = annees.map(a => Math.round(a.montantRecupere));
  const dataRendement = annees.map(a => Number.isFinite(a.rendementAnnualise) ? a.rendementAnnualise : null);

  const rootStyle = getComputedStyle(document.documentElement);
  const accent = rootStyle.getPropertyValue('--accent').trim() || '#f0b429';
  const cyan = rootStyle.getPropertyValue('--cyan').trim() || '#22d3ee';
  const textMuted = rootStyle.getPropertyValue('--text-muted').trim() || '#9ca3af';
  const border = rootStyle.getPropertyValue('--border').trim() || '#21262d';

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Montant récupéré cumulé (€)',
          data: dataMontant,
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
            label: ctx => {
              const v = ctx.parsed.y;
              if (v == null) return `${ctx.dataset.label}: —`;
              return ctx.dataset.yAxisID === 'yPercent'
                ? `${ctx.dataset.label}: ${fmtPct(v)}`
                : `${ctx.dataset.label}: ${fmtEUR(v)}`;
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
          ticks: { color: accent, callback: v => fmtEUR(v) },
          title: { display: true, text: 'Montant récupéré (€)', color: accent },
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
}

function renderTable(annees) {
  const tbody = document.querySelector('#synthese-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  for (const target of SYNTHESE_ANNEES) {
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

function buildModal(d, res) {
  const { totalAcquisition, montantEmprunte, mensualite, totalInterets, totalAssurance, coutTotalPret, rentabiliteBrute, rentabiliteNette, cashFlowMensuel } = res;
  const loyerAnnuel = d.loyer * 12 * (1 - d.vacancePct);
  const chargesMensuelles = d.chargesAnnuelles / 12;

  const differeLabel = {
    aucun: 'Aucun',
    partiel: 'Partiel (intérêts seuls)',
    total: 'Total (0 € + capitalisation)',
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
      <div class="expr">Loyer mensuel × 12 × (1 − vacance)</div>
      <div class="res">${fmtEUR(d.loyer)} × 12 × (1 − ${fmtPct(d.vacancePct)}) = ${fmtEUR(loyerAnnuel)} / an</div>
    </div>
    <div class="detail-step">
      <div class="expr">Augmentation annuelle du loyer</div>
      <div class="res">${fmtPct(d.augmentationLoyer)}</div>
    </div>

    <h4 style="margin:16px 0 8px; color:var(--accent);">Charges annuelles</h4>
    <div class="detail-step">
      <div class="expr">Total des charges (converties en annuel)</div>
      <div class="res">${fmtEUR(d.chargesAnnuelles)} / an</div>
    </div>

    <h4 style="margin:16px 0 8px; color:var(--accent);">Crédit</h4>
    <div class="detail-step">
      <div class="expr">Mensualité (amortissement + assurance)</div>
      <div class="res">${fmtEUR(mensualite)} / mois</div>
    </div>
    <div class="detail-step">
      <div class="expr">Différé</div>
      <div class="res">${differeLabel} — ${d.differe !== 'aucun' ? d.differeDuree + ' mois' : '—'}</div>
    </div>
    <div class="detail-step">
      <div class="expr">Coût total du prêt</div>
      <div class="res">${fmtEUR(montantEmprunte)} + ${fmtEUR(totalInterets)} (intérêts) + ${fmtEUR(totalAssurance)} (assurance) + ${fmtEUR(d.fraisDossier)} (dossier) + ${fmtEUR(d.garantie)} (garantie) = ${fmtEUR(coutTotalPret)}</div>
    </div>

    <h4 style="margin:16px 0 8px; color:var(--accent);">Rentabilité</h4>
    <div class="detail-step">
      <div class="expr">Rentabilité brute = Loyers annuels / Total acquisition</div>
      <div class="res">${fmtEUR(loyerAnnuel)} / ${fmtEUR(totalAcquisition)} = ${fmtPct(rentabiliteBrute / 100)}</div>
    </div>
    <div class="detail-step">
      <div class="expr">Rentabilité nette = (Loyers − Charges) / Total acquisition</div>
      <div class="res">(${fmtEUR(loyerAnnuel)} − ${fmtEUR(d.chargesAnnuelles)}) / ${fmtEUR(totalAcquisition)} = ${fmtPct(rentabiliteNette / 100)}</div>
    </div>

    <h4 style="margin:16px 0 8px; color:var(--accent);">Cash-flow</h4>
    <div class="detail-step">
      <div class="expr">Cash-flow mensuel = Loyer − Charges − Mensualité</div>
      <div class="res">${fmtEUR(d.loyer * (1 - d.vacancePct))} − ${fmtEUR(chargesMensuelles)} − ${fmtEUR(mensualite)} = ${fmtEUR(cashFlowMensuel)}</div>
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
      <div class="res">${fmtEUR(d.apport)} (les frais notaire/dossier/agence sont financés via le crédit dans ce modèle ou sunk costs — seul l'apport est récupérable).</div>
    </div>
    <div class="detail-step">
      <div class="expr">Stream de cashflows mono-projet pour une revente à l'année T</div>
      <div class="res">[−apport, CF(0→1), CF(1→2), …, CF(T−1→T) + cashVente(T)]<br>où CF(s→s+1) = loyer effectif − charges − mensualités (somme exacte des 12 mois, inclut la transition fin de crédit).</div>
    </div>
    <div class="detail-step">
      <div class="expr">Montant récupéré cumulé(T) = FV du stream à l'année T au taux ${fmtPct(d.cashflowRate)}</div>
      <div class="res">Σ CF(s) × (1 + ${fmtPct(d.cashflowRate)})^(T−s) — les cashflows positifs sont composés à ce taux (réinvestissement supposé), les négatifs reflètent un coût d'opportunité.</div>
    </div>
    <div class="detail-step">
      <div class="expr">Rendement annualisé(T) = TRI/IRR résolu sur le stream (NPV = 0)</div>
      <div class="res">Le TRI est indépendant du taux de capitalisation : c'est le rendement intrinsèque du projet locatif.</div>
    </div>

    <p class="muted">Calcul théorique mono-projet. Pas de fiscalité (revenus locatifs / plus-value immobilière) modélisée. Pas d'inflation sur les charges. Frais de revente (agence, PV) non déduits.</p>
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
    'prix','notaire-pct','agence-pct','travaux','meubles','superficie','inflation-revente','cashflow-rate',
    'loyer','vacance','vacance-unit','augmentation-loyer',
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
    'prix','notaire-pct','agence-pct','travaux','meubles','superficie','inflation-revente','cashflow-rate',
    'loyer','vacance','vacance-unit','augmentation-loyer',
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
