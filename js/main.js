import { loadData } from './data.js';
import { getInputs, setInputs, computeFiscal } from './fiscal.js';
import { renderResults, buildModal, setupToggle } from './ui.js';
import { createStorage } from './storage.js';
import { setupModal } from './modal.js';
import { setupTooltips } from './info-tooltip.js';

const storage = createStorage('tmi', 1);

let hasCalculatedOnce = false;
const tabId = storage.initTab();

function simLabel(s) {
  return s.name ? `${s.name} (#${s.id})` : `#${s.id}`;
}

function populateSelector() {
  const sel = document.getElementById('sim-selector');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Charger une simulation…</option>';
  const sims = storage.getAllSims();
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
  const sims = storage.getAllSims();
  const current = sims.find(s => s.id === tabId);
  const input = document.getElementById('sim-name');
  if (input) input.value = current?.name || '';
}

async function run() {
  try {
    const inputs = getInputs();
    const result = computeFiscal(inputs);
    renderResults(result);
    buildModal(inputs, result);
    storage.save(tabId, inputs);
    hasCalculatedOnce = true;
    populateSelector();
  } catch (e) {
    console.error('Run failed:', e);
  }
}

async function init() {
  await loadData();

  const saved = storage.load(tabId);
  if (saved) {
    setInputs(saved);
    await run();
  }

  populateSelector();
  updateSimName();

  setupToggle();
  setupModal({ openBtnId: 'btn-detail' });
  setupTooltips();

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
    storage.rename(tabId, e.target.value.trim());
    populateSelector();
  });

  document.getElementById('btn-delete-sim')?.addEventListener('click', () => {
    if (!confirm('Supprimer cette simulation ?')) return;
    storage.remove(tabId);
    const remaining = storage.getAllSims();
    if (remaining.length > 0) {
      history.replaceState(null, '', '#' + remaining[0].id);
    } else {
      history.replaceState(null, '', '#');
    }
    window.location.reload();
  });
}

init();
