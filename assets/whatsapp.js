// WhatsApp nas páginas de serviço e projeto.
// O número não está no HTML: é guardado invertido em base64 e o endereço wa.me só é
// montado quando alguém aponta, foca ou toca na ligação (os robôs que recolhem números
// a partir do código da página não o encontram).
document.querySelectorAll('a[data-wa]').forEach(link => {
  const arm = () => {
    if (link.dataset.armed) return;
    link.href = 'https://wa.me/' + atob(link.dataset.wa).split('').reverse().join('') + '?text=' + link.dataset.waText;
    link.dataset.armed = '1';
  };
  ['pointerenter', 'pointerdown', 'focus', 'touchstart'].forEach(ev => link.addEventListener(ev, arm, { passive: true }));
  link.addEventListener('click', () => {
    arm();
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'contact_click', { contact_method: 'whatsapp', link_location: document.body.dataset.pageType || 'service_page' });
    }
  });
});

// Fotografias: impede o menu de contexto («Guardar imagem como») e o arrastar.
document.addEventListener('contextmenu', e => { if (e.target.tagName === 'IMG') e.preventDefault(); });
document.addEventListener('dragstart', e => { if (e.target.tagName === 'IMG') e.preventDefault(); });
