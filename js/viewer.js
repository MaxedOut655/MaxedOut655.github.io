// --------------------- Document viewer helpers ---------------------
function getViewerUrl(file) {
  if (!/\.xlsx?(?:[?#]|$)/i.test(file)) return file;

  const fileUrl = new URL(file, window.location.href);

  // Excel files served by the external manual repository download in browsers.
  // Office for the web renders those public files inside this application's iframe.
  if (fileUrl.origin === window.location.origin) return file;

  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl.href)}`;
}

// --------------------- openPDF function ---------------------
function openPDF(file, title, docLi = null) {
  const viewerUrl = getViewerUrl(file);

  // Update the viewer area
  viewer.innerHTML = `
    <h2>${title}</h2>

    <iframe
      id="pdf-frame"
      src="${viewerUrl}"
      title="${title}"
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

  // --------------------- Update URL for routing ---------------------
  if (docLi && docLi.dataset.key) {
    const url = new URL(window.location);
    url.searchParams.set('doc', docLi.dataset.key);
    url.searchParams.set('manual', document.getElementById('doc-selector').value);
    window.history.replaceState({}, '', url);
  }

}
