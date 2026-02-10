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
const sidebar = document.getElementById('sidebar');

function closeMobileMenu() {
  if (!sidebar || !document.body.classList.contains('mobile')) return;
  sidebar.classList.remove('open');
  overlay.classList.remove('show');
  if (menuBtn) menuBtn.textContent = '☰';
}

function bindTreeClickHandler() {
  treeContainer.addEventListener('click', (event) => {
    const clickedItem = event.target.closest('li');
    if (!clickedItem || !treeContainer.contains(clickedItem)) return;

    if (clickedItem.classList.contains('doc')) {
      openPDF(clickedItem.dataset.file, clickedItem.dataset.path, clickedItem);
      expandPathToDoc(clickedItem);
      closeMobileMenu();
      return;
    }

    if (clickedItem.classList.contains('folder')) {
      const subtree = clickedItem.querySelector(':scope > ul');
      if (!subtree) return;
      const isOpen = clickedItem.classList.toggle('open');
      subtree.style.display = isOpen ? 'block' : 'none';
    }
  });
}

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
  document.dispatchEvent(new CustomEvent('tree:updated'));

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
  bindTreeClickHandler();

  // Load first document
  loadDocument('AMM');

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
    function openMenu() {
      sidebar.classList.add('open');
      overlay.classList.add('show');
      if (menuBtn) menuBtn.textContent = '✕';
    }

    function toggleMenu() {
      if (sidebar.classList.contains('open')) {
        closeMobileMenu();
      } else {
        openMenu();
      }
    }

    if (menuBtn) menuBtn.addEventListener('click', toggleMenu);
    if (overlay) overlay.addEventListener('click', closeMobileMenu);

    // ----------------- AUTO-OPEN sidebar on first mobile load -----------------
    const docKey = getUrlParam('doc');
    if (!docKey) {
      // Give DOM a moment to render before opening
      requestAnimationFrame(() => {
        openMenu();
      });
    }
  }
});
