import { fmtEUR, fmtPct } from './format.js';

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
  const depenseAchatAnnuelle = mensualite * 12 + d.entretien + d.taxe;
  const depenseLocAnnuelle = d.loyer * 12 + d.chargesLoc * 12;

  const annees = [];
  let potAchat = 0; // épargne secondaire côté acheteur
  let potLoc = d.apport + d.notaire + d.travaux; // capital initial côté locataire

  for (let t = 0; t <= d.horizon; t++) {
    // Achat — valeur nette du bien moins CRD
    const valeurBien = (d.prix + d.travaux) * Math.pow(1 + d.plusValue, t);
    const crd = capitalRestantDu(capitalEmprunte, d.tauxCredit, d.dureeCredit, t);
    const patrimoineAchat = (valeurBien - crd) + potAchat;

    // Location — pot de placement
    const patrimoineLoc = potLoc;

    annees.push({
      annee: t,
      patrimoineAchat,
      patrimoineLoc,
      diff: patrimoineAchat - patrimoineLoc,
      meilleure: patrimoineAchat >= patrimoineLoc ? 'achat' : 'location',
      mensualite,
      depenseAchatAnnuelle,
      depenseLocAnnuelle,
      valeurBien,
      crd,
      potAchat,
      potLoc,
    });

    if (t >= d.horizon) break; // pas de projection après la dernière année

    // Placement de la différence de cash-flow du côté qui économise
    const diffDepense = depenseAchatAnnuelle - depenseLocAnnuelle;
    if (diffDepense > 0) {
      // Locataire dépense moins → il place la différence
      potLoc = (potLoc + diffDepense) * (1 + d.rendement);
      potAchat = potAchat * (1 + d.rendement);
    } else if (diffDepense < 0) {
      // Acheteur dépense moins → il place la différence
      potAchat = (potAchat + Math.abs(diffDepense)) * (1 + d.rendement);
      potLoc = potLoc * (1 + d.rendement);
    } else {
      potLoc = potLoc * (1 + d.rendement);
      potAchat = potAchat * (1 + d.rendement);
    }
  }

  const epargneAnnuelle = Math.abs(depenseAchatAnnuelle - depenseLocAnnuelle);
  const gagnantEconomie = depenseAchatAnnuelle < depenseLocAnnuelle ? 'achat' : 'location';

  return { annees, capitalEmprunte, mensualite, depenseAchatAnnuelle, depenseLocAnnuelle, epargneAnnuelle, gagnantEconomie };
}

function renderChart(annees) {
  const ctx = document.getElementById('patrimoine-chart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  const labels = annees.map(a => 'A' + a.annee);
  const dataAchat = annees.map(a => Math.round(a.patrimoineAchat));
  const dataLoc = annees.map(a => Math.round(a.patrimoineLoc));

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
          label: 'Patrimoine achat',
          data: dataAchat,
          borderColor: accent,
          backgroundColor: accent + '20',
          fill: false,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5,
        },
        {
          label: 'Patrimoine location + placement',
          data: dataLoc,
          borderColor: cyan,
          backgroundColor: cyan + '20',
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

    <h4 style="margin:16px 0 8px; color:var(--accent);">Patrimoine achat</h4>
    <div class="detail-step">
      <div class="expr">Valeur du bien à l'année t = (Prix + Travaux) × (1 + plus-value)^t</div>
      <div class="res">${fmtEUR(d.prix + d.travaux)} × (1 + ${fmtPct(d.plusValue)})^t</div>
    </div>
    <div class="detail-step">
      <div class="expr">Capital restant dû (CRD) à l'année t — remboursé à la revente</div>
      <div class="res">Formule d'amortissement</div>
    </div>
    <div class="detail-step">
      <div class="expr">Patrimoine net achat = (Valeur du bien - CRD) + épargne placée</div>
      <div class="res">Si l'acheteur dépense moins que le locataire, la différence est placée au rendement ${fmtPct(d.rendement)}.</div>
    </div>

    <h4 style="margin:16px 0 8px; color:var(--accent);">Patrimoine location + placement</h4>
    <div class="detail-step">
      <div class="expr">Capital initial placé = Apport + Notaire + Travaux</div>
      <div class="res">${fmtEUR(d.apport)} + ${fmtEUR(d.notaire)} + ${fmtEUR(d.travaux)} = ${fmtEUR(d.apport + d.notaire + d.travaux)}</div>
    </div>
    <div class="detail-step">
      <div class="expr">Chaque année : on ajoute l'économie au pot du côté gagnant, puis on capitalise</div>
      <div class="res">Pot(t) = (Pot(t-1) + économie annuelle) × (1 + ${fmtPct(d.rendement)})</div>
    </div>
    <p class="muted">Calcul théorique avant fiscalité et inflation. Le crédit et le placement sont supposés constants. La différence de cash-flow est placée du côté qui dépense le moins.</p>
  `;
}

function setupModal() {
  const modal = document.getElementById('modal');
  document.getElementById('btn-detail')?.addEventListener('click', () => {
    if (lastInputs && lastResult) buildModal(lastInputs, lastResult);
    modal.classList.add('open');
  });
  document.getElementById('modal-close')?.addEventListener('click', () => modal.classList.remove('open'));
  modal?.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
}

function run() {
  try {
    const inputs = getInputs();
    const result = computeScenarios(inputs);
    lastInputs = inputs;
    lastResult = result;

    document.getElementById('result-section').classList.remove('hidden');
    renderChart(result.annees);
    renderTable(result.annees);
    buildModal(inputs, result);
  } catch (e) {
    console.error('Run failed:', e);
  }
}

function init() {
  document.getElementById('btn-calc').addEventListener('click', run);

  // Live update notaire display when prix or pct changes
  document.getElementById('prix')?.addEventListener('input', updateNotaireDisplay);
  document.getElementById('notaire-pct')?.addEventListener('input', updateNotaireDisplay);
  updateNotaireDisplay();

  // Auto-recalc on change
  const inputIds = ['prix','notaire-pct','apport','taux-credit','duree-credit','travaux','entretien','taxe','plus-value','loyer','charges-loc','rendement','horizon'];
  inputIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      if (!document.getElementById('result-section').classList.contains('hidden')) {
        run();
      }
    });
  });

  setupModal();
}

init();
