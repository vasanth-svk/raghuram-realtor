(() => {
  'use strict';

  const form = document.getElementById('realtor-form');
  if (!form) return;

  const submitBtn = document.getElementById('submit-btn');
  const submitLabel = submitBtn.querySelector('.btn-label');
  const alertBox = document.getElementById('form-alert');
  const yearEl = document.getElementById('year');

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // If the relay is unavailable, visitors can still reach the hosted Zoho form.
  const ZOHO_FALLBACK_URL =
    'https://forms.zohopublic.in/raghuramprealtorgm1/form/RaghuramRealtor/formperma/4QwnipUmpe5dv_Mjz44TawozzV4xdkSzwRu4npvp3Jc';

  // This value must match the consent option in the Zoho form exactly.
  const CONSENT_TEXT =
    'I agree to be contacted by Raghuram Puranam about my real estate inquiry using the contact details I provide.*';

  const fields = {
    firstName: document.getElementById('firstName'),
    lastName: document.getElementById('lastName'),
    phone: document.getElementById('phone'),
    email: document.getElementById('email'),
    contactMethod: document.getElementById('contactMethod'),
    bestTime: document.getElementById('bestTime'),
    neighbourhood: document.getElementById('neighbourhood'),
    budget: document.getElementById('budget'),
    timeline: document.getElementById('timeline'),
    bedrooms: document.getElementById('bedrooms'),
    bathrooms: document.getElementById('bathrooms'),
    notes: document.getElementById('notes'),
    agentStatus: document.getElementById('agentStatus'),
    mortgage: document.getElementById('mortgage'),
    heardFrom: document.getElementById('heardFrom'),
    consent: document.getElementById('consent')
  };

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const getChecked = (name) =>
    Array.from(form.querySelectorAll(`input[name="${name}"]:checked`), (input) => input.value);

  const errorEl = (key) => form.querySelector(`[data-error-for="${key}"]`);

  const prefersReducedMotion = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clearErrors() {
    form.querySelectorAll('.error').forEach((el) => {
      el.hidden = true;
      el.textContent = '';
    });

    form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));

    form.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));

    const consentRow = form.querySelector('.consent-row');
    if (consentRow) consentRow.classList.remove('invalid');
  }

  function markInvalid(container) {
    if (!container) return;

    if (container.classList && container.classList.contains('input')) {
      container.classList.add('invalid');
      container.setAttribute('aria-invalid', 'true');
      return;
    }

    if (container.classList && container.classList.contains('input-prefix')) {
      container.classList.add('invalid');
      const input = container.querySelector('.input');
      if (input) input.setAttribute('aria-invalid', 'true');
      return;
    }

    if (container.classList && container.classList.contains('consent-row')) {
      container.classList.add('invalid');
      return;
    }

    if (container.classList && container.classList.contains('choice-grid')) {
      container.querySelectorAll('input').forEach((input) => input.setAttribute('aria-invalid', 'true'));
    }
  }

  function showError(key, message, focusTarget) {
    const el = errorEl(key);
    if (el) {
      el.textContent = message;
      el.hidden = false;
    }
    return focusTarget || null;
  }

  function validate() {
    clearErrors();
    let firstInvalid = null;

    const intent = getChecked('intent');
    if (intent.length === 0) {
      const group = form.querySelector('[data-field="intent"] .choice-grid');
      markInvalid(group);
      const target = form.querySelector('input[name="intent"]');
      firstInvalid = firstInvalid || showError('intent', 'Choose at least one option so I know how to help.', target);
    }

    const location = getChecked('location');
    if (location.length === 0) {
      const group = form.querySelector('[data-field="location"] .choice-grid');
      markInvalid(group);
      const target = form.querySelector('input[name="location"]');
      firstInvalid = firstInvalid || showError('location', 'Choose at least one area you are considering.', target);
    }

    const phone = fields.phone.value.trim();
    if (phone && phone.replace(/\D/g, '').length < 7) {
      markInvalid(fields.phone);
      firstInvalid = firstInvalid || showError('phone', 'Please enter a valid phone number.', fields.phone);
    }

    const email = fields.email.value.trim();
    if (email && !EMAIL_RE.test(email)) {
      markInvalid(fields.email);
      firstInvalid = firstInvalid || showError('email', 'Please enter a valid email address.', fields.email);
    }

    const budget = fields.budget.value.trim();
    if (budget && Number(budget) < 0) {
      markInvalid(fields.budget.closest('.input-prefix') || fields.budget);
      firstInvalid = firstInvalid || showError('budget', 'Budget cannot be negative.', fields.budget);
    }

    if (!fields.consent.checked) {
      const consentRow = form.querySelector('.consent-row');
      markInvalid(consentRow);
      firstInvalid =
        firstInvalid ||
        showError('consent', 'Please tick the consent box so I am allowed to contact you.', fields.consent);
    }

    return firstInvalid;
  }

  function buildPayload() {
    const payload = {};

    const firstName = fields.firstName.value.trim();
    const lastName = fields.lastName.value.trim();
    if (firstName || lastName) {
      payload.Name = { Name_First: firstName, Name_Last: lastName };
    }

    const singles = [
      ['PhoneNumber', fields.phone.value.trim()],
      ['Email', fields.email.value.trim()],
      ['Dropdown', fields.contactMethod.value],
      ['Dropdown1', fields.bestTime.value],
      ['SingleLine', fields.neighbourhood.value.trim()],
      ['Currency', fields.budget.value.trim()],
      ['Dropdown2', fields.bedrooms.value],
      ['Dropdown3', fields.bathrooms.value],
      ['Dropdown4', fields.timeline.value],
      ['MultiLine', fields.notes.value.trim()],
      ['Dropdown5', fields.agentStatus.value],
      ['Dropdown6', fields.mortgage.value],
      ['Dropdown7', fields.heardFrom.value]
    ];

    singles.forEach(([zohoField, value]) => {
      if (value !== '') payload[zohoField] = value;
    });

    const arrays = [
      ['MultipleChoice', 'intent'],
      ['MultipleChoice1', 'location'],
      ['MultipleChoice2', 'propertyType'],
      ['MultipleChoice3', 'requirements']
    ];

    arrays.forEach(([zohoField, inputName]) => {
      const values = getChecked(inputName);
      if (values.length > 0) payload[zohoField] = values;
    });

    payload.Checkbox = [CONSENT_TEXT];

    return payload;
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.classList.toggle('is-loading', isLoading);
    submitBtn.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    submitLabel.textContent = isLoading ? 'Sending your details…' : 'Send my details';
  }

  function readErrorMessage(data) {
    if (!data) return '';

    if (Array.isArray(data.errors)) {
      const messages = [];
      data.errors.forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        Object.values(entry).forEach((value) => {
          if (typeof value === 'string' && value.trim()) messages.push(value.trim());
        });
      });
      if (messages.length) return messages.join(' ');
    }

    if (typeof data.error === 'string' && data.error.trim()) return data.error.trim();
    if (typeof data.message === 'string' && data.message.trim()) return data.message.trim();

    return '';
  }

  function showAlert(detail) {
    alertBox.replaceChildren();

    const text = document.createElement('p');
    const intro = document.createElement('span');
    intro.textContent = "We couldn't send your details just now. ";
    text.appendChild(intro);

    if (detail) {
      const reason = document.createElement('span');
      reason.textContent = `${detail} `;
      text.appendChild(reason);
    }

    text.appendChild(document.createTextNode('Please try again in a moment, or '));

    const link = document.createElement('a');
    link.href = ZOHO_FALLBACK_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'fill the form directly on Zoho';
    text.appendChild(link);

    text.appendChild(document.createTextNode('.'));

    alertBox.appendChild(text);
    alertBox.hidden = false;
  }

  function hideAlert() {
    alertBox.hidden = true;
    alertBox.replaceChildren();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideAlert();

    const firstInvalid = validate();
    if (firstInvalid) {
      firstInvalid.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'center'
      });
      try {
        firstInvalid.focus({ preventScroll: true });
      } catch (error) {
        firstInvalid.focus();
      }
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload())
      });

      let data = null;
      try {
        data = await response.json();
      } catch (error) {
        data = null;
      }

      if (!response.ok || (data && data.ok === false)) {
        const message = readErrorMessage(data);
        throw new Error(message || `The form service returned ${response.status}.`);
      }

      try {
        sessionStorage.setItem('leadFirstName', fields.firstName.value.trim());
        sessionStorage.setItem('leadContactMethod', fields.contactMethod.value);
      } catch (error) {
        // Private browsing may block sessionStorage; the thank-you page has a fallback.
      }

      window.location.assign('thank-you.html');
    } catch (error) {
      console.error('[lead-form] Submission failed:', error);

      let detail = '';

      if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
        detail = 'The form server could not be reached.';
      } else if (error && error.message) {
        detail = error.message;
      }

      if (window.location.protocol === 'file:') {
        detail = 'This page needs to be opened through the included server (node server.js).';
      }

      showAlert(detail);
      setLoading(false);
      submitBtn.focus();
    }
  });
})();
