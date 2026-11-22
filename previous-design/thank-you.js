(() => {
  'use strict';

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const nameWrap = document.querySelector('.thanks-name-wrap');
  const nameEl = document.getElementById('thanks-name');

  let firstName = '';

  try {
    firstName = (sessionStorage.getItem('leadFirstName') || '').trim();
  } catch (error) {
    firstName = '';
  }

  if (firstName && nameWrap && nameEl) {
    nameEl.textContent = firstName;
    nameWrap.hidden = false;
  }

  try {
    sessionStorage.removeItem('leadContactMethod');
  } catch (error) {
    // Nothing to clean up.
  }
})();
