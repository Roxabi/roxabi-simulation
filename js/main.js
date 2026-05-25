import { getInputs, computeFiscal } from './fiscal.js';
import { renderResults, buildModal, setupToggle, setupModal } from './ui.js';

let hasCalculatedOnce = false;

function run() {
  const inputs = getInputs();
  const result = computeFiscal(inputs);
  renderResults(result);
  buildModal(inputs, result);
  hasCalculatedOnce = true;
}

setupToggle();
setupModal();

document.getElementById('btn-calc').addEventListener('click', () => {
  hasCalculatedOnce = true;
  run();
});

const inputs = document.querySelectorAll('#annee, #parts, #salaire, #micro-ca, #micro-type, #div-brut, #div-mode');
inputs.forEach(el => {
  el.addEventListener('input', () => { if (hasCalculatedOnce) run(); });
  el.addEventListener('change', () => { if (hasCalculatedOnce) run(); });
});
