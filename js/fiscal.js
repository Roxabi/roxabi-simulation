import { BAREMES, ABATTEMENT_MICRO } from './data.js';
import { fmtEUR, fmtPct } from './format.js';

export function getInputs() {
  return {
    annee: document.getElementById('annee').value,
    parts: parseFloat(document.getElementById('parts').value) || 1,
    salaire: parseFloat(document.getElementById('salaire').value) || 0,
    microCa: parseFloat(document.getElementById('micro-ca').value) || 0,
    microType: document.getElementById('micro-type').value,
    divBrut: parseFloat(document.getElementById('div-brut').value) || 0,
    divMode: document.getElementById('div-mode').value,
  };
}

export function setInputs(data) {
  if (!data) return;
  document.getElementById('annee').value = data.annee || '2026';
  document.getElementById('parts').value = data.parts ?? 1;
  document.getElementById('salaire').value = data.salaire ?? '';
  document.getElementById('micro-ca').value = data.microCa ?? '';
  document.getElementById('micro-type').value = data.microType || 'vente';
  document.getElementById('div-brut').value = data.divBrut ?? '';
  document.getElementById('div-mode').value = data.divMode || 'reel';
}

export function calcImpotsParTranche(qf, tranches) {
  let reste = qf;
  let precedent = 0;
  const lignes = [];
  for (const tr of tranches) {
    const plafond = tr.max;
    const taux = tr.taux;
    const base = Math.min(Math.max(reste, 0), plafond - precedent);
    const montant = base * taux;
    lignes.push({
      label: taux === 0 ? `Jusqu'à ${fmtEUR(plafond)}` : `${fmtEUR(precedent + 1)} – ${plafond === Infinity ? 'au-delà' : fmtEUR(plafond)}`,
      base,
      taux,
      montant,
      active: base > 0,
    });
    reste -= base;
    precedent = plafond;
    if (reste <= 0) break;
  }
  return lignes;
}

export function computeFiscal(d) {
  const tranches = BAREMES[d.annee] || BAREMES[2026];

  const abattement = ABATTEMENT_MICRO[d.microType] || 0;
  const microImposable = d.microCa * (1 - abattement);

  let divImposable = 0;
  let divDetail = '';
  if (d.divMode === 'reel') {
    divImposable = d.divBrut * (1 - 0.40);
    divDetail = `${fmtEUR(d.divBrut)} × 60% = ${fmtEUR(divImposable)} (intégration barème)`;
  } else {
    divDetail = `${fmtEUR(d.divBrut)} imposés via PFU 30% — exclus du barème IR`;
  }

  const revenuImposable = d.salaire + microImposable + divImposable;
  const qf = Math.max(revenuImposable / d.parts, 0);

  const lignes = calcImpotsParTranche(qf, tranches);
  const impotParPart = lignes.reduce((s, l) => s + l.montant, 0);
  const impotTotal = impotParPart * d.parts;
  const tauxMoyen = revenuImposable > 0 ? impotTotal / revenuImposable : 0;

  const activeTranches = lignes.filter(l => l.active && l.taux > 0);
  const tmi = activeTranches.length ? activeTranches[activeTranches.length - 1].taux : 0;

  return {
    tranches,
    microImposable,
    divImposable,
    divDetail,
    revenuImposable,
    qf,
    lignes,
    impotParPart,
    impotTotal,
    tauxMoyen,
    tmi,
  };
}
