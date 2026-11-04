// Your tracks: files stay in this browser's IndexedDB and are never uploaded.
import { del, get, set as idbSet } from 'idb-keyval'
import { useSyncExternalStore } from 'react'
import type { Analysis } from '../audio/analyze'
import { ac } from '../audio/engine'
import { recordEvent } from './progress'

export interface TrackMeta {
  id: string
  name: string
  size: number
  addedAt: number
  status: 'analysing' | 'ready' | 'error'
  error?: string
  analysis?: Analysis
  /** True after the user corrected the grid by hand. */
  edited?: boolean
}

let tracks: TrackMeta[] = []
let loading: Promise<void> | null = null
const subs = new Set<() => void>()

function changed() {
  // a course mission waits for two analysed tracks
  if (readyTracks().length >= 2) recordEvent('library:tracks-ready')
  for (const s of subs) s()
}

function emit(next: TrackMeta[]) {
  tracks = next
  void idbSet('tracks', tracks.filter((t) => t.status !== 'analysing'))
  changed()
}

/** Loads the saved track list once; every caller waits for the same load. */
export function loadLibrary(): Promise<void> {
  loading ??= (async () => {
    tracks = ((await get('tracks')) as TrackMeta[] | undefined) ?? []
    changed()
  })()
  return loading
}

export const getTracks = () => tracks
export const readyTracks = () => tracks.filter((t) => t.status === 'ready' && t.analysis)

export function useTracks(): TrackMeta[] {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => tracks,
  )
}

// small LRU of decoded buffers: a 6-minute stereo track is ~130 MB as floats
const cache = new Map<string, AudioBuffer>()
export async function decodeTrack(id: string): Promise<AudioBuffer> {
  const hit = cache.get(id)
  if (hit) {
    cache.delete(id)
    cache.set(id, hit)
    return hit
  }
  const blob = (await get(`file:${id}`)) as Blob | undefined
  if (!blob) throw new Error('Track file is missing')
  const buf = await ac().decodeAudioData(await blob.arrayBuffer())
  cache.set(id, buf)
  while (cache.size > 4) cache.delete(cache.keys().next().value!)
  return buf
}

function analyseInWorker(buf: AudioBuffer): Promise<Analysis> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('../audio/analyze.worker.ts', import.meta.url), { type: 'module' })
    const channels = Array.from({ length: Math.min(2, buf.numberOfChannels) }, (_, i) => buf.getChannelData(i).slice())
    w.onmessage = (e) => {
      w.terminate()
      if (e.data.error) reject(new Error(e.data.error))
      else resolve(e.data.analysis)
    }
    w.onerror = (e) => {
      w.terminate()
      reject(new Error(e.message))
    }
    w.postMessage({ channels, sampleRate: buf.sampleRate }, channels.map((c) => c.buffer))
  })
}

export async function addFiles(files: File[]) {
  // adding before the saved list has loaded would drop the saved tracks
  await loadLibrary()
  for (const f of files) {
    if (!f.type.startsWith('audio/') && !/\.(mp3|wav|flac|ogg|m4a|aac|aiff?|opus|webm)$/i.test(f.name)) continue
    const id = crypto.randomUUID()
    const meta: TrackMeta = { id, name: f.name.replace(/\.[^.]+$/, ''), size: f.size, addedAt: Date.now(), status: 'analysing' }
    await idbSet(`file:${id}`, f)
    emit([...tracks, meta])
  }
  // analyse sequentially to keep memory bounded
  for (const t of tracks.filter((t) => t.status === 'analysing')) {
    try {
      const buf = await decodeTrack(t.id)
      const analysis = await analyseInWorker(buf)
      update(t.id, { status: 'ready', analysis })
    } catch (e) {
      update(t.id, { status: 'error', error: (e as Error).message })
    }
  }
}

export function update(id: string, patch: Partial<TrackMeta>) {
  emit(tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)))
}

export function setGrid(id: string, bpm: number, anchor: number) {
  const t = tracks.find((x) => x.id === id)
  if (!t?.analysis) return
  update(id, { analysis: { ...t.analysis, bpm, anchor }, edited: true })
}

export async function removeTrack(id: string) {
  await del(`file:${id}`)
  cache.delete(id)
  emit(tracks.filter((t) => t.id !== id))
}

/** Where public/sw.js keeps audio shared to the installed app until the Library picks it up. */
const SHARE_CACHE = 'openskool-share'
let importing: Promise<void> | null = null

/** Moves audio files shared to the installed app (Web Share Target) into the library. */
export function importShared(): Promise<void> {
  if (typeof caches === 'undefined') return Promise.resolve()
  importing ??= (async () => {
    const cache = await caches.open(SHARE_CACHE)
    const files: File[] = []
    for (const req of await cache.keys()) {
      const res = await cache.match(req)
      await cache.delete(req)
      if (!res) continue
      const blob = await res.blob()
      files.push(new File([blob], decodeURIComponent(res.headers.get('x-filename') ?? 'Shared track'), { type: blob.type }))
    }
    if (files.length) void addFiles(files)
  })().finally(() => (importing = null))
  return importing
}
