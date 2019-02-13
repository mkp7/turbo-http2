const contentTypes = {
  html: 'text/html',
  js: 'application/javascript',
  json: 'application/json',
  css: 'text/css',
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  mp4: 'video/mp4'
}

function getContentType (filename) {
  const match = /\.(\w+)$/.exec(filename)
  if (match === null) {
    return undefined
  }

  return contentTypes[match[1]]
}

module.exports = getContentType
