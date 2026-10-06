function initSearch({ treeContainer, resultsContainer, resultsList, viewer, searchInput, resetBtn }) {

  resetBtn.addEventListener('click', () => {
    condenseAll();
    searchInput.value = '';
    resultsList.innerHTML = '';
    resultsContainer.style.display = 'none';
    resultsContainer.style.opacity = 0;
    treeContainer.scrollTo({ top: 0, behavior: 'smooth' });
  });

  let longPressTimer = null;
  const LONG_PRESS_TIME = 600;

  function fullReset() {
    const url = new URL(window.location);
    url.searchParams.delete('doc');
    window.history.replaceState({}, '', url);
    loadDocument(docSelector.value);
    searchInput.value = '';
    resultsList.innerHTML = '';
    resultsContainer.style.display = 'none';
    resultsContainer.style.opacity = 0;
  }

  resetBtn.addEventListener('dblclick', fullReset);
  resetBtn.addEventListener('touchstart', () => {
    longPressTimer = setTimeout(fullReset, LONG_PRESS_TIME);
  });
  resetBtn.addEventListener('touchend', () => clearTimeout(longPressTimer));
  resetBtn.addEventListener('touchmove', () => clearTimeout(longPressTimer));

  function addResult(label, onClick, snippet = '') {
    const li = document.createElement('li');
    li.innerHTML = label + (snippet ? `<div class="pdf-result-snippet">${escapeHtml(snippet)}</div>` : '');
    li.addEventListener('click', onClick);
    resultsList.appendChild(li);
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
  }

  searchInput.addEventListener('input', () => {
    const term = searchInput.value.trim().toLowerCase();
    resultsList.innerHTML = '';
    if (!term) {
      resultsContainer.style.display = 'none';
      resultsContainer.style.opacity = 0;
      return;
    }

    resultsContainer.style.display = 'block';
    resultsContainer.style.opacity = 1;

    const docs = treeContainer.querySelectorAll('li.doc');
    docs.forEach(doc => {
      const title = doc.dataset.path.toLowerCase();
      if (title.includes(term)) {
        addResult(
          doc.dataset.path.replace(new RegExp(term.replace(/[.*+?^$\\{}()|[\\]\\\\]/g, '\\\\$&'), 'gi'), match => `<mark>${match}</mark>`),
          () => {
            openPDF(doc.dataset.file, doc.dataset.path, doc);
            expandPathToDoc(doc);
          }
        );
      }
    });

    if (window.pdfSearch) {
      const pdfResults = window.pdfSearch.searchPdfText(term);
      pdfResults.forEach(result => {
        addResult(
          `📄 Page ${result.page} — ${escapeHtml(result.title)}`,
          () => window.pdfSearch.openIndexedPage(result.page),
          result.snippet
        );
      });
    }

    if (!resultsList.children.length) {
      addResult('No matches found', () => {});
    }
  });
}