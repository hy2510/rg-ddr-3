import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import styled from 'styled-components'

import PopupLayout from '@components/common/PopupLayout'
import { DubbingCaptionLayout } from '@components/dubbing/caption/CaptionLayout'
import type {
  CaptionCharacterImage,
  CaptionCue,
} from '@components/dubbing/caption/captionTimeline'
import { TotalScore } from '@components/dubbing/TotalScore'
import Loading from '@components/Loading'
import { useAppContext } from '@contexts/AppContext'
import { useSoundContext } from '@contexts/SoundContext'
import { useWhisperContext } from '@contexts/WhisperContext'
import { useCaptionNavigation } from '@hooks/useCaptionNavigation'
import { useCueRecording } from '@hooks/useCueRecording'
import useFFmpeg from '@hooks/useFFmpeg'
import { RG_VIDEO_SEEK_DONE, usePauseAtCueEnd } from '@hooks/usePauseAtCueEnd'
import { useVideoPlayback } from '@hooks/useVideoPlayback'
import type { CueResult, MyMovieEncodeState } from '@interfaces/dubbingTypes'
import { IAnswer } from '@interfaces/IDubbing'
import { IRecordResultData } from '@interfaces/ISpeak'
import { getUploadUrl, saveContent, uploadVideo } from '@services/api'
import { convertTimeToSec, makeAnswer, makeScoreData } from '@utils/common'

function buildCharacterImage(actorCsv: string): CaptionCharacterImage | null {
  const codes = actorCsv
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
  if (codes.length === 0) return null

  const fileName = (code: string) =>
    code.toLowerCase().endsWith('.png') ? code : `${code}.png`

  return {
    image1: fileName(codes[0] ?? ''),
    image2: codes[1] ? fileName(codes[1]) : '',
    image3: codes[2] ? fileName(codes[2]) : '',
    image4: codes[3] ? fileName(codes[3]) : '',
  }
}

/** Web Speech 매칭 결과로 저장·모달용 스코어 객체 생성 */
function buildCueMatchRecordResult(
  sentence: string,
  matched: number,
  total: number,
  matchedIndexes: number[],
): IRecordResultData {
  const total_score = Math.min(
    100,
    Math.max(0, Math.round((matched / total) * 100)),
  )

  return {
    best_answer: sentence,
    total_score,
    matched_words: [...matchedIndexes],
  }
}

type DubbingProps = {
  onCompleteMyMovie?: (payload: {
    captionTimeline: CaptionCue[]
    cueResults: Record<number, CueResult>
  }) => void
}

export type RecordResultProps = {
  isPassed: boolean
  recordResult: IRecordResultData
}

type RecFileProps = { file: File; sentenceIndex: number }

const isFullMode = (studyMode: string) => {
  const normalized = String(studyMode).trim().toLowerCase()
  return normalized === 'full'
}

const isLeadSentence = (lead: unknown) => {
  if (typeof lead === 'boolean') return lead
  if (typeof lead === 'number') return lead === 1
  if (typeof lead === 'string') {
    const normalized = lead.trim().toLowerCase()
    return (
      normalized === 'true' ||
      normalized === '1' ||
      normalized === 'y' ||
      normalized === 'yes'
    )
  }
  return false
}

export default function Dubbing({ onCompleteMyMovie }: DubbingProps) {
  const {
    studyInfo,
    contentInfo,
    detailContentInfo,
    changeDetailContentInfo,
    setStudyInfo,
  } = useAppContext()
  const { audioList, playSound } = useSoundContext()
  const { disposeBeforeVideoEncode } = useWhisperContext()

  // ✅ mergeMyMovieAndDownload 대신 useFFmpeg 사용
  const {
    outputFile: ffmpegOutputFile,
    trans,
    terminate: terminateFFmpeg,
    clearOutputFile: clearFFmpegOutputFile,
  } = useFFmpeg()

  const videoRef = useRef<HTMLVideoElement>(null)
  const detailContentInfoRef = useRef(detailContentInfo)
  detailContentInfoRef.current = detailContentInfo

  const captionTimelineRef = useRef<CaptionCue[]>([])
  const recordIndicesRef = useRef<number[]>([])

  const [recFiles, setRecFiles] = useState<RecFileProps[]>([])
  const [lineResults, setLineResults] = useState<
    Record<number, RecordResultProps>
  >({})
  const [cueResults, setCueResults] = useState<Record<number, CueResult>>({})
  const [showModalTotalScore, setShowModalTotalScore] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [encodeState, setEncodeState] = useState<MyMovieEncodeState>({
    status: 'idle',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [readyGoState, setReadyGoState] = useState<'idle' | 'ready' | 'go'>(
    'idle',
  )
  const [showMicUnavailable, setShowMicUnavailable] = useState(false)
  const [dubbingCueTimelineIndex, setDubbingCueTimelineIndex] = useState(0)
  const readyGoTimersRef = useRef<number[]>([])

  // ✅ outputFile 상태는 useFFmpeg에서 직접 관리하므로 로컬 state 제거
  // ffmpegOutputFile을 outputFile 대신 사용
  const outputFile = ffmpegOutputFile

  const clearOutputFile = useCallback(() => {
    clearFFmpegOutputFile()
  }, [clearFFmpegOutputFile])

  const { cues: captionTimeline, recordIndices: recordIndicesForCue } =
    useMemo(() => {
      const cues: CaptionCue[] = []
      const recordIndices: number[] = []
      const studyMode = detailContentInfo.StudyMode

      detailContentInfo.Record.forEach((record, index) => {
        if (!isFullMode(studyMode) && !isLeadSentence(record.Lead)) return

        const img = buildCharacterImage(record.Actor)
        cues.push({
          start: convertTimeToSec(record.StartTime),
          end: convertTimeToSec(record.EndTime),
          text: record.Sentence,
          ...(img ? { characterImage: img } : {}),
          studyType: isFullMode(studyMode) ? 'full' : 'single',
        })
        recordIndices.push(index)
      })

      return { cues, recordIndices }
    }, [detailContentInfo.Record, detailContentInfo.StudyMode])

  captionTimelineRef.current = captionTimeline
  recordIndicesRef.current = recordIndicesForCue

  const refreshKey = `${detailContentInfo.LevelRoundId ?? ''}|${detailContentInfo.VideoPath}|${captionTimeline.length}`

  const { isPaused } = useVideoPlayback({
    videoRef,
    enabled: captionTimeline.length > 0,
    startAtTime: captionTimeline[0]?.start,
    refreshKey: detailContentInfo.VideoPath,
  })

  const dubbingActiveCue = useMemo(() => {
    if (
      captionTimeline.length === 0 ||
      dubbingCueTimelineIndex < 0 ||
      dubbingCueTimelineIndex >= captionTimeline.length
    ) {
      return null
    }
    return captionTimeline[dubbingCueTimelineIndex]!
  }, [captionTimeline, dubbingCueTimelineIndex])

  const dubbingCaption = dubbingActiveCue?.text ?? ''
  const dubbingCharacterImage = dubbingActiveCue?.characterImage ?? null

  const { replayCurrentCue } = useCaptionNavigation({
    videoRef,
    captionTimeline,
    enabled: captionTimeline.length > 0,
    refreshKey,
  })

  const unmuteVideo = useCallback(() => {
    const video = videoRef.current
    if (video) video.muted = false
  }, [])

  const handleNextCue = useCallback(() => {
    unmuteVideo()
    const video = videoRef.current
    if (!video || captionTimeline.length === 0) return
    const ci = dubbingCueTimelineIndex
    if (ci < 0 || ci >= captionTimeline.length - 1) return
    const nextStart = captionTimeline[ci + 1]!.start
    const nextIdx = ci + 1
    const el = video

    let settled = false
    let fallbackId: number | null = null

    function onSeeked() {
      if (settled) return
      settled = true
      el.removeEventListener('seeked', onSeeked)
      if (fallbackId != null) {
        window.clearTimeout(fallbackId)
        fallbackId = null
      }
      setDubbingCueTimelineIndex(nextIdx)
      el.dispatchEvent(new Event(RG_VIDEO_SEEK_DONE))
      void el.play().catch((error: unknown) => {
        console.error('Dubbing next cue play failed:', error)
      })
    }

    el.pause()
    el.addEventListener('seeked', onSeeked)
    el.currentTime = nextStart
    fallbackId = window.setTimeout(onSeeked, 0)
  }, [captionTimeline, dubbingCueTimelineIndex, unmuteVideo])

  const dubbableIndices = useMemo(
    () =>
      detailContentInfo.Record.map((r, i) => {
        if (
          !isFullMode(detailContentInfo.StudyMode) &&
          !isLeadSentence(r.Lead)
        ) {
          return -1
        }
        return i
      }).filter((i): i is number => i >= 0),
    [detailContentInfo.Record, detailContentInfo.StudyMode],
  )

  const canFinalizeMovie =
    dubbableIndices.length > 0 &&
    dubbableIndices.every((i) => recFiles.some((f) => f.sentenceIndex === i))

  const playCorrectionSfx = useCallback((passed: boolean) => {
    if (passed) {
      playSound(audioList.correctionCorrect, 0, 0.85)
    } else {
      playSound(audioList.correctionIncorrect, 0, 0.85)
    }
  }, [audioList.correctionCorrect, audioList.correctionIncorrect, playSound])

  const handleRecordingComplete = useCallback(
    ({
      cue,
      cueTimelineIndex,
      matched,
      total,
      matchedIndexes,
    }: {
      cue: CaptionCue
      cueTimelineIndex: number
      matched: number
      total: number
      matchedIndexes: number[]
    }) => {
      const cues = captionTimelineRef.current
      const ridxs = recordIndicesRef.current
      const ci = cueTimelineIndex
      if (ci < 0 || ci >= cues.length) return
      const recordIdx = ridxs[ci]!

      const cueKey = cues[ci]!.start

      const ratio = total > 0 ? matched / total : 0
      const passed = ratio >= 0.5
      const synthetic = buildCueMatchRecordResult(
        cue.text,
        matched,
        total,
        matchedIndexes,
      )
      setCueResults((prev) => ({
        ...prev,
        [cueKey]: {
          ...(prev[cueKey] ?? { audioBlob: undefined }),
          matched,
          total,
          matchedIndexes,
        },
      }))

      setLineResults((prev) => ({
        ...prev,
        [recordIdx]: { isPassed: passed, recordResult: synthetic },
      }))

      playCorrectionSfx(passed)
    },
    [playCorrectionSfx],
  )

  const handleRecordedAudioAvailable = useCallback(
    ({
      cue,
      cueTimelineIndex,
      audioBlob,
    }: {
      cue: CaptionCue
      cueTimelineIndex: number
      audioBlob: Blob
    }) => {
      const cues = captionTimelineRef.current
      const ridxs = recordIndicesRef.current
      const ci = cueTimelineIndex
      if (ci < 0 || ci >= cues.length) return
      const recordIdx = ridxs[ci]!
      if (audioBlob.size === 0) return

      const cueKey = cues[ci]!.start

      const ext = audioBlob.type.includes('webm')
        ? 'webm'
        : audioBlob.type.includes('mp4')
          ? 'm4a'
          : 'dat'
      const file = new File([audioBlob], `userAudio_${recordIdx}.${ext}`, {
        type: audioBlob.type || 'audio/webm',
      })

      setRecFiles((prev) => {
        const filtered = prev.filter((f) => f.sentenceIndex !== recordIdx)
        return [...filtered, { file, sentenceIndex: recordIdx }].sort(
          (a, b) => a.sentenceIndex - b.sentenceIndex,
        )
      })
      setCueResults((prev) => ({
        ...prev,
        [cueKey]: {
          ...(prev[cueKey] ?? { matched: 0, total: 0, matchedIndexes: [] }),
          audioBlob,
        },
      }))
    },
    [],
  )

  const {
    isRecording,
    isStartingRecording,
    hasRecorded,
    isWhisperPending,
    matchedWordIndexes,
    recordedAudioUrl,
    whisperStatus,
    isModelLoaded,
    startRecording,
    playRecording,
  } = useCueRecording({
    videoRef,
    activeCue: dubbingActiveCue,
    timelineCueIndex: dubbingCueTimelineIndex,
    enabled: captionTimeline.length > 0,
    onRecordingComplete: handleRecordingComplete,
    onRecordedAudioAvailable: handleRecordedAudioAvailable,
  })

  usePauseAtCueEnd({
    videoRef,
    captionTimeline,
    enabled: captionTimeline.length > 0 && !isRecording,
    refreshKey,
  })

  useEffect(() => {
    return () => {
      readyGoTimersRef.current.forEach((id) => window.clearTimeout(id))
      readyGoTimersRef.current = []
      // ✅ 컴포넌트 언마운트 시 진행 중인 FFmpeg 작업 강제 종료
      terminateFFmpeg()
      clearFFmpegOutputFile()
    }
  }, [terminateFFmpeg, clearFFmpegOutputFile])

  useEffect(() => {
    setLineResults({})
    setRecFiles([])
    setCueResults({})
    setEncodeState({ status: 'idle' })
    clearOutputFile()
    setShowModalTotalScore(false)
    setDubbingCueTimelineIndex(0)
  }, [detailContentInfo.LevelRoundId, clearOutputFile])

  useEffect(() => {
    if (captionTimeline.length === 0) return
    setDubbingCueTimelineIndex((prev) =>
      Math.min(prev, captionTimeline.length - 1),
    )
  }, [captionTimeline.length])

  const lastCueStart = captionTimeline[captionTimeline.length - 1]?.start
  const isLastCue =
    dubbingActiveCue != null &&
    lastCueStart != null &&
    dubbingActiveCue.start === lastCueStart

  const canGoNext = useMemo(() => {
    const ci = dubbingCueTimelineIndex
    if (ci < 0 || ci >= recordIndicesForCue.length) return false
    const ri = recordIndicesForCue[ci]!
    return recFiles.some((f) => f.sentenceIndex === ri)
  }, [dubbingCueTimelineIndex, recordIndicesForCue, recFiles])

  const isWhisperUiLocked = !isModelLoaded || whisperStatus === 'transcribing'

  // 카운트다운 ~ 녹음 준비 ~ 녹음 중 ~ Whisper 처리 중 ~ 녹음 완료 후 결과 대기까지를 하나로 묶은 플래그
  const isProcessing =
    readyGoState !== 'idle' ||
    isStartingRecording ||
    isRecording ||
    isWhisperUiLocked ||
    isWhisperPending


  const handleReplayCue = useCallback(() => {
    if (isProcessing) return
    unmuteVideo()
    const video = videoRef.current
    const cues = captionTimelineRef.current
    const ci = dubbingCueTimelineIndex
    if (!video || ci < 0 || ci >= cues.length) {
      replayCurrentCue()
      return
    }
    video.currentTime = cues[ci]!.start
    void video.play().catch((error: unknown) => {
      console.error('Dubbing replay cue failed:', error)
    })
  }, [dubbingCueTimelineIndex, isProcessing, replayCurrentCue, unmuteVideo])

  const checkMicAvailable = useCallback(async (): Promise<boolean> => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setShowMicUnavailable(true)
      return false
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      return true
    } catch (err) {
      console.warn('Microphone not available:', err)
      setShowMicUnavailable(true)
      return false
    }
  }, [])

  const handleStartRecordingWithCountdown = useCallback(async () => {
    if (!isModelLoaded || whisperStatus === 'transcribing') return

    // 마이크 권한 체크 중에도 isProcessing이 true가 되도록 즉시 ready 상태로 전환
    setReadyGoState('ready')
    if (!(await checkMicAvailable())) {
      setReadyGoState('idle')
      return
    }

    readyGoTimersRef.current.forEach((id) => window.clearTimeout(id))
    readyGoTimersRef.current = []

    if (
      dubbingCueTimelineIndex < 0 ||
      dubbingCueTimelineIndex >= captionTimeline.length
    ) {
      console.warn('Dubbing: invalid dubbing timeline index for recording')
      setReadyGoState('idle')
      return
    }
    const armCueIndex = dubbingCueTimelineIndex
    const cueArm = captionTimelineRef.current[armCueIndex]
    if (!cueArm) {
      console.warn('Dubbing: missing cue for recording arm index')
      setReadyGoState('idle')
      return
    }
    const toGo = window.setTimeout(() => {
      setReadyGoState('go')
    }, 1000)
    const toStart = window.setTimeout(() => {
      setReadyGoState('idle')
      setTimeout(() => {
        startRecording(cueArm, armCueIndex)
      }, 100)
    }, 2000)
    readyGoTimersRef.current.push(toGo, toStart)
  }, [
    captionTimeline.length,
    checkMicAvailable,
    dubbingCueTimelineIndex,
    startRecording,
    isModelLoaded,
    whisperStatus,
  ])

  const onClickSave = () => {
    if (encodeState.status === 'downloading' || !canFinalizeMovie) return
    clearOutputFile()
    setIsSaved(false)
    setEncodeState({ status: 'idle' })
    setShowModalTotalScore(true)
  }

  const uploadAndSaveResult = useCallback(async () => {
    const answers: IAnswer[] = dubbableIndices.map((recordIdx) => {
      const result = lineResults[recordIdx]

      if (!result) {
        throw new Error(
          `Missing recording result for record index: ${recordIdx}`,
        )
      }

      const scoreData = makeScoreData(result)

      return makeAnswer(
        `${detailContentInfo.Record[recordIdx]?.QuizNo ?? ''}`,
        scoreData,
        JSON.stringify(result.recordResult),
      )
    })

    setIsLoading(true)

    try {
      if (studyInfo.User === 'student') {
        const uploadUrl = await getUploadUrl(
          detailContentInfo.StudyId,
          detailContentInfo.StudentHistoryId,
          detailContentInfo.LevelRoundId,
          contentInfo.LevelName,
          detailContentInfo.StudyMode,
        )

        await uploadVideo(outputFile, uploadUrl)

        const onCompleteSave = () => {
          if (detailContentInfo.GetableRgPoint > 0) {
            const rgPoint =
              detailContentInfo.StudyMode === 'Full'
                ? contentInfo.BookPoint
                : contentInfo.BookPoint * 0.5
            setStudyInfo({
              ...studyInfo,
              RgPoint: studyInfo.RgPoint + rgPoint,
            })
          }
          setIsSaved(true)
        }

        await saveContent(
          detailContentInfo.StudyId,
          detailContentInfo.StudentHistoryId,
          detailContentInfo.StudyMode,
          answers,
          onCompleteSave,
        )
      } else {
        setIsSaved(true)
      }
    } catch (error) {
      console.error('Failed to upload and save result:', error)
    } finally {
      setIsLoading(false)
    }
  }, [
    contentInfo.BookPoint,
    contentInfo.LevelName,
    detailContentInfo.GetableRgPoint,
    detailContentInfo.LevelRoundId,
    detailContentInfo.Record,
    detailContentInfo.StudentHistoryId,
    detailContentInfo.StudyId,
    detailContentInfo.StudyMode,
    dubbableIndices,
    lineResults,
    outputFile,
    setStudyInfo,
    studyInfo,
  ])

  // 인코딩 완료(outputFile 생성) 시 자동으로 업로드 + 서버 저장
  useEffect(() => {
    if (!outputFile || isSaved) return
    void uploadAndSaveResult()
  }, [outputFile, isSaved, uploadAndSaveResult])

  const handleConfirmScorePopup = useCallback(async () => {
    if (!canFinalizeMovie || encodeState.status === 'downloading') return
    if (isSaved) return

    setEncodeState({
      status: 'downloading',
      progress: 0,
      message: 'Preparing video...',
    })
    try {
      // recFiles의 sentenceIndex는 recordIndicesForCue 기준(원본 Record 인덱스)이므로
      // captionTimeline 인덱스(i)와 맞추기 위해 recordIndicesForCue로 매핑한다.
      const mappedRecFiles = captionTimeline
        .map((_, timelineIdx) => {
          const recordIdx = recordIndicesForCue[timelineIdx] ?? -1
          const found = recFiles.find((f) => f.sentenceIndex === recordIdx)
          return found
            ? { file: found.file, sentenceIndex: timelineIdx }
            : null
        })
        .filter((f): f is { file: File; sentenceIndex: number } => f !== null)

      disposeBeforeVideoEncode()

      await trans({
        videoPath: detailContentInfo.VideoPath,
        captionTimeline,
        recFiles: mappedRecFiles,
        onProgress: (progress, message) => {
          setEncodeState({
            status: 'downloading',
            progress,
            message,
          })
        },
      })

      setEncodeState({ status: 'idle' })
      // outputFile useEffect가 업로드 + 저장을 자동 실행
    } catch (error) {
      console.error('Failed to encode my movie:', error)
      setEncodeState({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to create My Movie. Please try again.',
      })
    }
  }, [
    canFinalizeMovie,
    captionTimeline,
    detailContentInfo.VideoPath,
    disposeBeforeVideoEncode,
    encodeState.status,
    isSaved,
    recFiles,
    recordIndicesForCue,
    trans,
  ])

  const handleWatchMyMovie = useCallback(() => {
    onCompleteMyMovie?.({ captionTimeline, cueResults })
  }, [captionTimeline, cueResults, onCompleteMyMovie])

  const handleRetryTotalScore = useCallback(() => {
    if (encodeState.status === 'downloading') return
    if (isSaved) {
      setShowModalTotalScore(false)
      ;(window as any).onExitStudy?.()
      return
    }
    setShowModalTotalScore(false)
    setRecFiles([])
    setLineResults({})
    setCueResults({})
    setDubbingCueTimelineIndex(0)
    setEncodeState({ status: 'idle' })
    clearOutputFile()
    terminateFFmpeg()
    const v = videoRef.current
    const t0 = captionTimeline[0]?.start
    if (v != null && t0 != null) {
      try {
        v.pause()
      } catch {
        // noop
      }
      v.currentTime = t0
    }
  }, [
    captionTimeline,
    clearOutputFile,
    encodeState.status,
    isSaved,
    terminateFFmpeg,
  ])

  if (captionTimeline.length === 0) {
    return <Loading />
  }

  return (
    <>
      <StyledDubbingRoot>
        <StyledVideoShell>
          <video
            ref={videoRef}
            src={detailContentInfo.VideoPath}
            playsInline
            crossOrigin='anonymous'
            muted={false}
            style={{ objectFit: 'contain', width: '100%', height: '100%' }}
          />
        </StyledVideoShell>

        <DubbingCaptionLayout
          caption={dubbingCaption}
          characterImage={dubbingCharacterImage}
          onReplayCue={handleReplayCue}
          onStartRecording={handleStartRecordingWithCountdown}
          onPlayRecording={() => {
            const c = captionTimelineRef.current[dubbingCueTimelineIndex]
            if (c) playRecording(c)
          }}
          onNext={handleNextCue}
          onFinishDubbing={onClickSave}
          isNextDisabled={!canGoNext || isProcessing}
          isMicDisabled={
            !isPaused ||
            isProcessing ||
            encodeState.status === 'downloading'
          }
          isPlayRecordingDisabled={isProcessing}
          isRecording={isRecording}
          isCompleted={hasRecorded && !isRecording}
          isLastCue={isLastCue}
          showPlayRecording={hasRecorded && Boolean(recordedAudioUrl)}
          showNext={canGoNext}
          matchedWordIndexes={matchedWordIndexes}
          isWhisperPending={isWhisperPending}
        />
      </StyledDubbingRoot>

      {showModalTotalScore && (
        <PopupLayout
          hideButtons
          confirm={false}
          contents={
            <TotalScore
              captionTimeline={captionTimeline}
              cueResults={cueResults}
              encodeState={encodeState}
              isLoading={isLoading}
              onRetry={handleRetryTotalScore}
              onConfirm={isSaved ? handleWatchMyMovie : handleConfirmScorePopup}
              retryText={isSaved ? 'Exit' : 'Retry'}
              confirmText={isSaved ? 'Watch My Movie' : 'Confirm'}
            />
          }
        />
      )}

      {isLoading && <Loading />}

      {showMicUnavailable && (
        <PopupLayout
          contents='Microphone is not available. Please check your device settings.'
          confirm={false}
          confirmText='Confirm'
          onConfirm={() => setShowMicUnavailable(false)}
          onClose={() => setShowMicUnavailable(false)}
        />
      )}

      {readyGoState !== 'idle' && <ReadyGoOverlay state={readyGoState} />}
    </>
  )
}

const StyledReadyGoOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  z-index: 10;
  pointer-events: auto;

  .ready-go-text {
    color: #fff;
    font-size: 9em;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-shadow: 0 6px 30px rgba(0, 0, 0, 0.5);
    animation: ready-go-pop 1s ease-out forwards;
  }

  .ready-go-text.ready {
    color: #ffd54a;
  }

  .ready-go-text.go {
    color: #fff;
  }

  @keyframes ready-go-pop {
    0% {
      transform: scale(0.6);
      opacity: 0;
    }
    25% {
      transform: scale(1.1);
      opacity: 1;
    }
    60% {
      transform: scale(1);
      opacity: 1;
    }
    100% {
      transform: scale(1.05);
      opacity: 0.9;
    }
  }
`

const StyledDubbingRoot = styled.div`
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;

  img {
    -webkit-user-drag: none;
    user-select: none;
  }
`

function ReadyGoOverlay({ state }: { state: 'ready' | 'go' }) {
  return (
    <StyledReadyGoOverlay>
      <span key={state} className={`ready-go-text ${state}`}>
        {state === 'ready' ? 'Ready' : 'Go!'}
      </span>
    </StyledReadyGoOverlay>
  )
}

const StyledVideoShell = styled.div`
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;

  video {
    width: 100%;
    max-width: 1280px;
    height: 100%;
    max-height: 720px;
    object-fit: contain;
  }
`
