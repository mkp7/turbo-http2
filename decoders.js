module.exports = {
  decodeFrameHeader: (buf) => {
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
  },

  decodeDataFrame: (header, buf) => {
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
  },

  decodeHeadersFrame: (header, buf) => {
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

    const headers = this._decompressor.decompress(buf.slice(i, header[0] - padding))
    console.log(headers)

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
      headers,
      buf.slice(header[0])
    ]
  },

  decodePriorityFrame: (header, buf) => {
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
  },

  decodeRstStreamFrame: (header, buf) => {
    if (header[0] !== 4) {
      return null // stream error of type FRAME_SIZE_ERROR
    }

    if (Buffer.byteLength(buf) < header[0]) {
    // incomplete frame
      return null
    }

    return [buf.readUInt32BE(0), buf.slice(4)]
  },

  decodeSettingsFrame: (header, buf) => {
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
  },

  decodePushPromiseFrame: (header, buf) => {},

  decodePingFrame: (header, buf) => {},

  decodeGoawayFrame: (header, buf) => {},

  decodeWindowUpdateFrame: (header, buf) => {
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
  },

  decodeContinuationFrame: (header, buf) => {
    if (Buffer.byteLength(buf) < header[0]) {
    // incomplete frame
      return null
    }

    const headers = console.log(this._decompressor.decompress(buf.slice(0, header[0])))

    // check END_HEADERS (0x4) flag
    if (header[2] & 0x4) {
    // end of headers...
    }

    return [
      headers,
      buf.slice(header[0])
    ]
  }
}
