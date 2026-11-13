(() => {
  const T = {
    es: {
      title: 'Deja tu opinión',
      intro: 'Gracias por confiar en mi trabajo. Tu opinión ayuda a otros clubes y pilotos a conocer las fotografías. Una vez aprobada, puede aparecer en la web.',
      name: 'Nombre', team: 'Club, equipo o empresa (opcional)', sport: 'Modalidad',
      hoquei: 'Hockey sobre patines', futsal: 'Fútbol sala', other: 'Otra', rating: 'Valoración', text: 'Comentario',
      consent: 'Autorizo que mi nombre, club y comentario se publiquen en la web diogomonteirophotos.pt.',
      send: 'Enviar opinión', sending: 'A enviar…', missing: 'Rellena el nombre y el comentario y acepta la publicación.',
      fail: 'No se pudo enviar. Inténtalo de nuevo dentro de unos minutos.',
      done: '¡Gracias! He recibido tu opinión. La publicaré en la web después de revisarla.',
      htmlLang: 'es', docTitle: 'Dejar opinión | Diogo Monteiro',
    },
    pt: {
      sending: 'A enviar…', missing: 'Preenche o nome e o comentário e aceita a publicação.',
      fail: 'Não foi possível enviar. Tenta novamente dentro de alguns minutos.',
      done: 'Obrigado! Recebi a tua avaliação. Vou publicá-la no site depois de a rever.',
      htmlLang: 'pt-PT',
    },
  };
  const lang = new URLSearchParams(location.search).get('l') === 'es' ? 'es' : 'pt';
  const t = T[lang];
  document.querySelectorAll(`.review-lang a[data-l="${lang}"]`).forEach(a => a.setAttribute('aria-current', 'page'));
  if (lang === 'es') {
    document.documentElement.lang = t.htmlLang;
    document.title = t.docTitle;
    document.querySelectorAll('[data-t]').forEach(el => {
      if (t[el.dataset.t]) el.textContent = t[el.dataset.t];
    });
  }
  const form = document.getElementById('review-form');
  const status = document.getElementById('review-status');
  const text = document.getElementById('r-text');
  const count = document.getElementById('r-count');
  text.addEventListener('input', () => (count.textContent = text.value.length + '/600'));

  const b64url = obj => {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = '';
    bytes.forEach(b => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('r-name').value.trim();
    const team = document.getElementById('r-team').value.trim();
    const comment = text.value.trim();
    if (!name || !comment || !document.getElementById('r-consent').checked) {
      status.className = 'error';
      status.textContent = t.missing;
      return;
    }
    const review = {
      name: name.slice(0, 60),
      team: team.slice(0, 60),
      sport: document.getElementById('r-sport').value,
      rating: Number(form.querySelector('input[name=Estrelas]:checked')?.value || 5),
      text: comment.slice(0, 600),
      lang,
      date: new Date().toISOString().slice(0, 10),
    };
    document.getElementById('approve-link').value = location.origin + '/admin.html#avaliacao=' + b64url(review);
    form.querySelector('[name=_subject]').value = 'Nova avaliação de ' + review.name;
    const button = form.querySelector('button[type=submit]');
    const label = button.textContent;
    button.disabled = true;
    button.textContent = t.sending;
    status.className = '';
    status.textContent = '';
    try {
      const res = await fetch(form.action, { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(form) });
      if (!res.ok) throw Error(res.status);
      const done = document.createElement('p');
      done.className = 'review-done';
      done.textContent = t.done;
      form.replaceWith(done);
      if (typeof window.gtag === 'function') window.gtag('event', 'review_submit', { rating: review.rating, sport: review.sport });
    } catch {
      status.className = 'error';
      status.textContent = t.fail;
      button.disabled = false;
      button.textContent = label;
    }
  });
})();
