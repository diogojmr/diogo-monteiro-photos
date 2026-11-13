import {
  removePhoto,
  labels,
  clone,
  safeSource,
  normalizeCatalog,
  normalizeSettings,
  allPhotos,
  movePhoto,
  setHidden,
  updatePhoto,
  addPhoto,
  validateState,
  GitHubStore,
  normalizeReviews,
  decodeReviewLink,
} from './core.mjs';
const $ = s => document.querySelector(s),
  $$ = s => [...document.querySelectorAll(s)];
const escape = s =>
  String(s ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const defaults = {"version": 2, "autoplay": true, "interval": 6, "tagline": {"pt": "Fotografia de desporto em Portugal e Espanha", "es": "Fotografía deportiva en Portugal y España"}, "hero": [{"src": "media/portfolio/karting-2h-318.jpg", "category": "motorsport", "alt": "Karts em pista com fundo arrastado", "alt_es": "Karts en pista con el fondo en barrido", "x": 50, "y": 50, "w": 2160, "h": 1440, "v": [640, 1280]}, {"src": "media/portfolio/1791799653239-hoquei-fotografia-de-hoquei-em-patins-por-diogo-monteir.jpg", "category": "hoquei", "alt": "Jogador de hóquei em patins número 97 em velocidade", "alt_es": "Jugador de hockey sobre patines dorsal 97 a velocidad", "x": 55, "y": 50, "v": [640, 1280], "w": 1800, "h": 1200}, {"src": "media/portfolio/karting-regional-cup-1498.jpg", "category": "motorsport", "alt": "Grande plano de capacete branco e vermelho", "alt_es": "Primer plano de un casco blanco y rojo", "x": 50, "y": 45, "w": 2160, "h": 1440, "v": [640, 1280]}, {"src": "media/portfolio/1791799914624-futsal-fotografia-de-futsal-por-diogo-monteiro.jpg", "category": "futsal", "alt": "Dois jogadores de futsal de amarelo abraçam-se", "alt_es": "Dos jugadores de fútbol sala de amarillo se abrazan", "x": 50, "y": 40, "v": [640, 1280], "w": 1800, "h": 1200}, {"src": "media/portfolio/karting-pkc2-920.jpg", "category": "motorsport", "alt": "Grande plano de piloto com capacete azul e laranja", "alt_es": "Primer plano de piloto con casco azul y naranja", "x": 50, "y": 45, "w": 2048, "h": 1365, "v": [640, 1280]}, {"src": "https://res.cloudinary.com/dejrcqzgb/image/upload/q_auto/f_auto/c_limit,w_1920/v1781263948/juventude-142_sfrka5.jpg", "category": "hoquei", "alt": "Jogador de hóquei em patins de laranja em ação", "alt_es": "Jugador de hockey sobre patines de naranja en acción", "x": 50, "y": 50}], "services": {"karting": {"src": "media/portfolio/karting-sodi-galicia-186.jpg", "alt": "Piloto de fato roxo com o capacete debaixo do braço", "x": 50, "y": 35, "alt_es": "Piloto con mono morado y el casco bajo el brazo", "v": [640, 1280], "w": 1365, "h": 2048}, "hoquei": {"src": "media/portfolio/1791799596980-hoquei-fotografia-de-hoquei-em-patins-por-diogo-monteir.jpg", "alt": "Jogador de hóquei em patins de verde, número 26, de costas", "x": 50, "y": 40, "alt_es": "Jugador de hockey sobre patines de verde, dorsal 26, de espaldas", "v": [640], "w": 1200, "h": 1800}, "futsal": {"src": "media/portfolio/1791799928007-futsal-fotografia-de-futsal-por-diogo-monteiro.jpg", "alt": "Jogador de futsal de amarelo a rematar", "x": 50, "y": 45, "alt_es": "Jugador de fútbol sala de amarillo rematando", "v": [640], "w": 1200, "h": 1800}}};
let catalog,
  base = [],
  settings,
  store = null,
  demo = false,
  dirty = false,
  busy = false,
  editing = null,
  selectedHero = 0;
const selected = new Set(),
  pending = new Map();
let queue = [];
let deletions = []; // repository files to delete in the next publish
let reviews = [];
// a review arrives through the link in the Formspree email: admin.html#avaliacao=...
let incomingReview = decodeReviewLink(location.hash);
if (location.hash.includes('avaliacao=')) history.replaceState(null, '', location.pathname + location.search);
const notify = (text, type = '') => {
  $('#notice').textContent = text;
  $('#notice').className = type;
};
function status() {
  const enabled = !!catalog;
  $('#publish').disabled = !enabled || busy || !dirty || demo;
  $('#draft-state').textContent = dirty ? 'Alterações por publicar' : 'Sem alterações';
  $('#logout').hidden = !enabled;
  $('#mode').textContent = demo ? 'Pré-visualização · sem publicação' : enabled ? 'Ligado ao GitHub' : 'Sem sessão';
  $('#export').disabled = pending.size > 0 || busy;
  $('#prepare').disabled = !queue.length || busy;
  $('#nav-count').textContent = enabled ? allPhotos(catalog, base).length : '—';
}
function mark() {
  dirty = true;
  status();
}
function lock(value) {
  busy = value;
  $('#workspace').inert = value;
  $('#workspace').setAttribute('aria-busy', String(value));
  $$('#confirm-publish,#logout,#login-form button,#demo').forEach(el => (el.disabled = value));
  status();
}
function tab(name) {
  if (!catalog) return;
  $$('.tab').forEach(el => (el.hidden = el.id !== 'tab-' + name));
  $$('.sidebar [data-tab]').forEach(el => el.classList.toggle('current', el.dataset.tab === name));
  $('#page-title').textContent = {
    gallery: 'Fotografias',
    upload: 'Adicionar fotografias',
    hero: 'Destaque inicial',
    content: 'Textos do destaque',
    services: 'Fotografias dos serviços',
    reviews: 'Avaliações',
  }[name];
  if (name === 'reviews') renderReviews();
  if (name === 'services') renderServices();
  if (name === 'hero') renderHero();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function srcFor(src) {
  return pending.get(src)?.url || src;
}
function options() {
  return Object.entries(labels)
    .map(([value, label]) => `<option value="${value}">${escape(label)}</option>`)
    .join('');
}
$$('#upload-category,#edit-category').forEach(el => (el.innerHTML = options()));
$('#filter-category').insertAdjacentHTML('beforeend', options());
function filtered() {
  let photos = allPhotos(catalog, base);
  const q = $('#search').value.toLocaleLowerCase(),
    cat = $('#filter-category').value,
    visible = $('#filter-visibility').value;
  return photos.filter(
    p =>
      (cat === 'all' || p.category === cat) &&
      (visible === 'all' || (visible === 'hidden' ? p.hidden : !p.hidden)) &&
      (!q || [p.alt, p.label, labels[p.category]].join(' ').toLocaleLowerCase().includes(q)),
  );
}
// Re-rendering replaces every button: put keyboard focus back on the same control of the same photo
// (it follows the photo when it moves; if that control is now disabled, another one of the card).
function focusKey() {
  const el = document.activeElement;
  if (!$('#gallery').contains(el)) return null;
  const src = el.dataset.src || el.dataset.select;
  return src ? { src, selector: el.dataset.action ? `[data-action="${el.dataset.action}"]` : '[data-select]' } : null;
}
function restoreFocus(key) {
  if (!key) return;
  const card = $(`#gallery [data-card="${CSS.escape(key.src)}"]`);
  const target = card?.querySelector(key.selector);
  (target && !target.disabled ? target : card?.querySelector('button:not([disabled])'))?.focus();
}
function renderGallery() {
  if (!catalog) return;
  const key = focusKey();
  const all = allPhotos(catalog, base),
    photos = filtered();
  $('#total').textContent = all.length;
  $('#visible').textContent = all.filter(p => !p.hidden).length;
  $('#hero-count').textContent = settings.hero.length;
  $('#selected-count').textContent = selected.size + ' selecionadas';
  $('#select-all').checked = photos.length > 0 && photos.every(p => selected.has(p.src));
  $('#empty').hidden = photos.length > 0;
  $('#gallery').innerHTML = photos
    .map(p => {
      const i = all.findIndex(x => x.src === p.src);
      return `<article class="card" draggable="true" data-card="${escape(p.src)}"><div class="card-image"><img src="${escape(srcFor(p.src))}" loading="lazy" alt="${escape(p.alt || '')}"><label><input type="checkbox" data-select="${escape(p.src)}" ${selected.has(p.src) ? 'checked' : ''} aria-label="Selecionar ${escape(p.alt || p.label)}"></label><div class="badges">${p.hidden ? '<span class="badge hidden">Oculta</span>' : ''}${settings.hero.some(x => x.src === p.src) ? '<span class="badge lime">Destaque</span>' : ''}${pending.has(p.src) ? '<span class="badge">Novo upload</span>' : ''}</div></div><div class="card-body"><div class="card-title">${escape(labels[p.category] || p.label)}</div><div class="card-alt">${escape(p.alt || 'Sem descrição')}</div><div class="card-actions"><button data-action="edit" data-src="${escape(p.src)}">Editar</button><button data-action="hero" data-src="${escape(p.src)}">Destaque</button><button data-action="visibility" data-src="${escape(p.src)}">${p.hidden ? 'Mostrar' : 'Ocultar'}</button><button data-action="delete" class="danger" data-src="${escape(p.src)}" aria-label="Apagar ${escape(p.alt || 'fotografia')}">Apagar</button><button data-action="up" data-src="${escape(p.src)}" aria-label="Mover para cima" ${i === 0 ? 'disabled' : ''}>↑</button><button data-action="down" data-src="${escape(p.src)}" aria-label="Mover para baixo" ${i === all.length - 1 ? 'disabled' : ''}>↓</button><button data-action="first" data-src="${escape(p.src)}" ${i === 0 ? 'disabled' : ''}>Primeiro</button><button data-action="last" data-src="${escape(p.src)}" ${i === all.length - 1 ? 'disabled' : ''}>Último</button></div></div></article>`;
    })
    .join('');
  restoreFocus(key);
  status();
}
function renderContent() {
  for (const lang of ['pt', 'es']) $('#tagline-' + lang).value = settings.tagline[lang] || '';
  $('#hero-autoplay').checked = settings.autoplay !== false;
  $('#hero-interval').value = String(settings.interval);
}
function renderPreview() {
  const photo = settings.hero[selectedHero] || settings.hero[0];
  if (!photo) {
    $('#hero-preview-img').removeAttribute('src');
    return;
  }
  $('#hero-preview-img').src = srcFor(photo.src);
  $('#hero-preview-img').style.objectPosition = photo.x + '% ' + photo.y + '%';
  $('#preview-heading').innerHTML =
    '<span>Diogo</span><span>Monteiro</span><small>' + escape(settings.tagline.pt) + '</small>';
}
function renderHero() {
  selectedHero = Math.max(0, Math.min(selectedHero, settings.hero.length - 1));
  $('#hero-list').innerHTML = settings.hero
    .map(
      (p, i) =>
        `<article class="hero-item ${i === selectedHero ? 'selected' : ''}"><div class="hero-top"><img src="${escape(srcFor(p.src))}" alt="${escape(p.alt)}"><div><p>${escape(p.alt || 'Fotografia de destaque')}</p><button data-hero-action="view" data-index="${i}">Enquadrar</button> <button data-hero-action="up" data-index="${i}" ${i === 0 ? 'disabled' : ''}>Subir</button> <button data-hero-action="down" data-index="${i}" ${i === settings.hero.length - 1 ? 'disabled' : ''}>Descer</button> <button data-hero-action="remove" data-index="${i}" ${settings.hero.length === 1 ? 'disabled' : ''}>Retirar</button></div></div><div class="focal"><label>Horizontal <output>${Math.min(100, Math.max(0, Number(p.x) || 0))}%</output><input data-focal="x" data-index="${i}" type="range" min="0" max="100" value="${Math.min(100, Math.max(0, Number(p.x) || 0))}"></label><label>Vertical <output>${Math.min(100, Math.max(0, Number(p.y) || 0))}%</output><input data-focal="y" data-index="${i}" type="range" min="0" max="100" value="${Math.min(100, Math.max(0, Number(p.y) || 0))}"></label></div></article>`,
    )
    .join('');
  renderPreview();
  $('#hero-count').textContent = settings.hero.length;
}
function addHero(src) {
  if (settings.hero.some(p => p.src === src)) return false;
  if (settings.hero.length >= 12) throw Error('O destaque pode ter no máximo 12 fotografias.');
  const photo = allPhotos(catalog, base).find(p => p.src === src);
  settings.hero.push({
    src,
    category: photo?.category || '',
    alt: photo?.alt || 'Fotografia de desporto',
    ...(photo?.alt_es ? { alt_es: photo.alt_es } : {}),
    ...(photo?.v?.length ? { v: photo.v, w: photo.w, h: photo.h } : {}),
    x: 50,
    y: 50,
  });
  return true;
}
async function getJSON(url, options) {
  const r = await fetch(url, options);
  if (!r.ok) throw Error('Não foi possível carregar ' + url.split('?')[0] + ' (' + r.status + ').');
  return r.json();
}
async function start(preview = false) {
  if (busy) return;
  lock(true);
  try {
    demo = preview;
    if (preview) {
      const result = await Promise.all([
        getJSON('portfolio.json', { cache: 'no-store' }),
        getJSON('portfolio-base.json'),
        getJSON('site-settings.json', { cache: 'no-store' }).catch(() => clone(defaults)),
      ]);
      catalog = normalizeCatalog(result[0]);
      base = result[1];
      settings = normalizeSettings(result[2], defaults);
      reviews = normalizeReviews(await getJSON('reviews.json', { cache: 'no-store' }).catch(() => []));
      store = null;
    } else {
      const token = $('#token').value.trim();
      if (!token) throw Error('Introduz a chave de acesso.');
      store = new GitHubStore(token);
      const result = await store.load(defaults);
      catalog = result.catalog;
      base = result.base;
      settings = result.settings;
      reviews = await store.readReviews();
      $('#token').value = '';
    }
    validateState(catalog, settings);
    dirty = false;
    selected.clear();
    $('#login').hidden = true;
    $('#workspace').hidden = false;
    renderContent();
    renderGallery();
    tab(incomingReview ? 'reviews' : 'gallery');
    notify(
      preview
        ? 'Modo de pré-visualização: podes experimentar o painel. Nada será publicado.'
        : 'Ligação estabelecida. As alterações só entram no site quando publicares.',
    );
  } catch (e) {
    catalog = null;
    store = null;
    demo = false;
    notify(e.message || 'Não foi possível carregar o painel.', 'error');
  } finally {
    lock(false);
  }
}
$('#login-form').addEventListener('submit', e => {
  e.preventDefault();
  start(false);
});
$('#demo').onclick = () => start(true);
$$('[data-tab]').forEach(b => b.addEventListener('click', () => tab(b.dataset.tab)));
['search', 'filter-category', 'filter-visibility'].forEach(id => $('#' + id).addEventListener('input', renderGallery));
$('#select-all').onchange = e => {
  filtered().forEach(p => (e.target.checked ? selected.add(p.src) : selected.delete(p.src)));
  renderGallery();
};
$('#gallery').addEventListener('change', e => {
  if (e.target.dataset.select) {
    e.target.checked ? selected.add(e.target.dataset.select) : selected.delete(e.target.dataset.select);
    renderGallery();
  }
});
$('#gallery').addEventListener('click', e => {
  const b = e.target.closest('[data-action]');
  if (!b || busy) return;
  const src = b.dataset.src,
    action = b.dataset.action,
    all = allPhotos(catalog, base),
    p = all.find(x => x.src === src);
  try {
    if (action === 'edit') {
      editing = src;
      $('#edit-preview').src = srcFor(src);
      $('#edit-category').value = p.category;
      $('#edit-alt').value = p.alt || '';
      $('#edit-alt-es').value = p.alt_es || '';
      $('#edit-dialog').showModal();
      return;
    }
    if (action === 'hero') {
      if (!addHero(src)) return notify('Esta fotografia já está no destaque.');
      notify('Fotografia adicionada ao destaque. Podes ajustar o enquadramento no separador Destaque inicial.');
    }
    if (action === 'visibility') setHidden(catalog, [src], !p.hidden);
    if (action === 'delete') {
      const uploaded = catalog.photos.some(x => (x.src || x.url) === src);
      const msg = uploaded
        ? 'Apagar esta fotografia? Sai do site e o ficheiro é apagado do repositório quando publicares.'
        : 'Retirar esta fotografia do site? (É uma fotografia da lista original: deixa de aparecer, mas o ficheiro não é apagado porque pode ser usado nas páginas de serviço.)';
      if (!confirm(msg)) return;
      deletions.push(...removePhoto(catalog, base, settings, src, pending));
      if (pending.has(src)) { URL.revokeObjectURL(pending.get(src).url); pending.delete(src); }
      selected.delete(src);
      notify('Fotografia retirada do rascunho. Publica para aplicar no site.');
    }
    if (['up', 'down', 'first', 'last'].includes(action)) {
      const i = all.findIndex(p => p.src === src);
      const to = action === 'first' ? 0 : action === 'last' ? all.length - 1 : i + (action === 'up' ? -1 : 1);
      movePhoto(catalog, base, src, to);
      notify(`Fotografia movida para a posição ${Math.max(0, Math.min(to, all.length - 1)) + 1} de ${all.length}.`);
    }
    mark();
    renderGallery();
  } catch (e) {
    notify(e.message, 'error');
  }
});
$('#edit-form').onsubmit = e => {
  e.preventDefault();
  const fields = {
    category: $('#edit-category').value,
    label: labels[$('#edit-category').value],
    alt: $('#edit-alt').value.trim(),
    alt_es: $('#edit-alt-es').value.trim(),
  };
  if (!fields.alt) return notify('Escreve uma descrição para a fotografia.', 'error');
  updatePhoto(catalog, editing, fields);
  settings.hero.forEach(p => {
    if (p.src === editing) {
      p.alt = fields.alt;
      p.category = fields.category;
      if (fields.alt_es) p.alt_es = fields.alt_es;
      else delete p.alt_es;
    }
  });
  mark();
  renderGallery();
  $('#edit-dialog').close();
};
function bulk(hidden) {
  if (!selected.size) return notify('Seleciona primeiro as fotografias.');
  setHidden(catalog, [...selected], hidden);
  mark();
  renderGallery();
}
$('#bulk-hide').onclick = () => bulk(true);
$('#bulk-show').onclick = () => bulk(false);
$('#bulk-hero').onclick = () => {
  try {
    const sources = [...selected].filter(src => !settings.hero.some(p => p.src === src));
    if (settings.hero.length + sources.length > 12) throw Error('Escolhe no máximo 12 imagens para o destaque.');
    sources.forEach(addHero);
    if (sources.length) mark();
    renderGallery();
    notify(sources.length + ' fotografias adicionadas ao destaque.');
  } catch (e) {
    notify(e.message, 'error');
  }
};
function addFiles(files) {
  if (busy) return;
  const accepted = [];
  for (const file of files) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) {
      notify('Alguns ficheiros não foram aceites: usa JPEG, PNG ou WebP até 20 MB.', 'error');
      continue;
    }
    if (queue.length + accepted.length >= 50) {
      notify('O lote pode ter até 50 fotografias.', 'error');
      break;
    }
    accepted.push({ file, url: URL.createObjectURL(file), id: crypto.randomUUID(), alt: '' });
  }
  queue.push(...accepted);
  renderQueue();
}
function renderQueue() {
  $('#queue').innerHTML = queue
    .map(
      p =>
        `<div class="queue-item"><img src="${escape(p.url)}" alt=""><div class="filename">${escape(p.file.name)}<small>${(p.file.size / 1024 / 1024).toFixed(1)} MB</small></div><input data-queue-alt="${p.id}" value="${escape(p.alt)}" placeholder="Descrição desta fotografia (opcional)" aria-label="Descrição de ${escape(p.file.name)}"><button data-queue-remove="${p.id}">Retirar</button></div>`,
    )
    .join('');
  $('#queue-status').textContent = queue.length
    ? queue.length + ' ficheiros selecionados. Revê as descrições antes de preparar.'
    : '';
  status();
}
$('#files').onchange = e => {
  addFiles(e.target.files);
  e.target.value = '';
};
$('#drop').ondragover = e => {
  e.preventDefault();
  $('#drop').classList.add('over');
};
$('#drop').ondragleave = () => $('#drop').classList.remove('over');
$('#drop').ondrop = e => {
  e.preventDefault();
  $('#drop').classList.remove('over');
  addFiles(e.dataTransfer.files);
};
$('#queue').addEventListener('input', e => {
  const p = queue.find(p => p.id === e.target.dataset.queueAlt);
  if (p) p.alt = e.target.value;
});
$('#queue').addEventListener('click', e => {
  const id = e.target.dataset.queueRemove;
  if (id) {
    const p = queue.find(p => p.id === id);
    URL.revokeObjectURL(p.url);
    queue = queue.filter(p => p.id !== id);
    renderQueue();
  }
});
async function optimize(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(Error('Não foi possível preparar a imagem.'))), 'image/jpeg', 0.86),
  );
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(Error('Falha a ler a fotografia.'));
    reader.readAsDataURL(blob);
  });
  // smaller copies for phones and the gallery grid (same names with -640 / -1280)
  const variants = [];
  for (const w of [640, 1280]) {
    if (w >= canvas.width) continue;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = Math.round((canvas.height * w) / canvas.width);
    c.getContext('2d', { alpha: false }).drawImage(canvas, 0, 0, c.width, c.height);
    const b = await new Promise((resolve, reject) => c.toBlob(x => (x ? resolve(x) : reject(Error('Não foi possível preparar a imagem.'))), 'image/jpeg', 0.84));
    const b64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(Error('Falha a ler a fotografia.'));
      reader.readAsDataURL(b);
    });
    variants.push({ w, base64: b64 });
  }
  return { blob, base64, w: canvas.width, h: canvas.height, variants };
}
$('#prepare').onclick = async () => {
  if (!queue.length || busy) return;
  const category = $('#upload-category').value,
    target = $('#upload-target').value;
  if (target !== 'gallery' && settings.hero.length + queue.length > 12)
    return notify('Este lote excede o máximo de 12 imagens do destaque.', 'error');
  lock(true);
  const remaining = [...queue];
  let done = 0;
  try {
    for (const item of [...queue]) {
      $('#queue-status').textContent = 'A preparar ' + (done + 1) + ' de ' + queue.length + '…';
      const result = await optimize(item.file);
      const stem =
        item.file.name
          .replace(/\.[^.]+$/, '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .slice(0, 45) || 'fotografia';
      const src = 'media/portfolio/' + Date.now() + '-' + crypto.randomUUID().slice(0, 8) + '-' + stem + '.jpg';
      const alt = item.alt.trim() || 'Fotografia de ' + labels[category].toLocaleLowerCase() + ' por Diogo Monteiro';
      pending.set(src, { base64: result.base64, variants: result.variants, url: URL.createObjectURL(result.blob) });
      addPhoto(catalog, { src, category, label: labels[category], alt, w: result.w, h: result.h, v: result.variants.map(v => v.w) });
      if (target === 'hero' || target === 'outside') setHidden(catalog, [src], true);
      if (target !== 'gallery') addHero(src);
      URL.revokeObjectURL(item.url);
      remaining.shift();
      done++;
    }
    notify(done + ' fotografias preparadas. Revê a galeria e publica quando estiver tudo pronto.', 'success');
  } catch (e) {
    notify(
      'Foram preparadas ' + done + ' fotografias. ' + e.message + ' Os restantes ficheiros continuam na fila.',
      'error',
    );
  } finally {
    queue = remaining;
    if (done) mark();
    renderQueue();
    renderGallery();
    lock(false);
  }
};
$('#url-form').onsubmit = e => {
  e.preventDefault();
  const src = $('#photo-url').value.trim();
  try {
    if (!src.startsWith('https:') || !safeSource(src)) throw Error('Usa uma ligação de imagem HTTPS.');
    if (allPhotos(catalog, base).some(p => p.src === src)) throw Error('Esta fotografia já está no catálogo.');
    const category = $('#upload-category').value,
      target = $('#upload-target').value;
    if (target !== 'gallery' && settings.hero.length >= 12) throw Error('O destaque já tem 12 imagens.');
    const entry = { src, category, label: labels[category], alt: 'Fotografia de ' + labels[category].toLowerCase() };
    addPhoto(catalog, entry);
    const probe = new Image();
    probe.onload = () => {
      entry.w = probe.naturalWidth;
      entry.h = probe.naturalHeight;
    };
    probe.src = src;
    if (target === 'hero') setHidden(catalog, [src], true);
    if (target !== 'gallery') addHero(src);
    mark();
    renderGallery();
    e.target.reset();
    notify('Ligação adicionada ao rascunho.');
  } catch (e) {
    notify(e.message, 'error');
  }
};
$('#hero-list').addEventListener('click', e => {
  const b = e.target.closest('[data-hero-action]');
  if (!b || busy) return;
  const i = Number(b.dataset.index),
    action = b.dataset.heroAction;
  selectedHero = i;
  if (action === 'view') {
    renderHero();
    return $(`#hero-list [data-hero-action="view"][data-index="${i}"]`)?.focus();
  }
  if (action === 'remove') {
    if (settings.hero.length <= 1) return;
    settings.hero.splice(i, 1);
  }
  if (action === 'up' && i > 0) {
    [settings.hero[i - 1], settings.hero[i]] = [settings.hero[i], settings.hero[i - 1]];
    selectedHero = i - 1;
  }
  if (action === 'down' && i < settings.hero.length - 1) {
    [settings.hero[i + 1], settings.hero[i]] = [settings.hero[i], settings.hero[i + 1]];
    selectedHero = i + 1;
  }
  mark();
  renderHero();
  renderGallery();
  const item = $$('#hero-list .hero-item')[selectedHero];
  const same = item?.querySelector(`[data-hero-action="${action}"]`);
  (same && !same.disabled ? same : item?.querySelector('button:not([disabled])'))?.focus();
});
$('#hero-list').addEventListener('input', e => {
  if (e.target.dataset.focal) {
    const i = Number(e.target.dataset.index);
    selectedHero = i;
    settings.hero[i][e.target.dataset.focal] = Number(e.target.value);
    e.target.closest('label').querySelector('output').textContent = e.target.value + '%';
    mark();
    renderPreview();
  }
});
$('#hero-autoplay').onchange = e => {
  settings.autoplay = e.target.checked;
  mark();
};
$('#hero-interval').onchange = e => {
  settings.interval = Number(e.target.value);
  mark();
};
for (const lang of ['pt', 'es'])
  $('#tagline-' + lang).oninput = e => {
    settings.tagline[lang] = e.target.value;
    mark();
    renderPreview();
  };
$$('[data-close]').forEach(b => (b.onclick = () => b.closest('dialog').close()));
$('#publish').onclick = () => {
  try {
    validateState(catalog, settings);
    $('#publish-summary').textContent =
      allPhotos(catalog, base).filter(p => !p.hidden).length +
      ' fotografias visíveis, ' +
      settings.hero.length +
      ' imagens no destaque e ' +
      pending.size +
      ' novos uploads. As imagens ocultas não serão apagadas.';
    $('#publish-dialog').showModal();
  } catch (e) {
    notify(e.message, 'error');
  }
};
$('#confirm-publish').onclick = async () => {
  if (busy || demo || !store) return;
  $('#publish-dialog').close();
  lock(true);
  notify('A publicar as alterações…');
  try {
    await store.publish(catalog, settings, pending, (n, total) =>
      notify('A enviar fotografias: ' + n + ' de ' + total + '. O site só muda no fim.'),
    deletions);
    deletions = [];
    pending.forEach(p => URL.revokeObjectURL(p.url));
    pending.clear();
    deletions = [];
    dirty = false;
    renderGallery();
    notify('Alterações guardadas no GitHub. O site deverá atualizar dentro de alguns minutos.', 'success');
  } catch (e) {
    notify(e.message + ' O teu rascunho continua neste separador.', 'error');
  } finally {
    lock(false);
  }
};
$('#export').onclick = () => {
  if (pending.size) return notify('Publica os uploads antes de exportar o catálogo.');
  const blob = new Blob([JSON.stringify({ catalog, settings }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = 'djm-catalogo-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('#reload').onclick = async () => {
  if ((dirty || pending.size) && !confirm('Descartar o rascunho e carregar a versão guardada?')) return;
  lock(true);
  try {
    const result = demo
      ? {
          catalog: await getJSON('portfolio.json', { cache: 'no-store' }),
          base: await getJSON('portfolio-base.json'),
          settings: await getJSON('site-settings.json', { cache: 'no-store' }).catch(() => clone(defaults)),
        }
      : await store.load(defaults);
    catalog = normalizeCatalog(result.catalog);
    base = result.base;
    settings = normalizeSettings(result.settings, defaults);
    pending.forEach(p => URL.revokeObjectURL(p.url));
    pending.clear();
    deletions = [];
    selected.clear();
    dirty = false;
    renderContent();
    renderGallery();
    renderHero();
    notify('Versão guardada carregada.');
  } catch (e) {
    notify(e.message, 'error');
  } finally {
    lock(false);
  }
};
$('#logout').onclick = () => {
  if ((dirty || pending.size || queue.length) && !confirm('Terminar sessão e descartar as alterações por publicar?'))
    return;
  dirty = false;
  store = null;
  location.reload();
};
addEventListener('beforeunload', e => {
  if (dirty || pending.size || queue.length) {
    e.preventDefault();
    e.returnValue = '';
  }
});
status();

let dragged = null;
$('#gallery').addEventListener('dragstart', e => {
  const card = e.target.closest('[data-card]');
  if (!card || busy) return;
  dragged = card.dataset.card;
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragged);
});
$('#gallery').addEventListener('dragover', e => {
  if (!dragged) return;
  const card = e.target.closest('[data-card]');
  if (!card) return;
  e.preventDefault();
  $$('.card.drop-before,.card.drop-after').forEach(c => c.classList.remove('drop-before', 'drop-after'));
  const r = card.getBoundingClientRect();
  card.classList.add(e.clientX < r.left + r.width / 2 ? 'drop-before' : 'drop-after');
});
$('#gallery').addEventListener('drop', e => {
  if (!dragged) return;
  e.preventDefault();
  const card = e.target.closest('[data-card]');
  const target = card?.dataset.card;
  const after = card?.classList.contains('drop-after');
  $$('.card').forEach(c => c.classList.remove('drop-before', 'drop-after', 'dragging'));
  if (!target || target === dragged) {
    dragged = null;
    return;
  }
  const order = allPhotos(catalog, base)
    .map(p => p.src)
    .filter(x => x !== dragged);
  const to = order.indexOf(target) + (after ? 1 : 0);
  movePhoto(catalog, base, dragged, to);
  dragged = null;
  mark();
  renderGallery();
});
$('#gallery').addEventListener('dragend', () => {
  dragged = null;
  $$('.card').forEach(c => c.classList.remove('drop-before', 'drop-after', 'dragging'));
});

// ---------- Fotografias dos serviços ----------
const SERVICE_NAMES = { karting: 'Karting e motorsport', hoquei: 'Hóquei em patins', futsal: 'Futsal e outras modalidades' };
let pickingFor = null;
function renderServices() {
  settings.services = settings.services || {};
  $('#services-list').innerHTML = Object.entries(SERVICE_NAMES)
    .map(([key, name]) => {
      const sv = settings.services[key];
      const px = sv ? Math.min(100, Math.max(0, Number(sv.x) || 50)) : 50, py = sv ? Math.min(100, Math.max(0, Number(sv.y) || 50)) : 50;
      const inGallery = sv && allPhotos(catalog, base).some(p => p.src === sv.src && !p.hidden);
      return `<article class="service-slot"><div class="service-thumb">${sv ? `<img src="${escape(srcFor(sv.src))}" alt="${escape(sv.alt || '')}" style="object-position:${px}% ${py}%">` : ''}</div><div><h3>${name}</h3>${inGallery ? '<p class="badge">Também está no portfólio</p>' : ''}<button class="button" data-service-pick="${key}">Escolher fotografia</button><label>Enquadramento vertical <output>${py}%</output><input type="range" min="0" max="100" value="${py}" data-service-y="${key}" ${sv ? '' : 'disabled'}></label></div></article>`;
    })
    .join('');
}
$('#services-list').addEventListener('click', e => {
  const b = e.target.closest('[data-service-pick]');
  if (!b) return;
  pickingFor = b.dataset.servicePick;
  renderPicker();
  $('#service-picker').showModal();
});
$('#services-list').addEventListener('input', e => {
  const r = e.target.closest('[data-service-y]');
  if (!r) return;
  const sv = settings.services[r.dataset.serviceY];
  sv.y = Number(r.value);
  r.previousElementSibling.textContent = r.value + '%';
  r.closest('.service-slot').querySelector('img').style.objectPosition = `${sv.x}% ${sv.y}%`;
  mark();
});
function renderPicker() {
  const outsideOnly = $('#picker-outside').checked;
  const photos = allPhotos(catalog, base).filter(p => !outsideOnly || p.hidden);
  $('#picker-grid').innerHTML = photos
    .map(p => `<button type="button" class="pick" data-pick="${escape(p.src)}"><img src="${escape(srcFor(p.src))}" alt="${escape(p.alt || '')}" loading="lazy">${p.hidden ? '<span class="badge lime">Fora do portfólio</span>' : '<span class="badge">No portfólio</span>'}</button>`)
    .join('') || '<p>Ainda não há fotografias fora do portfólio. Carrega-as com a opção «Fora do portfólio».</p>';
}
$('#picker-outside').addEventListener('change', renderPicker);
$('#picker-grid').addEventListener('click', e => {
  const b = e.target.closest('[data-pick]');
  if (!b || !pickingFor) return;
  const p = allPhotos(catalog, base).find(x => x.src === b.dataset.pick);
  settings.services = settings.services || {};
  settings.services[pickingFor] = {
    src: p.src,
    alt: p.alt || SERVICE_NAMES[pickingFor],
    ...(p.alt_es ? { alt_es: p.alt_es } : {}),
    ...(p.v?.length ? { v: p.v, w: p.w, h: p.h } : {}),
    x: 50,
    y: settings.services[pickingFor]?.y ?? 50,
  };
  $('#service-picker').close();
  mark();
  renderServices();
  notify('Fotografia do serviço escolhida. Publica para aplicar no site.');
});

// ---------------------------------------------------------------- reviews
const SPORT_NAMES = { karting: 'Karting', hoquei: 'Hóquei em patins', futsal: 'Futsal', outro: 'Outra modalidade' };
function reviewCard(r, actions) {
  const meta = [r.team, SPORT_NAMES[r.sport], r.date, r.lang === 'es' ? 'ES' : 'PT'].filter(Boolean).map(escape).join(' · ');
  return `<article class="review-item"><p class="review-item-stars" aria-label="${r.rating} de 5 estrelas">${'★'.repeat(r.rating)}<span>${'★'.repeat(5 - r.rating)}</span></p><blockquote>${escape(r.text)}</blockquote><p class="review-item-meta"><strong>${escape(r.name)}</strong> ${meta}</p><div class="review-item-actions">${actions}</div></article>`;
}
function renderReviews() {
  $('#reviews-badge').hidden = !incomingReview;
  const known = incomingReview && reviews.some(r => r.id === incomingReview.id);
  $('#review-pending').innerHTML = incomingReview
    ? `<h3 class="reviews-subtitle">Por aprovar</h3>${known ? '<p class="help">Esta avaliação já está publicada.</p>' : ''}${reviewCard(incomingReview, known ? '<button class="button" data-review-dismiss>Fechar</button>' : '<button class="button primary" data-review-approve>Publicar no site</button> <button class="button" data-review-dismiss>Rejeitar</button>')}`
    : '';
  $('#reviews-list').innerHTML = reviews.length
    ? reviews
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(r => reviewCard(r, `<button class="button" data-review-remove="${escape(r.id)}">Retirar do site</button>`))
        .join('')
    : '<p class="help">Ainda não há avaliações publicadas.</p>';
}
async function saveReviews(next, message, success) {
  if (busy) return;
  if (demo || !store) return notify('No modo de pré-visualização nada é publicado.', 'error');
  lock(true);
  notify('A guardar no GitHub…');
  try {
    await store.saveReviews(next, message);
    reviews = normalizeReviews(next);
    notify(success, 'success');
    return true;
  } catch (e) {
    notify(e.message, 'error');
    return false;
  } finally {
    lock(false);
    renderReviews();
  }
}
$('#tab-reviews').addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.hasAttribute('data-review-approve') && incomingReview) {
    const ok = await saveReviews([...reviews, incomingReview], 'Publicar avaliação de ' + incomingReview.name, 'Avaliação publicada. Aparece no site dentro de alguns minutos.');
    if (ok) incomingReview = null;
    renderReviews();
  } else if (b.hasAttribute('data-review-dismiss')) {
    incomingReview = null;
    renderReviews();
    notify('Avaliação rejeitada. Não foi publicada.');
  } else if (b.dataset.reviewRemove) {
    const r = reviews.find(x => x.id === b.dataset.reviewRemove);
    if (!r || !confirm('Retirar do site a avaliação de ' + r.name + '?')) return;
    await saveReviews(reviews.filter(x => x !== r), 'Retirar avaliação de ' + r.name, 'Avaliação retirada do site.');
  } else if (b.id === 'copy-review-link' || b.id === 'copy-review-link-es') {
    const url = 'https://diogomonteirophotos.pt/avaliar.html' + (b.id.endsWith('-es') ? '?l=es' : '');
    try {
      await navigator.clipboard.writeText(url);
      notify('Ligação copiada: ' + url, 'success');
    } catch {
      $('#review-link').value = url;
      $('#review-link').select();
      notify('Copia a ligação selecionada.');
    }
  }
});
if (incomingReview) notify('Recebeste uma avaliação para aprovar. Entra para a rever e publicar.');
$('#review-paste').addEventListener('submit', e => {
  e.preventDefault();
  const value = $('#review-paste-url').value.trim();
  const review = decodeReviewLink(value.slice(value.indexOf('#')));
  if (!review) return notify('Essa ligação não tem uma avaliação válida. Copia a ligação completa do email.', 'error');
  incomingReview = review;
  $('#review-paste-url').value = '';
  renderReviews();
  notify('Avaliação carregada. Revê o texto e publica.');
});
