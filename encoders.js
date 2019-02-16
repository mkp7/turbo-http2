const encodeFrameHeader = (length, type, flags, id) => {
  const buf = Buffer.alloc(9)
  buf.writeUInt32BE(length << 8, 0) // 24 bits frame length
  buf.writeUInt8(type, 3) // 8 bits frame type
  buf.writeUInt8(flags, 4) // 8 bits frame flags
  buf.writeUInt32BE(id, 5) // 32-1 bits stream id

  return buf
}

const encodeHeaderFrame = (id, headers, flags, compressor) => {
  const frame = compressor.compress(headers)

  return Buffer.concat([encodeFrameHeader(Buffer.byteLength(frame), 0x1, flags, id), frame])
}

const encodeDataFrame = (id, data, flags) => {
  return Buffer.concat([
    encodeFrameHeader(Buffer.byteLength(Buffer.from(data)), 0x0, flags, id),
    Buffer.from(data)
  ])
}

const encodeWindowUpdateFrame = (id, size) => {
  const data = Buffer.alloc(4)
  data.writeInt32BE(size << 1 >> 1, 0)
  return Buffer.concat([
    encodeFrameHeader(4, 0x8, 0, id),
    data
  ])
}

module.exports = { encodeFrameHeader, encodeHeaderFrame, encodeDataFrame }
