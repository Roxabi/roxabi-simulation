import { getInputs, setInputs, computeFiscal } from './fiscal.js';
import { renderResults, buildModal, setupToggle, setupModal } from './ui.js';
import { initTab, save, load, getAllSims } from './storage.js';

let hasCalculatedOnce = false;
const tabId = initTab();

function populateSelector() {
  const sel = document.getElementById('sim-selector');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Charger une simulation…</option>';
  const sims = getAllSims();
  for (const s of sims) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `#${s.id}`;
    if (s.id === tabId) opt.disabled = true;
    sel.appendChild(opt);
  }
  sel.value = current;
}

function updateSimLabel() {
  const label = document.getElementById('sim-label');
  if (label) label.textContent = `Simulation active : #${tabId}`;
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

updateSimLabel();
populateSelector();

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
