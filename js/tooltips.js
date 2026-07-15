let tooltip;
let activeTarget;

function ensureTooltip() {
  if (tooltip) return tooltip;
  tooltip = document.createElement('div');
  tooltip.id = 'dice-forge-tooltip';
  tooltip.className = 'app-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.appendChild(tooltip);
  return tooltip;
}

function positionTooltip(target) {
  const tip = ensureTooltip();
  const rect = target.getBoundingClientRect();
  const gap = 10;
  const margin = 10;
  const tipRect = tip.getBoundingClientRect();
  let left = rect.left + (rect.width - tipRect.width) / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));
  let top = rect.top - tipRect.height - gap;
  if (top < margin) top = rect.bottom + gap;
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

function showTooltip(target) {
  const text = target?.dataset.tooltip?.trim();
  if (!text) return;
  const tip = ensureTooltip();
  activeTarget = target;
  tip.textContent = text;
  tip.hidden = false;
  target.setAttribute('aria-describedby', tip.id);
  positionTooltip(target);
}

function hideTooltip(target = activeTarget) {
  if (!activeTarget || (target && target !== activeTarget)) return;
  activeTarget.removeAttribute('aria-describedby');
  activeTarget = null;
  if (tooltip) tooltip.hidden = true;
}

document.addEventListener('pointerover', event => {
  const target = event.target.closest?.('[data-tooltip]');
  if (!target || target.contains(event.relatedTarget)) return;
  showTooltip(target);
});

document.addEventListener('pointerout', event => {
  const target = event.target.closest?.('[data-tooltip]');
  if (!target || target.contains(event.relatedTarget)) return;
  hideTooltip(target);
});

document.addEventListener('focusin', event => {
  const target = event.target.closest?.('[data-tooltip]');
  if (target) showTooltip(target);
});

document.addEventListener('focusout', event => {
  const target = event.target.closest?.('[data-tooltip]');
  if (target && !target.contains(event.relatedTarget)) hideTooltip(target);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') hideTooltip();
});

window.addEventListener('scroll', () => hideTooltip(), true);
window.addEventListener('resize', () => hideTooltip());
