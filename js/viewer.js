let activePdfLoad = null;
let activePdfObjectUrl = null;
const PDF_RENDER_SETTLE_DELAY = 1800;

function hidePdfOverlay(overlay) {
  overlay.classList.add('hidden');
  setTimeout(() => overlay.remove(), 300);
}

async function preloadPDF(file, iframe, overlay) {
  const controller = new AbortController();
  activePdfLoad = controller;
  const status = overlay.querySelector('.pdf-loader__detail');
  const progress = overlay.querySelector('.pdf-loader__progress');
  let pdfAssigned = false;

  iframe.onload = () => {
    if (!pdfAssigned) return;

    // Native PDF viewers report iframe load before their first page has painted.
    // Keep the loader up through that rendering handoff to avoid a white flash.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => hidePdfOverlay(overlay), PDF_RENDER_SETTLE_DELAY);
      });
    });
  };

  try {
    const response = await fetch(file, { signal: controller.signal });
    if (!response.ok || !response.body) throw new Error(`PDF request failed: ${response.status}`);

    const totalBytes = Number(response.headers.get('content-length'));
    const reader = response.body.getReader();
    const chunks = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      receivedBytes += value.length;

      if (Number.isFinite(totalBytes) && totalBytes > 0) {
        const percent = Math.min((receivedBytes / totalBytes) * 100, 100);
        progress.style.setProperty('--pdf-progress', `${percent}%`);
        status.textContent = `Downloading document · ${Math.round(percent)}%`;
      } else {
        status.textContent = `Downloading document · ${(receivedBytes / 1024 / 1024).toFixed(1)} MB`;
      }
    }

    if (controller.signal.aborted) return;
    status.textContent = 'Opening document…';
    progress.style.setProperty('--pdf-progress', '100%');
    activePdfObjectUrl = URL.createObjectURL(new Blob(chunks, { type: 'application/pdf' }));
    pdfAssigned = true;
    iframe.src = activePdfObjectUrl;
  } catch (error) {
    if (controller.signal.aborted) return;

    // Keep PDFs usable if a host does not permit cross-origin preloading.
    status.textContent = 'Opening document…';
    pdfAssigned = true;
    iframe.src = file;
  }
}

// --------------------- openPDF function ---------------------
function openPDF(file, title, docLi = null) {
  if (activePdfLoad) activePdfLoad.abort();
  if (activePdfObjectUrl) {
    URL.revokeObjectURL(activePdfObjectUrl);
    activePdfObjectUrl = null;
  }

  // Update the viewer area
  viewer.innerHTML = `
    <h2>${title}</h2>

    <iframe
      id="pdf-frame"
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
        <strong>Downloading PDF</strong>
        <span class="pdf-loader__detail">Connecting to document…</span>
        <span class="pdf-loader__progress" aria-hidden="true"><span></span></span>
      </div>
    </div>
  `;

  const iframe = document.getElementById('pdf-frame');
  const overlay = document.getElementById('pdf-overlay');

  // Download the file before handing it to the browser's PDF viewer so the
  // branded loading screen remains visible instead of a blank viewer.
  void preloadPDF(file, iframe, overlay);

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
