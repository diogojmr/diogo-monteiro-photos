document.querySelectorAll('[data-contact-intent]').forEach(link => {
  link.addEventListener('click', () => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'contact_intent', {
        contact_method: 'form',
        link_location: link.dataset.contactIntent || 'service_page'
      });
    }
  });
});

document.querySelectorAll('a[href*="instagram.com"]').forEach(link => {
  link.addEventListener('click', () => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'social_click', {
        social_network: 'instagram',
        link_location: document.body.dataset.pageType || 'site_page'
      });
    }
  });
});

document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
  link.addEventListener('click', () => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'contact_click', {
        contact_method: 'email',
        link_location: document.body.dataset.pageType || 'service_page'
      });
    }
  });
});

document.querySelectorAll('[data-lead-form]').forEach(form => {
  form.addEventListener('focusin', () => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'form_start', { form_name: form.dataset.leadSource || 'service_request' });
    }
  }, { once: true });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('.lead-submit');
    const success = form.querySelector('[data-form-success]');
    const error = form.querySelector('[data-form-error]');
    const originalLabel = button.textContent;
    button.textContent = form.dataset.sendingLabel || 'A enviar...';
    button.disabled = true;

    try {
      const formData = new FormData(form);
      const campaignParameters = new URLSearchParams(window.location.search);
      formData.set('pagina', window.location.pathname);
      ['utm_source', 'utm_medium', 'utm_campaign'].forEach(parameter => {
        const value = campaignParameters.get(parameter);
        if (value) formData.set(parameter, value);
      });
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData
      });
      if (!response.ok) throw new Error('Form submission failed');
      success.style.display = 'block';
      error.style.display = 'none';
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'generate_lead', { lead_source: form.dataset.leadSource || 'service_form' });
      }
      form.reset();
      button.textContent = form.dataset.sentLabel || 'Enviado';
    } catch {
      success.style.display = 'none';
      error.style.display = 'block';
      button.textContent = originalLabel;
      button.disabled = false;
    }
  });
});
