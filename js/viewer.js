const TASK_PATTERN = /\b(?:TASK|SUBTASK)\s+\d{2}[\-−]\d{2}[\-−]\d{2}[\-−]\d{3}[\-−]\d{3}\b/gi;

let taskIndexPromise = null;
let activeTaskLoadToken = 0;

function normalizeTaskCode(taskLabel = '') {
  return taskLabel.replace(/[−–—]/g, '-').replace(/\s+/g, ' ').trim().toUpperCase();
}

function buildPdfLink(file, taskCode, pageNumber) {
  const safeCode = encodeURIComponent(taskCode);
  const page = Number.isFinite(pageNumber) ? pageNumber : 1;
  return `${file}#page=${page}&search=${safeCode}`;
}

function getFileName(file = '') {
  try {
    const path = new URL(file, window.location.origin).pathname;
    return path.split('/').filter(Boolean).pop() || '';
  } catch (_) {
    return file.split('/').filter(Boolean).pop() || '';
  }
}

function parseTaskIndexEntries(entry, defaultFile) {
  if (!entry) return [];

  const taskList = Array.isArray(entry)
    ? entry
    : (Array.isArray(entry.tasks) ? entry.tasks : []);

  return taskList
    .map(item => {
      const label = normalizeTaskCode(item.task || item.label || item.code || '');
      const pageNumber = Number(item.page || item.pageNumber || 1);
      const targetFile = item.targetFile || item.file || entry.file || defaultFile;

      if (!label) return null;

      return {
        label,
        pageNumber: Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1,
        targetFile
      };
    })
    .filter(Boolean);
}

function findTasksInTaskIndex(index, context) {
  if (!index || typeof index !== 'object') return [];

  const documents = index.documents || {};
  const byDocKey = index.by_doc_key || index.byDocKey || {};

  const docKey = context.docKey || '';
  const file = context.file || '';
  const fileName = getFileName(file);

  const candidates = [];

  if (docKey && byDocKey[docKey]) candidates.push(byDocKey[docKey]);
  if (docKey && documents[docKey]) candidates.push(documents[docKey]);
  if (file && documents[file]) candidates.push(documents[file]);
  if (fileName && documents[fileName]) candidates.push(documents[fileName]);

  if (!candidates.length && Array.isArray(documents)) {
    const matchedDoc = documents.find(doc => {
      if (!doc) return false;
      return (
        doc.docKey === docKey ||
        doc.key === docKey ||
        doc.path === file ||
        doc.file === file ||
        getFileName(doc.path || doc.file || '') === fileName
      );
    });
    if (matchedDoc) candidates.push(matchedDoc);
  }

  const dedupe = new Set();
  const matches = [];

  candidates.forEach(candidate => {
    parseTaskIndexEntries(candidate, file).forEach(item => {
      const key = `${item.label}|${item.pageNumber}|${item.targetFile}`;
      if (dedupe.has(key)) return;
      dedupe.add(key);
      matches.push(item);
    });
  });

  matches.sort((a, b) => a.pageNumber - b.pageNumber || a.label.localeCompare(b.label));
  return matches;
}

async function loadTaskIndex() {
  if (taskIndexPromise) return taskIndexPromise;

  taskIndexPromise = fetch('task_index.json', { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`task_index.json not found (${response.status})`);
      return response.json();
    })
    .catch(error => {
      console.warn('Task index unavailable, using runtime PDF scan:', error.message || error);
      return null;
    });

  return taskIndexPromise;
}

async function extractTaskMatches(file) {
  if (!window.pdfjsLib) {
    return [];
  }

  try {
    const loadingTask = pdfjsLib.getDocument(file);
    const pdf = await loadingTask.promise;
    const found = [];
    const dedupe = new Set();

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const text = await page.getTextContent();
      const mergedText = text.items.map(item => item.str).join(' ');
      const matches = mergedText.match(TASK_PATTERN) || [];

      matches.forEach(rawLabel => {
        const taskLabel = normalizeTaskCode(rawLabel);
        const key = `${taskLabel}|${pageNumber}`;
        if (dedupe.has(key)) return;
        dedupe.add(key);

        found.push({
          label: taskLabel,
          pageNumber,
          targetFile: file
        });
      });
    }

    return found;
  } catch (error) {
    console.error('Task extraction failed:', error);
    return [];
  }
}

async function resolveTaskLinks(file, docKey) {
  const index = await loadTaskIndex();
  const indexedMatches = findTasksInTaskIndex(index, { file, docKey });
  if (indexedMatches.length) return indexedMatches;
  return extractTaskMatches(file);
}

function renderTaskLinks(matches) {
  const list = document.getElementById('task-links-list');
  const empty = document.getElementById('task-links-empty');

  if (!list || !empty) return;

  list.innerHTML = '';

  if (!matches.length) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;

  matches.forEach(match => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'task-link-item';
    button.innerHTML = `<strong>${match.label}</strong><span>Page ${match.pageNumber}</span>`;

    button.addEventListener('click', () => {
      openTaskInSplitView(match.targetFile, match.label, match.pageNumber);
    });

    list.appendChild(button);
  });
}

function openTaskInSplitView(file, taskCode, pageNumber) {
  const wrapper = document.getElementById('pdf-view-wrapper');
  const secondaryPanel = document.getElementById('secondary-panel');
  const secondaryTitle = document.getElementById('secondary-task-title');
  const secondaryFrame = document.getElementById('secondary-pdf-frame');

  if (!wrapper || !secondaryPanel || !secondaryTitle || !secondaryFrame) return;

  secondaryTitle.textContent = `${taskCode}`;
  secondaryFrame.src = buildPdfLink(file, taskCode, pageNumber);

  wrapper.classList.add('split-active');
  secondaryPanel.classList.add('open');

  if (document.body.classList.contains('mobile')) {
    secondaryPanel.classList.add('mobile-open');
  }
}

function closeTaskSplitView() {
  const wrapper = document.getElementById('pdf-view-wrapper');
  const secondaryPanel = document.getElementById('secondary-panel');
  const secondaryFrame = document.getElementById('secondary-pdf-frame');

  if (!wrapper || !secondaryPanel || !secondaryFrame) return;

  wrapper.classList.remove('split-active');
  secondaryPanel.classList.remove('open', 'mobile-open');
  secondaryFrame.src = 'about:blank';
}

// --------------------- openPDF function ---------------------
function openPDF(file, title, docLi = null) {
  // Update the viewer area
  viewer.innerHTML = `
    <h2>${title}</h2>
    <div id="task-link-bar">
      <span>Task links in this PDF</span>
      <div id="task-links-list"></div>
      <span id="task-links-empty">No task/subtask patterns detected yet.</span>
    </div>

    <div id="pdf-view-wrapper">
      <iframe
        id="pdf-frame"
        src="${file}"
      ></iframe>

      <aside id="secondary-panel" aria-label="Linked task viewer">
        <div class="secondary-header">
          <button id="close-secondary-panel" type="button" aria-label="Close linked task view">← Back</button>
          <h3 id="secondary-task-title">Linked Task</h3>
        </div>
        <iframe id="secondary-pdf-frame" src="about:blank"></iframe>
      </aside>
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

  const iframe = document.getElementById('pdf-frame');
  const overlay = document.getElementById('pdf-overlay');
  const closeSplitBtn = document.getElementById('close-secondary-panel');
  const taskLoadToken = ++activeTaskLoadToken;

  if (closeSplitBtn) {
    closeSplitBtn.addEventListener('click', closeTaskSplitView);
  }

  // Hide overlay once PDF loads
  iframe.onload = () => {
    overlay.classList.add('hidden');
    setTimeout(() => overlay.remove(), 300);
  };

  resolveTaskLinks(file, docLi?.dataset?.key)
    .then(matches => {
      if (taskLoadToken !== activeTaskLoadToken) return;
      renderTaskLinks(matches);
    })
    .catch(error => {
      console.error('Unable to load task links:', error);
    });

  // --------------------- Highlight selection ---------------------
  treeContainer.querySelectorAll('li.doc').forEach(d => d.classList.remove('selected'));
  if (docLi) docLi.classList.add('selected');

  markParentFolders(docLi); // open parent folders

  // --------------------- Update URL for routing ---------------------
  if (docLi && docLi.dataset.key) {
    const url = new URL(window.location);
    url.searchParams.set('doc', docLi.dataset.key);
    window.history.replaceState({}, '', url);
  }
}
