// Vercel adapter for the existing Node server.
//
// server.js is a long-running HTTP server (it calls listen()), which Vercel
// cannot invoke directly. This adapter captures the request listener that
// server.js passes to http.createServer() and bridges Vercel's Web Request to
// the Node req/res objects that server.js expects.
//
// server.js and the Zoho relay are NOT modified.

import http from 'node:http';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

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

  const res = {
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

  return res;
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
