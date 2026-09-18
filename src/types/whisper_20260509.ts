// export type WhisperStatus =
//   | 'idle'
//   | 'loading'
//   | 'ready'
//   | 'transcribing'
//   | 'done'
//   | 'error'

// export type WorkerInMessage =
//   | { type: 'load' }
//   | { type: 'transcribe'; audio: Float32Array } // language 제거

// export type WorkerOutMessage =
//   | { type: 'status'; message: string }
//   | { type: 'progress'; progress: ProgressInfo }
//   | { type: 'result'; text: string; chunks?: TimestampChunk[] }
//   | { type: 'error'; message: string }

// export interface ProgressInfo {
//   status: string
//   name?: string
//   progress?: number
//   loaded?: number
//   total?: number
// }

// export interface TimestampChunk {
//   text: string
//   timestamp: [number, number | null]
// }
