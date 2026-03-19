const TASK_PATTERN = /\b\d{2}-\d{2}-\d{2}-\d{3}-\d{3}\b/g;
const TASK_KEY_PATTERN = /\b\d{2}-\d{2}-\d{2}-\d{3}-\d{3}\b/;

const viewerState = {
  taskIndex: null,
  taskIndexLoaded: false,
  taskIndexPromise: null,
  historyStack: [],
  current: null
};

async function ensureTaskIndexLoaded() {
  if (viewerState.taskIndexLoaded) return viewerState.taskIndex;
  if (!viewerState.taskIndexPromise) {
    viewerState.taskIndexPromise = fetch('task_index.json', { cache: 'no-store' })
      .then(resp => {
        if (!resp.ok) throw new Error(`Failed to load task index (${resp.status})`);
        return resp.json();
      })
      .then(data => {
        viewerState.taskIndex = data?.tasks || {};
        viewerState.taskIndexLoaded = true;
        return viewerState.taskIndex;
      })
      .catch(err => {
        console.warn(err);
        viewerState.taskIndex = {};
        viewerState.taskIndexLoaded = true;
        return viewerState.taskIndex;
      });
  }
  return viewerState.taskIndexPromise;
}

function normalizeTaskKey(text = '') {
  const match = text.match(TASK_KEY_PATTERN);
  return match ? match[0] : null;
}

function resolveTaskPdfUrl(taskEntry) {
  if (!taskEntry?.file) return null;

  const normalized = taskEntry.file.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  if (/^https?:\/\//i.test(normalized)) return normalized;

  const parts = normalized.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  const folder = parts[0].toLowerCase();
  const fileName = parts[parts.length - 1];
  return `https://crj200rvc.github.io/crj200-manual-files/${folder}/${fileName}`;
}

function buildPdfUrlWithLocation(baseUrl, page = 0, taskKey = '') {
  const safePage = Number.isFinite(Number(page)) ? Math.max(1, Number(page) + 1) : 1;
  const searchParam = encodeURIComponent(`TASK ${taskKey}`);
  return `${baseUrl}#page=${safePage}&search=${searchParam}`;
}

function collectTaskReferences(taskEntry, sourceTaskKey) {
  if (!taskEntry) return [];
  const sourceText = `${taskEntry.title || ''}`;
  const found = new Set();

  for (const match of sourceText.matchAll(TASK_PATTERN)) {
    if (match[0] !== sourceTaskKey) found.add(match[0]);
  }

  return Array.from(found);
}

function createReferenceListHTML(referenceTasks) {
  if (!referenceTasks.length) {
    return `<div id="task-references" class="task-references empty">No task references found for this document.</div>`;
  }

  const items = referenceTasks
    .map(task => `<li><button type="button" class="task-ref-link" data-task="${task}">(Ref. TASK ${task})</button></li>`)
    .join('');

  return `
    <div id="task-references" class="task-references">
      <h3>Task References</h3>
      <ul>${items}</ul>
    </div>
  `;
}

function updateUrlForDoc(docLi) {
  if (!docLi?.dataset?.key) return;
  const url = new URL(window.location);
  url.searchParams.set('doc', docLi.dataset.key);
  window.history.replaceState({}, '', url);
}

function wireReferenceClickHandlers(contextState) {
  const refContainer = document.getElementById('task-references');
  if (!refContainer) return;

  refContainer.querySelectorAll('.task-ref-link').forEach(btn => {
    btn.addEventListener('click', async e => {
      const taskKey = e.currentTarget.dataset.task;
      await openTaskReference(taskKey, contextState);
    });
  });
}

function wireBackButton() {
  const backBtn = document.getElementById('pdf-back-btn');
  if (!backBtn) return;

  backBtn.addEventListener('click', () => {
    const previous = viewerState.historyStack.pop();
    if (!previous) return;

    openPDF(previous.file, previous.title, previous.docLi || null, {
      sourceTaskKey: previous.sourceTaskKey,
      explicitTaskKey: previous.explicitTaskKey,
      skipHistoryPush: true,
      page: previous.page,
      fromReference: previous.fromReference
    });
  });
}

async function openTaskReference(taskKey, sourceContext) {
  await ensureTaskIndexLoaded();

  const targetEntry = viewerState.taskIndex?.[taskKey];
  if (!targetEntry) {
    alert(`Task reference ${taskKey} was not found in task_index.json.`);
    return;
  }

  const targetUrl = resolveTaskPdfUrl(targetEntry);
  if (!targetUrl) {
    alert(`Could not resolve PDF URL for task ${taskKey}.`);
    return;
  }

  const sourceState = {
    file: sourceContext.file,
    title: sourceContext.title,
    docLi: sourceContext.docLi || null,
    sourceTaskKey: sourceContext.sourceTaskKey || null,
    explicitTaskKey: sourceContext.explicitTaskKey || null,
    page: sourceContext.page ?? null,
    fromReference: sourceContext.fromReference || false
  };
  viewerState.historyStack.push(sourceState);

  const page = targetEntry.page || 0;
  const targetFileWithPage = buildPdfUrlWithLocation(targetUrl, page, taskKey);
  openPDF(targetFileWithPage, `TASK ${taskKey}`, null, {
    explicitTaskKey: taskKey,
    sourceTaskKey: sourceContext.sourceTaskKey || null,
    page,
    fromReference: true,
    skipHistoryPush: true
  });
}

// --------------------- openPDF function ---------------------
async function openPDF(file, title, docLi = null, options = {}) {
  await ensureTaskIndexLoaded();

  const inferredTaskKey = normalizeTaskKey(title) || normalizeTaskKey(docLi?.dataset?.key || '') || normalizeTaskKey(docLi?.textContent || '');
  const activeTaskKey = options.explicitTaskKey || inferredTaskKey;
  const taskEntry = activeTaskKey ? viewerState.taskIndex?.[activeTaskKey] : null;
  const referenceTasks = collectTaskReferences(taskEntry, activeTaskKey);

  const showBackButton = options.fromReference && viewerState.historyStack.length > 0;
  const backButtonHtml = showBackButton
    ? '<button id="pdf-back-btn" class="pdf-back-btn" type="button">← Back to previous PDF</button>'
    : '';

  viewer.innerHTML = `
    <div class="viewer-header-row">
      <h2>${title}</h2>
      ${backButtonHtml}
    </div>

    ${createReferenceListHTML(referenceTasks)}

    <iframe
      id="pdf-frame"
      src="${file}"
      style="flex:1;border:none;border-radius:4px;background:#fff;"
    ></iframe>

    <div id="pdf-overlay">
      <div style="
        width:32px;
        height:32px;
        border:3px solid #555;
        border-top-color:#64b5f6;
        border-radius:50%;
        animation:spin 1s linear infinite;
      "></div>
    </div>
  `;

  const iframe = document.getElementById('pdf-frame');
  const overlay = document.getElementById('pdf-overlay');

  iframe.onload = () => {
    overlay.classList.add('hidden');
    setTimeout(() => overlay.remove(), 300);
  };

  treeContainer.querySelectorAll('li.doc').forEach(d => d.classList.remove('selected'));
  if (docLi) docLi.classList.add('selected');

  markParentFolders(docLi);
  updateUrlForDoc(docLi);

  const currentState = {
    file,
    title,
    docLi,
    sourceTaskKey: options.sourceTaskKey || activeTaskKey || null,
    explicitTaskKey: options.explicitTaskKey || null,
    page: options.page ?? null,
    fromReference: !!options.fromReference
  };
  viewerState.current = currentState;

  wireReferenceClickHandlers(currentState);
  wireBackButton();
}
