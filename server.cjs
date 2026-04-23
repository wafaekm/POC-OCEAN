const { WebSocketServer, WebSocket } = require('ws')

const PORT = 8787
const AISSTREAM_API_KEY = process.env.AISSTREAM_API_KEY

if (!AISSTREAM_API_KEY) {
  console.error('AISSTREAM_API_KEY is missing')
  process.exit(1)
}

const wss = new WebSocketServer({ port: PORT })

wss.on('connection', client => {
  console.log('Frontend connected')

  const upstream = new WebSocket('wss://stream.aisstream.io/v0/stream')

  upstream.on('open', () => {
    console.log('Connected to AISStream')

    upstream.send(JSON.stringify({
      APIKey: AISSTREAM_API_KEY,
      BoundingBoxes: [[[46.0, -1.6], [46.5, -0.8]]],
      FilterMessageTypes: [
        'PositionReport',
        'StandardClassBPositionReport',
        'ExtendedClassBPositionReport',
        'LongRangeAisBroadcastMessage',
        'ShipStaticData',
        'StaticDataReport',
        'SafetyBroadcastMessage',
        'AddressedSafetyMessage',
        'StandardSearchAndRescueAircraftReport'
      ]
    }))
  })

  upstream.on('message', data => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data.toString())
    }
  })

  upstream.on('close', (code, reason) => {
    console.log('AISStream closed', code, reason.toString())
    if (client.readyState === WebSocket.OPEN) client.close()
  })

  upstream.on('error', err => {
    console.error('AISStream error', err)
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ error: String(err) }))
    }
  })

  client.on('close', () => {
    console.log('Frontend disconnected')
    if (upstream.readyState === WebSocket.OPEN) upstream.close()
  })

  client.on('error', err => {
    console.error('Frontend socket error', err)
  })
})

wss.on('listening', () => {
  console.log(`Relay listening on ws://localhost:${PORT}`)
})

wss.on('error', err => {
  console.error('Relay server error', err)
})