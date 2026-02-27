// --------------------- openPDF function ---------------------
function openPDF(file, title, docLi = null) {
  const docKey = docLi?.dataset?.key || '';
  const docSet = (docKey.match(/^[A-Z]+/) || ['AMM'])[0];

  // Update the viewer area
  viewer.innerHTML = `
    <div class="viewer-header-row">
      <h2>${title}</h2>
      <button id="viewer-pin-btn" class="viewer-pin-btn">📌 Pin for everyone</button>
    </div>

    <iframe
      id="pdf-frame"
      src="${file}"
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

  // Hide overlay once PDF loads
  iframe.onload = () => {
    overlay.classList.add('hidden');
    setTimeout(() => overlay.remove(), 300);
  };

  // --------------------- Highlight selection ---------------------
  treeContainer.querySelectorAll('li.doc').forEach(d => d.classList.remove('selected'));
  if (docLi) docLi.classList.add('selected');

  markParentFolders(docLi); // open parent folders

  if (docLi && docLi.dataset.key) {
    const url = new URL(window.location);
    url.searchParams.set('doc', docLi.dataset.key);
    window.history.replaceState({}, '', url);
  }

  if (window.setCurrentDocContext) {
    window.setCurrentDocContext({
      key: docKey,
      file,
      title,
      path: docLi?.dataset?.path || title,
      docSet
    });
  }

  const pinBtn = document.getElementById('viewer-pin-btn');
  if (pinBtn && window.pinCurrentDocumentForEveryone) {
    pinBtn.addEventListener('click', () => window.pinCurrentDocumentForEveryone());
    if (window.isDocPinned && window.isDocPinned(docKey)) {
      pinBtn.classList.add('active');
      pinBtn.textContent = '📌 Pinned';
    }
  }
}
