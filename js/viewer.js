// --------------------- openPDF function ---------------------
function openPDF(file, title, docLi = null) {
  // Update the viewer area
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
  if (docLi) {
    const url = new URL(window.location); // current URL
    const key = docLi.dataset.path.split(' > ').pop(); // last part of path = doc key
    url.searchParams.set('doc', key); // set ?doc=...
    window.history.replaceState({}, '', url); // update browser URL without reload
  }

  // ✅ Update URL using the document key
if (docLi && docLi.dataset.key) {
  const url = new URL(window.location);
  url.searchParams.set('doc', docLi.dataset.key);
  window.history.replaceState({}, '', url);
}

}
