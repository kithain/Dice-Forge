// Presentation only: the database keeps the complete expression and result detail.
export function compactRoll(row) {
  const match = String(row.expression || '').match(/^(.+) (\d+)% · /);
  if (!match) return null;
  const threshold = String(row.expression).match(/\((\d+)%\)$/);
  const automatic = !threshold && /Automatique|Impossible/.test(row.expression);
  // A zero-threshold automatic failure still has the original normal difficulty.
  const autoResult = String(row.rolls_detail || '').includes('[AUTO]');
  return {
    expression: `${match[1]} (${threshold ? threshold[1] : automatic || autoResult ? 'AUTO' : match[2]}${threshold || !(automatic || autoResult) ? ' %' : ''})`,
    total: automatic || autoResult ? '—' : String(row.total),
    marker: `${row.is_crit ? ' <!>' : ''} ${row.is_fail ? '✗' : '✓'}`
  };
}
