'use strict';

/**
 * Vercel adapter for the existing Node server.
 *
 * server.js is a normal long-running HTTP server (it calls listen()), which
 * Vercel cannot invoke directly — that is what causes
 * 500 FUNCTION_INVOCATION_FAILED.
 *
 * This file does not change server.js or the Zoho relay. It captures the
 * request listener that server.js passes to http.createServer() and exposes
 * it through serverless-http so Vercel can call it once per request.
 */

const http = require('http');
const serverless = require('serverless-http');

let requestHandler;

function loadServerHandler() {
  if (requestHandler) return requestHandler;

  const originalCreateServer = http.createServer;

  // Capture the handler instead of opening a TCP port.
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

function handler(req, res) {
  return loadServerHandler()(req, res);
}

module.exports = serverless(handler);
