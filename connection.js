const Compressor = require('./compressor').Compressor
const Decompressor = require('./compressor').Decompressor
const decoders = require('./decoders')
const encoders = require('./encoders')
const Stream = require('./stream')
const getResponse = require('./response/get-response')

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

class H2Connection {
  constructor (socket, routes) {
    this.socket = socket
    this.routes = routes
    this.buffer = Buffer.from('')
    this.prefaceReceived = false
    this.settingsReceived = false
    // initial connection-level settings
    this.settings = {
      SETTINGS_INITIAL_WINDOW_SIZE: 65535,
      SETTINGS_MAX_FRAME_SIZE: 16384
    }
    this.streams = new Map()
    this._compressor = new Compressor(logger, 'RESPONSE')
    this._decompressor = new Decompressor(logger, 'RESPONSE')
    this.processFrames.bind(this)
    this.frameHandlers = [
      this.onDataFrame,
      this.onHeadersFrame,
      this.onPriorityFrame,
      this.onRstStreamFrame,
      this.onSettingsFrame,
      this.onPushPromiseFrame,
      this.onPingFrame,
      this.onGoAwayFrame,
      this.onWindowUpdateFrame,
      this.onContinuationFrame
    ]

    // write connection preface (possibly empty SETTINGS frame)
    this.socket.write(encoders.encodeFrameHeader(0, 4, 0, 0))
  }

  onDataFrame () {}
  onHeadersFrame () {}
  onPriorityFrame () {}
  onRstStreamFrame () {}
  onSettingsFrame () {}
  onPushPromiseFrame () {}
  onPingFrame () {}
  onGoAwayFrame () {}
  onWindowUpdateFrame () {}
  onContinuationFrame () {}

  processFrames () {
    // decode frame header
    let frameHeader = decoders[10](this.buffer)

    // could not parse frame header
    if (frameHeader === null) {
      return
    }

    // protocol error in case of (frameHeader[0][1] > 9)
    if (frameHeader[0][1] > 9 || decoders[frameHeader[0][1]] === undefined) {
      return
    }

    console.log(`> Frame type: ${frameHeader[0][1]}`)

    // create or update stream object
    let stream
    if (this.streams.has(frameHeader[0][3])) {
      // existing stream
      stream = this.streams.get(frameHeader[0][3])
    } else {
      // new stream
      stream = new Stream(frameHeader[0][3])
      this.streams.set(stream.ID, stream)
    }

    let framePayload = null
    switch (frameHeader[0][1]) {
      case 0: // DATA (0x0) frame
        framePayload = decoders[0](...frameHeader)
        if (framePayload === null) {
          return // there may be an error
        }
        stream.onData(frameHeader[0][2], framePayload[0])
        break
      case 1: // HEADERS (0x1) frame
        framePayload = decoders[1](...frameHeader, this._decompressor)
        if (framePayload === null) {
          return // there may be an error
        }
        stream.onHeaders(frameHeader[0][2], framePayload[0])
        break
      case 9: // CONTINUATION (0x9) frame
        framePayload = decoders[9](...frameHeader, this._decompressor)
        if (framePayload === null) {
          return // there may be an error
        }
        stream.onHeaders(frameHeader[0][2], framePayload[0])
        break
      case 2: // PRIORITY (0x2) frame
      case 3: // RST_STREAM (0x3) frame
      case 4: // SETTINGS (0x4) frame
      case 8: // WINDOW_UPDATE (0x8) frame
        framePayload = decoders[frameHeader[0][1]](...frameHeader)
        break
    }
    // decoders should return stream object and remaining buf

    if (framePayload === null) {
      return
    }

    // check END_STREAM (0x1) & END_HEADERS (0x4) flags
    if (stream.isEnded() && stream.STATE !== 'closed') {
      console.log('> Request received:')
      console.log({ ':method': stream.HEADERS[':method'], ':path': stream.HEADERS[':path'] })
      const response = getResponse(
        { headers: stream.HEADERS, body: stream.DATA },
        this.routes
      )

      console.log(`> Writing headers and data for Stream ID: ${stream.ID}`)
      console.log(`> Response body length: ${Buffer.byteLength(response.body)}`)
      // writing headers
      this.socket.write(encoders.encodeHeaderFrame(
        stream.ID,
        { ...response.headers, date: (new Date()).toUTCString() },
        0 | 0x4,
        this._compressor
      ))

      // split data into window size frames
      let data = Buffer.from(response.body)
      while (Buffer.byteLength(data) > this.settings.SETTINGS_MAX_FRAME_SIZE) {
        // writing data
        this.socket.write(encoders.encodeDataFrame(
          stream.ID,
          data.slice(0, this.settings.SETTINGS_MAX_FRAME_SIZE),
          0
        ))
        data = data.slice(this.settings.SETTINGS_MAX_FRAME_SIZE)
      }

      // writing data
      this.socket.write(encoders.encodeDataFrame(
        stream.ID,
        data,
        0 | 0x1
      ))

      stream.STATE = 'closed'
    }
    // based on the state of stream, process the request
    // generate the response and write it in frames

    this.buffer = framePayload[1]
    this.processFrames()
  }

  onData (buf) {
    // concat incoming buffer with existing buffer
    this.buffer = Buffer.concat([this.buffer, buf])

    // check whether connection preface is received
    if (!this.prefaceReceived) {
      const rbuf = decodeConnectionPreface(this.buffer)
      if (rbuf) {
        this.buffer = rbuf
        this.prefaceReceived = true
        console.log('>> H2 Connection Preface received')
      }
    }

    // after receiving connection preface, check whether initial SETTINGS is received
    if (this.prefaceReceived && !this.settingsReceived) {
      let data = decoders[10](this.buffer)

      // could not parse frame header
      if (data === null) {
        return
      }

      data = decoders[4](...data)

      // could not decode frame payload
      if (data === null) {
        return
      }

      this.settings = { ...this.settings, ...data[0] }
      this.buffer = data[1]
      this.settingsReceived = true
      console.log('>> Initial SETTINGS received')
      console.log(this.settings)
      // write SETTINGS ACK for initial SETTINGS
      this.socket.write(encoders.encodeFrameHeader(0, 4, 0 | 0x1, 0))
    }

    // there maybe protocol error
    if (!(this.prefaceReceived && this.settingsReceived)) {
      return
    }

    this.processFrames()
  }
}

module.exports = H2Connection
