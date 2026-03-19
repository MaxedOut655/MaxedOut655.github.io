const PDF_HOST = 'https://crj200rvc.github.io/crj200-manual-files/';
const referenceHistory = [];
let activeReferenceScanId = 0;
let pdfJsLoaderPromise = null;

function normalizeTaskFilePath(filePath = '') {
  if (/^https?:\/\//i.test(filePath)) return filePath;
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  return `${PDF_HOST}${normalized}`;
}

function stripPdfFragment(url = '') {
  return url.split('#')[0];
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
  const exactKey = `AMM${ref}`;

  for (const li of candidates) {
    if (li.dataset.key === exactKey) return li;
  }

  for (const li of candidates) {
    if ((li.dataset.key || '').includes(ref)) return li;
  }

  for (const li of candidates) {
    if ((li.dataset.path || '').includes(ref)) return li;
  }

  return null;
}

function extractReferencesFromText(rawText = '') {
  const text = normalizeRefText(rawText).replace(/\s+/g, ' ');
  const refs = new Set();

  const fullTaskPattern = /\b(?:REF\.?\s*)?(?:TASK\s*)?(\d{2}-\d{2}-\d{2}-\d{3}-\d{3})\b/gi;
  let fullMatch = fullTaskPattern.exec(text);
  while (fullMatch) {
    refs.add(fullMatch[1]);
    fullMatch = fullTaskPattern.exec(text);
  }

  const chapterRefPattern = /\bREF\.?\s*(\d{2}-\d{2}-\d{2})\b/gi;
  let chapterMatch = chapterRefPattern.exec(text);
  while (chapterMatch) {
    refs.add(chapterMatch[1]);
    chapterMatch = chapterRefPattern.exec(text);
  }

  return Array.from(refs);
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

async function extractTaskReferencesFromPdf(fileUrl, scanId) {
  const refsContainer = document.getElementById('task-ref-list');
  if (!refsContainer) return;

  try {
    const pdfjsLib = await ensurePdfJs();
    const loadingTask = pdfjsLib.getDocument({ url: stripPdfFragment(fileUrl), withCredentials: false });
    const pdf = await loadingTask.promise;

    const found = new Set();
    const maxPages = Math.min(pdf.numPages, 40);

    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      if (scanId !== activeReferenceScanId) return;
      const page = await pdf.getPage(pageNo);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str || '').join(' ');

      extractReferencesFromText(pageText).forEach(ref => found.add(ref));
    }

    if (scanId !== activeReferenceScanId) return;

    const sorted = Array.from(found).sort();
    if (!sorted.length) {
      refsContainer.classList.add('empty');
      refsContainer.textContent = 'No references detected in this PDF.';
      return;
    }

    refsContainer.classList.remove('empty');
    refsContainer.innerHTML = sorted
      .map(ref => {
        const isFullTask = /^\d{2}-\d{2}-\d{2}-\d{3}-\d{3}$/.test(ref);
        const label = isFullTask ? `Ref. TASK ${ref}` : `Ref. ${ref}`;
        return `<button class="task-ref-link" data-ref="${ref}">${label}</button>`;
      })
      .join('');

    attachReferenceLinkHandlers();
  } catch (error) {
    console.error(error);
    if (scanId !== activeReferenceScanId) return;
    refsContainer.classList.add('empty');
    refsContainer.textContent = 'Could not scan PDF references.';
  }
}

function attachReferenceLinkHandlers() {
  document.querySelectorAll('.task-ref-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const ref = normalizeRefText(btn.dataset.ref || '');
      const currentFrame = document.getElementById('pdf-frame');
      const currentTitle = viewer.querySelector('h2')?.textContent || 'PDF';

      referenceHistory.push({
        file: currentFrame ? currentFrame.src : '',
        title: currentTitle
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

      alert(`Reference ${ref} was detected, but no matching task/document was found in the loaded index.`);
    });
  });
}

function renderPdfToolbar(initialMessage = 'Scanning references...') {
  const backButton = referenceHistory.length
    ? '<button id="pdf-back-btn" class="pdf-toolbar-btn">← Back to previous PDF</button>'
    : '';

  return `
    <div id="pdf-toolbar">
      ${backButton}
      <div id="task-ref-list" class="empty">${initialMessage}</div>
    </div>
  `;
}

// --------------------- openPDF function ---------------------
function openPDF(file, title, docLi = null) {
  const resolvedFile = normalizeTaskFilePath(file);
  const scanId = ++activeReferenceScanId;

  viewer.innerHTML = `
    <h2>${title}</h2>
    ${renderPdfToolbar()}

    <iframe
      id="pdf-frame"
      src="${resolvedFile}"
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

  iframe.onload = () => {
    overlay.classList.add('hidden');
    setTimeout(() => overlay.remove(), 300);
  };

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      const previous = referenceHistory.pop();
      if (!previous) return;
      openPDF(previous.file, previous.title, null);
    });
  }

  extractTaskReferencesFromPdf(resolvedFile, scanId);

  treeContainer.querySelectorAll('li.doc').forEach(d => d.classList.remove('selected'));
  if (docLi) docLi.classList.add('selected');

  markParentFolders(docLi);

  if (docLi && docLi.dataset.key) {
    const url = new URL(window.location);
    url.searchParams.set('doc', docLi.dataset.key);
    window.history.replaceState({}, '', url);
  }
}
