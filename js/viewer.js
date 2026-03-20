const PDFJS_CDN_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_CDN_WORKER;
}

let taskIndexPromise = null;
let referencesBySource = null;
let openNavigationStack = [];
let activeRenderToken = 0;
let globalDocIndex = null;

function normalizeManualPath(path) {
  if (!path) return '';

  let normalized = path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  const marker = '/crj200-manual-files/';
  const lower = normalized.toLowerCase();
  const markerIndex = lower.indexOf(marker);

  if (markerIndex >= 0) {
    normalized = normalized.slice(markerIndex + marker.length);
  }

  return normalized.toLowerCase();
}

function loadTaskIndex() {
  if (!taskIndexPromise) {
    taskIndexPromise = fetch('task_index.json', { cache: 'no-store' })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to load task_index.json (${response.status})`);
        }
        return response.json();
      })
      .then(data => {
        const grouped = new Map();
        const refs = Array.isArray(data.references) ? data.references : [];

        refs.forEach(ref => {
          const sourceKey = normalizeManualPath(ref.source_file);
          if (!sourceKey) return;

          if (!grouped.has(sourceKey)) {
            grouped.set(sourceKey, []);
          }
          grouped.get(sourceKey).push(ref);
        });

        referencesBySource = grouped;
        return grouped;
      })
      .catch(error => {
        console.error(error);
        referencesBySource = new Map();
        return referencesBySource;
      });
  }

  return taskIndexPromise;
}

function getReferencesForFile(file) {
  const sourceKey = normalizeManualPath(file);
  return referencesBySource?.get(sourceKey) || [];
}

function buildGlobalDocIndex() {
  if (globalDocIndex) return globalDocIndex;

  const map = new Map();
  const parser = new DOMParser();

  Object.entries(documents || {}).forEach(([manualKey, xmlString]) => {
    const xmlDoc = parser.parseFromString((xmlString || '').trim(), 'text/xml');
    const docNodes = xmlDoc.querySelectorAll('doc');

    docNodes.forEach(node => {
      const file = node.getAttribute('file') || '';
      const title = node.getAttribute('title') || 'Document';
      const key = node.getAttribute('key') || '';
      const normalized = normalizeManualPath(file);
      if (!normalized) return;

      map.set(normalized, {
        file,
        title,
        key,
        manualKey,
        path: `${manualKey} > ${title}`
      });
    });
  });

  globalDocIndex = map;
  return map;
}

function findDocLiByFile(targetFile) {
  const target = normalizeManualPath(targetFile);
  if (!target) return null;

  const docs = treeContainer.querySelectorAll('li.doc');
  for (const doc of docs) {
    if (normalizeManualPath(doc.dataset.file) === target) {
      return doc;
    }
  }

  return null;
}

function resolveDocByFile(targetFile) {
  const inTree = findDocLiByFile(targetFile);
  if (inTree) {
    return {
      file: inTree.dataset.file,
      title: inTree.dataset.path,
      docLi: inTree,
      manualKey: docSelector.value
    };
  }

  const index = buildGlobalDocIndex();
  const fallback = index.get(normalizeManualPath(targetFile));
  if (fallback) {
    return {
      file: fallback.file,
      title: fallback.path,
      docLi: null,
      manualKey: fallback.manualKey
    };
  }

  const normalizedTarget = normalizeManualPath(targetFile);
  const absoluteFallback = normalizedTarget
    ? `https://crj200rvc.github.io/crj200-manual-files/${normalizedTarget}`
    : targetFile;

  return {
    file: absoluteFallback,
    title: targetFile,
    docLi: null,
    manualKey: null
  };
}

function updateSelectedDoc(docLi) {
  treeContainer.querySelectorAll('li.doc').forEach(d => d.classList.remove('selected'));
  if (!docLi) return;

  docLi.classList.add('selected');
  markParentFolders(docLi);
}

function updateUrl(docLi) {
  if (!docLi || !docLi.dataset.key) return;

  const url = new URL(window.location);
  url.searchParams.set('doc', docLi.dataset.key);
  window.history.replaceState({}, '', url);
}

function setViewerLoadingState() {
  const overlay = document.getElementById('pdf-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
  }
}

function hideViewerLoadingState() {
  const overlay = document.getElementById('pdf-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    setTimeout(() => overlay.remove(), 250);
  }
}

function pushNavigationState(ref) {
  const currentViewer = document.getElementById('pdf-viewer-content');
  const currentScrollTop = currentViewer ? currentViewer.scrollTop : 0;

  const sourceDoc = resolveDocByFile(ref.source_file);

  openNavigationStack.push({
    file: sourceDoc.file,
    title: sourceDoc.title || document.querySelector('#viewer h2')?.textContent || 'Document',
    scrollTop: currentScrollTop,
    page: ref.source_page,
    docLi: sourceDoc.docLi,
    manualKey: sourceDoc.manualKey
  });
}

function navigateToReferenceTarget(ref) {
  pushNavigationState(ref);

  const targetDoc = resolveDocByFile(ref.target_file);

  openPDF(
    targetDoc.file,
    targetDoc.title || ref.target_task || ref.target_file,
    targetDoc.docLi,
    {
      initialPage: Number(ref.target_page) + 1,
      fromReference: true,
      targetManualKey: targetDoc.manualKey
    }
  );
}

function buildReferenceButton(ref) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'reference-highlight';
  button.title = `Open ${ref.target_task} (${ref.target_file})`;

  const topPercent = Math.max(0, Math.min(99.5, (Number(ref.source_y_percent) || 0) * 100));
  button.style.top = `${topPercent}%`;

  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    navigateToReferenceTarget(ref);
  });

  return button;
}

function renderReferenceLayer(pageWrapper, refsForPage) {
  const layer = document.createElement('div');
  layer.className = 'reference-layer';

  refsForPage.forEach(ref => {
    layer.appendChild(buildReferenceButton(ref));
  });

  pageWrapper.appendChild(layer);
}

function renderBackButton() {
  const existing = document.getElementById('pdf-back-btn');
  if (existing) existing.remove();

  if (!openNavigationStack.length) return;

  const button = document.createElement('button');
  button.id = 'pdf-back-btn';
  button.type = 'button';
  button.textContent = '← Back to previous reference';

  button.addEventListener('click', () => {
    const previous = openNavigationStack.pop();
    if (!previous) return;

    openPDF(
      previous.docLi ? previous.docLi.dataset.file : previous.file,
      previous.docLi ? previous.docLi.dataset.path : previous.title,
      previous.docLi,
      {
        restoreScrollTop: previous.scrollTop,
        initialPage: Number(previous.page) + 1,
        fromBackNavigation: true,
        targetManualKey: previous.manualKey
      }
    );
  });

  const toolbar = document.getElementById('pdf-toolbar');
  if (toolbar) toolbar.appendChild(button);
}

function buildPageAwareUrl(file, page) {
  if (!page || Number(page) <= 0) return file;
  const safePage = Number(page);
  const hasHash = file.includes('#');
  return `${file}${hasHash ? '&' : '#'}page=${safePage}`;
}

function renderReferenceList(refs) {
  const list = document.getElementById('pdf-reference-list');
  if (!list) return;

  list.innerHTML = '';
  if (!refs.length) {
    const empty = document.createElement('li');
    empty.className = 'reference-item-empty';
    empty.textContent = 'No indexed references on this PDF.';
    list.appendChild(empty);
    return;
  }

  refs.forEach(ref => {
    const item = document.createElement('li');
    item.className = 'reference-item';

    const page = Number(ref.source_page) + 1;
    item.innerHTML = `<span class="reference-meta">Pg ${page}</span><span class="reference-task">${ref.target_task || 'Reference'}</span>`;

    item.addEventListener('click', () => {
      navigateToReferenceTarget(ref);
    });

    list.appendChild(item);
  });
}

function renderIframeFallback(file, options = {}, refs = []) {
  const viewerContent = document.getElementById('pdf-viewer-content');
  if (!viewerContent) return;

  const iframeSrc = buildPageAwareUrl(file, options.initialPage);

  viewerContent.innerHTML = `
    <div id="pdf-fallback-layout">
      <iframe id="pdf-frame" src="${iframeSrc}" style="flex:1;border:none;border-radius:4px;background:#fff;"></iframe>
      <aside id="pdf-reference-sidebar">
        <h4>Indexed References</h4>
        <ul id="pdf-reference-list"></ul>
      </aside>
    </div>
  `;

  const frame = document.getElementById('pdf-frame');
  if (frame) {
    frame.addEventListener('load', hideViewerLoadingState, { once: true });
  } else {
    hideViewerLoadingState();
  }

  renderReferenceList(refs);
}

async function renderPdfIntoViewer(file, refs, options = {}) {
  if (!window.pdfjsLib) {
    throw new Error('PDF.js failed to load.');
  }

  const currentToken = ++activeRenderToken;
  setViewerLoadingState();

  const viewerContent = document.getElementById('pdf-viewer-content');

  const refsByPage = new Map();
  refs.forEach(ref => {
    const page = Number(ref.source_page) || 0;
    if (!refsByPage.has(page)) refsByPage.set(page, []);
    refsByPage.get(page).push(ref);
  });

  const loadingTask = window.pdfjsLib.getDocument({ url: file });
  const pdf = await loadingTask.promise;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    if (currentToken !== activeRenderToken) return;

    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.3 });

    const pageWrapper = document.createElement('div');
    pageWrapper.className = 'pdf-page-wrapper';
    pageWrapper.dataset.pageNumber = String(pageNumber);

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-page-canvas';
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    pageWrapper.style.width = `${canvas.width}px`;
    pageWrapper.style.height = `${canvas.height}px`;

    const ctx = canvas.getContext('2d', { alpha: false });

    await page.render({ canvasContext: ctx, viewport }).promise;

    pageWrapper.appendChild(canvas);

    const pageRefs = refsByPage.get(pageNumber - 1) || [];
    if (pageRefs.length) {
      renderReferenceLayer(pageWrapper, pageRefs);
    }

    viewerContent.appendChild(pageWrapper);
  }

  hideViewerLoadingState();

  if (options.restoreScrollTop != null) {
    viewerContent.scrollTop = options.restoreScrollTop;
    return;
  }

  if (options.initialPage && Number(options.initialPage) > 0) {
    const target = viewerContent.querySelector(`.pdf-page-wrapper[data-page-number="${Number(options.initialPage)}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  }

  viewerContent.scrollTop = 0;
}

// --------------------- openPDF function ---------------------
async function openPDF(file, title, docLi = null, options = {}) {
  viewer.innerHTML = `
    <h2>${title}</h2>
    <div id="pdf-toolbar"></div>
    <div id="pdf-viewer-content"></div>
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


  if (!docLi && options.targetManualKey && options.targetManualKey !== docSelector.value) {
    docSelector.value = options.targetManualKey;
    loadDocument(options.targetManualKey);
    const refreshed = findDocLiByFile(file);
    if (refreshed) {
      openPDF(refreshed.dataset.file, refreshed.dataset.path, refreshed, options);
      return;
    }
  }

  updateSelectedDoc(docLi);
  updateUrl(docLi);
  if (docLi) {
    expandPathToDoc(docLi);
  }

  await loadTaskIndex();
  renderBackButton();

  const refs = getReferencesForFile(file);

  try {
    await renderPdfIntoViewer(file, refs, options);
  } catch (error) {
    console.warn('PDF.js render failed; falling back to iframe mode.', error);
    renderIframeFallback(file, options, refs);
  }
}
