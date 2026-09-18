import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'

import { type CaptionCue } from '@components/dubbing/caption/captionTimeline'
import { useWhisperContext } from '@contexts/WhisperContext'
import type { WhisperStatus } from '@src/types/whisper'

// 정규화 후 동일하거나(거의 일치) 한 글자 정도의 작은 차이만 허용한다.
const MATCH_THRESHOLD = 0.25
const STT_FINALIZE_SETTLE_DELAY_MS = 50

// 예외 단어 목록.
const EXCEPTION_WORDS: ReadonlySet<string> = new Set<string>([
  'leoni',
  'oho',
  'gino',
  'dodo',
  'ahhh',
])

function isExceptionCueWord(word: string): boolean {
  return EXCEPTION_WORDS.has(normalizeWord(word))
}

type UseCueRecordingParams = {
  videoRef: RefObject<HTMLVideoElement | null>
  activeCue: CaptionCue | null
  timelineCueIndex?: number | null
  enabled?: boolean
  onRecordingComplete?: (result: {
    cue: CaptionCue
    cueTimelineIndex: number
    matched: number
    total: number
    matchedIndexes: number[]
  }) => void
  onRecordedAudioAvailable?: (result: {
    cue: CaptionCue
    cueTimelineIndex: number
    audioBlob: Blob
  }) => void
}

type UseCueRecordingResult = {
  isRecording: boolean
  /** startRecording 호출 ~ 실제 녹음 시작 사이의 준비 구간 */
  isStartingRecording: boolean
  hasRecorded: boolean
  /** 녹음 완료 후 Whisper 결과를 기다리는 중 */
  isWhisperPending: boolean
  isPlayingRecording: boolean
  matchedWordIndexes: Set<number>
  recordedAudioUrl: string | null
  whisperStatus: WhisperStatus
  /** Whisper 모델이 워커에서 ready 될 때까지 false */
  isModelLoaded: boolean
  startRecording: (
    cueOverride?: CaptionCue,
    sessionTimelineIndex?: number | null,
  ) => void
  playRecording: (cueOverride?: CaptionCue) => void
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[] = new Array(n + 1)
  for (let j = 0; j <= n; j += 1) dp[j] = j
  for (let i = 1; i <= m; i += 1) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j += 1) {
      const temp = dp[j]
      dp[j] =
        a[i - 1] === b[j - 1] ? prev : Math.min(prev, dp[j - 1], dp[j]) + 1
      prev = temp
    }
  }
  return dp[n]
}

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function similarity(a: string, b: string): number {
  const aa = normalizeWord(a)
  const bb = normalizeWord(b)
  if (!aa && !bb) return 1
  if (!aa || !bb) return 0
  if (aa === bb) return 1
  const maxLen = Math.max(aa.length, bb.length)
  return 1 - levenshtein(aa, bb) / maxLen
}

export function splitCueWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

function matchWords(cueWords: string[], spokenWords: string[]): Set<number> {
  const matched = new Set<number>()
  const usedSpoken = new Set<number>()

  for (let i = 0; i < cueWords.length; i += 1) {
    if (isExceptionCueWord(cueWords[i])) continue
    for (let j = 0; j < spokenWords.length; j += 1) {
      if (usedSpoken.has(j)) continue
      if (similarity(spokenWords[j], cueWords[i]) >= MATCH_THRESHOLD) {
        matched.add(i)
        usedSpoken.add(j)
        break
      }
    }
  }

  for (let i = 0; i < cueWords.length; i += 1) {
    if (!isExceptionCueWord(cueWords[i])) continue
    for (let j = 0; j < spokenWords.length; j += 1) {
      if (usedSpoken.has(j)) continue
      if (similarity(spokenWords[j], cueWords[i]) >= MATCH_THRESHOLD) {
        matched.add(i)
        usedSpoken.add(j)
        break
      }
    }
  }

  return matched
}

/**
 * STT 종료 후: 아직 매칭되지 않은 예외 단어만 보정한다.
 */
function applyPostSttExceptionMatches(
  cueWords: string[],
  spokenWords: string[],
  matched: Set<number>,
): void {
  if (cueWords.length === 1 && isExceptionCueWord(cueWords[0])) {
    matched.add(0)
    return
  }

  const nonExcIndices = cueWords
    .map((w, i) => (!isExceptionCueWord(w) ? i : -1))
    .filter((i) => i >= 0)

  const allNonExcMatched =
    nonExcIndices.length === 0 || nonExcIndices.every((idx) => matched.has(idx))
  if (!allNonExcMatched) return

  const hasExtraSpeech =
    nonExcIndices.length === 0
      ? spokenWords.length > 0
      : spokenWords.length > nonExcIndices.length

  if (!hasExtraSpeech) return

  for (let i = 0; i < cueWords.length; i += 1) {
    if (!isExceptionCueWord(cueWords[i]) || matched.has(i)) continue
    const priorNonExcOk = cueWords.every((w, j) => {
      if (j >= i) return true
      if (isExceptionCueWord(w)) return true
      return matched.has(j)
    })
    if (priorNonExcOk) {
      matched.add(i)
    }
  }
}

export function useCueRecording({
  videoRef,
  activeCue,
  timelineCueIndex = null,
  enabled = true,
  onRecordingComplete,
  onRecordedAudioAvailable,
}: UseCueRecordingParams): UseCueRecordingResult {
  const [isRecording, setIsRecording] = useState(false)
  // startRecording 호출 ~ 실제 MediaRecorder.start() 사이의 준비 구간 플래그
  const [isStartingRecording, setIsStartingRecording] = useState(false)
  const [hasRecorded, setHasRecorded] = useState(false)
  const [isPlayingRecording, setIsPlayingRecording] = useState(false)
  const [matchedWordIndexes, setMatchedWordIndexes] = useState<Set<number>>(
    () => new Set(),
  )
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null)

  // Whisper hook — 녹음 종료 후 blob → 텍스트 변환
  const {
    loadModel,
    transcribeBlob,
    transcript,
    isModelLoaded,
    status: whisperStatus,
  } = useWhisperContext()

  const activeCueRef = useRef<CaptionCue | null>(activeCue)
  const matchedWordIndexesRef = useRef<Set<number>>(matchedWordIndexes)
  const onRecordingCompleteRef = useRef(onRecordingComplete)
  const onRecordedAudioAvailableRef = useRef(onRecordedAudioAvailable)
  const timelineCueIndexRef = useRef<number | null>(timelineCueIndex)

  // Whisper 결과 처리에 사용할 세션 정보 보관
  const pendingWhisperCueRef = useRef<CaptionCue | null>(null)
  const pendingWhisperSessionIndexRef = useRef<number>(-1)
  // Whisper 결과 대기 중 여부 (녹음 완료 ~ Whisper 결과 수신 사이의 갭을 추적)
  const [isWhisperPending, setIsWhisperPending] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recordingSessionIdRef = useRef<number>(0)
  const recordingDurationTimerRef = useRef<number | null>(null)
  const recordingVideoEndCleanupRef = useRef<(() => void) | null>(null)
  const recordingSessionEndHandledRef = useRef<number>(0)
  const finalizeTimerRef = useRef<number | null>(null)

  const playbackAudioRef = useRef<HTMLAudioElement | null>(null)
  const playbackPauseListenerRef = useRef<(() => void) | null>(null)

  const lastActiveCueKeyRef = useRef<string | null>(null)

  // 최신 값 동기화
  useEffect(() => {
    matchedWordIndexesRef.current = matchedWordIndexes
    onRecordingCompleteRef.current = onRecordingComplete
    onRecordedAudioAvailableRef.current = onRecordedAudioAvailable
  })

  useEffect(() => {
    activeCueRef.current = activeCue
  }, [activeCue])

  useEffect(() => {
    timelineCueIndexRef.current = timelineCueIndex
  }, [timelineCueIndex])

  // 인코딩 전 dispose 후 등: 모델이 없으면 다시 로드
  useEffect(() => {
    if (!enabled) return
    if (isModelLoaded) return
    if (whisperStatus === 'loading' || whisperStatus === 'transcribing') return
    loadModel()
  }, [enabled, isModelLoaded, whisperStatus, loadModel])

  // 실제로 다른 큐로 전환된 경우에만 매칭 상태 초기화
  useEffect(() => {
    if (!activeCue) return
    const key = `${activeCue.start}-${activeCue.end}`
    if (lastActiveCueKeyRef.current === key) return
    lastActiveCueKeyRef.current = key

    setMatchedWordIndexes(new Set())
    setHasRecorded(false)
    setIsWhisperPending(false)
    pendingWhisperCueRef.current = null
    pendingWhisperSessionIndexRef.current = -1
    setRecordedAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [activeCue])

  /**
   * Whisper 결과(transcript 또는 fallback)를 받아 채점하고 상태를 갱신한다.
   * - spokenText가 null이면 0점 처리 (빈 transcript, error, early-return 등)
   * - cue/sessionIndex가 유효하지 않으면 상태 초기화만 수행
   */
  const finalizeWithResult = useCallback(
    (
      cue: CaptionCue | null,
      sessionIndex: number,
      spokenText: string | null,
    ) => {
      pendingWhisperCueRef.current = null
      pendingWhisperSessionIndexRef.current = -1
      setIsWhisperPending(false)
      setHasRecorded(true)

      if (!cue || sessionIndex < 0) return

      const cueWords = splitCueWords(cue.text)

      let matched: Set<number>
      if (spokenText === null) {
        matched = new Set()
      } else {
        // hallucination 패턴([...] 또는 (...) 전체, 음표 기호만)은 무음으로 간주해 0점 처리
        const isHallucination =
          /^\[.*\]$/.test(spokenText.trim()) ||
          /^\(.*\)$/.test(spokenText.trim()) ||
          /^[♩♪♫♬♭♮♯\s]+$/.test(spokenText.trim())
        const spokenWords = isHallucination
          ? []
          : spokenText.split(/\s+/).filter(Boolean)
        matched = matchWords(cueWords, spokenWords)
        applyPostSttExceptionMatches(cueWords, spokenWords, matched)
      }

      matchedWordIndexesRef.current = matched
      setMatchedWordIndexes(matched)

      const callback = onRecordingCompleteRef.current
      if (callback) {
        const matchedIndexes = Array.from(matched).sort((a, b) => a - b)
        callback({
          cue,
          cueTimelineIndex: sessionIndex,
          matched: matchedIndexes.length,
          total: cueWords.length,
          matchedIndexes,
        })
      }
    },
    [],
  )

  // Whisper 결과(transcript)가 바뀌면 단어 매칭 및 채점 수행
  useEffect(() => {
    if (!transcript) return

    const cue = pendingWhisperCueRef.current
    const sessionIndex = pendingWhisperSessionIndexRef.current
    if (!cue || sessionIndex < 0) return

    finalizeWithResult(cue, sessionIndex, transcript)
  }, [transcript, finalizeWithResult])

  useEffect(() => {
    if (whisperStatus !== 'error' && whisperStatus !== 'done') return
    // done이지만 transcript가 빈 문자열인 경우 transcript useEffect가 건너뛰므로 여기서 처리
    // error인 경우도 동일하게 0점 처리
    if (!isWhisperPending) return

    const cue = pendingWhisperCueRef.current
    const sessionIndex = pendingWhisperSessionIndexRef.current
    finalizeWithResult(cue, sessionIndex, null)
  }, [whisperStatus, isWhisperPending, finalizeWithResult])

  /** MediaRecorder/MediaStream 리소스를 정리하고 녹음 상태를 초기화한다. */
  const cleanupMediaResources = useCallback(() => {
    if (recordingVideoEndCleanupRef.current) {
      recordingVideoEndCleanupRef.current()
      recordingVideoEndCleanupRef.current = null
    }
    if (finalizeTimerRef.current != null) {
      window.clearTimeout(finalizeTimerRef.current)
      finalizeTimerRef.current = null
    }

    const recorder = mediaRecorderRef.current
    if (recorder) {
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          // noop
        }
      } else {
        const stream = mediaStreamRef.current
        if (stream) {
          stream.getTracks().forEach((track) => track.stop())
          mediaStreamRef.current = null
        }
      }
      mediaRecorderRef.current = null
    } else {
      const stream = mediaStreamRef.current
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
      }
    }
  }, [])

  const completeRecordingSession = useCallback(
    (cueAtStop: CaptionCue, sessionId: number, sessionCueIndex: number) => {
      if (recordingSessionIdRef.current !== sessionId) return
      if (recordingSessionEndHandledRef.current === sessionId) return
      recordingSessionEndHandledRef.current = sessionId

      cleanupMediaResources()

      const video = videoRef.current
      if (video) {
        try {
          video.pause()
        } catch {
          // noop
        }
        video.currentTime = Math.max(cueAtStop.start, cueAtStop.end)
        video.muted = false
      }

      setIsRecording(false)

      // Whisper 미로드 상황 대비 fallback: 0점으로 즉시 처리
      if (!isModelLoaded) {
        finalizeTimerRef.current = window.setTimeout(() => {
          finalizeTimerRef.current = null
          finalizeWithResult(cueAtStop, sessionCueIndex, null)
        }, STT_FINALIZE_SETTLE_DELAY_MS)
      }
    },
    [cleanupMediaResources, finalizeWithResult, isModelLoaded, videoRef],
  )

  const stopRecording = useCallback(() => {
    cleanupMediaResources()
    const video = videoRef.current
    if (video) {
      video.muted = false
    }
    setIsRecording(false)
  }, [cleanupMediaResources, videoRef])

  const stopPlayback = useCallback(() => {
    const audio = playbackAudioRef.current
    if (audio) {
      try {
        audio.pause()
      } catch {
        // noop
      }
      audio.src = ''
      playbackAudioRef.current = null
    }
    const video = videoRef.current
    if (video) {
      if (playbackPauseListenerRef.current) {
        video.removeEventListener('pause', playbackPauseListenerRef.current)
        playbackPauseListenerRef.current = null
      }
      video.muted = false
    }
    setIsPlayingRecording(false)
  }, [videoRef])

  const playRecording = useCallback(
    (cueOverride?: CaptionCue) => {
      if (!enabled) return
      if (!isModelLoaded || whisperStatus === 'transcribing') return
      const cue = cueOverride ?? activeCueRef.current
      const video = videoRef.current
      const audioUrl = recordedAudioUrl
      if (!cue || !video || !audioUrl) return

      if (playbackAudioRef.current) {
        stopPlayback()
        video.pause()
        return
      }

      if (mediaRecorderRef.current) {
        stopRecording()
      }

      video.muted = true
      video.currentTime = cue.start
      video.play().catch((error: unknown) => {
        console.error('Cue replay (playback) failed:', error)
      })

      const audio = new Audio(audioUrl)
      audio.addEventListener('ended', () => {
        if (playbackAudioRef.current === audio) {
          playbackAudioRef.current = null
        }
      })
      audio.play().catch((error: unknown) => {
        console.error('Recorded audio play failed:', error)
      })
      playbackAudioRef.current = audio

      const handlePause = () => {
        stopPlayback()
      }
      video.addEventListener('pause', handlePause)
      playbackPauseListenerRef.current = handlePause

      setIsPlayingRecording(true)
    },
    [
      enabled,
      recordedAudioUrl,
      stopPlayback,
      stopRecording,
      videoRef,
      whisperStatus,
      isModelLoaded,
    ],
  )

  const startRecording = useCallback(
    (cueOverride?: CaptionCue, sessionTimelineIndex?: number | null) => {
      if (!enabled) return
      if (!isModelLoaded || whisperStatus === 'transcribing') return
      const cue = cueOverride ?? activeCueRef.current
      const video = videoRef.current
      if (!cue || !video) return

      const sessionCueIndexResolved =
        sessionTimelineIndex ?? timelineCueIndexRef.current
      const sessionCueIndex =
        typeof sessionCueIndexResolved === 'number' &&
        sessionCueIndexResolved >= 0
          ? sessionCueIndexResolved
          : -1

      if (playbackAudioRef.current) {
        stopPlayback()
      }

      if (mediaRecorderRef.current) {
        stopRecording()
        if (!cueOverride) return
      }

      setIsStartingRecording(true)

      setRecordedAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })

      const initialMatchedWordIndexes = new Set<number>()
      matchedWordIndexesRef.current = initialMatchedWordIndexes
      setMatchedWordIndexes(initialMatchedWordIndexes)
      setHasRecorded(false)

      recordingSessionIdRef.current += 1
      const sessionId = recordingSessionIdRef.current
      recordingSessionEndHandledRef.current = 0

      const durationMs = Math.max(0, (cue.end - cue.start) * 1000)

      const armRecordingEndTimer = () => {
        if (recordingSessionIdRef.current !== sessionId) return
        if (recordingVideoEndCleanupRef.current) {
          recordingVideoEndCleanupRef.current()
          recordingVideoEndCleanupRef.current = null
        }

        const stopWhenVideoReachesCueEnd = () => {
          if (recordingSessionIdRef.current !== sessionId) return
          if (video.currentTime < cue.end && !video.ended) return
          completeRecordingSession(cue, sessionId, sessionCueIndex)
        }

        video.addEventListener('timeupdate', stopWhenVideoReachesCueEnd)
        video.addEventListener('ended', stopWhenVideoReachesCueEnd)

        recordingDurationTimerRef.current = window.setTimeout(
          () => completeRecordingSession(cue, sessionId, sessionCueIndex),
          Math.max(durationMs + 5000, 10000),
        )

        recordingVideoEndCleanupRef.current = () => {
          video.removeEventListener('timeupdate', stopWhenVideoReachesCueEnd)
          video.removeEventListener('ended', stopWhenVideoReachesCueEnd)
          if (recordingDurationTimerRef.current != null) {
            window.clearTimeout(recordingDurationTimerRef.current)
            recordingDurationTimerRef.current = null
          }
        }

        stopWhenVideoReachesCueEnd()
      }

      const startVideoForDisplayOnly = () => {
        if (recordingSessionIdRef.current !== sessionId) return
        video.muted = true
        video.currentTime = cue.start
        void video.play().catch((error: unknown) => {
          console.error('Cue replay failed:', error)
        })
      }

      if (
        typeof navigator !== 'undefined' &&
        navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== 'undefined'
      ) {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            if (recordingSessionIdRef.current !== sessionId) {
              stream.getTracks().forEach((track) => track.stop())
              setIsStartingRecording(false)
              return
            }

            mediaStreamRef.current = stream
            const recorder = new MediaRecorder(stream)
            const chunks: Blob[] = []

            recorder.ondataavailable = (event) => {
              if (recordingSessionIdRef.current !== sessionId) return
              if (event.data && event.data.size > 0) {
                chunks.push(event.data)
              }
            }

            recorder.onstop = () => {
              stream.getTracks().forEach((track) => track.stop())
              if (mediaStreamRef.current === stream) {
                mediaStreamRef.current = null
              }

              if (recordingSessionIdRef.current !== sessionId) return
              if (chunks.length === 0) return

              const blob = new Blob(chunks, {
                type: recorder.mimeType || 'audio/webm',
              })
              if (blob.size === 0) return

              // 재생용 URL 생성
              const url = URL.createObjectURL(blob)
              setRecordedAudioUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev)
                return url
              })

              // 외부로 blob notify (다운로드용 보관 등)
              if (onRecordedAudioAvailableRef.current && sessionCueIndex >= 0) {
                onRecordedAudioAvailableRef.current({
                  cue,
                  cueTimelineIndex: sessionCueIndex,
                  audioBlob: blob,
                })
              }

              // Whisper 변환 요청
              // pending 정보를 먼저 세팅해두어야 transcript useEffect 에서 참조할 수 있다.
              pendingWhisperCueRef.current = cue
              pendingWhisperSessionIndexRef.current = sessionCueIndex
              setIsWhisperPending(true)
              void transcribeBlob(blob).then((accepted) => {
                // 이미 transcribing 중이라 early return된 경우 0점으로 즉시 처리
                if (!accepted) {
                  finalizeWithResult(cue, sessionCueIndex, null)
                }
              })
            }

            mediaRecorderRef.current = recorder

            try {
              recorder.start()
              setIsStartingRecording(false)
              setIsRecording(true)
              startVideoForDisplayOnly()
              armRecordingEndTimer()
            } catch (error) {
              console.error('Failed to start MediaRecorder:', error)
              setIsStartingRecording(false)
              stream.getTracks().forEach((track) => track.stop())
              if (mediaStreamRef.current === stream) {
                mediaStreamRef.current = null
              }
              stopRecording()
            }
          })
          .catch((err: unknown) => {
            console.warn('Microphone access failed:', err)
            setIsStartingRecording(false)
            stopRecording()
          })
      }
    },
    [
      completeRecordingSession,
      enabled,
      finalizeWithResult,
      stopPlayback,
      stopRecording,
      transcribeBlob,
      videoRef,
      whisperStatus,
      isModelLoaded,
    ],
  )

  // 언마운트 시 정리
  useEffect(() => {
    const videoElement = videoRef.current
    return () => {
      recordingSessionIdRef.current += 1

      cleanupMediaResources()

      const audio = playbackAudioRef.current
      if (audio) {
        try {
          audio.pause()
        } catch {
          // noop
        }
        audio.src = ''
        playbackAudioRef.current = null
      }

      if (videoElement) {
        if (playbackPauseListenerRef.current) {
          videoElement.removeEventListener(
            'pause',
            playbackPauseListenerRef.current,
          )
          playbackPauseListenerRef.current = null
        }
        videoElement.muted = false
      }
    }
  }, [cleanupMediaResources, videoRef])

  // 녹음 오디오 URL 언마운트 시 revoke
  useEffect(() => {
    return () => {
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl)
      }
    }
  }, [recordedAudioUrl])

  // 비활성화 시 진행 중인 녹음/재생 정리
  useEffect(() => {
    if (!enabled) {
      if (mediaRecorderRef.current) {
        stopRecording()
      }
      if (playbackAudioRef.current) {
        stopPlayback()
      }
    }
  }, [enabled, stopPlayback, stopRecording])

  return {
    isRecording,
    isStartingRecording,
    hasRecorded,
    isWhisperPending,
    isPlayingRecording,
    matchedWordIndexes,
    recordedAudioUrl,
    whisperStatus,
    isModelLoaded,
    startRecording,
    playRecording,
  }
}
