const fs = require('fs')
const url = require('url')
const getContentType = require('./content-type')

const PUBLIC_DIR = url.pathToFileURL(`${__dirname}/../public`).pathname

function Response (request, conn, statusLine, headers, body) {
  this.request = request
  this.conn = conn
  this.statusLine = statusLine
  this.headers = headers
  this.body = body
  this.write = body => {
    this.body = Buffer.concat([this.body, Buffer.from(body)])
    this.headers['Content-Length'] = Buffer.byteLength(this.body)
    let res = this.statusLine + '\r\n'
    for (let [k, v] of Object.entries(this.headers)) {
      res += `${k}:${v}\r\n`
    }
    this.conn.write(Buffer.concat([Buffer.from(res + '\r\n'), this.body]))
  }
}

function getUnderDevelopmentResponse (request, conn) {
  const statusLine = 'HTTP/1.1 501 Not Implemented'
  const body = fs.readFileSync(`${PUBLIC_DIR}/under-dev.html`)
  const headers = {
    'Content-Type': 'text/html',
    'Content-Length': Buffer.byteLength(body)
  }

  return new Response(request, conn, statusLine, headers, body)
}

function getNotFoundResponse (request, conn) {
  const statusLine = 'HTTP/1.1 404 Not Found'
  const body = fs.readFileSync(`${PUBLIC_DIR}/not-found.html`)
  const headers = {
    'Content-Type': 'text/html',
    'Content-Length': Buffer.byteLength(body)
  }

  return new Response(request, conn, statusLine, headers, body)
}

function getForbiddenResponse (request, conn) {
  const statusLine = 'HTTP/1.1 403 Forbidden'
  const body = fs.readFileSync(`${PUBLIC_DIR}/forbidden.html`)
  const headers = {
    'Content-Type': 'text/html',
    'Content-Length': Buffer.byteLength(body)
  }

  return new Response(request, conn, statusLine, headers, body)
}

function staticHandler (conn, request, routes) {
  // static handler
  if (request.requestLine.method !== 'GET') {
    getUnderDevelopmentResponse(request, conn).write('')
    return
  }

  const STATIC_DIR = url.pathToFileURL(`${__dirname}/..${routes.STATIC}`).pathname
  if (!url.pathToFileURL(`${__dirname}/..${request.requestLine.target}`)
    .pathname.startsWith(STATIC_DIR)) {
    getForbiddenResponse(request, conn).write('')
    return
  }

  try {
    const statusLine = 'HTTP/1.1 200 OK'
    const body = fs.readFileSync(`${__dirname}/..${request.requestLine.target}`)
    const headers = {
      'Content-Type': getContentType(request.requestLine.target) || 'application/octet-stream',
      'Content-Length': Buffer.byteLength(body)
    }

    new Response(request, conn, statusLine, headers, body).write('')
    return
  } catch (err) {
    getNotFoundResponse(request, conn).write('')
  }
}

function callbackHandler (conn, request, routes) {
  const handler = routes[request.requestLine.method].find(([uri]) => uri === request.requestLine.target)
  if (handler === undefined) {
    return getNotFoundResponse(request, conn).write('')
  }

  const statusLine = 'HTTP/1.1 200 OK'
  const body = Buffer.from('')
  const headers = {
    'Content-Type': getContentType(request.requestLine.target) || 'application/octet-stream',
    'Content-Length': Buffer.byteLength(body)
  }
  return handler[1](request, new Response(request, conn, statusLine, headers, body))
}

function getResponse (conn, request, routes) {
  if (request.requestLine.target.startsWith(routes.STATIC)) {
    return staticHandler(conn, request, routes)
  }

  // callback handler
  return callbackHandler(conn, request, routes)
}

module.exports = getResponse
