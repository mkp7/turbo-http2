class Stream {
  constructor (sock, id) {
    this.sock = sock
    this.ID = id
    // this.DATA = Buffer.alloc(0)
    // this.HEADERS = {}
    // this.END_HEADERS = false
    // this.END_STREAM = false
    // this.STEAM_STATUS = 'idle'
  }

  // onData (data) {
  //   this.DATA = Buffer.concat([this.DATA, data])
  // }

  // onHeaders (headers) {
  //   this.HEADERS = { ...this.HEADERS, ...headers }
  // }

  // isEnded () {
  //   return (this.END_HEADERS && this.END_STREAM)
  // }
}

module.exports = Stream
