const parseBody = require('./body-parser')

function Request (headers, body) {
  this.headers = headers
  this.body = body
}

function parseRequest (headers, rawBody) {
  let body = parseBody(headers, rawBody)
  if (body === null) {
    body = rawBody
  }

  return new Request(headers, body)
}

module.exports = parseRequest
