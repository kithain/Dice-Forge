async function submitForm(form, submitter) {
    const data = new FormData(form);
    if (submitter?.name) data.append(submitter.name, submitter.value);
    const response = await fetch(submitter?.formAction || form.action, {
        method: submitter?.formMethod || form.method || 'POST',
        body: data,
    });
    const result = await response.json();
    if (!result.success && result.message) console.warn(result.message);
    if (result.success && form.id === 'add-participant-form') form.reset();
    if (form.classList.contains('import-card')) {
        const message = document.getElementById('markdown-message');
        message.textContent = result.success
            ? `${result.added} × ${result.name} ajouté au combat.`
            : (result.message || 'Import impossible.');
    }
    if (result.success && form.classList.contains('delete-encounter-form')) {
        form.closest('.encounter')?.remove();
    }
}

document.addEventListener('submit', event => {
    event.preventDefault();
    const confirmation = event.submitter?.dataset.confirm;
    if (confirmation && !window.confirm(confirmation)) return;
    submitForm(event.target, event.submitter).catch(console.error);
});

async function updateMainContent() {
    const response = await fetch('/api/main_content');
    document.getElementById('main-content-wrapper').innerHTML = await response.text();
    bindEditButtons();
}

function bindEditButtons() {
    document.querySelectorAll('.edit-button').forEach(button => {
        button.onclick = () => {
            const data = button.dataset;
            document.getElementById('edit-index').value = data.participantIndex;
            document.getElementById('edit-name').value = data.participantName;
            document.getElementById('edit-role').value = data.participantRole;
            document.getElementById('edit-dexterity').value = data.participantDexterity;
            document.getElementById('edit-hp').value = data.participantHp;
            document.getElementById('edit-hp-max').value = data.participantHpMax;
            document.getElementById('edit-portrait').value = data.participantPortrait;
            document.getElementById('editModal').style.display = 'block';
        };
    });
}

document.getElementById('cancelEdit').onclick = () => {
    document.getElementById('editModal').style.display = 'none';
};
document.getElementById('saveEdit').onclick = async () => {
    const index = document.getElementById('edit-index').value;
    const form = document.getElementById('editParticipantForm');
    const response = await fetch(`/participant/${index}/edit`, { method: 'POST', body: new FormData(form) });
    if ((await response.json()).success) document.getElementById('editModal').style.display = 'none';
};
window.onclick = event => {
    if (event.target.id === 'editModal') event.target.style.display = 'none';
};

function openPortraitSelector(target) {
    window.open(`/select_portrait?target=${target}`, 'portraitSelector', 'width=800,height=600,scrollbars=yes')?.focus();
}
window.openPortraitSelector = openPortraitSelector;
window.addEventListener('message', event => {
    if (event.data?.type === 'portrait-selected') {
        document.getElementById(event.data.target).value = event.data.portrait;
    }
});

function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    })[character]);
}

function roleOptions(selected) {
    return [
        ['player', 'PJ'], ['ally', 'Allié'], ['monster', 'Monstre'],
    ].map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
}

function renderImportIssues(data) {
    const container = document.getElementById('markdown-issues');
    const issues = Array.isArray(data.issues) ? data.issues : [];
    if (!data.ignored_count) {
        container.innerHTML = '';
        return;
    }
    const details = issues.map(issue => (
        `<li><strong>${escapeHtml(issue.source)}</strong> — ${escapeHtml(issue.message)}</li>`
    )).join('');
    container.innerHTML = `
        <details>
            <summary>${data.ignored_count} fiche(s) ignorée(s)</summary>
            <ul>${details}</ul>
        </details>`;
}

async function loadMarkdownEntries() {
    const query = document.getElementById('markdown-search').value;
    const type = document.getElementById('markdown-type').value;
    const message = document.getElementById('markdown-message');
    const results = document.getElementById('markdown-results');
    message.textContent = 'Recherche…';
    try {
        const response = await fetch(`/api/markdown_entries?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}`);
        const data = await response.json();
        if (!data.success) throw new Error(data.message || 'Lecture impossible.');
        message.textContent = `${data.entries.length} fiche(s) disponible(s).`;
        renderImportIssues(data);
        results.innerHTML = data.entries.map(entry => `
            <form method="post" class="import-card">
                <div>
                    <span class="import-name">${escapeHtml(entry.name)}</span>
                    <span class="import-meta"><span class="source-tag">${escapeHtml(entry.source_type)}</span>DEX ${entry.dexterity} · PV ${entry.hp_max}${entry.portrait_available ? ' · portrait' : ''}</span>
                </div>
                <input type="hidden" name="source" value="${escapeHtml(entry.source)}">
                <select name="role" aria-label="Ajouter comme">${roleOptions(entry.default_role)}</select>
                <input type="number" name="quantity" value="1" min="1" max="20" title="Quantité">
                <button type="submit" formaction="/import_markdown" class="btn btn-success compact">Ajouter</button>
            </form>
        `).join('');
    } catch (error) {
        message.textContent = error.message;
        document.getElementById('markdown-issues').innerHTML = '';
        results.innerHTML = '';
    }
}

let markdownSearchTimer;
document.getElementById('markdown-search').addEventListener('input', () => {
    clearTimeout(markdownSearchTimer);
    markdownSearchTimer = setTimeout(loadMarkdownEntries, 250);
});
document.getElementById('markdown-type').addEventListener('change', loadMarkdownEntries);
document.getElementById('markdown-refresh').addEventListener('click', loadMarkdownEntries);

bindEditButtons();
loadMarkdownEntries();
const socket = io();
socket.on('update_data', updateMainContent);
