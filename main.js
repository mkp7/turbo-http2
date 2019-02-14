const tls = require('tls')
const H2Connection = require('./connection')

function Server () {
  // array of request handlers for each method
  this.routes = {
    STATIC: '/static',
    GET: {},
    POST: {},
    PUT: {},
    DELETE: {}
    // head
    // options
  }

  this.static = dir => (this.routes.STATIC = dir)
  // register handlers for each routes
  this.get = (route, handler) => (this.routes.GET[route] = handler)
  this.post = (route, handler) => (this.routes.POST[route] = handler)
  this.put = (route, handler) => (this.routes.PUT[route] = handler)
  this.delete = (route, handler) => (this.routes.DELETE[route] = handler)

  this.listen = (port, options) => {
    options['ALPNProtocols'] = ['h2', 'http/1.1']
    // minVersion: 'TLSv1.2'
    const server = tls.createServer(options)

    server.on('secureConnection', sock => {
      console.log(sock.authorized, sock.authorizationError, sock.alpnProtocol)

      const h2Sock = new H2Connection(sock, this.routes)
      sock.on('data', h2Sock.onData.bind(h2Sock))
    })

    port = process.env.PORT || port || 8080

    server.listen(port, () => {
      console.log(`>> server bound on ${port}`)
    })
  }
}

module.exports = Server
