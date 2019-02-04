const turbo = require('turbo-net')

// 24 octets connection preface
const CON_PREFACE = 'PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n'

function isConnectionPreface (buf) {
  return buf.toString('ascii') === CON_PREFACE
}

const server = turbo.createServer(function (socket) {
  socket.read(Buffer.alloc(32 * 1024), function onread (err, buf, read) {
    if (err) throw err
    if (isConnectionPreface(buf.slice(0, 24))) {
      console.log('// HTTP2 Connection Preface confirmed\n')
      let rbuf = buf.slice(24)

      // SETTINGS Identifier
      console.log('SETTINGS Identifier:', rbuf.slice(0, 2))
      rbuf = rbuf.slice(2)

      // SETTINGS Value
      console.log('SETTINGS Value:', rbuf.slice(0, 4))
      rbuf = rbuf.slice(4)

      console.log(rbuf)

      // Create SETTINGS frame
      const SETTINGS = new Uint8Array(9)
      SETTINGS[0] = 0
      SETTINGS[1] = 0
      SETTINGS[2] = 0 // 24 bits Frame length
      SETTINGS[3] = 4 // 8 bits Frame type
      SETTINGS[4] = 0 // 8 bits for Settings flags
      SETTINGS[5] = 0 // 8 bits Reserved 'R'
      SETTINGS[8] = 2 // 31 bits Frame ID
      socket.write(Buffer.from(SETTINGS), read, function (err) {
        if (err) throw err
      })

      console.log('// Successfully sent HTTP2 SETTNIGS frame')
    }
    socket.read(buf, onread)
  })
})

server.listen(8080)
