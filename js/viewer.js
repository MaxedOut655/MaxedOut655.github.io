const PDF_HOST = 'https://crj200rvc.github.io/crj200-manual-files/';
const referenceHistory = [];

function normalizeTaskFilePath(filePath = '') {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  return `${PDF_HOST}${normalized.replace(/^\.\//, '').replace(/^\.\//, '')}`;
}

function getPdfUrlWithLocation(file, taskId = null) {
  if (!taskId || !taskIndexData?.tasks?.[taskId]) return file;
  const task = taskIndexData.tasks[taskId];
  const page = Number.isFinite(task.page) ? task.page + 1 : null;
  const search = encodeURIComponent(`TASK ${taskId}`);
  if (!page) return `${normalizeTaskFilePath(task.file)}#search=${search}`;
  return `${normalizeTaskFilePath(task.file)}#page=${page}&search=${search}`;
}

function getReferencesForFile(file) {
  if (!taskIndexData?.tasks) return [];
  const fileName = (file.split('/').pop() || '').toLowerCase();
  const references = new Set();
  const allTasks = Object.entries(taskIndexData.tasks);

  allTasks.forEach(([, task]) => {
    const taskFileName = ((task.file || '').replace(/\\/g, '/').split('/').pop() || '').toLowerCase();
    if (taskFileName !== fileName) return;

    const normalizedTitle = (task.title || '').replace(/\u2212/g, '-');
    const matches = normalizedTitle.match(/\b\d{2}-\d{2}-\d{2}-\d{3}-\d{3}\b/g) || [];
    matches.forEach(match => {
      if (taskIndexData.tasks[match]) references.add(match);
    });
  });

  return Array.from(references).sort();
}

// --------------------- openPDF function ---------------------
function openPDF(file, title, docLi = null, options = {}) {
  const { fromReference = false, targetTaskId = null } = options;
  const resolvedFile = targetTaskId ? normalizeTaskFilePath(taskIndexData?.tasks?.[targetTaskId]?.file || file) : file;
  const pdfUrl = targetTaskId ? getPdfUrlWithLocation(resolvedFile, targetTaskId) : resolvedFile;

  if (fromReference) {
    const iframe = document.getElementById('pdf-frame');
    const previousSrc = iframe ? iframe.src : '';
    referenceHistory.push({ file: previousSrc || file, title });
  }

  const references = getReferencesForFile(resolvedFile);
  const backButton = referenceHistory.length
    ? `<button id="pdf-back-btn" class="pdf-toolbar-btn">← Back to previous PDF</button>`
    : '';
  const refsHtml = references.length
    ? `<div id="task-ref-list">${references
      .map(ref => `<button class="task-ref-link" data-task="${ref}">Ref. TASK ${ref}</button>`)
      .join('')}</div>`
    : `<div id="task-ref-list" class="empty">No task references detected in this PDF.</div>`;

  // Update the viewer area
  viewer.innerHTML = `
    <h2>${title}</h2>
    <div id="pdf-toolbar">
      ${backButton}
      ${refsHtml}
    </div>

    <iframe
      id="pdf-frame"
      src="${pdfUrl}"
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
  const backBtn = document.getElementById('pdf-back-btn');

  // Hide overlay once PDF loads
  iframe.onload = () => {
    overlay.classList.add('hidden');
    setTimeout(() => overlay.remove(), 300);
  };

  // --------------------- Highlight selection ---------------------
  treeContainer.querySelectorAll('li.doc').forEach(d => d.classList.remove('selected'));
  if (docLi) docLi.classList.add('selected');

  markParentFolders(docLi); // open parent folders

  // --------------------- Update URL for routing ---------------------
  if (docLi) {
    const url = new URL(window.location); // current URL
    const key = docLi.dataset.path.split(' > ').pop(); // last part of path = doc key
    url.searchParams.set('doc', key); // set ?doc=...
    window.history.replaceState({}, '', url); // update browser URL without reload
  }

  // ✅ Update URL using the document key
if (docLi && docLi.dataset.key) {
  const url = new URL(window.location);
  url.searchParams.set('doc', docLi.dataset.key);
  window.history.replaceState({}, '', url);
}

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      const previous = referenceHistory.pop();
      if (!previous) return;
      openPDF(previous.file, previous.title, null);
    });
  }

  document.querySelectorAll('.task-ref-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const taskId = btn.dataset.task;
      const currentFrame = document.getElementById('pdf-frame');
      referenceHistory.push({
        file: currentFrame ? currentFrame.src : file,
        title
      });
      openPDF(
        normalizeTaskFilePath(taskIndexData.tasks[taskId].file),
        `TASK ${taskId}`,
        null,
        { fromReference: false, targetTaskId: taskId }
      );
    });
  });
}
