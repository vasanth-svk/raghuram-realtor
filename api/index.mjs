// Vercel adapter for the existing Node server.
//
// server.js is a long-running HTTP server (it calls listen()), which Vercel
// cannot invoke directly. This adapter captures the request listener that
// server.js passes to http.createServer() and bridges Vercel's Web Request to
// the Node req/res objects that server.js expects.
//
// server.js and the Zoho relay are NOT modified. Static files are preloaded as
// raw bytes here and handed to server.js through fs.readFile, so the browser
// script app.js is never executed on the server.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Static assets. Using new URL() with literal paths lets Vercel's file tracer
// include them in the function bundle without treating them as source code.
const STATIC_FILES = new Map([
  ['index.html', fs.readFileSync(new URL('../index.html', import.meta.url))],
  ['thank-you.html', fs.readFileSync(new URL('../thank-you.html', import.meta.url))],
  ['styles.css', fs.readFileSync(new URL('../styles.css', import.meta.url))],
  ['app.js', fs.readFileSync(new URL('../app.js', import.meta.url))],
  ['thank-you.js', fs.readFileSync(new URL('../thank-you.js', import.meta.url))],
  ['raghuram-puranam.jpg', fs.readFileSync(new URL('../assets/raghuram-puranam.jpg', import.meta.url))],
  ['logo.png', fs.readFileSync(new URL('../assets/logo.png', import.meta.url))],
  ['favicon.png', fs.readFileSync(new URL('../assets/favicon.png', import.meta.url))]
]);

// Feed preloaded bytes to server.js's fs.readFile calls.
const originalReadFile = fs.readFile;
fs.readFile = function readFile(file, options, callback) {
  const key = path.basename(String(file));
  if (STATIC_FILES.has(key)) {
    const content = STATIC_FILES.get(key);
    if (typeof options === 'function') {
      options(null, content);
      return this;
    }
    if (typeof callback === 'function') {
      callback(null, content);
      return this;
    }
    return content;
  }
  return originalReadFile.apply(this, arguments);
};

let requestHandler;

function loadServerHandler() {
  if (requestHandler) return requestHandler;

  const originalCreateServer = http.createServer;

  http.createServer = function captureServer(listener) {
    requestHandler = listener;
    return {
      listen() {},
      close() {},
      on() {},
      once() {},
      emit() {},
      address() {
        return null;
      }
    };
  };

  try {
    require('../server.js');
  } finally {
    http.createServer = originalCreateServer;
  }

  if (typeof requestHandler !== 'function') {
    throw new Error('Could not load the request handler from server.js');
  }

  return requestHandler;
}

function createNodeRequest(webRequest) {
  const headers = {};
  webRequest.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const req = new Readable({ read() {} });
  req.url = webRequest.url;
  req.method = webRequest.method;
  req.headers = headers;
  req.socket = {
    remoteAddress: String(headers['x-forwarded-for'] || '')
      .split(',')[0]
      .trim() || 'unknown'
  };

  const method = String(webRequest.method || 'GET').toUpperCase();
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    webRequest.arrayBuffer().then(
      (buffer) => {
        if (buffer.byteLength) req.push(Buffer.from(buffer));
        req.push(null);
      },
      (error) => req.destroy(error)
    );
  } else {
    setImmediate(() => req.push(null));
  }

  return req;
}

function createNodeResponse() {
  const headers = {};
  const chunks = [];
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });

  return {
    statusCode: 200,
    headersSent: false,
    chunks,
    headers,
    done,

    writeHead(statusCode, newHeaders) {
      this.statusCode = statusCode;
      if (newHeaders && typeof newHeaders === 'object') {
        Object.assign(headers, newHeaders);
      }
      this.headersSent = true;
      return this;
    },

    setHeader(name, value) {
      headers[name] = value;
      return this;
    },

    getHeader(name) {
      return headers[name];
    },

    removeHeader(name) {
      delete headers[name];
    },

    write(chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    },

    end(chunk) {
      if (chunk !== undefined && chunk !== null) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      this.headersSent = true;
      resolveDone();
      return this;
    }
  };
}

async function fetchHandler(webRequest) {
  try {
    const req = createNodeRequest(webRequest);
    const res = createNodeResponse();
    const handler = loadServerHandler();

    await Promise.resolve(handler(req, res));
    await res.done;

    const body = res.chunks.length ? Buffer.concat(res.chunks) : null;
    return new Response(body, {
      status: res.statusCode,
      headers: res.headers
    });
  } catch (error) {
    console.error('[vercel-adapter]', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

export default { fetch: fetchHandler };
