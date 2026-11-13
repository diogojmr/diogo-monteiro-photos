/* Diogo Monteiro — página inicial (PT/ES). */
(() => {
  'use strict';
  const data = JSON.parse(document.getElementById('site-data').textContent);
  const { lang, labels, t } = data;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const track = (name, params = {}) => { if (typeof window.gtag === 'function') window.gtag('event', name, params); };
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
  const CLOUD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(?:[^/]+\/)*?(v\d+\/.+)$/;
  const variant = (src, w, q = 'auto') => { const m = CLOUD.exec(src); return m ? `${m[1]}q_${q}/f_auto/c_limit,w_${w}/${m[2]}` : src; };
  const isCloud = src => CLOUD.test(src);
  // Photos in the repository: `v` lists extra widths generated next to the file (x-640.jpg, x-1280.jpg).
  const localSized = (p, w) => p.src.replace(/\.jpg$/i, `-${w}.jpg`);
  const localWidths = p => (Array.isArray(p.v) ? p.v.filter(Number.isFinite) : []);
  const localPick = (p, need) => { const w = localWidths(p).filter(x => x >= need).sort((a, b) => a - b)[0]; return w ? localSized(p, w) : p.src; };
  const localSrcset = p => [...localWidths(p).map(w => `${localSized(p, w)} ${w}w`), ...(p.w ? [`${p.src} ${p.w}w`] : [])].join(', ');
  // Only site-relative uploads or https URLs are accepted from the JSON files.
  const safeSrc = src => {
    if (typeof src !== 'string') return false;
    if (src.startsWith('media/portfolio/')) return !src.includes('..') && !/[?#\\]/.test(src);
    try { return new URL(src).protocol === 'https:'; } catch { return false; }
  };
  const clamp = (n, min, max, fallback) => (Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback);
  const smooth = () => (reduced.matches ? 'auto' : 'smooth');
  const onChange = (mq, fn) => (mq.addEventListener ? mq.addEventListener('change', fn) : mq.addListener(fn)); // Safari < 14

  /* ---------------- header: solid once the hero is behind it ---------------- */
  const header = $('#site-header');
  const hero = $('#hero');
  const setSolid = solid => {
    header.classList.toggle('is-solid', solid);
    header.classList.toggle('is-over-hero', !solid);
  };
  if ('IntersectionObserver' in window) {
    // No scroll listener: the observer fires only when the hero's bottom edge crosses the header.
    let headerIO = null;
    const watchHero = () => {
      headerIO?.disconnect();
      headerIO = new IntersectionObserver(([en]) => setSolid(!en.isIntersecting), { rootMargin: `-${header.offsetHeight + 8}px 0px 0px 0px` });
      headerIO.observe(hero);
    };
    watchHero();
    onChange(matchMedia('(max-width: 640px)'), watchHero); // header height changes at this breakpoint
  } else {
    const paint = () => setSolid(scrollY > hero.offsetHeight - header.offsetHeight - 8);
    addEventListener('scroll', paint, { passive: true });
    paint();
  }

  /* ---------------- dialogs (menu, lightbox): focus trap ---------------- */
  let activeDialog = null;
  let returnFocus = null;
  function openDialog(el, focusEl) {
    returnFocus = document.activeElement;
    el.hidden = false;
    activeDialog = el;
    document.body.classList.add('is-locked');
    (focusEl || el.querySelector('button, a[href]'))?.focus();
  }
  // Returns false if the dialog was already closed. restoreFocus=false lets the caller choose the target.
  function closeDialog(el, restoreFocus = true) {
    if (el.hidden) return false;
    el.hidden = true;
    if (activeDialog === el) activeDialog = null;
    document.body.classList.remove('is-locked');
    if (restoreFocus && returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
    return true;
  }
  function trapTab(e) {
    const items = $$('a[href], button:not([disabled])', activeDialog).filter(x => x.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    const outside = !activeDialog.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || outside)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || outside)) { e.preventDefault(); first.focus(); }
  }

  /* ---------------- mobile menu ---------------- */
  const overlay = $('#nav-overlay');
  const menuBtn = $('#menu-btn');
  const closeMenu = (restoreFocus = true) => { menuBtn.setAttribute('aria-expanded', 'false'); closeDialog(overlay, restoreFocus); };
  menuBtn.addEventListener('click', () => { menuBtn.setAttribute('aria-expanded', 'true'); openDialog(overlay, $('#nav-close-btn')); });
  $('#nav-close-btn').addEventListener('click', () => closeMenu());
  // Section links: close without sending focus back to the menu button, so the page can scroll to the target.
  overlay.addEventListener('click', e => { if (e.target.closest('a[href^="#"]')) closeMenu(false); });
  onChange(matchMedia('(min-width: 960px)'), e => { if (e.matches) closeMenu(false); });

  /* ---------------- hero slideshow ---------------- */
  const slidesEl = $('#hero-slides');
  const dotsEl = $('#hero-dots');
  const caption = $('#hero-caption');
  const pauseBtn = $('#hero-pause');
  const taglines = $$('[data-tagline]');
  let slides = $$('.hero-slide', slidesEl);
  let dots = $$('.hero-dot', dotsEl);
  let current = 0;
  let timer = null;
  let captionTimer = null;
  let paused = reduced.matches;   // reduced motion: start paused (the visitor can still press play)
  let userChose = false;          // once the visitor uses the button, settings no longer override it
  let heroVisible = true;
  let interval = 6000;
  let pageLoaded = document.readyState === 'complete';

  function setTimes() {
    hero.style.setProperty('--slide-time', interval + 'ms');
    hero.style.setProperty('--drift-time', interval + 1600 + 'ms');
  }
  // Slides other than the first are created without src; they load just before they are needed.
  function loadSlide(fig) {
    const img = fig?.querySelector('img');
    const p = fig?._photo;
    if (!img || !p || img.getAttribute('src')) return;
    if (isCloud(p.src)) {
      img.srcset = [960, 1440, 1920, 2560].map(w => `${variant(p.src, w)} ${w}w`).join(', ');
      img.sizes = '100vw';
      img.src = variant(p.src, 1920);
    } else if (localWidths(p).length) {
      img.srcset = localSrcset(p);
      img.sizes = '100vw';
      img.src = localPick(p, 1280);
    } else img.src = p.src;
  }
  const preloadNext = () => { if (slides.length > 1) loadSlide(slides[(current + 1) % slides.length]); };
  function restartBar() {
    const bar = dots[current]?.firstElementChild;
    if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
  }
  function select(index) {
    if (!slides.length) return;
    current = (index + slides.length) % slides.length;
    slides.forEach((s, i) => { s.classList.toggle('is-active', i === current); s.setAttribute('aria-hidden', String(i !== current)); });
    dots.forEach((d, i) => {
      d.classList.toggle('is-active', i === current);
      d.classList.toggle('is-done', i < current);
      d.setAttribute('aria-pressed', String(i === current));
    });
    restartBar();
    loadSlide(slides[current]);
    if (pageLoaded) preloadNext(); // never compete with the first image for bandwidth
    // fade the caption; a newer change cancels a pending one
    const text = labels[slides[current].dataset.category] || '';
    clearTimeout(captionTimer);
    if (caption.textContent === text) { caption.classList.remove('is-changing'); return; }
    caption.classList.add('is-changing');
    captionTimer = setTimeout(() => { caption.textContent = text; caption.classList.remove('is-changing'); }, 300);
  }
  function playing() { return !paused && heroVisible && !document.hidden && slides.length > 1; }
  // restart=false keeps a running cycle, so the timer stays in step with the progress line.
  function schedule(restart = false) {
    const on = playing();
    hero.classList.toggle('is-playing', on);
    pauseBtn.hidden = slides.length < 2;
    pauseBtn.textContent = paused ? pauseBtn.dataset.play : pauseBtn.dataset.pause;
    if (!on) { clearTimeout(timer); timer = null; return; }
    if (timer && !restart) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; select(current + 1); schedule(); }, interval);
  }
  dotsEl.addEventListener('click', e => {
    const d = e.target.closest('.hero-dot');
    if (d) { select(Number(d.dataset.slide)); schedule(true); }
  });
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    userChose = true;
    schedule(true);
  });
  document.addEventListener('visibilitychange', () => schedule());
  onChange(reduced, () => { if (reduced.matches) paused = true; schedule(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { heroVisible = entry.isIntersecting; schedule(); }, { threshold: 0.15 }).observe(hero);
  }
  addEventListener('load', () => { pageLoaded = true; preloadNext(); }, { once: true });

  function newSlide() {
    const fig = document.createElement('figure');
    fig.className = 'hero-slide';
    const img = document.createElement('img');
    img.decoding = 'async';
    fig.append(img);
    return fig;
  }
  // Brings the slides in line with site-settings.json. Slides already in the page are reused,
  // so the first image is never downloaded twice; only alt/category/framing are refreshed.
  // Service cards: photos chosen in the admin (site-settings.json -> services).
  function applyServices(services) {
    if (!services || typeof services !== 'object') return;
    $$('img[data-service]').forEach(img => {
      const sv = services[img.dataset.service];
      if (!sv || !safeSrc(sv.src)) return;
      const pos = `${Number.isFinite(sv.x) ? sv.x : 50}% ${Number.isFinite(sv.y) ? sv.y : 50}%`;
      img.style.objectPosition = pos;
      img.alt = (lang === 'es' && sv.alt_es) || sv.alt || img.alt;
      const current = img.getAttribute('src') || '';
      if (current === sv.src || current === localPick(sv, 1280) || current.includes(sv.src.split('/').pop().replace(/\.jpg$/i, ''))) return;
      if (isCloud(sv.src)) { img.removeAttribute('srcset'); img.src = variant(sv.src, 900); }
      else if (localWidths(sv).length) { img.srcset = localSrcset(sv); img.src = localPick(sv, 1280); }
      else { img.removeAttribute('srcset'); img.src = sv.src; }
    });
  }
  function applySettings(s) {
    applyServices(s?.services);
    if (!s || typeof s !== 'object') return;
    const n = Number(s.interval);
    const nextInterval = clamp(n, 4, 20, 6) * 1000;
    const timingChanged = nextInterval !== interval;
    interval = nextInterval;
    setTimes();
    if (!userChose) paused = s.autoplay === false || reduced.matches;
    const tagline = s.tagline?.[lang];
    if (typeof tagline === 'string' && tagline.trim()) taglines.forEach(el => { el.textContent = tagline; });
    const list = Array.isArray(s.hero) ? s.hero.filter(p => p && safeSrc(p.src)).slice(0, 12) : [];
    if (!list.length) return;

    const activeSrc = slides[current]?.dataset.photo;
    const pool = new Map();
    slides.forEach(f => { if (!pool.has(f.dataset.photo)) pool.set(f.dataset.photo, f); });
    const figs = list.map(p => {
      const fig = pool.get(p.src) || newSlide();
      pool.delete(p.src);
      fig._photo = p;
      fig.dataset.photo = p.src;
      fig.dataset.category = p.category || '';
      const img = fig.querySelector('img');
      img.alt = (lang === 'es' && p.alt_es) || p.alt || '';
      img.style.objectPosition = `${clamp(p.x, 0, 100, 50)}% ${clamp(p.y, 0, 100, 50)}%`;
      return fig;
    });
    const sameOrder = figs.length === slides.length && figs.every((f, i) => f === slides[i]);
    if (!sameOrder) {
      slidesEl.replaceChildren(...figs);
      slides = figs;
    }
    // dots are rebuilt only if their labels change (the page already has them for the built-in list)
    const dotLabels = list.map((p, i) => `${labels[p.category] || ''} – ${i + 1} ${t.of} ${list.length}`);
    if (dots.length !== list.length || dots.some((d, i) => d.getAttribute('aria-label') !== dotLabels[i])) {
      dots = dotLabels.map((label, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'hero-dot';
        b.dataset.slide = String(i);
        b.setAttribute('aria-label', label);
        b.append(document.createElement('span'));
        return b;
      });
      dotsEl.replaceChildren(...dots);
    }
    const keep = slides.findIndex(f => f.dataset.photo === activeSrc);
    select(keep < 0 ? 0 : keep);
    schedule(!sameOrder || timingChanged);
  }
  applySettings(data.settings);
  if (!data.preview) {
    fetch('site-settings.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null))
      .then(applySettings)
      .catch(() => {});
  }

  /* ---------------- gallery (static: no motion) ---------------- */
  const grid = $('#gallery-grid');
  const pagination = $('#pagination');
  const filterButtons = $$('.filter-btn');
  let photos = data.static.map(p => ({ ...p }));
  let filter = 'todos';
  let page = 1;
  let lastLayoutKey = '';
  let catalogSettled = false;
  let pagePhotos = [];

  function layout() {
    const w = innerWidth;
    if (w >= 1200) return { target: 340, max: 5, rows: 4 };
    if (w >= 900) return { target: 290, max: 4, rows: 4 };
    if (w >= 600) return { target: 230, max: 3, rows: 5 };
    return { target: 150, max: 2, rows: 7 };
  }
  // Content width and gap of the grid, read from CSS so the rows always fill the line exactly.
  function measure() {
    const cs = getComputedStyle(grid);
    const width = grid.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const gap = parseFloat(cs.rowGap) || 6;
    const cfg = layout();
    return { cfg, width, gap, key: `${Math.round(width)}|${gap}|${cfg.target}|${cfg.max}|${cfg.rows}` };
  }
  const ratioOf = p => (p.w && p.h ? p.w / p.h : p._ratio || 1.5);
  function probe(p) {
    return new Promise(resolve => {
      const img = new Image();
      const done = r => { clearTimeout(to); img.onload = img.onerror = null; p._ratio = r; resolve(); };
      const to = setTimeout(() => done(1.5), 5000);
      img.onload = () => done(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1.5);
      img.onerror = () => done(1.5);
      img.src = variant(p.src, 64, 'auto:low');
    });
  }
  function visible() { return filter === 'todos' ? photos : photos.filter(p => p.cat === filter); }
  // Justified rows: fill each line up to cfg.max photos; the last row keeps the target height.
  function buildRows(list, { width, gap, cfg }) {
    const rows = [];
    let items = [], sum = 0;
    const close = loose => {
      const avail = width - gap * (items.length - 1);
      let height = Math.round(avail / sum);
      if (loose) height = Math.min(cfg.target, height);
      const widths = items.map(p => Math.round(height * ratioOf(p)));
      if (!loose) widths[widths.length - 1] += avail - widths.reduce((a, b) => a + b, 0);
      rows.push({ height, items: items.map((p, i) => ({ p, w: widths[i] })) });
      items = []; sum = 0;
    };
    list.forEach(p => {
      items.push(p);
      sum += ratioOf(p);
      if (sum * cfg.target + gap * (items.length - 1) >= width || items.length >= cfg.max) close(false);
    });
    if (items.length) close(true);
    return rows;
  }
  function pageButtons(total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const set = new Set([1, total, page - 1, page, page + 1]);
    if (page <= 3) [2, 3, 4].forEach(n => set.add(n));
    if (page >= total - 2) [total - 1, total - 2, total - 3].forEach(n => set.add(n));
    const nums = [...set].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
    const out = [];
    nums.forEach((n, i) => { if (i && n - nums[i - 1] > 1) out.push('gap'); out.push(n); });
    return out;
  }
  const CLOUD_WIDTHS = [480, 800, 1200, 1600];
  function card(p, w, h, i, dpr) {
    const alt = esc(p.alt);
    let src = p.src, set = '';
    if (isCloud(p.src)) {
      const need = Math.ceil(w * dpr);
      src = variant(p.src, CLOUD_WIDTHS.find(x => x >= need) || 1600);
      set = ` srcset="${CLOUD_WIDTHS.map(x => `${esc(variant(p.src, x))} ${x}w`).join(', ')}" sizes="${w}px"`;
    } else if (localWidths(p).length) {
      src = localPick(p, Math.ceil(w * dpr));
      set = ` srcset="${esc(localSrcset(p))}" sizes="${w}px"`;
    }
    return `<button class="photo-card" type="button" data-index="${i}" style="width:${w}px;height:${h}px" aria-label="${esc(t.open_photo)}: ${alt}"><img src="${esc(src)}"${set} alt="${alt}" width="${w}" height="${h}" loading="lazy" decoding="async"></button>`;
  }
  const ICON_PREV = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  const ICON_NEXT = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
  function render() {
    const m = measure();
    lastLayoutKey = m.key;
    const list = visible();
    const rows = buildRows(list, m);
    const total = Math.max(1, Math.ceil(rows.length / m.cfg.rows));
    page = Math.min(Math.max(1, page), total);
    const first = (page - 1) * m.cfg.rows;
    let index = rows.slice(0, first).reduce((n, r) => n + r.items.length, 0);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    grid.innerHTML = rows.slice(first, first + m.cfg.rows)
      .map(row => `<div class="gallery-row" style="height:${row.height}px">${row.items.map(({ p, w }) => card(p, w, row.height, index++, dpr)).join('')}</div>`)
      .join('');
    grid.classList.add('is-ready');
    pagePhotos = list;
    if (total <= 1) { pagination.innerHTML = ''; return; }
    const btn = (n, label, extra = '') => `<button class="page-btn" type="button" data-page="${n}" aria-label="${esc(label)}"${extra}>`;
    let h = page > 1 ? `${btn(page - 1, t.prev_page)}${ICON_PREV}</button>` : '';
    pageButtons(total).forEach(n => {
      h += n === 'gap' ? '<span class="page-gap" aria-hidden="true">…</span>'
        : `${btn(n, `${t.page} ${n}`, n === page ? ' aria-current="page"' : '')}${n}</button>`;
    });
    if (page < total) h += `${btn(page + 1, t.next_page)}${ICON_NEXT}</button>`;
    pagination.innerHTML = h;
  }
  grid.addEventListener('click', e => {
    const c = e.target.closest('.photo-card');
    if (c) openLightbox(Number(c.dataset.index));
  });
  pagination.addEventListener('click', e => {
    const b = e.target.closest('[data-page]');
    if (!b) return;
    page = Number(b.dataset.page);
    render();
    $('#gallery-section').scrollIntoView({ behavior: smooth() });
    pagination.querySelector('[aria-current]')?.focus({ preventScroll: true });
  });
  function updateFilters() {
    const cats = new Set(photos.map(p => p.cat));
    if (filter !== 'todos' && !cats.has(filter)) filter = 'todos';
    filterButtons.forEach(b => {
      b.hidden = b.dataset.filter !== 'todos' && !cats.has(b.dataset.filter);
      const on = b.dataset.filter === filter;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }
  filterButtons.forEach(b => b.addEventListener('click', () => {
    if (filter === b.dataset.filter) return;
    filter = b.dataset.filter;
    page = 1;
    updateFilters();
    track('gallery_filter', { gallery_category: filter });
    render();
  }));
  // Re-layout only when the usable width (or the breakpoint) really changed; mobile browsers
  // fire resize when the address bar hides, which only changes the height.
  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (grid.classList.contains('is-ready') && measure().key !== lastLayoutKey) render(); }, 150);
  });

  function mergeCatalog(payload) {
    const records = Array.isArray(payload) ? payload : (payload?.photos || []);
    const staticSources = new Set(data.static.map(p => p.src));
    const extra = records.map(r => {
      const src = r.src || r.url;
      if (!safeSrc(src) || staticSources.has(src)) return null;
      return { src, cat: r.category || r.cat || 'outros', alt: (lang === 'es' && r.alt_es) || r.alt || '', w: Number(r.w) || 0, h: Number(r.h) || 0, v: Array.isArray(r.v) ? r.v : [] };
    }).filter(Boolean);
    const hidden = new Set([...(payload?.hiddenSources || []), ...(payload?.removedSources || [])]);
    const overrides = payload?.overrides || {};
    let list = [...extra, ...data.static.map(p => ({ ...p }))].filter(p => !hidden.has(p.src)).map(p => {
      const o = overrides[p.src] || {};
      const alt = lang === 'es' ? (o.alt_es || p.alt) : (o.alt || p.alt);
      return { ...p, alt, cat: o.category || p.cat };
    });
    const order = Array.isArray(payload?.galleryOrder) ? payload.galleryOrder : null;
    if (order) {
      const pos = new Map(order.map((s, i) => [s, i]));
      list = list.map((p, i) => [p, i]).sort((a, b) => ((pos.get(a[0].src) ?? order.length) - (pos.get(b[0].src) ?? order.length)) || a[1] - b[1]).map(x => x[0]);
    }
    return list;
  }
  async function loadCatalog() {
    let payload = null;
    try {
      if (data.preview) payload = data.catalog;
      else {
        // the query string changes every minute: fresh after a publish, cacheable within the minute
        const r = await fetch(`portfolio.json?v=${Math.floor(Date.now() / 60000)}`);
        if (r.ok) payload = await r.json();
      }
    } catch { /* keep the static list */ }
    if (payload) photos = mergeCatalog(payload);
    const missing = photos.filter(p => !(p.w && p.h));
    if (missing.length) await Promise.all(missing.map(probe));
    catalogSettled = true;
    updateFilters();
    render();
  }
  updateFilters();
  // Show the static list straight away only if the catalog is slow; otherwise render once, in the final order.
  setTimeout(() => { if (!catalogSettled) render(); }, 1200);
  loadCatalog();

  /* ---------------- lightbox ---------------- */
  const box = $('#lightbox');
  const boxImg = $('#lightbox-img');
  const closeBtn = $('#lightbox-close');
  const prevBtn = $('#lightbox-prev');
  const nextBtn = $('#lightbox-next');
  let boxList = [];   // snapshot taken on open: a late catalog/filter update cannot shift the photos under the visitor
  let boxIndex = 0;
  // Smallest Cloudinary size that covers the space the photo can take on this screen.
  function large(p) {
    const ratio = ratioOf(p);
    const fit = Math.min(innerWidth, innerHeight * ratio) * Math.min(devicePixelRatio || 1, 2);
    if (!isCloud(p.src)) return localPick(p, fit);
    return variant(p.src, [1200, 1800, 2400].find(w => w >= fit) || 2400);
  }
  boxImg.addEventListener('load', () => boxImg.classList.remove('is-loading'));
  boxImg.addEventListener('error', () => boxImg.classList.remove('is-loading'));
  let loadToken = 0;
  function fitBox(p) {
    const phone = innerWidth <= 640;
    const availW = innerWidth - (phone ? 0 : 160);
    const availH = innerHeight - (phone ? 150 : 120);
    const r = ratioOf(p);
    const w = Math.min(availW, availH * r);
    boxImg.style.width = Math.round(w) + 'px';
    boxImg.style.height = Math.round(w / r) + 'px';
  }
  addEventListener('resize', () => { if (!box.hidden && boxList[boxIndex]) fitBox(boxList[boxIndex]); });
  function showPhoto(i) {
    const p = boxList[i];
    if (!p) return;
    boxIndex = i;
    // Give the image its final on-screen size first, so the small cached version is shown at full
    // size (slightly soft) instead of small, and the large one only sharpens it.
    fitBox(p);
    // Show the version already cached by the grid at once, then swap to the large one when it has loaded.
    const src = large(p);
    const token = ++loadToken;
    if (boxImg.dataset.full !== src) {
      boxImg.classList.remove('is-loading');
      boxImg.src = isCloud(p.src) ? variant(p.src, 800) : localPick(p, 640);
      boxImg.dataset.full = '';
      const full = new Image();
      full.onload = () => { if (token === loadToken) { boxImg.src = src; boxImg.dataset.full = src; } };
      full.src = src;
    }
    boxImg.alt = p.alt || '';
    $('#lightbox-label').textContent = labels[p.cat] || '';
    $('#lightbox-count').textContent = `${i + 1} / ${boxList.length}`;
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === boxList.length - 1;
    // a button that becomes disabled drops focus to <body>: keep it inside the dialog
    const f = document.activeElement;
    if (!box.hidden && (f === document.body || f?.disabled)) (!prevBtn.disabled ? prevBtn : !nextBtn.disabled ? nextBtn : closeBtn).focus();
    [i + 1, i - 1, i + 2].forEach(n => { const q = boxList[n]; if (q) new Image().src = large(q); });
  }
  function openLightbox(i) {
    boxList = pagePhotos;
    showPhoto(i);
    openDialog(box, closeBtn);
    track('photo_open', { gallery_category: filter });
  }
  function closeLightbox() {
    if (!closeDialog(box, false)) return;
    // go to the gallery page of the last photo seen and focus it (scrolls into view if needed)
    const photo = boxList[boxIndex];
    const i = pagePhotos.indexOf(photo);
    if (i < 0) { returnFocus?.focus({ preventScroll: true }); return; }
    const m = measure();
    const rows = buildRows(pagePhotos, m);
    let count = 0, rowIndex = 0;
    for (; rowIndex < rows.length; rowIndex++) { count += rows[rowIndex].items.length; if (count > i) break; }
    const target = Math.floor(rowIndex / m.cfg.rows) + 1;
    if (target !== page) { page = target; render(); }
    grid.querySelector(`[data-index="${i}"]`)?.focus();
  }
  closeBtn.addEventListener('click', closeLightbox);
  $('#lightbox-backdrop').addEventListener('click', closeLightbox);
  prevBtn.addEventListener('click', () => showPhoto(boxIndex - 1));
  nextBtn.addEventListener('click', () => showPhoto(boxIndex + 1));
  let touch = null;
  box.addEventListener('touchstart', e => { touch = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
  box.addEventListener('touchend', e => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) showPhoto(boxIndex + (dx < 0 ? 1 : -1));
  }, { passive: true });

  /* ---------------- keyboard: one listener for both dialogs ---------------- */
  document.addEventListener('keydown', e => {
    if (!activeDialog) return;
    if (e.key === 'Tab') return trapTab(e);
    if (e.key === 'Escape') return activeDialog === box ? closeLightbox() : closeMenu();
    if (activeDialog !== box) return;
    if (e.key === 'ArrowLeft') showPhoto(boxIndex - 1);
    if (e.key === 'ArrowRight') showPhoto(boxIndex + 1);
  });

  /* ---------------- section transitions ---------------- */
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reduced.matches) {
    const io = new IntersectionObserver(entries => entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    }), { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach(el => io.observe(el));
  } else reveals.forEach(el => el.classList.add('is-in'));

  /* ---------------- analytics (same event names and parameters as before; one delegated listener) ---------------- */
  document.addEventListener('click', e => {
    const intent = e.target.closest('[data-contact-intent]');
    if (intent) track('contact_intent', { contact_method: 'form', link_location: intent.dataset.contactIntent });
    const a = e.target.closest('a[href]');
    if (!a) return;
    if (a.dataset.whatsapp !== undefined) track('contact_click', { contact_method: 'whatsapp', link_location: a.closest('footer') ? 'footer' : 'contact' });
    const href = a.getAttribute('href');
    if (href.startsWith('mailto:')) track('contact_click', { contact_method: 'email', link_location: 'site' });
    if (href.includes('instagram.com')) track('social_click', { social_network: 'instagram', link_location: 'site' });
    if (a.matches('.detail-links a, .project-strip')) {
      track('select_content', { content_type: href.includes('projeto-') ? 'project' : 'service', item_id: href.replace('.html', '') });
    }
  });

  // WhatsApp: the number is not in the HTML; build the wa.me address only on interaction.
  $$('a[data-wa]').forEach(a => {
    const arm = () => {
      if (a.dataset.armed) return;
      a.href = 'https://wa.me/' + atob(a.dataset.wa).split('').reverse().join('') + '?text=' + a.dataset.waText;
      a.dataset.armed = '1';
    };
    ['pointerenter', 'pointerdown', 'focus', 'touchstart'].forEach(ev => a.addEventListener(ev, arm, { passive: true }));
  });
  // "Pedir orçamento": after scrolling, put the cursor in the first field (desktop only, so phones don't pop the keyboard).
  $$('a[href="#contact-section"]:not([data-wa])').forEach(a => a.addEventListener('click', () => {
    if (!matchMedia('(pointer: fine)').matches) return;
    setTimeout(() => $('#nome')?.focus({ preventScroll: true }), reduced.matches ? 0 : 700);
  }));

  // Photos: no context menu ("Save image as") or dragging. A deterrent only: it cannot stop screenshots.
  document.addEventListener('contextmenu', e => { if (e.target.tagName === 'IMG') e.preventDefault(); });
  document.addEventListener('dragstart', e => { if (e.target.tagName === 'IMG') e.preventDefault(); });

  /* ---------------- contact form (Formspree) ---------------- */
  const form = $('#contact-form');
  const params = new URLSearchParams(location.search);
  const setLeadPage = () => { $('#lead-page').value = params.get('origem') || location.pathname || '/'; };
  setLeadPage();
  [['lead-utm-source', 'utm_source'], ['lead-utm-medium', 'utm_medium'], ['lead-utm-campaign', 'utm_campaign']]
    .forEach(([id, key]) => { $('#' + id).value = params.get(key) || ''; });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const button = $('.form-submit', form);
    const ok = $('#form-success'), err = $('#form-error'), pre = $('#form-preview');
    [ok, err, pre].forEach(x => { x.hidden = true; });
    if (!form.checkValidity()) { form.reportValidity(); return; }
    if (data.preview) { pre.hidden = false; return; }
    const label = button.innerHTML;
    button.disabled = true;
    button.textContent = button.dataset.sending;
    try {
      const res = await fetch(form.action, { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(form) });
      if (!res.ok) throw new Error(String(res.status));
      ok.hidden = false;
      track('generate_lead', { lead_source: 'contact_form' });
      form.reset();
      setLeadPage();
      button.textContent = button.dataset.sent;
      setTimeout(() => { button.innerHTML = label; button.disabled = false; }, 4000);
    } catch {
      err.hidden = false;
      button.innerHTML = label;
      button.disabled = false;
    }
  });
})();
