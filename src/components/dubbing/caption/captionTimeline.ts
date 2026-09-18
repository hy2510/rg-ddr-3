export type CaptionWordCue = {
  start: number
  end: number
  text: string
}

export type CaptionCharacterImage = {
  image1: string
  image2: string
  image3: string
  image4: string
}

export type CaptionCue = {
  start: number
  end: number
  text: string
  words?: CaptionWordCue[]
  characterImage?: CaptionCharacterImage
  studyType: 'single' | 'full'
}

/**
 * 반열린 [start, end) 에 들어가는 큐 인덱스.
 * 부동소수로 이전 end 가 다음 start 보다 커져 둘 다 걸리면 **뒤 큐**를 택한다.
 */
function findHalfOpenCueIndex(
  timeline: CaptionCue[],
  currentTime: number,
): number {
  let last = -1
  for (let i = 0; i < timeline.length; i += 1) {
    const cue = timeline[i]
    if (currentTime >= cue.start && currentTime < cue.end) {
      last = i
    }
  }
  return last
}

/**
 * 재생 시각 t에 대한 “활성 큐 인덱스”의 단일 정의.
 * - 먼저 반열린 [start, end) 안에 들면 그 큐.
 * - 갭·끝 이후 등 반열린에 없으면 `start <= t` 인 마지막 큐 (시청 인덱스·네비와 맞춤).
 * 이전 큐 end === 다음 큐 start 인 경계에서는 반열린상 다음 큐가 선택된다.
 */
export function getActiveCueIndexAtTime(
  timeline: CaptionCue[],
  currentTime: number,
): number {
  const byHalfOpen = findHalfOpenCueIndex(timeline, currentTime)
  if (byHalfOpen >= 0) return byHalfOpen
  return findActiveCueIndex(timeline, currentTime)
}

export function findCaptionCueByTime(
  timeline: CaptionCue[],
  currentTime: number,
): CaptionCue | undefined {
  const i = findHalfOpenCueIndex(timeline, currentTime)
  return i >= 0 ? timeline[i] : undefined
}

export function getCaptionByTime(
  timeline: CaptionCue[],
  currentTime: number,
  fallbackText: string,
): string {
  const matchedCue = findCaptionCueByTime(timeline, currentTime)

  return matchedCue?.text ?? fallbackText
}

function findActiveCueIndex(
  timeline: CaptionCue[],
  currentTime: number,
): number {
  let activeIndex = -1
  for (let i = 0; i < timeline.length; i += 1) {
    if (timeline[i].start <= currentTime) {
      activeIndex = i
    } else {
      break
    }
  }
  return activeIndex
}

export function findPreviousCueStart(
  timeline: CaptionCue[],
  currentTime: number,
): number | null {
  const activeIndex = getActiveCueIndexAtTime(timeline, currentTime)
  if (activeIndex <= 0) {
    return null
  }
  return timeline[activeIndex - 1].start
}

export function findCurrentCueStart(
  timeline: CaptionCue[],
  currentTime: number,
): number | null {
  const activeIndex = getActiveCueIndexAtTime(timeline, currentTime)
  if (activeIndex < 0) {
    return null
  }
  return timeline[activeIndex].start
}

export function findNextCueStart(
  timeline: CaptionCue[],
  currentTime: number,
): number | null {
  if (timeline.length === 0) {
    return null
  }
  const activeIndex = getActiveCueIndexAtTime(timeline, currentTime)
  if (activeIndex < 0) {
    return timeline[0].start
  }
  if (activeIndex >= timeline.length - 1) {
    return null
  }
  return timeline[activeIndex + 1].start
}

export function getWordIndexByTime(
  cue: CaptionCue,
  currentTime: number,
): number {
  if (!cue.words || cue.words.length === 0) {
    return -1
  }

  const wordIndex = cue.words.findIndex(
    (word) => currentTime >= word.start && currentTime < word.end,
  )

  if (wordIndex >= 0) {
    return wordIndex
  }

  if (currentTime >= cue.words[cue.words.length - 1].end) {
    return cue.words.length - 1
  }

  return -1
}
