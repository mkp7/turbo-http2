const tls = require('tls')
const fs = require('fs')

const options = {
  key: fs.readFileSync('PLACE_HOLDER'),
  cert: fs.readFileSync('PLACE_HOLDER'),

  // This is necessary only if using client certificate authentication.
  // requestCert: true,

  // This is necessary only if the client uses a self-signed certificate.
  ca: [ fs.readFileSync('PLACE_HOLDER') ],

  ALPNProtocols: ['h2', 'http/1.1']
  // minVersion: 'TLSv1.2'
}

const server = tls.createServer(options)

// 24 octets connection preface
const CON_PREFACE = 'PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n'

const parseConnectionPreface = buf => {
  const preface = buf.slice(0, 24).toString('ascii')
  return preface === CON_PREFACE ? buf.slice(24) : null
}

const parseFrameHeader = buf => {
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
      buf.readUInt32BE(5) // 32-1 bits stream id
    ], buf.slice(9) // remaining buffer
  ]
}

const parseSettingsFrame = buf => {
  const data = parseFrameHeader(buf)

  // could not parse frame
  if (data === null) {
    return null
  }

  const [header, rbuf] = data

  // type id is not of settings or frame id is not 0 or settings frame length is not multiple of 6
  if (header[1] !== 4 || header[3] !== 0 || header[0] % 6 !== 0) {
    return null // should be an error in other two cases
  }

  // incomplete frame
  if (Buffer.byteLength(rbuf) < header[0]) {
    return null
  }

  const settings = new Map()
  for (let i = 0; i < header[0]; i += 6) {
    settings.set(rbuf.readUInt16BE(i, i + 2), rbuf.readUInt32BE(i + 2, i + 6))
  }

  return [settings, rbuf.slice(header[0])]
}

class H2Instance {
  constructor (socket) {
    this.socket = socket
    this.buffer = Buffer.from('')
    this.validH2 = false
    this.validSettings = false
    this.settings = null
  }

  onData (buf) {
    this.buffer = Buffer.concat([this.buffer, buf])

    // check whether connection preface is received
    if (!this.validH2) {
      const conPrefBuf = parseConnectionPreface(this.buffer)
      if (conPrefBuf) {
        this.buffer = conPrefBuf
        this.validH2 = true
        console.log('HTTP/2.0 Connection Preface verified')
      }
    }

    // after receiving connection preface, check whether initial SETTINGS is received
    if (this.validH2 && !this.validSettings) {
      console.log('Settings Frame:')
      const data = parseSettingsFrame(this.buffer)

      if (data === null) {
        return
      }

      this.settings = data[0]
      this.buffer = data[1]

      this.settings.forEach(console.log)

      // send (write) initial settings frame
    }
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
