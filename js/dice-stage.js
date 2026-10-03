// Shared result card for the dice launcher and character progression.
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function totalResultHtml({label,value,critical=false,messageHtml='',detailsHtml=''}) {
 return `<div class="total-box">
      <div class="total-lbl">${escapeHtml(label)}</div>
      <div class="total-num${critical ? ' crit-style' : ''}">${escapeHtml(value)}</div>
      ${messageHtml}${detailsHtml}
    </div>`;
}
