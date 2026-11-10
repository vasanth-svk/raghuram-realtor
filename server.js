'use strict';

/**
 * Raghuram Realtor lead form
 * --------------------------
 * A tiny, dependency-free Node server that:
 *   1. serves the static form + thank-you page, and
 *   2. relays submissions to the Zoho Forms public "records" endpoint.
 *
 * The relay exists because Zoho does not allow cross-origin browser
 * requests to its records endpoint. The server adds no secrets: this is
 * the same public endpoint Zoho's own hosted form calls.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;

const ZOHO_RECORDS_URL =
  process.env.ZOHO_RECORDS_URL ||
  'https://forms.zohopublic.in/raghuramprealtorgm1/form/RaghuramRealtor/formperma/4QwnipUmpe5dv_Mjz44TawozzV4xdkSzwRu4npvp3Jc/records';

const CONSENT_TEXT =
  'I agree to be contacted by Raghuram Puranam about my real estate inquiry using the contact details I provide.*';

const MAX_BODY_BYTES = 64 * 1024;
const ZOHO_TIMEOUT_MS = 20000;

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 12;
const rateBuckets = new Map();

const PUBLIC_DIR = __dirname;

const STATIC_FILES = new Map([
  ['/', { file: 'index.html', type: 'text/html; charset=utf-8' }],
  ['/index.html', { file: 'index.html', type: 'text/html; charset=utf-8' }],
  ['/thank-you.html', { file: 'thank-you.html', type: 'text/html; charset=utf-8' }],
  ['/styles.css', { file: 'styles.css', type: 'text/css; charset=utf-8' }],
  ['/app.js', { file: 'app.js', type: 'text/javascript; charset=utf-8' }],
  ['/thank-you.js', { file: 'thank-you.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/raghuram-puranam.jpg', { file: 'assets/raghuram-puranam.jpg', type: 'image/jpeg' }],
  ['/assets/logo.png', { file: 'assets/logo.png', type: 'image/png' }],
  ['/assets/favicon.png', { file: 'assets/favicon.png', type: 'image/png' }]
]);

const STRING_FIELDS = {
  PhoneNumber: 40,
  Email: 160,
  Dropdown: 60,
  Dropdown1: 60,
  SingleLine: 160,
  Currency: 32,
  Dropdown2: 60,
  Dropdown3: 60,
  Dropdown4: 60,
  MultiLine: 2500,
  Dropdown5: 60,
  Dropdown6: 60,
  Dropdown7: 60
};

const ARRAY_FIELDS = {
  MultipleChoice: {
    maxItems: 10,
    maxLength: 60,
    allowed: ['Buy', 'Sell', 'Rent or lease', 'Invest', 'Just exploring']
  },
  MultipleChoice1: {
    maxItems: 12,
    maxLength: 60,
    allowed: [
      'Scarborough',
      'Toronto',
      'Pickering',
      'Ajax',
      'Whitby',
      'Oshawa',
      'Markham',
      'Other GTA area'
    ]
  },
  MultipleChoice2: {
    maxItems: 10,
    maxLength: 60,
    allowed: ['Detached', 'Semi-detached', 'Townhouse', 'Condo', 'Bungalow', 'Commercial', 'other']
  },
  MultipleChoice3: {
    maxItems: 10,
    maxLength: 60,
    allowed: [
      'Parking',
      'Garage',
      'Finished basement',
      'Rental potential',
      'Schools',
      'Transit',
      'Parks',
      'Others'
    ]
  }
};

const ALLOWED_VALUES = {
  Dropdown: ['Call', 'Text', 'WhatsApp', 'Email'],
  Dropdown1: ['Morning', 'Afternoon', 'Evening', 'Anytime'],
  Dropdown2: ['1', '2', '3', '4', '5+', 'Flexible'],
  Dropdown3: ['1', '2', '3', '4', '5+', 'Flexible'],
  Dropdown4: ['Immediately', '1-3 months', '3-6 months', '6-12 months', 'just exploring'],
  Dropdown5: ['Yes', 'No', 'Prefer to discuss'],
  Dropdown6: ['Yes', 'No', 'Not applicable', 'I Would like assistance'],
  Dropdown7: ['Referral', 'Instagram', 'WhatsApp', 'Business card', 'Other']
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);

  if (!bucket || now - bucket.start > RATE_WINDOW_MS) {
    rateBuckets.set(ip, { start: now, count: 1 });
    return false;
  }

  bucket.count += 1;
  return bucket.count > RATE_MAX;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;

      if (size > MAX_BODY_BYTES) {
        const error = new Error('Your submission is too large.');
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        const parseError = new Error('The request body is not valid JSON.');
        parseError.statusCode = 400;
        reject(parseError);
      }
    });

    req.on('error', reject);
  });
}

function postToZoho(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(ZOHO_RECORDS_URL);
    const transport = url.protocol === 'http:' ? http : https;

    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'http:' ? 80 : 443),
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/zoho.forms-v1+json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'RaghuramRealtorLeadForm/1.0'
        },
        timeout: ZOHO_TIMEOUT_MS
      },
      (response) => {
        const chunks = [];
        let size = 0;

        response.on('data', (chunk) => {
          size += chunk.length;
          if (size <= 256 * 1024) chunks.push(chunk);
        });

        response.on('end', () => {
          resolve({
            statusCode: response.statusCode || 0,
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('The Zoho request timed out.'));
    });
    request.on('error', reject);
    request.end(body);
  });
}

/* ------------------------------------------------------------------ */
/* Payload validation                                                  */
/* ------------------------------------------------------------------ */

function cleanString(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, maxLength);
}

function validateAndBuildPayload(body) {
  const errors = {};

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: { form: 'The submission could not be read.' }, payload: null };
  }

  const payload = {};

  // Name (composite field in Zoho)
  const name = body.Name;
  if (name && typeof name === 'object' && !Array.isArray(name)) {
    const first = cleanString(name.Name_First, 80);
    const last = cleanString(name.Name_Last, 80);
    if (first || last) payload.Name = { Name_First: first, Name_Last: last };
  } else if (typeof name === 'string' && name.trim()) {
    payload.Name = { Name_First: cleanString(name, 80), Name_Last: '' };
  }

  // Simple text / select fields
  Object.entries(STRING_FIELDS).forEach(([field, maxLength]) => {
    const value = cleanString(body[field], maxLength);
    if (!value) return;

    if (ALLOWED_VALUES[field] && !ALLOWED_VALUES[field].includes(value)) {
      errors[field] = 'Please choose one of the listed options.';
      return;
    }

    payload[field] = value;
  });

  // Multi-select fields
  Object.entries(ARRAY_FIELDS).forEach(([field, config]) => {
    const raw = body[field];

    if (raw === undefined || raw === null) return;

    if (!Array.isArray(raw)) {
      errors[field] = 'Please choose one of the listed options.';
      return;
    }

    const values = [];
    raw.forEach((item) => {
      const value = cleanString(item, config.maxLength);
      if (!value) return;
      if (!config.allowed.includes(value)) {
        errors[field] = 'Please choose one of the listed options.';
        return;
      }
      if (!values.includes(value)) values.push(value);
    });

    if (values.length > config.maxItems) {
      errors[field] = 'Please choose fewer options.';
      return;
    }

    if (values.length > 0) payload[field] = values;
  });

  // Consent (required by Zoho). The server sets the exact Zoho option value.
  const consent = body.Checkbox;
  if (!Array.isArray(consent) || consent.length === 0) {
    errors.Checkbox = 'Please tick the consent box so you can be contacted.';
  } else {
    payload.Checkbox = [CONSENT_TEXT];
  }

  // The two fields marked as required on the form.
  if (!payload.MultipleChoice || payload.MultipleChoice.length === 0) {
    errors.MultipleChoice = 'Please choose what you are looking to do.';
  }
  if (!payload.MultipleChoice1 || payload.MultipleChoice1.length === 0) {
    errors.MultipleChoice1 = 'Please choose at least one preferred area.';
  }

  // Format checks for optional fields.
  if (payload.Email && !EMAIL_RE.test(payload.Email)) {
    errors.Email = 'Please enter a valid email address.';
  }

  if (payload.PhoneNumber && payload.PhoneNumber.replace(/\D/g, '').length < 7) {
    errors.PhoneNumber = 'Please enter a valid phone number.';
  }

  if (payload.Currency && !/^\d+(\.\d{1,2})?$/.test(payload.Currency)) {
    errors.Currency = 'Please enter a valid budget.';
  }

  if (Object.keys(errors).length > 0) {
    return { errors, payload: null };
  }

  return { errors: null, payload };
}

/* ------------------------------------------------------------------ */
/* Static files                                                        */
/* ------------------------------------------------------------------ */

function serveStatic(req, res, pathname) {
  const entry = STATIC_FILES.get(pathname);

  if (!entry) {
    sendJson(res, 404, { ok: false, error: 'Page not found.' });
    return;
  }

  const filePath = path.join(PUBLIC_DIR, entry.file);

  fs.readFile(filePath, (error, content) => {
    if (error) {
      console.error('[static] Could not read', entry.file, error.message);
      sendJson(res, 500, { ok: false, error: 'The page could not be loaded.' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': entry.type,
      'Content-Length': content.length,
      'Cache-Control': pathname === '/' || pathname === '/index.html' || pathname === '/thank-you.html'
        ? 'no-store'
        : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'SAMEORIGIN',
      'Content-Security-Policy':
        "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    res.end(content);
  });
}

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */

async function handleRequest(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/api/submit') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
      return;
    }

    const ip = clientIp(req);

    if (isRateLimited(ip)) {
      sendJson(res, 429, {
        ok: false,
        error: 'Too many submissions from this connection. Please try again in a few minutes.'
      });
      return;
    }

    let body;

    try {
      body = await readJsonBody(req);
    } catch (error) {
      sendJson(res, error.statusCode || 400, {
        ok: false,
        error: error.message || 'Could not read the submission.'
      });
      return;
    }

    const { errors, payload } = validateAndBuildPayload(body);

    if (errors) {
      sendJson(res, 400, { ok: false, errors: [errors] });
      return;
    }

    try {
      const zohoResponse = await postToZoho(payload);

      let zohoData = null;
      try {
        zohoData = JSON.parse(zohoResponse.body);
      } catch (error) {
        zohoData = null;
      }

      if (zohoResponse.statusCode === 200 && (!zohoData || !zohoData.errors)) {
        console.log(`[submit] Lead forwarded successfully at ${new Date().toISOString()}`);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (zohoResponse.statusCode === 400 && zohoData && Array.isArray(zohoData.errors)) {
        console.warn('[submit] Zoho rejected the submission:', JSON.stringify(zohoData.errors));
        sendJson(res, 400, { ok: false, errors: zohoData.errors });
        return;
      }

      console.error('[submit] Unexpected Zoho response:', zohoResponse.statusCode, zohoResponse.body.slice(0, 300));
      sendJson(res, 502, {
        ok: false,
        error: 'Zoho could not accept the submission right now.'
      });
    } catch (error) {
      console.error('[submit] Relay failed:', error.message);
      sendJson(res, 502, {
        ok: false,
        error: 'The form service could not be reached right now.'
      });
    }

    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }

  serveStatic(req, res, pathname);
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error('[server] Unexpected request error:', error);
    if (!res.headersSent) {
      sendJson(res, 500, { ok: false, error: 'Unexpected server error.' });
    } else {
      res.end();
    }
  });
});

// Keep the in-memory rate-limit map from growing forever.
const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  for (const [ip, bucket] of rateBuckets.entries()) {
    if (bucket.start < cutoff) rateBuckets.delete(ip);
  }
}, RATE_WINDOW_MS);

cleanupTimer.unref();

server.listen(PORT, () => {
  console.log(`Raghuram Realtor form running at http://localhost:${PORT}`);
  console.log(`Relaying submissions to: ${ZOHO_RECORDS_URL}`);
});
