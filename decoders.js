// function FrameHeader (length, type, flags, id) {
//   this.length = length
//   this.type = type
//   this.flags = flags
//   this.id = id
// }

const decodeFrameHeader = (buf) => {
  // Frame header is not complete
  if (Buffer.byteLength(buf) < 9) {
    return null
  }

  // decode 8 bits flags
  /*
    const flags = buf.readUInt8(3)
    [
      (flags & (1 << 0)) !== 0,
      (flags & (1 << 1)) !== 0,
      (flags & (1 << 2)) !== 0,
      (flags & (1 << 3)) !== 0,
      (flags & (1 << 4)) !== 0,
      (flags & (1 << 5)) !== 0,
      (flags & (1 << 6)) !== 0,
      (flags & (1 << 7)) !== 0,
    ]
   */

  return [
    [
      buf.readUInt32BE(0) >> 8, // 24 bits frame length
      buf.readUInt8(3), // 8 bits frame type
      buf.readUInt8(4), // 8 bits frame flags
      buf.readUInt32BE(5) << 1 >> 1 // 31 bits stream id
    ], buf.slice(9) // remaining buffer
  ]
}

const decodeDataFrame = (header, buf, socket, compressor, decompressor) => {
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

  return [
    buf.slice(0, header[0]),
    buf.slice(header[0])
  ]
}

const decodeHeadersFrame = (header, buf, decompressor) => {
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

  const headers = decompressor.decompress(buf.slice(i, header[0] - padding))
  console.log(headers)

  return [
    headers,
    buf.slice(header[0])
  ]
}

const decodePriorityFrame = (header, buf) => {
  if (header[0] !== 5) {
    return null // stream error of type FRAME_SIZE_ERROR
  }

  if (Buffer.byteLength(buf) < header[0]) {
    // incomplete frame
    return null
  }

  console.log(`> Stream ID ${header[3]} depends on stream ID ${buf.readUInt32BE(0) << 1 >> 1}`)

  return [
    [
      buf.readUInt32BE(0) << 31 >> 31,
      buf.readUInt32BE(0) << 1 >> 1,
      buf.readUInt8(4)
    ],
    buf.slice(5)
  ]
}

const decodeRstStreamFrame = (header, buf) => {
  if (header[0] !== 4) {
    return null // stream error of type FRAME_SIZE_ERROR
  }

  if (Buffer.byteLength(buf) < header[0]) {
    // incomplete frame
    return null
  }

  return [buf.readUInt32BE(0), buf.slice(4)]
}

const decodeSettingsFrame = (header, buf) => {
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

const decodePushPromiseFrame = (header, buf) => { }

const decodePingFrame = (header, buf) => { }

const decodeGoawayFrame = (header, buf) => { }

const decodeWindowUpdateFrame = (header, buf) => {
  // check frame length
  if (header[0] !== 4) {
    return null // connection error of type FRAME_SIZE_ERROR
  }

  // incomeplete frame
  if (Buffer.byteLength(buf) < 4) {
    return null
  }

  console.log(`>> WINDOW_UPDATE: ${buf.readUInt32BE(0) << 1 >> 1}`)

  return [
    buf.readUInt32BE(0) << 1 >> 1, // 31 bits
    buf.slice(4)
  ]
}

const decodeContinuationFrame = (header, buf, decompressor) => {
  if (Buffer.byteLength(buf) < header[0]) {
    // incomplete frame
    return null
  }

  const headers = console.log(decompressor.decompress(buf.slice(0, header[0])))

  // check END_HEADERS (0x4) flag
  if (header[2] & 0x4) {
    // end of headers...
  }

  return [
    headers,
    buf.slice(header[0])
  ]
}

module.exports = [
  decodeDataFrame, // DATA (0x0) frame decoder
  decodeHeadersFrame, // HEADERS (0x1) frame decoder
  decodePriorityFrame, // PRIORITY (0x2) frame decoder
  decodeRstStreamFrame, // RST_STREAM (0x3) frame decoder
  decodeSettingsFrame, // SETTINGS (0x4) frame decoder
  undefined, // decodePushPromiseFrame, // PUSH_PROMISE (0x5) frame decoder
  undefined, // decodePingFrame, // PING (0x6) frame decoder
  undefined, // decodeGoawayFrame, // GOAWAY (0x7) frame decoder
  decodeWindowUpdateFrame, // WINDOW_UPDATE (0x8) frame decoder
  decodeContinuationFrame, // CONTINUATION (0x9) frame decoder
  decodeFrameHeader // frame header decoder
]
