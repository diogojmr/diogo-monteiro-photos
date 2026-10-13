const app = document.getElementById('app');
const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const binary = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
let key = null,
  album = null,
  generation = 0,
  query = '',
  onlyFavorites = false,
  faceMatches = null;
const imageCache = new Map();
let faceEngine;
let faceSearch = 0;

function message(value) {
  const toast = document.getElementById('toast');
  toast.textContent = value;
  toast.style.display = 'block';
  clearTimeout(message.timer);
  message.timer = setTimeout(() => (toast.style.display = 'none'), 5000);
}
function favorites() {
  try {
    return new Set(JSON.parse(localStorage.getItem('gallery-favorites-' + album.id) || '[]'));
  } catch {
    return new Set();
  }
}
async function fetchBytes(file) {
  // Files must remain inside this exported gallery, including when metadata is malformed.
  if (!/^(album\.enc|media\/[a-f0-9]{36}\.(preview|original)\.enc)$/.test(file))
    throw new Error('Ficheiro inválido.');
  const response = await fetch('./' + file);
  if (!response.ok) throw new Error('Não foi possível abrir um ficheiro da galeria.');
  return response.arrayBuffer();
}
async function decrypt(record, activeKey = key) {
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: binary(record.iv) },
    activeKey,
    await fetchBytes(record.file),
  );
}
async function preview(photo) {
  if (imageCache.has(photo.id)) return imageCache.get(photo.id);
  const activeGeneration = generation,
    activeKey = key;
  const pending = decrypt(photo.preview, activeKey).then((bytes) => {
    if (activeGeneration !== generation) throw new Error('A sessão foi fechada.');
    return URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
  });
  imageCache.set(photo.id, pending);
  try {
    return await pending;
  } catch (error) {
    imageCache.delete(photo.id);
    throw error;
  }
}
function save(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function visiblePhotos() {
  const saved = favorites();
  return album.photos.filter(
    (photo) =>
      (!faceMatches || faceMatches.includes(photo.id)) &&
      (!onlyFavorites || saved.has(photo.id)) &&
      (!query ||
        `${photo.name} ${photo.team} ${photo.number}`.toLocaleLowerCase('pt-PT').includes(query)),
  );
}
async function renderPhotos() {
  const photos = visiblePhotos(),
    saved = favorites(),
    activeGeneration = generation;
  document.getElementById('photo-count').textContent =
    `${photos.length} ${photos.length === 1 ? 'fotografia' : 'fotografias'}`;
  document.getElementById('photo-grid').innerHTML = photos.length
    ? photos
        .map(
          (photo) => `
    <article class="photo"><button data-open="${photo.id}" aria-label="Ampliar ${escapeHtml(photo.name)}"><img data-photo="${photo.id}" width="${photo.width}" height="${photo.height}" alt="${escapeHtml(photo.name)}" loading="lazy"></button>
    <div class="photo-footer"><span>${escapeHtml([photo.team, photo.number && 'N.º ' + photo.number].filter(Boolean).join(' · ') || photo.name)}</span><div class="actions">
    <button class="icon-button ${saved.has(photo.id) ? 'favorite-on' : ''}" data-favorite="${photo.id}" aria-label="${saved.has(photo.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}" title="Favorito" aria-pressed="${saved.has(photo.id)}">${icon('heart')}</button>
    ${photo.original ? `<button class="icon-button" data-download="${photo.id}" aria-label="Descarregar ${escapeHtml(photo.name)}" title="Descarregar original">${icon('download')}</button>` : ''}</div></div></article>`,
        )
        .join('')
    : '<div class="empty"><h2>Nenhuma fotografia nesta seleção</h2><p>Experimente outro filtro.</p></div>';
  lucide.createIcons();
  // Limit concurrent fetch/decryption to keep larger albums usable on a phone.
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, photos.length) }, async () => {
      while (cursor < photos.length) {
        const photo = photos[cursor++];
        try {
          const url = await preview(photo);
          if (activeGeneration !== generation) return;
          const image = document.querySelector(`img[data-photo="${photo.id}"]`);
          if (image) image.src = url;
        } catch (error) {
          if (activeGeneration === generation) message(error.message);
        }
      }
    }),
  );
}
function render() {
  const mega = album.megaUrl ? new URL(album.megaUrl) : null;
  if (mega && (mega.protocol !== 'https:' || mega.hostname !== 'mega.nz'))
    throw new Error('Ligação de entrega inválida.');
  document.getElementById('lock-gallery').hidden = false;
  app.innerHTML = `<section class="client"><div class="album-heading"><div><p class="eyebrow">${escapeHtml(album.sport)}</p><h1>${escapeHtml(album.title)}</h1><p class="metadata">${album.photos.length} ${album.photos.length === 1 ? 'fotografia' : 'fotografias'}</p></div><div class="actions">
    ${album.includeOriginals ? `<button id="download-selection" class="primary">${icon('download')} Descarregar seleção</button>` : `<a class="primary" href="${escapeHtml(mega.href)}" target="_blank" rel="noopener noreferrer">${icon('external-link')} Abrir originais no MEGA</a>`}</div></div>
    <div class="toolbar"><div class="actions"><button class="secondary" id="favorites" aria-pressed="${onlyFavorites}">${icon('heart')} ${onlyFavorites ? 'Mostrar todas' : 'Favoritos'}</button>${album.facialEnabled ? '<button class="secondary" id="find-me">Encontrar as minhas fotografias</button>' : ''}</div><input id="query" type="search" aria-label="Pesquisar fotografias" placeholder="Equipa, número ou nome" value="${escapeHtml(query)}"><span id="photo-count" class="status"></span></div>
    ${faceMatches ? '<div class="result-bar"><span>Correspondências prováveis</span><button id="clear-face" class="secondary">Ver álbum completo</button></div>' : ''}<div class="photo-grid" id="photo-grid"></div></section>`;
  renderPhotos();
}
document.getElementById('unlock-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target,
    button = form.querySelector('button');
  button.disabled = true;
  const error = document.getElementById('unlock-error');
  error.textContent = 'A abrir a galeria...';
  try {
    if (!crypto.subtle) throw new Error('Abra a galeria através de HTTPS.');
    const response = await fetch('./manifest.json');
    if (!response.ok) throw new Error('Falta o ficheiro da galeria.');
    const manifest = await response.json();
    if (
      manifest.version !== 1 ||
      manifest.iterations !== 250000 ||
      manifest.kdf !== 'PBKDF2-SHA256' ||
      manifest.encryption !== 'AES-256-GCM'
    )
      throw new Error('Formato não suportado.');
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(form.elements.password.value),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    const derived = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: binary(manifest.salt),
        iterations: manifest.iterations,
        hash: 'SHA-256',
      },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
    let decoded;
    try {
      decoded = await decrypt(manifest.album, derived);
    } catch {
      throw new Error('Palavra-passe incorreta ou ficheiro danificado.');
    }
    const parsed = JSON.parse(new TextDecoder().decode(decoded));
    if (!Array.isArray(parsed.photos) || parsed.photos.length > 200)
      throw new Error('Álbum inválido.');
    key = derived;
    album = parsed;
    generation++;
    form.reset();
    render();
  } catch (problem) {
    error.textContent = problem.message;
    button.disabled = false;
  }
});
async function downloadPhoto(photo) {
  if (!photo.original) return;
  const bytes = await decrypt(photo.original);
  save(bytes, photo.name, `image/${photo.format}`);
}
document.addEventListener('input', (event) => {
  if (event.target.id === 'query') {
    query = event.target.value.trim().toLocaleLowerCase('pt-PT');
    renderPhotos();
  }
});
document.addEventListener('click', async (event) => {
  const close = event.target.closest('[data-close]');
  if (close) {
    document.getElementById(close.dataset.close).close();
    return;
  }
  if (!album) return;
  const favorite = event.target.closest('[data-favorite]');
  if (favorite) {
    const saved = favorites();
    saved.has(favorite.dataset.favorite)
      ? saved.delete(favorite.dataset.favorite)
      : saved.add(favorite.dataset.favorite);
    try {
      localStorage.setItem('gallery-favorites-' + album.id, JSON.stringify([...saved]));
    } catch {
      message('Não foi possível guardar os favoritos neste navegador.');
    }
    renderPhotos();
  }
  if (event.target.closest('#favorites')) {
    onlyFavorites = !onlyFavorites;
    render();
  }
  if (event.target.closest('#clear-face')) {
    faceMatches = null;
    render();
  }
  if (event.target.closest('#find-me')) document.getElementById('selfie-dialog').showModal();
  const open = event.target.closest('[data-open]');
  if (open) {
    const photo = album.photos.find((item) => item.id === open.dataset.open);
    try {
      document.getElementById('large-photo').src = await preview(photo);
      document.getElementById('large-photo').alt = photo.name;
      const button = document.getElementById('large-download');
      button.hidden = !photo.original;
      button.dataset.download = photo.id;
      document.getElementById('photo-dialog').showModal();
    } catch (error) {
      message(error.message);
    }
  }
  const download = event.target.closest('[data-download]');
  if (download) {
    download.disabled = true;
    try {
      await downloadPhoto(album.photos.find((photo) => photo.id === download.dataset.download));
    } catch (error) {
      message(error.message);
    } finally {
      download.disabled = false;
    }
  }
  if (event.target.closest('#download-selection')) {
    const button = event.target.closest('button');
    button.disabled = true;
    const photos = visiblePhotos(),
      activeGeneration = generation;
    try {
      if (!photos.length) throw new Error('Escolha fotografias para descarregar.');
      const zip = new JSZip();
      for (const [index, photo] of photos.entries()) {
        if (activeGeneration !== generation) throw new Error('A sessão foi fechada.');
        message(`A preparar ${index + 1}/${photos.length}...`);
        zip.file(
          `${String(index + 1).padStart(3, '0')}-${photo.name}`,
          await decrypt(photo.original),
        );
      }
      save(
        await zip.generateAsync({ type: 'uint8array', compression: 'STORE' }),
        album.title + '.zip',
        'application/zip',
      );
      message('Download preparado.');
    } catch (error) {
      message(error.message);
    } finally {
      button.disabled = false;
    }
  }
});
document.getElementById('lock-gallery').addEventListener('click', () => {
  generation++;
  key = null;
  album = null;
  for (const pending of imageCache.values())
    pending.then((url) => URL.revokeObjectURL(url)).catch(() => {});
  imageCache.clear();
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  document.getElementById('large-photo').removeAttribute('src');
  location.reload();
});
async function engine() {
  if (faceEngine) return faceEngine;
  faceEngine = (async () => {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = './vendor/face-api.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Não foi possível carregar o motor facial.'));
      document.head.append(script);
    });
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('./models'),
      faceapi.nets.faceLandmark68Net.loadFromUri('./models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('./models'),
    ]);
  })();
  try {
    return await faceEngine;
  } catch (error) {
    faceEngine = null;
    throw error;
  }
}
async function descriptors(source) {
  const image = await faceapi.fetchImage(source);
  return faceapi
    .detectAllFaces(
      image,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.5 }),
    )
    .withFaceLandmarks()
    .withFaceDescriptors();
}
document.getElementById('selfie-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target,
    button = form.querySelector('[type=submit]'),
    status = form.querySelector('[role=status]'),
    activeGeneration = generation,
    activeAlbum = album,
    search = ++faceSearch;
  const cancelled = () => search !== faceSearch || activeGeneration !== generation;
  let selfieUrl;
  button.disabled = true;
  try {
    status.textContent = 'A carregar o motor facial...';
    await engine();
    if (cancelled()) return;
    selfieUrl = URL.createObjectURL(form.elements.selfie.files[0]);
    const selfie = await descriptors(selfieUrl);
    if (cancelled()) return;
    if (selfie.length !== 1) throw new Error('Use uma fotografia frontal com apenas o seu rosto.');
    const found = [];
    for (const [index, photo] of activeAlbum.photos.entries()) {
      if (cancelled()) return;
      status.textContent = `A procurar ${index + 1}/${activeAlbum.photos.length}...`;
      const faces = await descriptors(await preview(photo));
      if (cancelled()) return;
      if (
        faces.some(
          (face) => faceapi.euclideanDistance(selfie[0].descriptor, face.descriptor) <= 0.5,
        )
      )
        found.push(photo.id);
    }
    faceMatches = found;
    document.getElementById('selfie-dialog').close();
    render();
    message(`${found.length} correspondências prováveis.`);
  } catch (error) {
    if (!cancelled()) status.textContent = error.message;
  } finally {
    if (selfieUrl) URL.revokeObjectURL(selfieUrl);
    if (!cancelled()) {
      form.reset();
      button.disabled = false;
    }
  }
});
document
  .getElementById('selfie-dialog')
  .addEventListener('close', () => {
    faceSearch++;
    const form = document.getElementById('selfie-form');
    form.reset();
    form.querySelector('[type=submit]').disabled = false;
    form.querySelector('[role=status]').textContent = '';
  });
