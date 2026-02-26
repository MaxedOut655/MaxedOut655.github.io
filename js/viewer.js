async function openPDF(file, title, docLi = null, highlightText = null) {
  const viewer = document.getElementById("viewer");
  viewer.innerHTML = `<h2>${title}</h2><div id="pdf-container" style="position:relative;"></div>
                      <div id="pdf-overlay">
                        <div style="
                          width:32px;height:32px;
                          border:3px solid #555;
                          border-top-color:#64b5f6;
                          border-radius:50%;
                          animation:spin 1s linear infinite;">
                        </div>
                      </div>`;

  const pdfContainer = document.getElementById("pdf-container");
  const overlay = document.getElementById("pdf-overlay");

  const pdf = await pdfjsLib.getDocument(file).promise;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.4 });

    // Canvas for rendering
    const canvas = document.createElement("canvas");
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    canvas.id = `page-${pageNum}`;
    canvas.style.display = "block";
    canvas.style.margin = "10px auto";
    pdfContainer.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Text layer
    const textContent = await page.getTextContent();
    const textLayerDiv = document.createElement("div");
    textLayerDiv.className = "textLayer";
    textLayerDiv.style.position = "absolute";
    textLayerDiv.style.top = "0";
    textLayerDiv.style.left = "0";
    textLayerDiv.style.height = viewport.height + "px";
    textLayerDiv.style.width = viewport.width + "px";
    pdfContainer.appendChild(textLayerDiv);

    pdfjsLib.renderTextLayer({
      textContent,
      container: textLayerDiv,
      viewport,
      textDivs: []
    }).promise.then(() => {
      // optional: highlight after layer renders
      if (highlightText) {
        highlightTask(highlightText, textLayerDiv, canvas.parentElement);
      }
    });
  }

  overlay.classList.add("hidden");
  setTimeout(() => overlay.remove(), 300);

  // Tree highlighting & URL update (your existing logic)
  treeContainer.querySelectorAll('li.doc').forEach(d => d.classList.remove('selected'));
  if (docLi) docLi.classList.add('selected');
  markParentFolders(docLi);

  if (docLi && docLi.dataset.key) {
    const url = new URL(window.location);
    url.searchParams.set('doc', docLi.dataset.key);
    window.history.replaceState({}, '', url);
  }
}
