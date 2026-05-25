import { getInputs, setInputs, computeFiscal } from './fiscal.js';
import { renderResults, buildModal, setupToggle, setupModal } from './ui.js';
import { initTab, save, load, remove, rename, getAllSims } from './storage.js';

let hasCalculatedOnce = false;
const tabId = initTab();

function simLabel(s) {
  return s.name ? `${s.name} (#${s.id})` : `#${s.id}`;
}

function populateSelector() {
  const sel = document.getElementById('sim-selector');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Charger une simulation…</option>';
  const sims = getAllSims();
  for (const s of sims) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = simLabel(s);
    if (s.id === tabId) opt.disabled = true;
    sel.appendChild(opt);
  }
  sel.value = current;
}

function updateSimName() {
  const sims = getAllSims();
  const current = sims.find(s => s.id === tabId);
  const input = document.getElementById('sim-name');
  if (input) input.value = current?.name || '';
}

function run() {
  const inputs = getInputs();
  const result = computeFiscal(inputs);
  renderResults(result);
  buildModal(inputs, result);
  save(tabId, inputs);
  hasCalculatedOnce = true;
  populateSelector();
}

// Restore saved data on load
const saved = load(tabId);
if (saved) {
  setInputs(saved);
  run();
}

populateSelector();
updateSimName();

setupToggle();
setupModal();

document.getElementById('btn-calc').addEventListener('click', () => {
  hasCalculatedOnce = true;
  run();
});

const inputEls = document.querySelectorAll('#annee, #parts, #salaire, #micro-ca, #micro-type, #div-brut, #div-mode');
inputEls.forEach(el => {
  el.addEventListener('input', () => { if (hasCalculatedOnce) run(); });
  el.addEventListener('change', () => { if (hasCalculatedOnce) run(); });
});

document.getElementById('sim-selector')?.addEventListener('change', (e) => {
  if (e.target.value) {
    history.replaceState(null, '', '#' + e.target.value);
    window.location.reload();
  }
});

document.getElementById('btn-new-sim')?.addEventListener('click', () => {
  history.replaceState(null, '', '#');
  window.location.reload();
});

document.getElementById('sim-name')?.addEventListener('change', (e) => {
  rename(tabId, e.target.value.trim());
  populateSelector();
});

document.getElementById('btn-delete-sim')?.addEventListener('click', () => {
  if (!confirm('Supprimer cette simulation ?')) return;
  remove(tabId);
  const remaining = getAllSims();
  if (remaining.length > 0) {
    history.replaceState(null, '', '#' + remaining[0].id);
  } else {
    history.replaceState(null, '', '#');
  }
  window.location.reload();
});
