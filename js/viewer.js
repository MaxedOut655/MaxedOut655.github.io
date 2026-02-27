const crossRefNavigationStack = [];
let activeDocState = null;
let pdfJsLoadingPromise = null;
const targetPageLookupCache = new Map();

function isMobileViewerMode() {
  return document.body.classList.contains('mobile') || window.innerWidth < 900;
}

function normalizeDashes(value = '') {
  return value.replace(/[‐‑‒–—−]/g, '-');
}

function normalizeTaskCode(code = '') {
  return normalizeDashes(code).replace(/\s+/g, '');
}

function normalizeReferenceText(text = '') {
  return normalizeDashes(text)
    .replace(/\s*[‐‑‒–—−-]\s*/g, '-')
    .replace(/TASK\s*(?=\d)/gi, 'TASK ')
    .replace(/Ref\s*\./gi, 'Ref.')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')');
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


function getTargetDocForRef(ref) {
  if (ref.type === 'task') return findBestTaskMatch(ref.taskCode);
  if (ref.type === 'section') return findBestSectionMatch(ref.sectionCode);
  if (ref.type === 'chapter') return treeContainer.querySelector(`li.doc[data-key="${ref.docKey}"]`);
  return null;
}


function getReferenceLookupText(ref = {}) {
  if (ref.type === 'task' && ref.taskCode) return `TASK ${normalizeTaskCode(ref.taskCode)}`;
  if (ref.type === 'section' && ref.sectionCode) return normalizeTaskCode(ref.sectionCode);
  if (ref.type === 'chapter' && ref.docKey) return normalizeTaskCode(ref.docKey.replace(/^AMM/i, ''));
  return '';
}


function parseCrossReferences(text) {
  const normalizedText = normalizeReferenceText(text);
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

  const refRegex = /Ref\.?\s*(?:TASK\s*)?(\d{2}(?:\s*[‐‑‒–—−-]\s*\d{2}){2}(?:\s*[‐‑‒–—−-]\s*\d{3}\s*[‐‑‒–—−-]\s*\d{3})?)/gi;
  while ((match = refRegex.exec(normalizedText)) !== null) {
    const normalized = normalizeTaskCode(match[1]);
    if (/^\d{2}-\d{2}-\d{2}-\d{3}-\d{3}$/.test(normalized)) {
      pushTask(normalized, `Ref. TASK ${normalized}`);
    } else if (/^\d{2}-\d{2}-\d{2}$/.test(normalized)) {
      pushSection(normalized, `Ref. ${normalized}`);
    }
  }

  const standaloneTaskRegex = /(?:^|\s)TASK\s*(\d{2}(?:\s*[‐‑‒–—−-]\s*\d{2}){2}\s*[‐‑‒–—−-]\s*\d{3}\s*[‐‑‒–—−-]\s*\d{3})/gi;
  while ((match = standaloneTaskRegex.exec(normalizedText)) !== null) {
    pushTask(match[1], `TASK ${normalizeTaskCode(match[1])}`);
  }

  const chapterRegex = /(AMM\s*\d{2}(?:\s*[‐‑‒–—−-]\s*\d{2}){3})(?:\s*page\s*(\d+))?/gi;
  while ((match = chapterRegex.exec(normalizedText)) !== null) {
    const keyCode = normalizeDashes(match[1]).replace(/\s+/g, '');
    const page = match[2] ? Number.parseInt(match[2], 10) : null;
    const key = `chapter:${keyCode}:${page || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ type: 'chapter', label: page ? `${keyCode} page ${page}` : keyCode, docKey: keyCode, page });
  }

  return refs.slice(0, 30);
}

async function resolveTargetPage(targetFile, ref = {}) {
  if (ref.page) return ref.page;

  const lookupText = getReferenceLookupText(ref);
  if (!lookupText) return null;

  const cacheKey = `${targetFile}::${lookupText}`;
  if (targetPageLookupCache.has(cacheKey)) return targetPageLookupCache.get(cacheKey);

  try {
    const pdfjs = await ensurePdfJs();
    const loadingTask = pdfjs.getDocument({ url: targetFile, withCredentials: false });
    const pdf = await loadingTask.promise;

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent({ normalizeWhitespace: true });
      const line = normalizeReferenceText(textContent.items.map(item => item.str || '').join(' '));
      if (line.includes(lookupText)) {
        targetPageLookupCache.set(cacheKey, i);
        return i;
      }
    }
  } catch (error) {
    console.warn('Target page lookup failed:', error);
  }

  targetPageLookupCache.set(cacheKey, null);
  return null;
}

async function openReferenceTarget(targetDoc, ref = {}, docState = null) {
  const lookupText = getReferenceLookupText(ref);
  const resolvedPage = await resolveTargetPage(targetDoc.dataset.file, ref) || ref.page || null;

  if (isMobileViewerMode()) {
    crossRefNavigationStack.push(docState);
    openPDF(targetDoc.dataset.file, targetDoc.dataset.path, targetDoc, {
      source: 'xref',
      page: resolvedPage,
      lookupText
    });
    return;
  }

  const splitPane = document.getElementById('split-pane');
  const splitTitle = document.getElementById('split-title');
  const splitFrame = document.getElementById('split-pdf-frame');
  if (!splitPane || !splitTitle || !splitFrame) return;

  splitPane.classList.add('visible');
  splitTitle.textContent = targetDoc.dataset.path;
  splitFrame.src = `${targetDoc.dataset.file}${resolvedPage ? `#page=${resolvedPage}` : ''}`;

  const backBtn = document.getElementById('xref-back-btn');
  if (backBtn) backBtn.style.display = 'inline-flex';
}

function closeSplitPane() {
  const splitPane = document.getElementById('split-pane');
  const splitFrame = document.getElementById('split-pdf-frame');
  if (!splitPane || !splitFrame) return false;
  if (!splitPane.classList.contains('visible')) return false;

  splitPane.classList.remove('visible');
  splitFrame.src = 'about:blank';
  return true;
}

function buildRefsFromPageLines(pageLines = []) {
  const seen = new Set();
  const refs = [];

  pageLines.forEach(({ page, text }) => {
    parseCrossReferences(text).forEach(ref => {
      const key = `${ref.type}:${ref.label}`;
      if (seen.has(key)) return;
      seen.add(key);
      refs.push({ ...ref, page });
    });
  });

  return refs;
}

async function annotateInlineReferences(textLayerDiv, docState) {
  const spans = Array.from(textLayerDiv.querySelectorAll('span'));
  for (const span of spans) {
    const text = span.textContent || '';
    const refs = parseCrossReferences(text);
    if (!refs.length) continue;

    const ref = refs[0];
    const targetDoc = getTargetDocForRef(ref);
    if (!targetDoc) continue;

    span.classList.add('pdf-inline-ref');
    span.title = `Open ${targetDoc.dataset.key}`;
    span.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      await openReferenceTarget(targetDoc, ref, docState);
    });
  }
}

async function renderMainPdfDocument(file, docState, initialPage = null, lookupText = "") {
  const pagesContainer = document.getElementById('pdf-pages');
  if (!pagesContainer) return;

  pagesContainer.innerHTML = '<div class="xref-muted">Rendering PDF pages…</div>';

  try {
    const pdfjs = await ensurePdfJs();
    const loadingTask = pdfjs.getDocument({ url: file, withCredentials: false });
    const pdf = await loadingTask.promise;

    if (!activeDocState || activeDocState.file !== docState.file) return;

    pagesContainer.innerHTML = '';
    const pageLines = [];
    const normalizedLookup = normalizeTaskCode(lookupText || "");
    let bestMatchElement = null;

    for (let i = 1; i <= pdf.numPages; i++) {
      if (!activeDocState || activeDocState.file !== docState.file) return;

      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.25 });
      const pageDiv = document.createElement('div');
      pageDiv.className = 'pdf-page';
      pageDiv.id = `pdf-page-${i}`;
      pageDiv.style.width = `${viewport.width}px`;
      pageDiv.style.height = `${viewport.height}px`;

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { alpha: false });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'pdf-text-layer';

      pageDiv.appendChild(canvas);
      pageDiv.appendChild(textLayerDiv);
      pagesContainer.appendChild(pageDiv);

      await page.render({ canvasContext: context, viewport }).promise;

      const textContent = await page.getTextContent({ normalizeWhitespace: true });
      const line = textContent.items.map(item => item.str || '').join(' ');
      pageLines.push({ page: i, text: line });

      const textLayerTask = pdfjs.renderTextLayer({
        textContent,
        container: textLayerDiv,
        viewport,
        textDivs: []
      });
      if (textLayerTask.promise) {
        await textLayerTask.promise;
      }

      await annotateInlineReferences(textLayerDiv, docState);

      if (normalizedLookup && !bestMatchElement) {
        const spans = Array.from(textLayerDiv.querySelectorAll('span'));
        bestMatchElement = spans.find(span => normalizeTaskCode(span.textContent || '').includes(normalizedLookup)) || null;
      }
    }

    const refs = buildRefsFromPageLines(pageLines);
    renderCrossReferences(refs, docState);

    if (bestMatchElement) {
      bestMatchElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      bestMatchElement.classList.add('pdf-inline-ref-focus');
      setTimeout(() => bestMatchElement.classList.remove('pdf-inline-ref-focus'), 2000);
    } else if (initialPage) {
      const targetEl = document.getElementById(`pdf-page-${initialPage}`);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  } catch (error) {
    pagesContainer.innerHTML = `<div class="xref-muted">Unable to render PDF (${error.message}).</div>`;
    const panel = document.getElementById('cross-ref-panel');
    if (panel) panel.innerHTML = `<span class="xref-muted">Cross-reference scan unavailable (${error.message}).</span>`;
  }
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

    const targetDoc = getTargetDocForRef(ref);

    if (!targetDoc) {
      button.disabled = true;
      button.textContent = `${ref.label} (not found in this manual)`;
    } else {
      button.textContent = `${ref.label} → ${targetDoc.dataset.key}`;
      button.addEventListener('click', async () => {
        if (button.disabled) return;
        button.disabled = true;
        const originalText = button.textContent;
        button.textContent = `${originalText} (opening...)`;
        await openReferenceTarget(targetDoc, ref, docState);
        button.textContent = originalText;
        button.disabled = false;
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
    const refsWithPages = [];

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent({ normalizeWhitespace: true });
      const line = textContent.items.map(item => item.str || '').join(' ');
      mergedText += ` ${line}`;

      const pageRefs = parseCrossReferences(line).map(ref => ({ ...ref, page: i }));
      refsWithPages.push(...pageRefs);
    }

    if (!activeDocState || activeDocState.file !== docState.file) return;

    const refs = parseCrossReferences(mergedText).map(ref => {
      const firstSeen = refsWithPages.find(candidate =>
        candidate.type === ref.type
        && candidate.label === ref.label
      );
      return firstSeen ? { ...ref, page: firstSeen.page } : ref;
    });
    renderCrossReferences(refs, docState);
  } catch (error) {
    panel.innerHTML = `<span class="xref-muted">Cross-reference scan unavailable (${error.message}).</span>`;
  }
}

function renderBackButton() {
  const btn = document.getElementById('xref-back-btn');
  if (!btn) return;

  const splitPane = document.getElementById('split-pane');
  if (splitPane && splitPane.classList.contains('visible')) {
    btn.style.display = 'inline-flex';
    btn.textContent = '← Close split view';
    return;
  }

  btn.textContent = '← Back';
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

    <div id="pdf-workspace">
      <div id="pdf-pages"></div>

      <div id="split-pane">
        <div id="split-pane-header">Referenced: <span id="split-title"></span></div>
        <iframe id="split-pdf-frame" src="about:blank"></iframe>
      </div>
    </div>

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

  const overlay = document.getElementById('pdf-overlay');

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
    if (closeSplitPane()) {
      renderBackButton();
      return;
    }

    const previous = crossRefNavigationStack.pop();
    if (!previous) return;

    const previousDoc = treeContainer.querySelector(`li.doc[data-key="${previous.docKey}"]`);
    openPDF(previous.file, previous.path || previous.title, previousDoc, { page: previous.page || null });
  });

  renderBackButton();
  renderMainPdfDocument(file, activeDocState, options.page || null, options.lookupText || "").finally(() => {
    overlay.classList.add('hidden');
    setTimeout(() => overlay.remove(), 300);
  });
}
