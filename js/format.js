export function fmtEUR(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

export function fmtPct(n) {
  return (n * 100).toFixed(1).replace('.', ',') + '%';
}
