/**
 * 해당 파일은 IOS26버전의 whisper오류를 해결하기 위하여 copy해둔 파일입니다.
 */

// import {
//   AutomaticSpeechRecognitionPipeline,
//   env,
//   pipeline,
// } from '@huggingface/transformers'

// import { WorkerInMessage, WorkerOutMessage } from '../types/whisper'

// if (env.backends?.onnx?.wasm) {
//   console.log('env.backends.onnx.wasm', env.backends.onnx.wasm)
//   env.backends.onnx.wasm.numThreads = 1
//   env.backends.onnx.wasm.proxy = true
// }

// let transcriber: AutomaticSpeechRecognitionPipeline | null = null

// self.onmessage = async (e: MessageEvent<WorkerInMessage>) => {
//   const data = e.data

//   if (data.type === 'load') {
//     try {
//       self.postMessage({
//         type: 'status',
//         message: 'loading',
//       } satisfies WorkerOutMessage)

//       const MODEL = 'Xenova/whisper-tiny.en'

//       transcriber = await pipeline('automatic-speech-recognition', MODEL, {
//         dtype: 'q4',
//         device: 'wasm',
//         progress_callback: (progress: any) => {
//           self.postMessage({ type: 'progress', progress })
//         },
//       })

//       self.postMessage({
//         type: 'status',
//         message: 'ready',
//       } satisfies WorkerOutMessage)
//     } catch (err) {
//       console.error('모델 로딩 에러 상세:', err)
//       console.error('에러 타입:', typeof err)
//       console.error(
//         '에러 스택:',
//         err instanceof Error ? err.stack : String(err),
//       )

//       self.postMessage({
//         type: 'error',
//         message: err instanceof Error ? err.message : String(err),
//       } satisfies WorkerOutMessage)
//     }
//   }

//   if (data.type === 'transcribe') {
//     if (!transcriber) return

//     try {
//       self.postMessage({
//         type: 'status',
//         message: 'transcribing',
//       } satisfies WorkerOutMessage)

//       const result = await transcriber(data.audio, {
//         chunk_length_s: 30,
//         stride_length_s: 0,
//         return_timestamps: false,
//       })

//       const output = Array.isArray(result) ? result[0] : result
//       self.postMessage({
//         type: 'result',
//         text: output.text,
//         chunks: output.chunks,
//       } satisfies WorkerOutMessage)
//     } catch (err) {
//       self.postMessage({
//         type: 'error',
//         message: err instanceof Error ? err.message : '변환 실패',
//       } satisfies WorkerOutMessage)
//     }
//   }
// }
