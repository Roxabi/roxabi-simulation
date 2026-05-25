import { fmtEUR } from './format.js';

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
  const epargneLocAnnuelle = Math.max(0, depenseAchatAnnuelle - depenseLocAnnuelle);

  const annees = [];
  let patrimoineAchat = 0;
  let patrimoineLoc = d.apport + d.notaire + d.travaux; // argent non dépensé côté location

  for (let t = 0; t <= d.horizon; t++) {
    // Achat
    const valeurBien = (d.prix + d.travaux) * Math.pow(1 + d.plusValue, t);
    const crd = capitalRestantDu(capitalEmprunte, d.tauxCredit, d.dureeCredit, t);
    patrimoineAchat = valeurBien - crd;

    // Location + investissement
    if (t > 0) {
      patrimoineLoc = (patrimoineLoc + epargneLocAnnuelle) * (1 + d.rendement);
    }

    annees.push({
      annee: t,
      patrimoineAchat,
      patrimoineLoc,
      diff: patrimoineAchat - patrimoineLoc,
      meilleure: patrimoineAchat >= patrimoineLoc ? 'achat' : 'location',
      mensualite,
      depenseAchatAnnuelle,
      depenseLocAnnuelle,
      epargneLocAnnuelle,
      valeurBien,
      crd,
    });
  }

  return { annees, mensualite, depenseAchatAnnuelle, depenseLocAnnuelle, epargneLocAnnuelle };
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

function run() {
  try {
    const inputs = getInputs();
    const { annees, mensualite, depenseAchatAnnuelle, depenseLocAnnuelle, epargneLocAnnuelle } = computeScenarios(inputs);

    document.getElementById('result-section').classList.remove('hidden');
    renderChart(annees);
    renderTable(annees);
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
}

init();
