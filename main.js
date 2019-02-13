const tls = require('tls')
const fs = require('fs')
const H2Connection = require

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

server.on('secureConnection', sock => {
  console.log(sock.authorized, sock.authorizationError, sock.alpnProtocol)

  const h2Sock = new H2Connection(sock)
  sock.on('data', h2Sock.onData.bind(h2Sock))
})

let port = process.env.PORT || 8000

server.listen(port, () => {
  console.log(`server bound on ${port}`)
})
