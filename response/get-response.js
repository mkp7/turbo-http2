const fs = require('fs')
const url = require('url')
const getContentType = require('./content-type')

const PUBLIC_DIR = url.pathToFileURL(`${__dirname}/../public`).pathname

function getUnderDevelopmentResponse () {
  const body = fs.readFileSync(`${PUBLIC_DIR}/under-dev.html`)
  const headers = {
    ':status': 501,
    'content-type': 'text/html',
    'content-length': Buffer.byteLength(body)
  }

  return { headers, body }
}

function getNotFoundResponse () {
  const body = fs.readFileSync(`${PUBLIC_DIR}/not-found.html`)
  const headers = {
    ':status': 404,
    'content-type': 'text/html',
    'content-length': Buffer.byteLength(body)
  }

  return { headers, body }
}

function getForbiddenResponse () {
  const body = fs.readFileSync(`${PUBLIC_DIR}/forbidden.html`)
  const headers = {
    ':status': 403,
    'content-type': 'text/html',
    'content-length': Buffer.byteLength(body)
  }

  return { headers, body }
}

function staticHandler (request, routes) {
  // static handler
  if (request.headers[':method'] !== 'GET') {
    return getUnderDevelopmentResponse()
  }

  const STATIC_DIR = url.pathToFileURL(`${__dirname}/..${routes.STATIC}`).pathname
  if (!url.pathToFileURL(`${__dirname}/..${request.headers[':path']}`)
    .pathname.startsWith(STATIC_DIR)) {
    return getForbiddenResponse()
  }

  try {
    const body = fs.readFileSync(`${__dirname}/..${request.headers[':path']}`)
    const headers = {
      ':status': 200,
      'content-type': getContentType(request.headers[':path']) || 'application/octet-stream',
      'content-length': Buffer.byteLength(body)
    }

    return { headers, body }
  } catch (err) {
    return getNotFoundResponse()
  }
}

function callbackHandler (request, routes) {
  // check for the :method availability
  const handler = routes[request.headers[':method']][request.headers[':path']]
  if (handler === undefined) {
    return getNotFoundResponse()
  }

  const headers = {
    ':status': 200,
    'content-type': 'text/plain'
  }
  const body = Buffer.from('')
  return handler(request, { headers, body })
}

function getResponse (request, routes) {
  if (request.headers[':path'].startsWith(routes.STATIC)) {
    return staticHandler(request, routes)
  }

  // callback handler
  return callbackHandler(request, routes)
}

module.exports = getResponse
