const headerParser = require('./header-parser')

function formDataParser (buf, conType) {
  const ptrn = /multipart\/form-data; ?boundary=(.+)/
  const boundary = ptrn.exec(conType)[1]

  let i = 0
  while (Buffer.byteLength(buf) > 2 &&
    i < Buffer.byteLength(buf) &&
    !(buf[i++] === 13 && buf[i] === 10)) {}

  if (buf.slice(0, ++i).toString('ascii') === `--${boundary}--\r\n`) {
    return [[], buf.slice(i)]
  }

  if (buf.slice(0, i).toString('ascii') === `--${boundary}\r\n`) {
    let headers
    [headers, buf] = headerParser(buf.slice(i))

    let j = 0
    while (Buffer.byteLength(buf) > j &&
      buf.slice(j, `--${boundary}`.length + j).toString('ascii') !== `--${boundary}`) {
      j++
    }

    let body = buf.slice(0, j - 2)
    // default content-type of "text/plain; charset=US-ASCII"
    if (headers['content-type'] === undefined) {
      body = body.toString('ascii')
    }
    const recur = formDataParser(buf.slice(j), conType)

    if (recur === null) return null

    return [[{ ...headers, body }, ...recur[0]], recur[1]]
  }

  return null
}

module.exports = formDataParser
