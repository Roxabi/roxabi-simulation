// Shared modal wiring: open/close/backdrop-click/Escape.
// Usage:
//   setupModal({ openBtnId: 'btn-detail', onOpen: () => buildModalContent() });
//
export function setupModal({ modalId = 'modal', openBtnId, closeBtnId = 'modal-close', onOpen } = {}) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  const openBtn = openBtnId ? document.getElementById(openBtnId) : null;
  const closeBtn = closeBtnId ? document.getElementById(closeBtnId) : null;
  const close = () => modal.classList.remove('open');
  openBtn?.addEventListener('click', () => {
    if (onOpen) onOpen();
    modal.classList.add('open');
  });
  closeBtn?.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}
