function openPDF(file, title, docLi = null) {
  viewer.innerHTML = `
    <h2>${title}</h2>
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

  iframe.onload = () => {
    overlay.classList.add('hidden');
    setTimeout(() => overlay.remove(), 300);
  };

  treeContainer.querySelectorAll('li.doc').forEach(d => d.classList.remove('selected'));
  if (docLi) docLi.classList.add('selected');
  markParentFolders(docLi);

  if (docLi) {
    const url = new URL(window.location);
    url.searchParams.set('doc', docLi.dataset.key || docLi.dataset.path.split(' > ').pop());
    window.history.replaceState({}, '', url);
  }

  if (window.pdfSearch && file) {
    window.pdfSearch.indexPdf(file, title);
  }
}