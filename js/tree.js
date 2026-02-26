function createTree(node, parentPath = "") {
  const ul = document.createElement('ul');
  for (let child of node.children) {
    const li = document.createElement('li');

    // normalize name to lowercase in a cross-browser-safe way
    const nodeName = (child.tagName || child.nodeName || '').toLowerCase();

    const fullPath = parentPath
      ? parentPath + " > " + (child.getAttribute('title') || '')
      : (child.getAttribute('title') || '');

    if (nodeName === 'folder') {
      li.textContent = child.getAttribute('title') || 'Folder';
      li.classList.add('folder');

      const subtree = createTree(child, fullPath);
      subtree.style.display = 'none';
      li.appendChild(subtree);

      li.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = li.classList.toggle('open');
        subtree.style.display = isOpen ? 'block' : 'none';
      });

    } else if (nodeName === 'doc') {
      li.textContent = child.getAttribute('title') || 'Document';
      li.dataset.file = child.getAttribute('file') || '';
      li.dataset.path = fullPath || li.textContent; // display path
      li.dataset.key = child.getAttribute('key') || ''; // ✅ NEW: unique doc key
      li.classList.add('doc');

      li.addEventListener('click', e => {
        e.stopPropagation();
        openPDF(child.getAttribute('file') || '', li.dataset.path, li);
      });

    } else {
      continue;
    }

    ul.appendChild(li);
  }
  return ul;
}

function updateDocPadding() {
    const docs = treeContainer.querySelectorAll('li.doc');
    docs.forEach(doc => {
        let depth = 0;
        let parent = doc.parentElement;
        while (parent && parent !== treeContainer) {
            if (parent.tagName === 'UL' && parent.parentElement.classList.contains('folder')) {
                depth++;
            }
            parent = parent.parentElement;
        }
        // This inline style will now stick perfectly because 
        // CSS isn't trying to fight it on hover.
        doc.style.paddingLeft = `${20 + depth * 20}px`; 
    });
}
function condenseAll() {
  const folders = treeContainer.querySelectorAll('li.folder');
  folders.forEach(folder => { folder.classList.remove('open'); const subtree = folder.querySelector('ul'); if (subtree) subtree.style.display = 'none'; });
}

function condenseAll() {
  const folders = treeContainer.querySelectorAll('li.folder');
  folders.forEach(folder => { folder.classList.remove('open'); const subtree = folder.querySelector('ul'); if (subtree) subtree.style.display = 'none'; });
}

function expandPathToDoc(docLi) {
  condenseAll();
  let parent = docLi.parentElement;
  while (parent && parent !== treeContainer) {
    if (parent.tagName === 'UL' && parent.parentElement.classList.contains('folder')) {
      const folderLi = parent.parentElement;
      folderLi.classList.add('open');
      const subtree = folderLi.querySelector('ul');
      if (subtree) subtree.style.display = 'block';
    }
    parent = parent.parentElement;
  }
  docLi.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function markParentFolders(docLi) {
  const allFolders = treeContainer.querySelectorAll('li.folder');
  allFolders.forEach(f => f.classList.remove('active'));
  let parent = docLi ? docLi.parentElement : null;
  while (parent && parent !== treeContainer) {
    if (parent.tagName === 'UL' && parent.parentElement.classList.contains('folder')) {
      const folderLi = parent.parentElement;
      folderLi.classList.add('active');
    }
    parent = parent.parentElement;
  }
}
