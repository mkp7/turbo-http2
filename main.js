const tls = require('tls')
const fs = require('fs')
const Compressor = require('./compressor').Compressor
const Decompressor = require('./compressor').Decompressor
const decoders = require('./decoders')
const encoders = require('./encoders')

const options = {
  key: fs.readFileSync('../localhost-key.pem'),
  cert: fs.readFileSync('../localhost.pem'),

  // This is necessary only if using client certificate authentication.
  // requestCert: true,

  // This is necessary only if the client uses a self-signed certificate.
  // ca: [ fs.readFileSync('/Users/mkp7/Library/Application Support/mkcert/rootCA.pem') ],

  ALPNProtocols: ['h2', 'http/1.1']
  // minVersion: 'TLSv1.2'
}

const server = tls.createServer(options)

const noop = () => {}

const logger = {
  fatal: noop,
  error: noop,
  warn: noop,
  info: noop,
  debug: noop,
  trace: noop,

  child: function () { return this }
}

const decodeConnectionPreface = buf => {
  // 24 octets connection preface
  const CON_PREFACE = 'PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n'
  const preface = buf.slice(0, 24).toString('ascii')
  return preface === CON_PREFACE ? buf.slice(24) : null
}

// const encodeSettingsFrame = () => {
//   const buf = Buffer.alloc
// }

class H2Instance {
  constructor (socket) {
    this.socket = socket
    this.buffer = Buffer.from('')
    this.prefaceReceived = false
    this.settingsReceived = false
    this.settings = null
    this.streams = []
    this._compressor = new Compressor(logger, 'RESPONSE')
    this._decompressor = new Decompressor(logger, 'RESPONSE')
    this.processFrames.bind(this)

    // write connection preface (possibly empty SETTINGS frame)
    this.socket.write(encoders.encodeFrameHeader(0, 4, 0, 0))
  }

  processFrames () {
    // decode frame header
    let frameHeader = decoders[10](this.buffer)

    // could not parse frame header
    if (frameHeader === null) {
      return
    }

    // protocol error in case of (frameHeader[0][1] > 9)
    if (frameHeader[0][1] > 9 || decoders[frameHeader[0][1]] === undefined) {
      return
    }

    console.log(`Frame type: ${frameHeader[0][1]}`)
    let framePayload = null
    switch (frameHeader[0][1]) {
      case 0: // DATA (0x0) frame
      case 1: // HEADERS (0x1) frame
      case 9: // CONTINUATION (0x9) frame
        framePayload = decoders[frameHeader[0][1]](...frameHeader, this.socket, this._compressor, this._decompressor)
        break
      case 2:
      case 3:
      case 4:
      case 8:
        framePayload = decoders[frameHeader[0][1]](...frameHeader)
        break
    }

    if (framePayload === null) {
      return
    }

    this.buffer = framePayload[1]
    // console.log(`Buffer length: ${Buffer.byteLength(this.buffer)}`)
    this.processFrames()
  }

  onData (buf) {
    // concat incoming buffer with existing buffer
    this.buffer = Buffer.concat([this.buffer, buf])

    // check whether connection preface is received
    if (!this.prefaceReceived) {
      const rbuf = decodeConnectionPreface(this.buffer)
      if (rbuf) {
        this.buffer = rbuf
        this.prefaceReceived = true
        console.log('>> H2 Connection Preface received')
      }
    }

    // after receiving connection preface, check whether initial SETTINGS is received
    if (this.prefaceReceived && !this.settingsReceived) {
      let data = decoders[10](this.buffer)

      // could not parse frame header
      if (data === null) {
        return
      }

      data = decoders[4](...data)

      // could not decode frame payload
      if (data === null) {
        return
      }

      this.settings = data[0]
      this.buffer = data[1]
      this.settingsReceived = true
      console.log('>> Initial SETTINGS received\n')
      // write ACK SETTINGS for initial SETTINGS
      this.socket.write(encoders.encodeFrameHeader(0, 4, 0 | 0x1, 0))
    }

    if (!(this.prefaceReceived && this.settingsReceived)) {
      return // there maybe protocol error
    }

    this.processFrames()
  }
}

server.on('secureConnection', sock => {
  console.log(sock.authorized, sock.authorizationError, sock.alpnProtocol)

  const h2Sock = new H2Instance(sock)
  sock.on('data', h2Sock.onData.bind(h2Sock))
})

let port = process.env.PORT || 8000

server.listen(port, () => {
  console.log(`server bound on ${port}`)
})
