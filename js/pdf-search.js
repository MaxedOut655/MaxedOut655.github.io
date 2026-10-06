/* Client-side PDF text search. Supports normal PDFs and OCR fallback for scanned pages. */
(() => {
  const PDFJS_VERSION = '4.10.38';
  const TESSERACT_VERSION = '5.1.1';
  let pdfjsPromise = null;
  let tesseractPromise = null;
  let currentIndex = null;
  let indexToken = 0;

  function setStatus(message, state = '') {
    const el = document.getElementById('pdf-search-status');
    if (!el) return;
    el.textContent = message;
    el.dataset.state = state;
  }

  async function loadPdfJs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import(`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`)
        .then(pdfjsLib => {
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
          return pdfjsLib;
        });
    }
    return pdfjsPromise;
  }

  async function loadTesseract() {
    if (!tesseractPromise) {
      tesseractPromise = import(`https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/+esm`);
    }
    return tesseractPromise;
  }

  async function toPdfData(source) {
    if (source instanceof File || source instanceof Blob) return source.arrayBuffer();
    const response = await fetch(source, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Unable to load PDF (${response.status})`);
    return response.arrayBuffer();
  }

  function normalize(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function makeSnippet(text, query) {
    const clean = normalize(text);
    const lower = clean.toLowerCase();
    const q = query.toLowerCase();
    const at = lower.indexOf(q);
    if (at < 0) return clean.slice(0, 220);
    const start = Math.max(0, at - 100);
    const end = Math.min(clean.length, at + q.length + 120);
    return (start ? '…' : '') + clean.slice(start, end) + (end < clean.length ? '…' : '');
  }

  async function ocrPage(pdf, pageNumber, token) {
    const Tesseract = await loadTesseract();
    const worker = await Tesseract.createWorker('eng');
    try {
      if (token !== indexToken) return '';
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.8 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d', { willReadFrequently: true }), viewport }).promise;
      const result = await worker.recognize(canvas);
      return normalize(result.data.text);
    } finally {
      await worker.terminate();
    }
  }

  async function indexPdf(source, title = 'PDF') {
    const token = ++indexToken;
    currentIndex = null;
    setStatus('Loading PDF…', 'loading');

    try {
      const pdfjsLib = await loadPdfJs();
      const data = await toPdfData(source);
      if (token !== indexToken) return;

      const pdf = await pdfjsLib.getDocument({ data }).promise;
      const pages = [];
      let hasText = false;

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        if (token !== indexToken) return;
        setStatus(`Reading page ${pageNumber} of ${pdf.numPages}…`, 'loading');
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = normalize(content.items.map(item => item.str).join(' '));
        pages.push({ page: pageNumber, text });
        if (text) hasText = true;
      }

      if (!hasText && pdf.numPages > 0) {
        setStatus('No text layer found — OCR is scanning this PDF…', 'ocr');
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          if (token !== indexToken) return;
          setStatus(`OCR page ${pageNumber} of ${pdf.numPages}… This may take a while.`, 'ocr');
          pages[pageNumber - 1].text = await ocrPage(pdf, pageNumber, token);
        }
      }

      currentIndex = { title, pages, pageCount: pdf.numPages };
      const searchablePages = pages.filter(p => p.text).length;
      setStatus(
        searchablePages
          ? `Ready — ${searchablePages} page${searchablePages === 1 ? '' : 's'} searchable`
          : 'PDF contains no searchable text',
        searchablePages ? 'ready' : 'empty'
      );
      return currentIndex;
    } catch (error) {
      if (token !== indexToken) return;
      currentIndex = null;
      console.error('PDF search error:', error);
      setStatus(error.message || 'Could not read this PDF', 'error');
    }
  }

  function searchPdfText(query) {
    if (!currentIndex || !query.trim()) return [];
    const q = query.trim().toLowerCase();
    return currentIndex.pages
      .filter(page => page.text.toLowerCase().includes(q))
      .map(page => ({
        page: page.page,
        title: currentIndex.title,
        snippet: makeSnippet(page.text, query),
        file: currentIndex.file || null
      }));
  }

  function openIndexedPage(pageNumber) {
    const iframe = document.getElementById('pdf-frame');
    if (!iframe) return;
    const base = iframe.src.split('#')[0];
    iframe.src = `${base}#page=${pageNumber}&search=${encodeURIComponent(document.getElementById('search')?.value || '')}`;
  }

  async function handlePdfFile(file) {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setStatus('Please choose a PDF file', 'error');
      return;
    }
    currentIndex = null;
    await indexPdf(file, file.name);
    if (currentIndex) currentIndex.file = file;
  }

  window.pdfSearch = { indexPdf, searchPdfText, openIndexedPage, handlePdfFile };

  document.addEventListener('DOMContentLoaded', () => {
    const picker = document.getElementById('pdf-file');
    if (picker) picker.addEventListener('change', event => handlePdfFile(event.target.files[0]));
  });
})();