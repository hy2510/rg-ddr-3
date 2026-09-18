import { useCallback, useEffect, useRef, useState } from 'react'

import { WhisperStatus, WorkerRequest, WorkerResponse } from '@src/types/whisper'

interface UseWhisperReturn {
  status: WhisperStatus
  transcript: string
  isModelLoaded: boolean
  loadModel: () => void
  transcribeBlob: (blob: Blob) => Promise<boolean>
  reset: () => void
  disposeBeforeVideoEncode: () => void
}

type PendingRequest = {
  resolve: (text: string) => void
  reject: (error: Error) => void
}

function resampleAudio(audioBuffer: AudioBuffer, targetSampleRate: number) {
  const sourceLength = audioBuffer.length
  const monoSamples = new Float32Array(sourceLength)
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const channelSamples = audioBuffer.getChannelData(channel)
    for (let index = 0; index < sourceLength; index += 1) {
      monoSamples[index] += channelSamples[index] / audioBuffer.numberOfChannels
    }
  }

  if (audioBuffer.sampleRate === targetSampleRate) return monoSamples

  const targetLength = Math.max(
    1,
    Math.round((sourceLength * targetSampleRate) / audioBuffer.sampleRate),
  )
  const resampled = new Float32Array(targetLength)
  const ratio = audioBuffer.sampleRate / targetSampleRate
  for (let index = 0; index < targetLength; index += 1) {
    const sourcePosition = index * ratio
    const leftIndex = Math.floor(sourcePosition)
    const rightIndex = Math.min(leftIndex + 1, sourceLength - 1)
    const fraction = sourcePosition - leftIndex
    resampled[index] =
      (monoSamples[leftIndex] ?? 0) * (1 - fraction) +
      (monoSamples[rightIndex] ?? 0) * fraction
  }
  return resampled
}

export function useWhisper(): UseWhisperReturn {
  const [status, setStatus] = useState<WhisperStatus>('idle')
  const [transcript, setTranscript] = useState('')
  const [isModelLoaded, setIsModelLoaded] = useState(false)

  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const pendingRef = useRef(new Map<number, PendingRequest>())
  const warmupPromiseRef = useRef<Promise<void> | undefined>(undefined)

  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current

    const worker = new Worker(
      new URL('../workers/whisper.worker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const pending = pendingRef.current.get(event.data.id)
      if (!pending) return
      pendingRef.current.delete(event.data.id)
      if (event.data.error) {
        pending.reject(new Error(event.data.error))
        return
      }
      pending.resolve(event.data.text ?? '')
    }
    worker.onerror = (event) => {
      const error = new Error(event.message || 'Whisper worker error')
      pendingRef.current.forEach(({ reject }) => reject(error))
      pendingRef.current.clear()
    }
    workerRef.current = worker
    return worker
  }, [])

  /**
   * 모델 로드 (warmup)
   * 중복 호출 방지: 이미 로딩 중이거나 완료된 경우 무시
   */
  const loadModel = useCallback(() => {
    if (isModelLoaded || status === 'loading') return

    setStatus('loading')
    warmupPromiseRef.current ??= new Promise<void>((resolve) => {
      const id = ++requestIdRef.current
      pendingRef.current.set(id, {
        resolve: () => {
          setIsModelLoaded(true)
          setStatus('ready')
          resolve()
        },
        reject: () => {
          // warmup 실패해도 ready로 간주 (transcribe 시점에 재시도)
          setIsModelLoaded(true)
          setStatus('ready')
          resolve()
        },
      })
      const msg: WorkerRequest = { id, type: 'init' }
      getWorker().postMessage(msg)
    })
  }, [getWorker, isModelLoaded, status])

  const transcribeBlob = useCallback(
    async (blob: Blob): Promise<boolean> => {
      if (status === 'transcribing') return false

      setStatus('transcribing')
      const context = new AudioContext()
      try {
        const decoded = await context.decodeAudioData(await blob.arrayBuffer())
        const samples = resampleAudio(decoded, 16_000)
        const id = ++requestIdRef.current

        const text = await new Promise<string>((resolve, reject) => {
          pendingRef.current.set(id, { resolve, reject })
          // Transferable로 효율적 전달
          getWorker().postMessage({ id, samples }, [samples.buffer])
        })

        console.log('✅ Whisper 결과:', text)
        setTranscript(text)
        setStatus('done')
      } catch (err) {
        console.error('❌ Whisper 에러:', err)
        setStatus('error')
      } finally {
        await context.close()
      }
      return true
    },
    [getWorker, status],
  )

  const disposeBeforeVideoEncode = useCallback(() => {
    try {
      workerRef.current?.terminate()
    } catch {
      // noop
    }
    workerRef.current = null
    warmupPromiseRef.current = undefined
    pendingRef.current.clear()
    setIsModelLoaded(false)
    setTranscript('')
    setStatus('idle')
  }, [])

  const reset = useCallback(() => {
    setTranscript('')
    setStatus(isModelLoaded ? 'ready' : 'idle')
  }, [isModelLoaded])

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  return {
    status,
    transcript,
    isModelLoaded,
    loadModel,
    transcribeBlob,
    reset,
    disposeBeforeVideoEncode,
  }
}
