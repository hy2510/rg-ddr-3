import {
  type AutomaticSpeechRecognitionOutput,
  type AutomaticSpeechRecognitionPipeline,
  env,
  pipeline,
} from '@huggingface/transformers'

import { WorkerRequest, WorkerResponse } from '../types/whisper'

const assetBaseUrl = new URL(import.meta.env.BASE_URL, self.location.origin)

env.allowLocalModels = true
env.allowRemoteModels = false
env.localModelPath = new URL('models/', assetBaseUrl).href
const wasmBackend = env.backends.onnx.wasm
if (!wasmBackend) throw new Error('ONNX WASM backend is unavailable')
wasmBackend.wasmPaths = new URL('transformers-wasm/', assetBaseUrl).href

type Transcriber = AutomaticSpeechRecognitionPipeline

let transcriberPromise: Promise<Transcriber> | undefined

function getTranscriber() {
  transcriberPromise ??= (
    pipeline as unknown as (
      task: 'automatic-speech-recognition',
      model: string,
      options: { device: 'wasm'; dtype: 'q8' },
    ) => Promise<Transcriber>
  )('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
    device: 'wasm',
    dtype: 'q8',
  })
  return transcriberPromise
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id } = event.data

  // init: 모델 warmup
  if ('type' in event.data && event.data.type === 'init') {
    try {
      await getTranscriber()
    } catch {
      // warmup 실패해도 무시 — transcribe 시점에 재시도
    }
    self.postMessage({ id } satisfies WorkerResponse)
    return
  }

  // transcribe
  if (!('samples' in event.data) || !event.data.samples) return

  try {
    const transcriber = await getTranscriber()
    const output = await transcriber(event.data.samples)
    const result = Array.isArray(output)
      ? (output[0] as AutomaticSpeechRecognitionOutput | undefined)
      : output
    const text = result?.text
    self.postMessage({ id, text: text?.trim() ?? '' } satisfies WorkerResponse)
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    } satisfies WorkerResponse)
  }
}
