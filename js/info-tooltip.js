let activePopup = null;

function closeActive() {
  if (activePopup) {
    activePopup.remove();
    activePopup = null;
  }
}

export function setupTooltips(root = document) {
  root.querySelectorAll('button.info-tooltip[data-tooltip]').forEach(btn => {
    if (btn.dataset.wired === '1') return;
    btn.dataset.wired = '1';
    btn.setAttribute('aria-label', btn.getAttribute('aria-label') || 'Aide');
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const wasOpen = activePopup?.dataset.owner === btn.dataset.tooltip;
      closeActive();
      if (wasOpen) return;
      const popup = document.createElement('div');
      popup.className = 'info-tooltip-popup';
      popup.dataset.owner = btn.dataset.tooltip;
      popup.textContent = btn.dataset.tooltip;
      document.body.appendChild(popup);
      const rect = btn.getBoundingClientRect();
      popup.style.top = `${rect.bottom + window.scrollY + 6}px`;
      popup.style.left = `${Math.max(8, Math.min(rect.left + window.scrollX, window.innerWidth - 300))}px`;
      activePopup = popup;
    });
  });
  if (!document._tooltipGlobalWired) {
    document._tooltipGlobalWired = true;
    document.addEventListener('click', closeActive);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeActive(); });
  }
}
