(() => {
  'use strict';

  // Vercel bundles this browser script into its Node function wrapper.
  // Skip DOM work when there is no document (server-side execution).
  if (typeof document === 'undefined') return;

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const messageEl = document.getElementById('thanks-message');

  let firstName = '';

  try {
    firstName = (sessionStorage.getItem('leadFirstName') || '').trim();
    sessionStorage.removeItem('leadContactMethod');
  } catch (error) {
    firstName = '';
  }

  if (firstName && messageEl) {
    messageEl.textContent = `Thanks, ${firstName} — I have received your details and will contact you soon.`;
  }
})();
