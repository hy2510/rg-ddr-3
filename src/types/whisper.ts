export type WhisperStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'transcribing'
  | 'done'
  | 'error'

// Worker 메시지: Promise ID 기반 구조
export type WorkerRequest =
  | { id: number; type: 'init' }
  | { id: number; samples: Float32Array }

export type WorkerResponse = {
  id: number
  text?: string
  error?: string
}

// useWhisper 외부 인터페이스에서 사용
export interface TimestampChunk {
  text: string
  timestamp: [number, number | null]
}
