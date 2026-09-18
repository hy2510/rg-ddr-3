import { type RefObject, useEffect, useState } from 'react'

import {
  type CaptionCharacterImage,
  type CaptionCue,
  findCaptionCueByTime,
  getActiveCueIndexAtTime,
} from '@components/dubbing/caption/captionTimeline'

type UseCaptionSyncParams = {
  videoRef: RefObject<HTMLVideoElement | null>
  captionTimeline: CaptionCue[]
  defaultCaption: string
  enabled?: boolean
  refreshKey?: unknown
  /**
   * true: 자막·activeCue·캐릭터를 `findCaptionCueByTime`이 아니라
   * `getActiveCueIndexAtTime`과 같은 인덱스의 큐로만 맞춤 (더빙: 인덱스 n/N 과 본문 일치, 경계 시각에서 빈 자막 방지).
   */
  preferPlaybackCueIndexForDisplay?: boolean
}

type UseCaptionSyncResult = {
  caption: string
  characterImage: CaptionCharacterImage | null
  captionIndex: number | null
  captionTotal: number
  activeCue: CaptionCue | null
  /** `getActiveCueIndexAtTime` — 더빙 진행·다음 버튼은 재생 시각 기준으로 이 값을 쓰는 것이 안전 */
  playbackCueIndex: number | null
}

export function useCaptionSync({
  videoRef,
  captionTimeline,
  defaultCaption,
  enabled = true,
  refreshKey,
  preferPlaybackCueIndexForDisplay = false,
}: UseCaptionSyncParams): UseCaptionSyncResult {
  const [caption, setCaption] = useState<string>(defaultCaption)
  const [characterImage, setCharacterImage] =
    useState<CaptionCharacterImage | null>(null)
  const [captionIndex, setCaptionIndex] = useState<number | null>(null)
  const [activeCue, setActiveCue] = useState<CaptionCue | null>(null)
  const [playbackCueIndex, setPlaybackCueIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!enabled) {
      return
    }
    const videoElement = videoRef.current
    if (!videoElement) {
      return
    }

    const updateCaption = () => {
      const currentTime = videoElement.currentTime

      if (captionTimeline.length === 0) {
        setCaption(defaultCaption)
        setCharacterImage(null)
        setActiveCue(null)
        setCaptionIndex(null)
        setPlaybackCueIndex(null)
        return
      }

      const idx = getActiveCueIndexAtTime(captionTimeline, currentTime)
      const displayCue =
        preferPlaybackCueIndexForDisplay && idx >= 0
          ? captionTimeline[idx]
          : findCaptionCueByTime(captionTimeline, currentTime)

      setCaption(displayCue?.text ?? defaultCaption)
      setCharacterImage(displayCue?.characterImage ?? null)
      setActiveCue(displayCue ?? null)
      setPlaybackCueIndex(idx)
      setCaptionIndex(idx < 0 ? 1 : idx + 1)
    }

    videoElement.addEventListener('timeupdate', updateCaption)
    videoElement.addEventListener('seeked', updateCaption)
    updateCaption()

    return () => {
      videoElement.removeEventListener('timeupdate', updateCaption)
      videoElement.removeEventListener('seeked', updateCaption)
    }
  }, [
    captionTimeline,
    defaultCaption,
    enabled,
    preferPlaybackCueIndexForDisplay,
    videoRef,
    refreshKey,
  ])

  return {
    caption,
    characterImage,
    captionIndex,
    captionTotal: captionTimeline.length,
    activeCue,
    playbackCueIndex,
  }
}
