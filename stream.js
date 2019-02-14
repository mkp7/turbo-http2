const STREAM_STATES = new Map()
STREAM_STATES.set('idle', 'idle')
STREAM_STATES.set('reserved (local)', 'reserved (local)')
STREAM_STATES.set('reserved (remote)', 'reserved (remote)')
STREAM_STATES.set('open', 'open')
STREAM_STATES.set('half-closed (local)', 'half-closed (local)')
STREAM_STATES.set('half-closed (remote)', 'half-closed (remote)')
STREAM_STATES.set('closed', 'closed')

class Stream {
  constructor (id) {
    this.ID = id
    this.DATA = Buffer.alloc(0)
    this.HEADERS = {}

    // flags
    this.END_HEADERS = false // (0x1) - bit 0
    this.END_STREAM = false // (0x4) - bit 2

    // state
    this.STATE = STREAM_STATES.get('idle')
  }

  onData (flags, data) {
    if (this.END_STREAM) {
      // stream error of type STREAM_CLOSED
      return
    }

    // check END_STREAM (0x1) flag
    if (flags & 0x1) {
      this.END_STREAM = true
    }

    this.DATA = Buffer.concat([this.DATA, data])
  }

  onHeaders (flags, headers) {
    // connection error of type PROTOCOL_ERROR
    if (this.END_HEADERS) {
      return
    }

    // check END_STREAM (0x1) flag
    if (flags & 0x1) {
      this.END_STREAM = true
    }

    // check END_HEADERS (0x4) flag
    if (flags & 0x4) {
      this.END_HEADERS = true
    }

    this.HEADERS = { ...this.HEADERS, ...headers }
  }

  isEnded () {
    return (this.END_HEADERS && this.END_STREAM)
  }
}

module.exports = Stream
