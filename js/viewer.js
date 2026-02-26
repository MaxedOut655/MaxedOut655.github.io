const crossRefNavigationStack = [];
let activeDocState = null;
let pdfJsLoadingPromise = null;

function normalizeDashes(value = '') {
  return value.replace(/[‐‑‒–—−]/g, '-');
}

function normalizeTaskCode(code = '') {
  return normalizeDashes(code).replace(/\s+/g, '');
}

function ensurePdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfJsLoadingPromise) return pdfJsLoadingPromise;

  pdfJsLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
        script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      } else {
        reject(new Error('PDF.js unavailable after load'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load PDF.js'));
    document.head.appendChild(script);
  });

  return pdfJsLoadingPromise;
}

function getDocsByPrefix(prefix) {
  const currentManual = docSelector ? docSelector.value : '';
  const selector = `li.doc[data-key^="${currentManual}${prefix}"]`;
  return Array.from(treeContainer.querySelectorAll(selector));
}

function findBestTaskMatch(taskCode) {
  const normalized = normalizeTaskCode(taskCode);
  const groups = normalized.match(/^(\d{2})-(\d{2})-(\d{2})-(\d{3})-(\d{3})$/);
  if (!groups) return null;

  return findBestSectionMatch(`${groups[1]}-${groups[2]}-${groups[3]}`);
}

function findBestSectionMatch(sectionCode) {
  const normalized = normalizeTaskCode(sectionCode);
  const groups = normalized.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (!groups) return null;

  const prefix = `${groups[1]}-${groups[2]}-${groups[3]}-`;
  const candidates = getDocsByPrefix(prefix);
  if (!candidates.length) return null;

  const preferred = candidates.find(doc => doc.dataset.key.endsWith('-02'));
  return preferred || candidates[0];
}

function parseCrossReferences(text) {
  const refs = [];
  const seen = new Set();

  function pushTask(taskCode, label = null) {
    const normalized = normalizeTaskCode(taskCode);
    const key = `task:${normalized}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({ type: 'task', label: label || `Ref. TASK ${normalized}`, taskCode: normalized });
  }

  function pushSection(sectionCode, label = null) {
    const normalized = normalizeTaskCode(sectionCode);
    const key = `section:${normalized}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({ type: 'section', label: label || `Ref. ${normalized}`, sectionCode: normalized });
  }

  let match;

  const refRegex = /Ref\.?\s*(?:TASK\s*)?(\d{2}[‐‑‒–—−-]\d{2}[‐‑‒–—−-]\d{2}(?:[‐‑‒–—−-]\d{3}[‐‑‒–—−-]\d{3})?)/gi;
  while ((match = refRegex.exec(text)) !== null) {
    const normalized = normalizeTaskCode(match[1]);
    if (/^\d{2}-\d{2}-\d{2}-\d{3}-\d{3}$/.test(normalized)) {
      pushTask(normalized, `Ref. TASK ${normalized}`);
    } else if (/^\d{2}-\d{2}-\d{2}$/.test(normalized)) {
      pushSection(normalized, `Ref. ${normalized}`);
    }
  }

  const standaloneTaskRegex = /(?:^|\s)TASK\s*(\d{2}[‐‑‒–—−-]\d{2}[‐‑‒–—−-]\d{2}[‐‑‒–—−-]\d{3}[‐‑‒–—−-]\d{3})/gi;
  while ((match = standaloneTaskRegex.exec(text)) !== null) {
    pushTask(match[1], `TASK ${normalizeTaskCode(match[1])}`);
  }

  const chapterRegex = /(AMM\s*\d{2}[‐‑‒–—−-]\d{2}[‐‑‒–—−-]\d{2}[‐‑‒–—−-]\d{2})(?:\s*page\s*(\d+))?/gi;
  while ((match = chapterRegex.exec(text)) !== null) {
    const keyCode = normalizeDashes(match[1]).replace(/\s+/g, '');
    const page = match[2] ? Number.parseInt(match[2], 10) : null;
    const key = `chapter:${keyCode}:${page || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ type: 'chapter', label: page ? `${keyCode} page ${page}` : keyCode, docKey: keyCode, page });
  }

  return refs.slice(0, 30);
}

function renderCrossReferences(refs = [], docState) {
  const panel = document.getElementById('cross-ref-panel');
  if (!panel) return;

  if (!refs.length) {
    panel.innerHTML = '<span class="xref-muted">No references detected in this PDF.</span>';
    return;
  }

  panel.innerHTML = '';
  refs.forEach(ref => {
    const button = document.createElement('button');
    button.className = 'xref-link';

    let targetDoc = null;
    if (ref.type === 'task') {
      targetDoc = findBestTaskMatch(ref.taskCode);
    } else if (ref.type === 'section') {
      targetDoc = findBestSectionMatch(ref.sectionCode);
    } else if (ref.type === 'chapter') {
      targetDoc = treeContainer.querySelector(`li.doc[data-key="${ref.docKey}"]`);
    }

    if (!targetDoc) {
      button.disabled = true;
      button.textContent = `${ref.label} (not found in this manual)`;
    } else {
      button.textContent = `${ref.label} → ${targetDoc.dataset.key}`;
      button.addEventListener('click', () => {
        crossRefNavigationStack.push(docState);
        openPDF(targetDoc.dataset.file, targetDoc.dataset.path, targetDoc, {
          source: 'xref',
          page: ref.page || null
        });
      });
    }

    panel.appendChild(button);
  });
}

async function scanPdfForReferences(file, docState) {
  const panel = document.getElementById('cross-ref-panel');
  if (!panel) return;

  panel.innerHTML = '<span class="xref-muted">Scanning PDF for cross references…</span>';

  try {
    const pdfjs = await ensurePdfJs();
    const loadingTask = pdfjs.getDocument({ url: file, withCredentials: false });
    const pdf = await loadingTask.promise;

    const maxPages = Math.min(pdf.numPages, 60);
    let mergedText = '';

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const line = textContent.items.map(item => item.str || '').join(' ');
      mergedText += ` ${line}`;
    }

    if (!activeDocState || activeDocState.file !== docState.file) return;

    const refs = parseCrossReferences(mergedText);
    renderCrossReferences(refs, docState);
  } catch (error) {
    panel.innerHTML = `<span class="xref-muted">Cross-reference scan unavailable (${error.message}).</span>`;
  }
}

function renderBackButton() {
  const btn = document.getElementById('xref-back-btn');
  if (!btn) return;

  if (!crossRefNavigationStack.length) {
    btn.style.display = 'none';
    return;
  }

  btn.style.display = 'inline-flex';
}

function openPDF(file, title, docLi = null, options = {}) {
  if (options.source !== 'xref') {
    crossRefNavigationStack.length = 0;
  }

  const pageSuffix = options.page ? `#page=${options.page}` : '';

  viewer.innerHTML = `
    <div id="viewer-toolbar">
      <button id="xref-back-btn" type="button" title="Back to previous document">← Back</button>
      <h2>${title}</h2>
    </div>

    <div id="cross-ref-panel"></div>

    <iframe
      id="pdf-frame"
      src="${file}${pageSuffix}"
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

  if (docLi && docLi.dataset.key) {
    const url = new URL(window.location);
    url.searchParams.set('doc', docLi.dataset.key);
    window.history.replaceState({}, '', url);
  }

  activeDocState = {
    file,
    title,
    docKey: docLi?.dataset.key || '',
    path: docLi?.dataset.path || title,
    page: options.page || null
  };

  const backBtn = document.getElementById('xref-back-btn');
  backBtn?.addEventListener('click', () => {
    const previous = crossRefNavigationStack.pop();
    if (!previous) return;

    const previousDoc = treeContainer.querySelector(`li.doc[data-key="${previous.docKey}"]`);
    openPDF(previous.file, previous.path || previous.title, previousDoc, { page: previous.page || null });
  });

  renderBackButton();
  scanPdfForReferences(file, activeDocState);
}
