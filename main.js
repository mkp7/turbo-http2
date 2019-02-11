const tls = require('tls')
const fs = require('fs')
const Compressor = require('./compressor').Compressor
const Decompressor = require('./compressor').Decompressor

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

const encodeFrameHeader = (length, type, flags, id) => {
  const buf = Buffer.alloc(9)
  buf.writeUInt32BE(length << 8, 0) // 24 bits frame length
  buf.writeUInt8(type, 3) // 8 bits frame type
  buf.writeUInt8(flags, 4) // 8 bits frame flags
  buf.writeUInt32BE(id, 5) // 32-1 bits stream id

  return buf
}

// const encodeSettingsFrame = () => {
//   const buf = Buffer.alloc
// }

class H2Instance {
  constructor (socket) {
    this.socket = socket
    this.buffer = Buffer.from('')
    this.validH2 = false
    this.validSettings = false
    this.settings = null
    this.streams = []
    this.decoders = [
      this.decodeDataFrame.bind(this), // DATA (0x0) frame decoder
      this.decodeHeadersFrame.bind(this), // HEADERS (0x1) frame decoder
      this.decodePriorityFrame.bind(this), // PRIORITY (0x2) frame decoder
      this.decodeRstStreamFrame.bind(this), // RST_STREAM (0x3) frame decoder
      this.decodeSettingsFrame.bind(this), // SETTINGS (0x4) frame decoder
      undefined, // this.decodePushPromiseFrame, // PUSH_PROMISE (0x5) frame decoder
      undefined, // this.decodePingFrame, // PING (0x6) frame decoder
      undefined, // this.decodeGoawayFrame, // GOAWAY (0x7) frame decoder
      this.decodeWindowUpdateFrame.bind(this), // WINDOW_UPDATE (0x8) frame decoder
      this.decodeContinuationFrame.bind(this) // CONTINUATION (0x9) frame decoder
    ]
    this._compressor = new Compressor(logger, 'RESPONSE')
    this._decompressor = new Decompressor(logger, 'RESPONSE')
    this.processFrames.bind(this)
    // this.onData.bind(this)
  }

  encodeHeaderFrame (id, headers, flags) {
    const frame = this._compressor.compress(headers)

    return Buffer.concat([encodeFrameHeader(Buffer.byteLength(frame), 0x1, flags, id), frame])
  }

  encodeDataFrame (id, data, flags) {
    return Buffer.concat([
      encodeFrameHeader(Buffer.byteLength(Buffer.from(data)), 0x0, flags, id),
      Buffer.from(data)
    ])
  }

  processFrames () {
    let data = this.decodeFrameHeader(this.buffer)

    if (data === null) {
      return
    }

    if (data[0][1] > 9 || this.decoders[data[0][1]] === undefined) {
      return
    }

    console.log(`Frame type: ${data[0][1]}`)
    data = this.decoders[data[0][1]](...data)

    if (data === null) {
      return
    }

    this.buffer = data[1]
    // console.log(`Buffer length: ${Buffer.byteLength(this.buffer)}`)
    this.processFrames()
  }

  onData (buf) {
    this.buffer = Buffer.concat([this.buffer, buf])

    // check whether connection preface is received
    if (!this.validH2) {
      const conPrefBuf = decodeConnectionPreface(this.buffer)
      if (conPrefBuf) {
        this.buffer = conPrefBuf
        this.validH2 = true
        console.log('HTTP/2.0 Connection Preface verified')
      }
    }

    // after receiving connection preface, check whether initial SETTINGS is received
    if (this.validH2 && !this.validSettings) {
      let data = this.decodeFrameHeader(this.buffer)

      // could not parse frame header
      if (data === null) {
        return
      }

      data = this.decodeSettingsFrame(...data)

      // could not decode frame
      if (data === null) {
        return
      }

      this.settings = data[0]
      this.buffer = data[1]
      this.validSettings = true
      console.log('Initial SETTINGS confirmed\n')

      // send (write) initial empty settings frame
      this.socket.write(encodeFrameHeader(0, 4, 0, 0))
      this.socket.write(encodeFrameHeader(0, 4, 0 | 0x1, 0))
      // this.socket.write(encodeFrameHeader(0, 4, 0, 0))
    }

    if (!(this.validH2 && this.validSettings)) {
      return
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
