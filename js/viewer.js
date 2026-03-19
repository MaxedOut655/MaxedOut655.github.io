const PDF_HOST = 'https://crj200rvc.github.io/crj200-manual-files/';
const referenceHistory = [];
let pdfJsLoaderPromise = null;
let currentPdfDoc = null;
let currentPageNumber = 1;
let currentPdfUrl = '';
let currentViewerTitle = '';

function normalizeTaskFilePath(filePath = '') {
  if (/^https?:\/\//i.test(filePath)) return filePath;
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  return `${PDF_HOST}${normalized}`;
}

function stripPdfFragment(url = '') {
  return url.split('#')[0];
}

function parsePageFromUrl(url = '') {
  const fragment = (url.split('#')[1] || '');
  const params = new URLSearchParams(fragment.replace(/&/g, '&'));
  const page = Number.parseInt(params.get('page') || '1', 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function normalizeRefText(value = '') {
  return value.replace(/\u2212/g, '-').replace(/[‐‑‒–—−]/g, '-');
}

function getPdfUrlWithLocation(taskId) {
  if (!taskId || !taskIndexData?.tasks?.[taskId]) return '';
  const task = taskIndexData.tasks[taskId];
  const file = normalizeTaskFilePath(task.file || '');
  const page = Number.isFinite(task.page) ? task.page + 1 : null;
  const search = encodeURIComponent(`TASK ${taskId}`);
  if (!page) return `${file}#search=${search}`;
  return `${file}#page=${page}&search=${search}`;
}

function findDocByReference(refText) {
  const ref = normalizeRefText(refText);
  const candidates = treeContainer.querySelectorAll('li.doc');

  for (const li of candidates) {
    if (li.dataset.key === `AMM${ref}`) return li;
  }
  for (const li of candidates) {
    if ((li.dataset.key || '').includes(ref)) return li;
  }
  for (const li of candidates) {
    if ((li.dataset.path || '').includes(ref)) return li;
  }
  return null;
}

async function ensurePdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  if (pdfJsLoaderPromise) return pdfJsLoaderPromise;

  pdfJsLoaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error('Could not load pdf.js.'));
    document.head.appendChild(script);
  });

  return pdfJsLoaderPromise;
}

function linkifyTaskText(input = '') {
  const normalized = normalizeRefText(input);
  const pattern = /(Ref\.\s*(?:TASK\s*)?(\d{2}-\d{2}-\d{2}(?:-\d{3}-\d{3})?))/gi;
  return normalized.replace(pattern, (_all, fullLabel, ref) => {
    const escapedLabel = fullLabel.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<a href="#" class="inline-task-ref" data-ref="${ref}">${escapedLabel}</a>`;
  });
}

function attachInlineReferenceHandlers() {
  document.querySelectorAll('.inline-task-ref').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      const ref = normalizeRefText(link.dataset.ref || '');

      referenceHistory.push({
        file: `${stripPdfFragment(currentPdfUrl)}#page=${currentPageNumber}`,
        title: currentViewerTitle
      });

      if (taskIndexData?.tasks?.[ref]) {
        openPDF(getPdfUrlWithLocation(ref), `TASK ${ref}`, null);
        return;
      }

      const docLi = findDocByReference(ref);
      if (docLi) {
        openPDF(docLi.dataset.file, docLi.dataset.path, docLi);
        return;
      }

      alert(`Reference ${ref} was found, but no matching target document was resolved.`);
    });
  });
}

async function renderCurrentPage() {
  if (!currentPdfDoc) return;

  const page = await currentPdfDoc.getPage(currentPageNumber);
  const viewport = page.getViewport({ scale: 1.35 });

  const canvas = document.getElementById('pdf-canvas');
  const textLayer = document.getElementById('pdf-text-layer');
  const pageLabel = document.getElementById('pdf-page-label');
  const prevBtn = document.getElementById('pdf-prev-btn');
  const nextBtn = document.getElementById('pdf-next-btn');

  const context = canvas.getContext('2d');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  textLayer.style.width = `${viewport.width}px`;
  textLayer.style.height = `${viewport.height}px`;
  textLayer.innerHTML = '';

  await page.render({ canvasContext: context, viewport }).promise;

  const textContent = await page.getTextContent();
  textContent.items.forEach(item => {
    const tx = window.pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]);

    const span = document.createElement('span');
    span.className = 'pdf-text-item';
    span.style.left = `${tx[4]}px`;
    span.style.top = `${tx[5] - fontHeight}px`;
    span.style.fontSize = `${fontHeight}px`;
    span.style.fontFamily = item.fontName || 'sans-serif';
    span.style.transform = `scaleX(${item.width ? Math.abs(tx[0]) / item.width : 1})`;
    span.style.transformOrigin = 'left top';
    span.innerHTML = linkifyTaskText(item.str || '');
    textLayer.appendChild(span);
  });

  attachInlineReferenceHandlers();

  pageLabel.textContent = `Page ${currentPageNumber} / ${currentPdfDoc.numPages}`;
  prevBtn.disabled = currentPageNumber <= 1;
  nextBtn.disabled = currentPageNumber >= currentPdfDoc.numPages;
}

async function loadPdfDocument(fileUrl) {
  const pdfjsLib = await ensurePdfJs();
  const loadingTask = pdfjsLib.getDocument({ url: stripPdfFragment(fileUrl), withCredentials: false });
  currentPdfDoc = await loadingTask.promise;
  currentPageNumber = Math.min(parsePageFromUrl(fileUrl), currentPdfDoc.numPages || 1);
  await renderCurrentPage();
}

function renderViewerShell(title) {
  const backButton = referenceHistory.length
    ? '<button id="pdf-back-btn" class="pdf-toolbar-btn">← Back to previous PDF</button>'
    : '';

  viewer.innerHTML = `
    <h2>${title}</h2>
    <div id="pdf-toolbar">
      ${backButton}
      <button id="pdf-prev-btn" class="pdf-toolbar-btn">← Prev</button>
      <button id="pdf-next-btn" class="pdf-toolbar-btn">Next →</button>
      <span id="pdf-page-label" class="pdf-page-label">Loading...</span>
    </div>

    <div id="pdf-canvas-wrap">
      <canvas id="pdf-canvas"></canvas>
      <div id="pdf-text-layer"></div>
    </div>
  `;

  const backBtn = document.getElementById('pdf-back-btn');
  const prevBtn = document.getElementById('pdf-prev-btn');
  const nextBtn = document.getElementById('pdf-next-btn');

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      const previous = referenceHistory.pop();
      if (!previous) return;
      openPDF(previous.file, previous.title, null);
    });
  }

  prevBtn.addEventListener('click', async () => {
    if (!currentPdfDoc || currentPageNumber <= 1) return;
    currentPageNumber -= 1;
    await renderCurrentPage();
  });

  nextBtn.addEventListener('click', async () => {
    if (!currentPdfDoc || currentPageNumber >= currentPdfDoc.numPages) return;
    currentPageNumber += 1;
    await renderCurrentPage();
  });
}

// --------------------- openPDF function ---------------------
async function openPDF(file, title, docLi = null) {
  const resolvedFile = normalizeTaskFilePath(file);
  currentPdfUrl = resolvedFile;
  currentViewerTitle = title;

  renderViewerShell(title);

  try {
    await loadPdfDocument(resolvedFile);
  } catch (error) {
    console.error(error);
    viewer.innerHTML = `<h2>${title}</h2><p>Failed to load PDF with pdf.js.</p>`;
    return;
  }

  treeContainer.querySelectorAll('li.doc').forEach(d => d.classList.remove('selected'));
  if (docLi) docLi.classList.add('selected');
  markParentFolders(docLi);

  if (docLi && docLi.dataset.key) {
    const url = new URL(window.location);
    url.searchParams.set('doc', docLi.dataset.key);
    window.history.replaceState({}, '', url);
  }
}
