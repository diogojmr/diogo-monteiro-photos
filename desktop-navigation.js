(() => {
  const desktop = window.matchMedia('(min-width: 960px)');
  const services = document.querySelector('.desktop-services');
  const phone = document.querySelector('[name="telemovel"]');

  function updateLayout() {
    if (phone) phone.disabled = !desktop.matches;
    if (services) services.open = false;
    const overlay = document.getElementById('nav-overlay');
    if (desktop.matches && overlay?.classList.contains('open')) {
      overlay.classList.remove('open');
      document.getElementById('menu-btn')?.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
  }

  desktop.addEventListener('change', updateLayout);
  updateLayout();

  if (!services) return;
  document.addEventListener('click', event => {
    if (!services.contains(event.target) || event.target.closest('a')) services.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && services.open) {
      services.open = false;
      services.querySelector('summary').focus();
    }
  });
  services.addEventListener('focusout', event => {
    if (!services.contains(event.relatedTarget)) services.open = false;
  });
})();
