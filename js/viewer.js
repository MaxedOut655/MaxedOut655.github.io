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

    <div id="pdf-overlay" role="status" aria-live="polite" aria-label="Loading PDF">
      <div class="pdf-loader" aria-hidden="true">
        <div class="pdf-loader__winds">
          <span class="pdf-loader__wind pdf-loader__wind--one"></span>
          <span class="pdf-loader__wind pdf-loader__wind--two"></span>
          <span class="pdf-loader__wind pdf-loader__wind--three"></span>
          <span class="pdf-loader__wind pdf-loader__wind--four"></span>
          <span class="pdf-loader__wind pdf-loader__wind--five"></span>
        </div>
        <svg class="pdf-loader__plane" viewBox="0 0 92 72" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M85.2 34.4 57.7 42l-15.8 20.4c-1.8 2.4-5.4.3-4.3-2.5l8-21.7-28.4-7.1-8.4 6.2-5.2-1.3 6-10.5 10.3-3.5 54.4 7.2c10.2 1.3 11.8 3.5 11 5.2Z" fill="currentColor"/>
          <path d="m19.9 22 11.5-9.7 7.2 1-8.5 10.1" fill="currentColor" opacity=".72"/>
          <circle cx="58.6" cy="33.7" r="2.25" fill="#E8F6FF"/>
        </svg>
      </div>
      <div class="pdf-loader__copy">
        <span class="pdf-loader__eyebrow">Preparing document</span>
        <strong>Loading PDF</strong>
        <span class="pdf-loader__detail">Just a moment while the viewer gets ready.</span>
      </div>
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
