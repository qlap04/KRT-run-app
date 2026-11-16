'use strict';
// Tiny fakes for Express req/res so controllers can be tested without a server.

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    rendered: null,
    redirectedTo: null,
    headers: {},
    status(code) { res.statusCode = code; return res; },
    sendStatus(code) { res.statusCode = code; return res; },
    json(body) { res.body = body; return res; },
    render(view, data) { res.rendered = { view, data }; return res; },
    redirect(url) { res.redirectedTo = url; return res; },
    setHeader(name, value) { res.headers[name.toLowerCase()] = value; },
  };
  return res;
}

function fakeReq({ body = {}, query = {}, params = {}, session = {}, headers = {}, ip = '203.0.113.7' } = {}) {
  return {
    body, query, params, session, ip,
    socket: { remoteAddress: ip },
    get: (name) => headers[name.toLowerCase()],
  };
}

module.exports = { fakeRes, fakeReq };
