const tls = require('tls')
const fs = require('fs')

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

const decodeConnectionPreface = buf => {
  // 24 octets connection preface
  const CON_PREFACE = 'PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n'
  const preface = buf.slice(0, 24).toString('ascii')
  return preface === CON_PREFACE ? buf.slice(24) : null
}

const encodeFrameHeader = (length, type, flags, id) => {
  const buf = Buffer.alloc(9)
  buf.writeUInt32BE(length >> 8, 0) // 24 bits frame length
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
      this.decodeDataFrame, // DATA (0x0) frame decoder
      this.decodeHeadersFrame, // HEADERS (0x1) frame decoder
      this.decodePriorityFrame, // PRIORITY (0x2) frame decoder
      this.decodeRstStreamFrame, // RST_STREAM (0x3) frame decoder
      this.decodeSettingsFrame, // SETTINGS (0x4) frame decoder
      undefined, // this.decodePushPromiseFrame, // PUSH_PROMISE (0x5) frame decoder
      undefined, // this.decodePingFrame, // PING (0x6) frame decoder
      undefined, // this.decodeGoawayFrame, // GOAWAY (0x7) frame decoder
      this.decodeWindowUpdateFrame, // WINDOW_UPDATE (0x8) frame decoder
      undefined // this.decodeContinuationFrame // CONTINUATION (0x9) frame decoder
    ]
  }

  decodeFrameHeader (buf) {
  // Frame header is not complete
    if (Buffer.byteLength(buf) < 9) {
      return null
    }

    // const frameHeader = new DataView(buf.buffer)
    // ${frameHeader.getUint32(0) >> 8}
    // ${frameHeader.getUint8(3)}
    // ${frameHeader.getUint8(4)}
    // ${frameHeader.getUint32(5)}

    console.log(`Frame Length:\t${buf.readUInt32BE(0) >> 8}`)
    console.log(`Frame Type:\t${buf.readUInt8(3)}`)
    console.log(`Frame Flags:\t${buf.readUInt8(4)}`)
    console.log(`Frame ID:\t${buf.readUInt32BE(5)}`)

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
    // ...

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
      i = 8
    }

    let [excl, strmDep, weight] = [0, 0, 0]
    // check PRIORITY (0x20) flag
    if (header[2] & 0x20) {
      excl = buf.readUInt32BE(i) << 31 >> 31
      strmDep = buf.readUInt32BE(i) << 1 >> 1
      i += 32
      weight = buf.readUInt8(i)
      i += 8
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
  // incomeplete frame
    if (Buffer.byteLength(buf) < 32) {
      return null
    }

    return [
      buf.readUInt32BE(0) << 1 >> 1, // 31 bits
      buf.slice(32)
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

    data = this.decoders[data[0][1]](...data)

    if (data === null) {
      return
    }

    console.log(data[0])
    this.buffer = data[1]
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
      console.log('Settings Frame:')
      let data = this.decodeFrameHeader(this.buffer)

      // could not parse frame header
      if (data === null) {
        return
      }

      const [headers, rbuf] = data
      data = this.decodeSettingsFrame(headers, rbuf)

      // could not decode frame
      if (data === null) {
        return
      }

      this.settings = data[0]
      this.buffer = data[1]
      this.validSettings = true

      // send (write) initial empty settings frame
      this.socket.write(encodeFrameHeader(0, 4, 1, 0))
    }

    if (!(this.validH2 && this.validSettings)) {
      return
    }

    this.processFrames()
  }
}

server.on('secureConnection', sock => {
  console.log(sock.authorized, sock.authorizationError, sock.alpnProtocol)

  // let gbuf = Buffer.from('')
  const h2Sock = new H2Instance(sock)
  sock.on('data', h2Sock.onData.bind(h2Sock))
})

server.listen(8000, () => {
  console.log('server bound')
})
