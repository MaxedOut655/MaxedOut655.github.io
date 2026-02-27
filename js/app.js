// --------------------- Grab DOM elements ---------------------
const treeContainer = document.getElementById('tree-container');
const resultsContainer = document.getElementById('results-container');
const resultsList = document.getElementById('results-list');
const viewer = document.getElementById('viewer');
const searchInput = document.getElementById('search');
const resetBtn = document.getElementById('reset-btn');
const docSelector = document.getElementById('doc-selector');
const menuBtn = document.getElementById('menu-btn');
const overlay = document.getElementById('menu-overlay');
const pinnedMenuBtn = document.getElementById('pinned-menu-btn');
const pinnedPanel = document.getElementById('pinned-panel');
const pinnedList = document.getElementById('pinned-list');
const toastStack = document.getElementById('toast-stack');

let currentDocContext = null;
const pinnedDocs = new Map();
let pinFeed = null;
const sessionId = Math.random().toString(36).slice(2);

// --------------------- URL Routing ---------------------
function getUrlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function loadFromURL() {
  const docKey = getUrlParam('doc'); // e.g., ?doc=AMM05-20-00
  if (!docKey) return;

  const docLi = treeContainer.querySelector(`li[data-key="${docKey}"]`);
  if (docLi) {
    expandPathToDoc(docLi);
    openPDF(docLi.dataset.file, docLi.dataset.path, docLi);
  }
}

function setCurrentDocContext(context) {
  currentDocContext = context;
}

function isDocPinned(docKey) {
  return pinnedDocs.has(docKey);
}

function showToast(message) {
  if (!toastStack) return;
  const toast = document.createElement('div');
  toast.className = 'toast-item';
  toast.textContent = message;
  toastStack.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

function togglePinnedPanel(forceOpen = null) {
  if (!pinnedPanel) return;
  const willOpen = forceOpen === null ? !pinnedPanel.classList.contains('open') : forceOpen;
  pinnedPanel.classList.toggle('open', willOpen);
}

function updatePinnedMarkerInTree() {
  treeContainer.querySelectorAll('li.doc').forEach(li => {
    li.classList.toggle('is-pinned', pinnedDocs.has(li.dataset.key));
  });

  const pinBtn = document.getElementById('viewer-pin-btn');
  if (pinBtn && currentDocContext?.key) {
    const pinned = pinnedDocs.has(currentDocContext.key);
    pinBtn.classList.toggle('active', pinned);
    pinBtn.textContent = pinned ? '📌 Pinned' : '📌 Pin for everyone';
  }
}

function renderPinnedList() {
  if (!pinnedList) return;
  pinnedList.innerHTML = '';

  const docs = [...pinnedDocs.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (!docs.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No pinned files yet.';
    pinnedList.appendChild(li);
    return;
  }

  for (const doc of docs) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="pin-dot">📌</span><span class="pin-title">${doc.title}</span>`;
    li.addEventListener('click', () => openPinnedDocument(doc));
    pinnedList.appendChild(li);
  }
}

function openPinnedDocument(doc) {
  if (docSelector.value !== doc.docSet) {
    docSelector.value = doc.docSet;
    loadDocument(doc.docSet);
    requestAnimationFrame(() => {
      const docLi = treeContainer.querySelector(`li[data-key="${doc.key}"]`);
      if (docLi) {
        expandPathToDoc(docLi);
        openPDF(docLi.dataset.file, docLi.dataset.path, docLi);
      }
    });
    return;
  }

  const docLi = treeContainer.querySelector(`li[data-key="${doc.key}"]`);
  if (docLi) {
    expandPathToDoc(docLi);
    openPDF(docLi.dataset.file, docLi.dataset.path, docLi);
  }
}

function pushPinUpdate(payload) {
  if (!pinFeed) return;
  pinFeed.get(payload.key).put(payload);
}

function pinCurrentDocumentForEveryone() {
  if (!currentDocContext || !currentDocContext.key) return;

  if (isDocPinned(currentDocContext.key)) {
    pushPinUpdate({
      key: currentDocContext.key,
      status: 'unpinned',
      updatedAt: Date.now(),
      updatedBy: sessionId
    });
    return;
  }

  pushPinUpdate({
    ...currentDocContext,
    status: 'pinned',
    updatedAt: Date.now(),
    updatedBy: sessionId
  });

  togglePinnedPanel(true);
}

function initPinSync() {
  if (!window.Gun) {
    console.warn('Gun realtime script missing; falling back to local-only pin state.');
    showToast('⚠️ Realtime pin sync unavailable right now');
    return;
  }

  const peers = [
    'https://gun-manhattan.herokuapp.com/gun',
    'https://gunjs.herokuapp.com/gun',
    'https://peer.wallie.io/gun',
    'https://gun-us.herokuapp.com/gun'
  ];

  const gun = window.Gun({
    peers,
    localStorage: false,
    retry: 1500
  });

  let connectedToRelay = false;
  gun.on('hi', () => {
    if (connectedToRelay) return;
    connectedToRelay = true;
    showToast('✅ Realtime sync connected');
  });

  setTimeout(() => {
    if (!connectedToRelay) {
      showToast('⚠️ Realtime relay offline. Pinning may not sync for others.');
    }
  }, 5000);

  pinFeed = gun.get('crj200-manual-v2').get('pinned-docs');

  pinFeed.map().on((data, key) => {
    if (!data || data.status === 'unpinned') {
      pinnedDocs.delete(key);
      renderPinnedList();
      updatePinnedMarkerInTree();
      return;
    }

    pinnedDocs.set(key, {
      key: data.key || key,
      title: data.title || key,
      file: data.file || '',
      path: data.path || data.title || key,
      docSet: data.docSet || 'AMM',
      updatedAt: data.updatedAt || 0
    });

    renderPinnedList();
    updatePinnedMarkerInTree();

    if (data.updatedBy !== sessionId) {
      showToast(`📌 ${data.title || key} was pinned`);
      togglePinnedPanel(true);
    }
  });
}

// --------------------- Load a document tree ---------------------
function loadDocument(key) {
  const parser = new DOMParser();
  const xmlString = documents[key];
  const xmlDoc = parser.parseFromString(xmlString.trim(), "text/xml");

  treeContainer.innerHTML = '';
  resultsList.innerHTML = '';
  resultsContainer.style.display = 'none';
  resultsContainer.style.opacity = 0;
  viewer.innerHTML = `<h2>Select a document</h2>`;

  // Create tree
  const treeRoot = createTree(xmlDoc.documentElement);
  treeContainer.appendChild(treeRoot);
  updateDocPadding();
  updatePinnedMarkerInTree();

  // ----------------- Reattach mobile doc click listeners -----------------
  if (document.body.classList.contains('mobile')) {
    treeContainer.querySelectorAll('li.doc').forEach(li => {
      li.addEventListener('click', () => {
        openPDF(li.dataset.file, li.dataset.path, li);
        expandPathToDoc(li);

        // Close sidebar after tap
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
        if (menuBtn) menuBtn.textContent = '☰';
      });
    });
  }

  // ----------------- Load document from URL after DOM painted -----------------
  requestAnimationFrame(() => {
    loadFromURL();
  });
}

// --------------------- Handle document switching ---------------------
docSelector.addEventListener('change', () => {
  loadDocument(docSelector.value);
});

// --------------------- Initialize everything ---------------------
document.addEventListener('DOMContentLoaded', () => {
  // Load first document
  loadDocument('AMM');

  initPinSync();

  if (pinnedMenuBtn) {
    pinnedMenuBtn.addEventListener('click', () => togglePinnedPanel());
  }

  // --------------------- Initialize search/reset ---------------------
  setTimeout(() => {
    initSearch({
      treeContainer,
      resultsContainer,
      resultsList,
      viewer,
      searchInput,
      resetBtn
    });
  }, 50); // tiny delay fixes first-load double-click issues

  // --------------------- Optional: register Service Worker for PWA ---------------------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(() => console.log('Service Worker registered'))
        .catch(console.error);
    });
  }

  // --------------------- Mobile detection ---------------------
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    document.body.classList.add('mobile');
  }

  // --------------------- Mobile sidebar toggle & auto-open ---------------------
  if (document.body.classList.contains('mobile')) {
    const sidebar = document.getElementById('sidebar');

    function openMenu() {
      sidebar.classList.add('open');
      overlay.classList.add('show');
      if (menuBtn) menuBtn.textContent = '✕';
    }

    function closeMenu() {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
      if (menuBtn) menuBtn.textContent = '☰';
    }

    function toggleMenu() {
      if (sidebar.classList.contains('open')) {
        closeMenu();
      } else {
        openMenu();
      }
    }

    if (menuBtn) menuBtn.addEventListener('click', toggleMenu);
    if (overlay) overlay.addEventListener('click', closeMenu);

    // Close sidebar when tapping a document (also handled in loadDocument)
    sidebar.querySelectorAll('li.doc').forEach(li => {
      li.addEventListener('click', closeMenu);
    });

    // ----------------- AUTO-OPEN sidebar on first mobile load -----------------
    const docKey = getUrlParam('doc');
    if (!docKey) {
      requestAnimationFrame(() => {
        openMenu();
      });
    }
  }
});

window.setCurrentDocContext = setCurrentDocContext;
window.pinCurrentDocumentForEveryone = pinCurrentDocumentForEveryone;
window.isDocPinned = isDocPinned;
