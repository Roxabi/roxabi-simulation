import { fmtEUR, fmtPct } from './format.js';
import { ABATTEMENT_MICRO } from './data.js';

export function renderResults(result) {
  document.getElementById('res-revenu-imposable').textContent = fmtEUR(result.revenuImposable);
  document.getElementById('res-quotient').textContent = fmtEUR(result.qf);
  document.getElementById('res-impot').textContent = fmtEUR(result.impotTotal);
  document.getElementById('res-taux-moyen').textContent = fmtPct(result.tauxMoyen);
  document.getElementById('res-tmi').textContent = fmtPct(result.tmi);
  document.getElementById('res-tmi-inline').textContent = 'TMI : ' + fmtPct(result.tmi);

  document.getElementById('result-block').classList.remove('hidden');
  document.getElementById('compare-placeholder').style.opacity = '1';
  document.getElementById('compare-placeholder').style.pointerEvents = 'auto';
  document.getElementById('auto-hint').textContent = 'Auto-recalc activé.';
}

export function buildModal(d, result) {
  const rows = result.lignes.map(l => `
    <tr style="${l.active ? '' : 'opacity:0.5'}">
      <td>${l.label}</td>
      <td>${l.base > 0 ? fmtEUR(l.base) : '—'}</td>
      <td>${fmtPct(l.taux)}</td>
      <td>${l.montant > 0 ? fmtEUR(l.montant) : '—'}</td>
    </tr>
  `).join('');

  document.getElementById('modal-content').innerHTML = `
    <div class="detail-step">
      <div class="expr">Salaires nets imposables</div>
      <div class="res">${fmtEUR(d.salaire)}</div>
    </div>
    <div class="detail-step">
      <div class="expr">Micro-entreprise — CA ${fmtEUR(d.microCa)} × ${fmtPct(1 - (ABATTEMENT_MICRO[d.microType] || 0))} imposable</div>
      <div class="res">${fmtEUR(result.microImposable)}</div>
    </div>
    <div class="detail-step">
      <div class="expr">Dividendes — ${result.divDetail}</div>
      <div class="res">${d.divMode === 'reel' ? fmtEUR(result.divImposable) : 'Non intégrés au barème'}</div>
    </div>
    <div class="detail-step">
      <div class="expr">Revenu imposable total / parts = QF</div>
      <div class="res">${fmtEUR(result.revenuImposable)} / ${d.parts} = ${fmtEUR(result.qf)}</div>
    </div>

    <h4 style="margin:16px 0 6px; color:var(--accent);">Barème IR ${d.annee}</h4>
    <table>
      <thead><tr><th>Tranche</th><th>Base taxable</th><th>Taux</th><th>Impôt généré</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="detail-step" style="margin-top:12px;">
      <div class="expr">Impôt par part × nombre de parts</div>
      <div class="res">${fmtEUR(result.impotParPart)} × ${d.parts} = ${fmtEUR(result.impotTotal)}</div>
    </div>
    <div class="detail-step">
      <div class="expr">TMI (dernière tranche active)</div>
      <div class="res">${fmtPct(result.tmi)}</div>
    </div>
    <div class="detail-step">
      <div class="expr">Taux moyen d'imposition</div>
      <div class="res">${fmtPct(result.tauxMoyen)}</div>
    </div>
    <p class="muted">Calcul théorique avant décote et réductions éventuelles.</p>
  `;
}

export function setupToggle() {
  document.getElementById('main-toggle').addEventListener('click', () => {
    document.getElementById('main-block').classList.toggle('collapsed');
  });
}

export function setupModal() {
  const modal = document.getElementById('modal');
  document.getElementById('btn-detail').addEventListener('click', () => modal.classList.add('open'));
  document.getElementById('modal-close').addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
}
