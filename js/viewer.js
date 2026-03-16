const PDFJS_WORKER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let taskIndexPromise = null;

function getTaskIndex() {
  if (!taskIndexPromise) {
    taskIndexPromise = fetch('task_index.json')
      .then(res => (res.ok ? res.json() : { tasks: {} }))
      .catch(() => ({ tasks: {} }));
  }
  return taskIndexPromise;
}

function normalizeTaskId(raw = '') {
  return raw
    .replace(/[−–—]/g, '-')
    .replace(/TASK\s*/gi, '')
    .replace(/[^0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

function getTaskFromText(text = '') {
  const match = text
    .replace(/[−–—]/g, '-')
    .match(/(?:TASK\s*)?(\d{2}-\d{2}-\d{2}-\d{3}-\d{3})/i);
  return match ? normalizeTaskId(match[1]) : null;
}

function findDocLiForTaskEntry(entry) {
  const docs = treeContainer.querySelectorAll('li.doc');
  const base = (entry.file || '').split(/[/\\]/).pop()?.replace(/\.pdf$/i, '') || '';
  const bare = base.replace(/^[A-Za-z]+/, '');

  return Array.from(docs).find(doc => doc.dataset.key === base)
    || Array.from(docs).find(doc => (doc.dataset.key || '').endsWith(bare))
    || Array.from(docs).find(doc => (doc.dataset.path || '').includes(bare));
}

async function jumpToTaskReference(taskId) {
  const index = await getTaskIndex();
  const entry = index?.tasks?.[taskId];
  if (!entry) return;

  const targetDoc = findDocLiForTaskEntry(entry);
  const page = Number.isFinite(entry.page) ? entry.page + 1 : 1;
  const yPercent = Number.isFinite(entry.y_percent) ? entry.y_percent : 0;

  if (!targetDoc) return;

  expandPathToDoc(targetDoc);
  openPDF(targetDoc.dataset.file, targetDoc.dataset.path, targetDoc, { page, yPercent });
}

async function renderPdfWithPdfJs(file, options = {}) {
  if (!window.pdfjsLib) {
    throw new Error('PDF.js did not load.');
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;

  const pdfContainer = document.getElementById('pdf-container');
  const overlay = document.getElementById('pdf-overlay');
  const loadingTask = pdfjsLib.getDocument(file);
  const pdf = await loadingTask.promise;

  pdfContainer.innerHTML = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.35 });

    const pageWrap = document.createElement('div');
    pageWrap.className = 'pdf-page';
    pageWrap.dataset.page = String(pageNum);

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer';
    textLayer.style.width = `${viewport.width}px`;
    textLayer.style.height = `${viewport.height}px`;

    pageWrap.appendChild(canvas);
    pageWrap.appendChild(textLayer);
    pdfContainer.appendChild(pageWrap);

    await page.render({ canvasContext: context, viewport }).promise;
    const textContent = await page.getTextContent();
    await pdfjsLib.renderTextLayer({ textContentSource: textContent, container: textLayer, viewport }).promise;
  }

  overlay.classList.add('hidden');
  setTimeout(() => overlay.remove(), 250);

  const targetPage = options.page || 1;
  const targetY = options.yPercent || 0;
  const targetPageEl = pdfContainer.querySelector(`[data-page="${targetPage}"]`);
  if (targetPageEl) {
    const yOffset = targetPageEl.offsetTop + (targetPageEl.offsetHeight * targetY);
    pdfContainer.scrollTo({ top: yOffset, behavior: 'smooth' });
  }
}

// --------------------- openPDF function ---------------------
function openPDF(file, title, docLi = null, options = {}) {
  viewer.innerHTML = `
    <h2>${title}</h2>
    <div class="pdf-hint">Tip: click any TASK reference in the PDF to jump there.</div>
    <div id="pdf-container"></div>
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

  renderPdfWithPdfJs(file, options).catch(err => {
    const pdfContainer = document.getElementById('pdf-container');
    const overlay = document.getElementById('pdf-overlay');
    if (overlay) overlay.remove();
    pdfContainer.innerHTML = `<p style="color:#ff8a80;">Could not load PDF with PDF.js: ${err.message}</p>`;
  });

  const pdfContainer = document.getElementById('pdf-container');
  pdfContainer.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const textLayer = target.closest('.textLayer');
    if (!textLayer) return;

    const spans = Array.from(textLayer.querySelectorAll('span'));
    const spanIndex = spans.indexOf(target);
    const nearText = spanIndex >= 0
      ? spans.slice(Math.max(0, spanIndex - 8), spanIndex + 9).map(s => s.textContent || '').join(' ')
      : (target.textContent || '');

    const taskId = getTaskFromText(nearText);
    if (!taskId) return;

    event.preventDefault();
    await jumpToTaskReference(taskId);
  });

  treeContainer.querySelectorAll('li.doc').forEach(d => d.classList.remove('selected'));
  if (docLi) docLi.classList.add('selected');

  markParentFolders(docLi);

  if (docLi && docLi.dataset.key) {
    const url = new URL(window.location);
    url.searchParams.set('doc', docLi.dataset.key);
    window.history.replaceState({}, '', url);
  }
}
