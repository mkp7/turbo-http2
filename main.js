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
      undefined // this.decodeContinuationFrame // CONTINUATION (0x9) frame decoder
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

  decodeFrameHeader (buf) {
    // Frame header is not complete
    if (Buffer.byteLength(buf) < 9) {
      return null
    }

    return [
      [
        buf.readUInt32BE(0) >> 8, // 24 bits frame length
        buf.readUInt8(3), // 8 bits frame type
        buf.readUInt8(4), // 8 bits frame flags
        buf.readUInt32BE(5) << 1 >> 1 // 31 bits stream id
      ], buf.slice(9) // remaining buffer
    ]
  }

  decodeDataFrame (header, buf) {
    if (Buffer.byteLength(buf) < header[0]) {
    // incomplete frame
      return null
    }

    // check PADDED (0x8) flag
    if (header[2] & 0x8) {
      const padding = buf.readUInt8(0)

      return [
        buf.slice(8, header[0] - padding),
        buf.slice(header[0])
      ]
    }

    // check END_STREAM (0x1) flag
    if (header[2] & 0x1) {
      console.log(`Writing HEADER frame on DATA receive`)
      console.log(`END_STREAM ID: ${header[3]}`)
      const HFrame = this.encodeHeaderFrame(header[3], { ':status': 200, date: (new Date()).toUTCString() }, 0 | 0x4)
      this.socket.write(HFrame)
      this.socket.write(this.encodeDataFrame(
        header[3],
        'hello world\n',
        0 | 0x1
      ))
    }

    return [
      buf.slice(0, header[0]),
      buf.slice(header[0])
    ]
  }

  decodeHeadersFrame (header, buf) {
    if (Buffer.byteLength(buf) < header[0]) {
      // incomplete frame
      return null
    }

    // check PADDED (0x8) flag
    let [i, padding] = [0, 0]
    if (header[2] & 0x8) {
      padding = buf.readUInt8(0)
      i = 1
    }

    let [excl, strmDep, weight] = [0, 0, 0]
    // check PRIORITY (0x20) flag
    if (header[2] & 0x20) {
      excl = buf.readUInt32BE(i) << 31 >> 31
      strmDep = buf.readUInt32BE(i) << 1 >> 1
      i += 4
      weight = buf.readUInt8(i)
      i += 1
    }

    console.log(this._decompressor.decompress(buf.slice(i, header[0] - padding)))

    // check END_STREAM (0x1) flag
    if (header[2] & 0x1) {
      console.log(`Writing HEADER frame`)
      console.log(`END_STREAM ID: ${header[3]} END_HEADERS: ${header[2] & 0x4}`)
      const HFrame = this.encodeHeaderFrame(header[3], { ':status': '200', date: (new Date()).toUTCString() }, 0 | 0x4)
      this.socket.write(HFrame)
      this.socket.write(this.encodeDataFrame(
        header[3],
        'hello world\n',
        0 | 0x1
      ))
    }

    return [
      buf.slice(i, header[0] - padding),
      buf.slice(header[0])
    ]
  }

  decodePriorityFrame (header, buf) {
    if (header[0] !== 5) {
      return null // stream error of type FRAME_SIZE_ERROR
    }

    if (Buffer.byteLength(buf) < header[0]) {
      // incomplete frame
      return null
    }

    console.log(`Stream ID ${header[3]} depends on stream ID ${buf.readUInt32BE(0) << 1 >> 1}`)

    return [
      [
        buf.readUInt32BE(0) << 31 >> 31,
        buf.readUInt32BE(0) << 1 >> 1,
        buf.readUInt8(4)
      ],
      buf.slice(5)
    ]
  }

  decodeRstStreamFrame (header, buf) {
    if (header[0] !== 4) {
      return null // stream error of type FRAME_SIZE_ERROR
    }

    if (Buffer.byteLength(buf) < header[0]) {
      // incomplete frame
      return null
    }

    return [buf.readUInt32BE(0), buf.slice(4)]
  }

  decodeSettingsFrame (header, buf) {
    // type id is not of settings or frame id is not 0 or settings frame length is not multiple of 6
    if (header[1] !== 4 || header[3] !== 0 || header[0] % 6 !== 0) {
      return null // should be an error in other two cases
    }

    // incomplete frame
    if (Buffer.byteLength(buf) < header[0]) {
      return null
    }

    const settings = new Map()
    for (let i = 0; i < header[0]; i += 6) {
      settings.set(buf.readUInt16BE(i), buf.readUInt32BE(i + 2))
    }

    return [settings, buf.slice(header[0])]
  }

  decodePushPromiseFrame (header, buf) {}

  decodePingFrame (header, buf) {}

  decodeGoawayFrame (header, buf) {}

  decodeWindowUpdateFrame (header, buf) {
    // check frame length
    if (header[0] !== 4) {
      return null // connection error of type FRAME_SIZE_ERROR
    }

    // incomeplete frame
    if (Buffer.byteLength(buf) < 4) {
      return null
    }

    console.log(`WINDOW_UPDATE: ${buf.readUInt32BE(0) << 1 >> 1}`)

    return [
      buf.readUInt32BE(0) << 1 >> 1, // 31 bits
      buf.slice(4)
    ]
  }

  decodeContinuationFrame (header, buf) {}

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

server.listen(8000, () => {
  console.log('server bound')
})
