const TASK_ID_REGEX = /\bTASK\s*([0-9\u2212-]{14,20})\b/gi;

const viewerState = {
  taskIndexById: null,
  taskIndexPromise: null,
  referenceBackStack: [],
  activeContext: null
};

window.viewerState = viewerState;

function normalizeTaskId(raw) {
  return (raw || '').replace(/\u2212/g, '-').replace(/[^0-9-]/g, '').trim();
}

function normalizePathForMatch(path) {
  return (path || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\//, '')
    .toLowerCase();
}

function buildHostedFileFromTaskRecord(record) {
  if (!record || !record.file) return '';

  const normalized = normalizePathForMatch(record.file);
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length < 2) return '';

  const folder = parts[parts.length - 2];
  const filename = parts[parts.length - 1];
  return `https://crj200rvc.github.io/crj200-manual-files/${folder}/${filename}`;
}

function buildPdfSrc(file, options = {}) {
  if (!file) return '';

  const hashParams = new URLSearchParams();

  if (Number.isInteger(options.targetPage)) {
    // Browser PDF viewers use 1-indexed pages in hash.
    hashParams.set('page', String(options.targetPage + 1));
  }

  if (options.targetTaskId) {
    hashParams.set('search', `TASK ${options.targetTaskId}`);
  }

  const hash = hashParams.toString();
  return hash ? `${file}#${hash}` : file;
}

function extractReferencedTaskIds(taskText, sourceTaskId) {
  const taskIds = new Set();
  let match;

  while ((match = TASK_ID_REGEX.exec(taskText || '')) !== null) {
    const normalized = normalizeTaskId(match[1]);
    if (!normalized || normalized === sourceTaskId) continue;
    taskIds.add(normalized);
  }

  TASK_ID_REGEX.lastIndex = 0;
  return [...taskIds];
}

function getDocLiByTaskId(taskId) {
  if (!viewerState.taskIndexById) return null;

  const record = viewerState.taskIndexById[taskId];
  if (!record) return null;

  const targetFile = buildHostedFileFromTaskRecord(record);
  if (!targetFile) return null;

  const normalizedTarget = normalizePathForMatch(targetFile);
  const docs = treeContainer.querySelectorAll('li.doc');

  return [...docs].find(li => normalizePathForMatch(li.dataset.file) === normalizedTarget) || null;
}

async function ensureTaskIndexLoaded() {
  if (viewerState.taskIndexById) return viewerState.taskIndexById;
  if (viewerState.taskIndexPromise) return viewerState.taskIndexPromise;

  viewerState.taskIndexPromise = fetch('task_index.json', { cache: 'no-store' })
    .then(res => {
      if (!res.ok) throw new Error(`Failed to load task_index.json (${res.status})`);
      return res.json();
    })
    .then(data => {
      viewerState.taskIndexById = data.tasks || {};
      return viewerState.taskIndexById;
    })
    .catch(err => {
      console.error('Task index load failed:', err);
      viewerState.taskIndexById = {};
      return viewerState.taskIndexById;
    });

  return viewerState.taskIndexPromise;
}

function updateViewerURL(docLi, targetTaskId = '') {
  const url = new URL(window.location);

  if (docLi && docLi.dataset.key) {
    url.searchParams.set('doc', docLi.dataset.key);
  }

  if (targetTaskId) {
    url.searchParams.set('task', targetTaskId);
  } else {
    url.searchParams.delete('task');
  }

  window.history.replaceState({}, '', url);
}

function renderReferencePanel(sourceTaskId) {
  if (!sourceTaskId || !viewerState.taskIndexById) return '';

  const sourceRecord = viewerState.taskIndexById[sourceTaskId];
  if (!sourceRecord) return '';

  const referencedTasks = extractReferencedTaskIds(sourceRecord.title, sourceTaskId)
    .filter(taskId => viewerState.taskIndexById[taskId]);

  if (!referencedTasks.length) return '';

  const links = referencedTasks
    .map(taskId => `<button class="task-ref-link" data-task-id="${taskId}" title="Open TASK ${taskId}">(Ref. TASK ${taskId})</button>`)
    .join('');

  return `
    <div id="task-ref-panel">
      <div class="task-ref-title">Task References</div>
      <div class="task-ref-links">${links}</div>
    </div>
  `;
}

function renderViewer({ title, src, showBackButton, currentTaskId }) {
  const backBtn = showBackButton
    ? '<button id="task-ref-back-btn" type="button">← Back</button>'
    : '';

  const referencePanel = renderReferencePanel(currentTaskId);

  viewer.innerHTML = `
    <div id="viewer-header-row">
      ${backBtn}
      <h2>${title}</h2>
    </div>

    ${referencePanel}

    <iframe
      id="pdf-frame"
      src="${src}"
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
}

function goBackFromTaskReference() {
  const previous = viewerState.referenceBackStack.pop();
  if (!previous) return;

  openPDF(previous.file, previous.title, previous.docLi, {
    targetTaskId: previous.targetTaskId,
    targetPage: previous.targetPage,
    fromReference: false,
    suppressBackPush: true
  });
}

function openTaskReference(targetTaskId) {
  if (!viewerState.taskIndexById) return;

  const targetRecord = viewerState.taskIndexById[targetTaskId];
  if (!targetRecord) return;

  const targetFile = buildHostedFileFromTaskRecord(targetRecord);
  if (!targetFile) return;

  const targetDocLi = getDocLiByTaskId(targetTaskId);
  const title = targetDocLi
    ? targetDocLi.dataset.path
    : `TASK ${targetTaskId}`;

  openPDF(targetFile, title, targetDocLi, {
    targetTaskId,
    targetPage: Number.isInteger(targetRecord.page) ? targetRecord.page : null,
    fromReference: true
  });
}

// --------------------- openPDF function ---------------------
async function openPDF(file, title, docLi = null, options = {}) {
  await ensureTaskIndexLoaded();

  const context = {
    file,
    title,
    docLi,
    targetTaskId: options.targetTaskId || '',
    targetPage: Number.isInteger(options.targetPage) ? options.targetPage : null
  };

  if (options.fromReference && !options.suppressBackPush && viewerState.activeContext) {
    viewerState.referenceBackStack.push(viewerState.activeContext);
  }

  viewerState.activeContext = context;

  const showBackButton = viewerState.referenceBackStack.length > 0;
  const src = buildPdfSrc(file, options);

  renderViewer({
    title,
    src,
    showBackButton,
    currentTaskId: context.targetTaskId
  });

  const iframe = document.getElementById('pdf-frame');
  const overlayEl = document.getElementById('pdf-overlay');

  iframe.onload = () => {
    overlayEl.classList.add('hidden');
    setTimeout(() => overlayEl.remove(), 300);
  };

  // --------------------- Highlight selection ---------------------
  treeContainer.querySelectorAll('li.doc').forEach(d => d.classList.remove('selected'));
  if (docLi) docLi.classList.add('selected');

  markParentFolders(docLi); // open parent folders

  updateViewerURL(docLi, context.targetTaskId);

  const backBtn = document.getElementById('task-ref-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', goBackFromTaskReference);
  }

  document.querySelectorAll('.task-ref-link').forEach(btn => {
    btn.addEventListener('click', () => {
      openTaskReference(btn.dataset.taskId);
    });
  });
}
