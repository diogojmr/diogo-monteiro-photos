export const labels = {
  motorsport: 'Karting',
  hoquei: 'Hóquei em patins',
  futebol: 'Futebol',
  futsal: 'Futsal',
  volei: 'Voleibol',
  basquetebol: 'Basquetebol',
  atletismo: 'Atletismo',
  outros: 'Outras modalidades',
};
export const clone = value => JSON.parse(JSON.stringify(value));
export function safeSource(src) {
  if (typeof src !== 'string') return false;
  if (src.startsWith('media/portfolio/') && !src.includes('..') && !/[?#\\]/.test(src)) return true;
  try {
    return new URL(src).protocol === 'https:';
  } catch {
    return false;
  }
}
export function normalizeCatalog(data) {
  if (!data || !Array.isArray(data.photos)) throw Error('O catálogo não é válido. Não foi substituído.');
  return {
    ...clone(data),
    galleryOrder: Array.isArray(data.galleryOrder) ? [...data.galleryOrder] : [],
    hiddenSources: Array.isArray(data.hiddenSources) ? [...data.hiddenSources] : [],
    removedSources: Array.isArray(data.removedSources) ? [...data.removedSources] : [],
  };
}
export function allPhotos(catalog, base) {
  const map = new Map();
  [...catalog.photos, ...base].forEach(p => {
    const src = p.src || p.url;
    if (src && !map.has(src)) map.set(src, { ...p, src, category: p.category || p.cat || 'outros' });
  });
  const order = new Map(catalog.galleryOrder.map((s, i) => [s, i]));
  const removed = new Set(catalog.removedSources || []);
  return [...map.values()]
    .filter(p => !removed.has(p.src))
    .sort((a, b) => (order.get(a.src) ?? 1e9) - (order.get(b.src) ?? 1e9))
    .map(p => ({ ...p, ...catalog.overrides?.[p.src], hidden: catalog.hiddenSources.includes(p.src) }));
}
export function movePhoto(catalog, base, src, to) {
  const order = allPhotos(catalog, base).map(p => p.src);
  const index = order.indexOf(src);
  if (index < 0) return;
  order.splice(index, 1);
  order.splice(Math.max(0, Math.min(to, order.length)), 0, src);
  catalog.galleryOrder = order;
}
export function setHidden(catalog, sources, hidden) {
  const values = new Set(catalog.hiddenSources);
  sources.forEach(src => (hidden ? values.add(src) : values.delete(src)));
  catalog.hiddenSources = [...values];
}
// An empty Spanish description removes the override, so the page falls back to the default one
// (before, the old alt_es could never be cleared).
export function updatePhoto(catalog, src, fields) {
  const clean = { category: fields.category, label: fields.label || labels[fields.category], alt: fields.alt };
  const withEs = record => {
    const next = { ...record, ...clean };
    if (fields.alt_es) next.alt_es = fields.alt_es;
    else delete next.alt_es;
    return next;
  };
  catalog.overrides = { ...(catalog.overrides || {}), [src]: withEs(catalog.overrides?.[src]) };
  const i = catalog.photos.findIndex(p => (p.src || p.url) === src);
  if (i >= 0) catalog.photos[i] = withEs(catalog.photos[i]);
}
export function validateState(catalog, settings) {
  normalizeCatalog(catalog);
  if (!Array.isArray(settings.hero) || !settings.hero.length)
    throw Error('Escolhe pelo menos uma fotografia para o destaque.');
  if (settings.hero.length > 12) throw Error('O destaque pode ter no máximo 12 fotografias.');
  for (const p of catalog.photos)
    if (!safeSource(p.src || p.url)) throw Error('Foi encontrada uma ligação de imagem inválida.');
  for (const p of settings.hero) {
    if (!safeSource(p.src)) throw Error('Imagem de destaque inválida.');
    for (const k of ['x', 'y'])
      if (!Number.isFinite(p[k]) || p[k] < 0 || p[k] > 100) throw Error('Enquadramento inválido.');
  }
  for (const [key, sv] of Object.entries(settings.services || {})) {
    if (!['karting', 'hoquei', 'futsal'].includes(key)) throw Error('Serviço desconhecido.');
    if (!safeSource(sv?.src)) throw Error('Fotografia de serviço inválida.');
    for (const k of ['x', 'y'])
      if (!Number.isFinite(sv[k]) || sv[k] < 0 || sv[k] > 100) throw Error('Enquadramento inválido.');
  }
  if (!Number.isFinite(settings.interval) || settings.interval < 4 || settings.interval > 20)
    throw Error('O intervalo deve ser entre 4 e 20 segundos.');
  for (const lang of ['pt', 'es'])
    if (
      typeof settings.tagline?.[lang] !== 'string' ||
      !settings.tagline[lang].trim() ||
      settings.tagline[lang].length > 90
    )
      throw Error('Revê a linha por baixo do nome (PT e ES, até 90 caracteres).');
  return true;
}
// Removes a photo from the site. Returns the repository files to delete in the next commit.
// Uploaded photos (in portfolio.json) are removed with their files. Photos of the base list stay in the
// page HTML and may be used by service pages, so they are only removed from the site (no file deletion).
export function removePhoto(catalog, base, settings, src, pendingUploads = new Map()) {
  for (const [key, sv] of Object.entries(settings.services || {}))
    if (sv?.src === src) throw Error('Esta fotografia está num cartão de serviço. Escolhe outra para o serviço antes de a apagar.');
  const files = [];
  const idx = catalog.photos.findIndex(p => (p.src || p.url) === src);
  if (idx >= 0) {
    const photo = catalog.photos[idx];
    catalog.photos.splice(idx, 1);
    catalog.galleryOrder = catalog.galleryOrder.filter(s => s !== src);
    catalog.hiddenSources = catalog.hiddenSources.filter(s => s !== src);
    if (catalog.overrides) delete catalog.overrides[src];
    if (!pendingUploads.has(src) && src.startsWith('media/portfolio/'))
      files.push(src, ...(photo.v || []).map(w => src.replace(/\.jpg$/i, `-${w}.jpg`)));
  } else if (base.some(p => p.src === src)) {
    if (!catalog.hiddenSources.includes(src)) catalog.hiddenSources.push(src);
    catalog.removedSources = [...new Set([...(catalog.removedSources || []), src])];
  } else throw Error('Fotografia não encontrada.');
  settings.hero = settings.hero.filter(h => h.src !== src);
  return files;
}
export function addPhoto(catalog, photo) {
  if (!safeSource(photo.src)) throw Error('Imagem inválida.');
  if (catalog.photos.some(p => (p.src || p.url) === photo.src)) throw Error('Esta fotografia já existe.');
  catalog.photos.push(photo);
  catalog.galleryOrder.push(photo.src);
}
export function encodeText(value) {
  const bytes = new TextEncoder().encode(value);
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}
export function decodeText(value) {
  return new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, '')), c => c.charCodeAt(0)));
}
export class GitHubStore {
  constructor(token, fetcher = (...args) => globalThis.fetch(...args)) {
    this.token = token;
    this.fetcher = fetcher;
    this.root = 'https://api.github.com/repos/diogojmr/diogo-monteiro-photos';
    this.branch = 'main';
    this.loadedHead = null;
  }
  async request(path, method = 'GET', body) {
    const r = await this.fetcher(this.root + path, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + this.token,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!r.ok) {
      const e = Error(
        r.status === 401
          ? 'Chave inválida ou expirada.'
          : r.status === 403
            ? 'Sem permissão de escrita, ou limite de pedidos atingido.'
            : r.status === 409 || r.status === 422
              ? 'O site foi alterado noutra sessão. Recarrega a base antes de publicar.'
              : 'Não foi possível comunicar com o GitHub (' + r.status + ').',
      );
      e.status = r.status;
      throw e;
    }
    return r.status === 204 ? null : r.json();
  }
  async read(path, optional = false) {
    try {
      const r = await this.request('/contents/' + path + '?ref=' + encodeURIComponent(this.loadedHead || this.branch));
      return JSON.parse(decodeText(r.content));
    } catch (e) {
      if (optional && e.status === 404) return null;
      throw e;
    }
  }
  async load(defaultSettings) {
    const ref = await this.request('/git/ref/heads/' + this.branch);
    this.loadedHead = ref.object.sha;
    const [catalog, base, settings] = await Promise.all([
      this.read('portfolio.json'),
      this.read('portfolio-base.json'),
      this.read('site-settings.json', true),
    ]);
    return { catalog: normalizeCatalog(catalog), base, settings: normalizeSettings(settings, defaultSettings) };
  }
  async publish(catalog, settings, uploads, onProgress = () => {}, deletions = []) {
    validateState(catalog, settings);
    if (!this.loadedHead) throw Error('Entra novamente antes de publicar.');
    const ref = await this.request('/git/ref/heads/' + this.branch);
    if (ref.object.sha !== this.loadedHead)
      throw Error(
        'Existem alterações mais recentes no GitHub. O teu rascunho foi mantido; recarrega a base antes de publicar.',
      );
    const parent = await this.request('/git/commits/' + this.loadedHead);
    if (!parent.tree?.sha) throw Error('Não foi possível verificar a base do site.');
    const tree = [];
    let done = 0;
    const active = new Set([...catalog.photos.map(p => p.src || p.url), ...settings.hero.map(p => p.src)]);
    const files = [...uploads].filter(([path]) => active.has(path));
    for (const [path, entry] of files) {
      for (const [p, b64] of [[path, entry.base64], ...(entry.variants || []).map(v => [path.replace(/\.jpg$/i, `-${v.w}.jpg`), v.base64])]) {
        const blob = await this.request('/git/blobs', 'POST', { content: b64, encoding: 'base64' });
        tree.push({ path: p, mode: '100644', type: 'blob', sha: blob.sha });
      }
      onProgress(++done, files.length);
    }
    // removed photos: delete their files in the same commit (sha null = delete in the Git Data API)
    for (const path of new Set(deletions))
      if (!active.has(path) && path.startsWith('media/portfolio/')) tree.push({ path, mode: '100644', type: 'blob', sha: null });
    for (const [path, value] of [
      ['portfolio.json', catalog],
      ['site-settings.json', settings],
    ])
      tree.push({ path, mode: '100644', type: 'blob', content: JSON.stringify(value, null, 2) + '\n' });
    const newTree = await this.request('/git/trees', 'POST', { base_tree: parent.tree.sha, tree });
    const commit = await this.request('/git/commits', 'POST', {
      message: 'Atualizar galeria e destaque pelo painel de administração',
      tree: newTree.sha,
      parents: [this.loadedHead],
    });
    const check = await this.request('/git/ref/heads/' + this.branch);
    if (check.object.sha !== this.loadedHead)
      throw Error('O site mudou durante o envio. Não substituí a versão mais recente. O rascunho foi mantido.');
    try {
      await this.request('/git/refs/heads/' + this.branch, 'PATCH', { sha: commit.sha, force: false });
    } catch (e) {
      if (e.status === 409 || e.status === 422) throw e;
      try {
        const actual = await this.request('/git/ref/heads/' + this.branch);
        if (actual.object.sha === commit.sha) {
          this.loadedHead = commit.sha;
          return commit.sha;
        }
      } catch {}
      throw Error('Não foi possível confirmar a publicação. Atualiza a base antes de voltar a tentar.');
    }
    this.loadedHead = commit.sha;
    return commit.sha;
  }
}

export function normalizeSettings(value, defaults) {
  const s = { ...clone(defaults), ...clone(value || {}) };
  if (!value?.tagline || typeof value.tagline !== 'object') {
    const h = value?.heading;
    s.tagline =
      h && Array.isArray(h.pt) && Array.isArray(h.es)
        ? { pt: h.pt.filter(Boolean).join(' '), es: h.es.filter(Boolean).join(' ') }
        : clone(defaults.tagline);
  }
  delete s.heading;
  s.version = 2;
  s.interval = Number(s.interval) || 6;
  s.hero = (Array.isArray(s.hero) ? s.hero : []).map(p => ({
    src: p.src,
    category: p.category || '',
    alt: p.alt || '',
    ...(p.alt_es ? { alt_es: p.alt_es } : {}),
    x: Number.isFinite(p.x) ? p.x : 50,
    y: Number.isFinite(p.y) ? p.y : 50,
  }));
  return s;
}
