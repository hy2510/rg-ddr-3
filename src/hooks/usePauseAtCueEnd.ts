import { type RefObject, useEffect } from 'react'

import { type CaptionCue } from '@components/dubbing/caption/captionTimeline'

/** 더빙 `handleNextCue` 등에서 시크 직후 `seeked`가 생략될 때 한 번만 보냄 */
export const RG_VIDEO_SEEK_DONE = 'rg-seek-done'

type UsePauseAtCueEndParams = {
  videoRef: RefObject<HTMLVideoElement | null>
  captionTimeline: CaptionCue[]
  enabled?: boolean
  refreshKey?: unknown
}

// 큐 end 를 재생이 엄격히 넘긴 뒤에만 일시정지한다.
// - 직전 프레임이 그 큐의 반열린 [start, end) 안에 있었을 때만 "그 큐가 끝났다"고 본다.
// - seeked(또는 RG_VIDEO_SEEK_DONE) 직후 첫 timeupdate 에는 끝 판정을 건너뛴다.
//   (부동소수·경계에서 이전 큐로 오판하거나, 동일 시각 시크로 seeked 가 안 올 때)
// DB 구간 end 를 가감하지 않고 스냅은 cue.end 로 맞춘다.
export function usePauseAtCueEnd({
  videoRef,
  captionTimeline,
  enabled = true,
  refreshKey,
}: UsePauseAtCueEndParams): void {
  useEffect(() => {
    if (!enabled) {
      return
    }
    const videoElement = videoRef.current
    if (!videoElement) {
      return
    }

    let lastTime = videoElement.currentTime
    let skipCueEndOnceAfterSeek = false

    // 자연스러운 재생에서 timeupdate 간격이 대략 250ms 내외이므로,
    // 그보다 현저히 큰 점프는 seek 로 간주하여 cue-end 판정을 건너뛴다.
    const SEEK_JUMP_THRESHOLD = 0.75

    const handleTimeUpdate = () => {
      if (videoElement.paused) {
        lastTime = videoElement.currentTime
        return
      }

      const currentTime = videoElement.currentTime

      if (skipCueEndOnceAfterSeek) {
        skipCueEndOnceAfterSeek = false
        lastTime = currentTime
        return
      }

      // seek 로 인한 큰 점프는 cue-end 판정 대상에서 제외한다.
      if (currentTime - lastTime > SEEK_JUMP_THRESHOLD) {
        lastTime = currentTime
        return
      }

      const endedCue = captionTimeline.find(
        (cue) =>
          lastTime >= cue.start &&
          lastTime < cue.end &&
          currentTime > cue.end,
      )

      if (endedCue) {
        videoElement.pause()
        const snapTime = Math.max(endedCue.start, endedCue.end)
        videoElement.currentTime = snapTime
        lastTime = snapTime
        return
      }

      lastTime = currentTime
    }

    const handleSeeking = () => {
      lastTime = videoElement.currentTime
    }

    const handleSeeked = () => {
      lastTime = videoElement.currentTime
      skipCueEndOnceAfterSeek = true
    }

    const handleRgSeekDone = () => {
      skipCueEndOnceAfterSeek = true
    }

    videoElement.addEventListener('timeupdate', handleTimeUpdate)
    videoElement.addEventListener('seeking', handleSeeking)
    videoElement.addEventListener('seeked', handleSeeked)
    videoElement.addEventListener(RG_VIDEO_SEEK_DONE, handleRgSeekDone)

    return () => {
      videoElement.removeEventListener('timeupdate', handleTimeUpdate)
      videoElement.removeEventListener('seeking', handleSeeking)
      videoElement.removeEventListener('seeked', handleSeeked)
      videoElement.removeEventListener(RG_VIDEO_SEEK_DONE, handleRgSeekDone)
    }
  }, [captionTimeline, enabled, videoRef, refreshKey])
}
