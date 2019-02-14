const fs = require('fs')
const Server = require('./main')

const options = {
  key: fs.readFileSync('../localhost-key.pem'),
  cert: fs.readFileSync('../localhost.pem')
}

const app = new Server()

app.get('/', (req, res) => {
  res.body = 'Hello World, from GeekSkool.'

  return res
})

app.get('/ping', (req, res) => {
  res.body = 'pong'

  return res
})

app.listen(3100, options)
