import { analyse } from './analyze'

self.onmessage = (e: MessageEvent<{ channels: Float32Array[]; sampleRate: number }>) => {
  try {
    self.postMessage({ analysis: analyse(e.data.channels, e.data.sampleRate) })
  } catch (err) {
    self.postMessage({ error: (err as Error).message })
  }
}
