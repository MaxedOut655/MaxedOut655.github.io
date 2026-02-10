function initSearch({ treeContainer, resultsContainer, resultsList, viewer, searchInput, resetBtn }) {
  let searchableDocs = [];

  function buildSearchIndex() {
    searchableDocs = Array.from(treeContainer.querySelectorAll('li.doc')).map((doc) => ({
      element: doc,
      path: doc.dataset.path,
      file: doc.dataset.file,
      pathLower: (doc.dataset.path || '').toLowerCase(),
    }));
  }

  // ---------------- Single click: normal reset ----------------
  resetBtn.addEventListener('click', () => {
    condenseAll();
    searchInput.value = '';
    resultsList.innerHTML = '';
    resultsContainer.style.display = 'none';
    resultsContainer.style.opacity = 0;
    treeContainer.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ---------------- Full reset: double-click (desktop) or long-press (mobile) ----------------
  let longPressTimer = null;
  const LONG_PRESS_TIME = 600; // ms

  function fullReset() {
    // Remove ?doc=... from URL
    const url = new URL(window.location);
    url.searchParams.delete('doc');
    window.history.replaceState({}, '', url);

    // Reload initial document tree for current manual
    loadDocument(docSelector.value);

    // Clear search & results
    searchInput.value = '';
    resultsList.innerHTML = '';
    resultsContainer.style.display = 'none';
    resultsContainer.style.opacity = 0;
  }

  // Desktop double-click
  resetBtn.addEventListener('dblclick', fullReset);

  // Mobile long-press
  resetBtn.addEventListener('touchstart', () => {
    longPressTimer = setTimeout(fullReset, LONG_PRESS_TIME);
  });
  resetBtn.addEventListener('touchend', () => {
    clearTimeout(longPressTimer);
  });
  resetBtn.addEventListener('touchmove', () => {
    clearTimeout(longPressTimer);
  });

  // ---------------- Search ----------------
  searchInput.addEventListener('input', () => {
    const term = searchInput.value.toLowerCase();
    resultsList.innerHTML = '';
    if (!term) {
      resultsContainer.style.display = 'none';
      resultsContainer.style.opacity = 0;
      return;
    }

    const highlightRegex = new RegExp(term, 'gi');
    resultsContainer.style.display = 'block';
    resultsContainer.style.opacity = 1;

    searchableDocs.forEach((doc) => {
      if (doc.pathLower.includes(term)) {
        const li = document.createElement('li');
        li.innerHTML = doc.path.replace(highlightRegex, (match) => `<mark>${match}</mark>`);
        li.addEventListener('click', () => {
          openPDF(doc.file, doc.path, doc.element);
          expandPathToDoc(doc.element);
        });
        resultsList.appendChild(li);
      }
    });
  });

  document.addEventListener('tree:updated', buildSearchIndex);
  buildSearchIndex();
}
