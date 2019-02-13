const formDataParser = require('./form-data-parser')

const bodyParsers = {
  'application/json': JSON.parse,
  'multipart/form-data': formDataParser
}

function parseBody (headers, buf) {
  const parser = bodyParsers[headers['content-type']]
  if (parser !== undefined) {
    // default uft8
    return parser(buf.toString('utf8'))
  }

  // default utf8
  return buf.toString('utf8')
}

module.exports = parseBody
