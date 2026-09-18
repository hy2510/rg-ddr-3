import { useCallback, useEffect, useRef, useState } from 'react'

import { isIOS } from 'react-device-detect'
import styled from 'styled-components'

import sndClose from '@assets/sounds/btn-close.mp3'
import sndMenuTab from '@assets/sounds/btn-menu_tap.mp3'
import sndCorrectionCorrect from '@assets/sounds/sound_correction_correct.mp3'
import sndCorrectionIncorrect from '@assets/sounds/sound_correction_incorrect.mp3'

interface SoundItem {
  ref: React.RefObject<HTMLAudioElement>
  src: string
  loop?: boolean
  preload?: 'auto' | 'metadata' | 'none'
}

export type AudioList = {
  menuTapSound: React.RefObject<HTMLAudioElement>
  closeTapSound: React.RefObject<HTMLAudioElement>
  correctionCorrect: React.RefObject<HTMLAudioElement>
  correctionIncorrect: React.RefObject<HTMLAudioElement>
}

/**
 * 실제 `src/assets/sounds`에 있는 파일만 등록합니다.
 * 목록에 없는 키는 ref만 유지되고 `<audio>`가 붙지 않으므로 `playSound`는 무시됩니다.
 */
export function useSounds() {
  const audioContextRef = useRef<AudioContext | null>(null)
  const menuTapSoundRef = useRef<HTMLAudioElement>(null!)
  const closeTapSoundRef = useRef<HTMLAudioElement>(null!)
  const correctionCorrectRef = useRef<HTMLAudioElement>(null!)
  const correctionIncorrectRef = useRef<HTMLAudioElement>(null!)

  const sounds: Record<string, SoundItem> = {
    menuTapSound: {
      ref: menuTapSoundRef,
      src: sndMenuTab,
      preload: 'auto',
    },
    closeTapSound: {
      ref: closeTapSoundRef,
      src: sndClose,
      preload: 'auto',
    },
    correctionCorrect: {
      ref: correctionCorrectRef,
      src: sndCorrectionCorrect,
      preload: 'auto',
    },
    correctionIncorrect: {
      ref: correctionIncorrectRef,
      src: sndCorrectionIncorrect,
      preload: 'auto',
    },
  }

  const [isReady, setIsReady] = useState(false)

  const unlockAudioContext = useCallback(() => {
    if (audioContextRef.current) return
    try {
      const ctx = new AudioContext()
      audioContextRef.current = ctx
      const buffer = ctx.createBuffer(1, 1, 22050)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.start(0)
    } catch {
      // noop
    }
    // iOS는 사용자 인터랙션 전까지 preload를 무시하므로 첫 터치 시 강제 로드
    Object.values(sounds).forEach(({ ref }) => {
      ref.current?.load()
    })
  }, [sounds])

  useEffect(() => {
    document.addEventListener('touchstart', unlockAudioContext, { once: true })
    document.addEventListener('click', unlockAudioContext, { once: true })
    return () => {
      document.removeEventListener('touchstart', unlockAudioContext)
      document.removeEventListener('click', unlockAudioContext)
    }
  }, [unlockAudioContext])

  useEffect(() => {
    const audioElements = Object.values(sounds)
      .map((sound) => sound.ref.current)
      .filter((el): el is HTMLAudioElement => el !== null)

    if (audioElements.length === 0) {
      setIsReady(true)
      return
    }

    let loadedCount = 0

    const handlePlayHandler = () => {
      loadedCount++

      if (loadedCount === audioElements.length) {
        setIsReady(true)
      }
    }

    audioElements.forEach((audio) => {
      if (isIOS) {
        audio.addEventListener('loadedmetadata', handlePlayHandler, {
          once: true,
        })
      } else {
        audio.addEventListener('canplaythrough', handlePlayHandler, {
          once: true,
        })
      }

      audio.load()
    })

    return () => {
      audioElements.forEach((audio) => {
        if (isIOS) {
          audio.removeEventListener('loadedmetadata', handlePlayHandler)
        } else {
          audio.removeEventListener('canplaythrough', handlePlayHandler)
        }
      })
    }
  }, [])

  const playSound = (
    ref: React.RefObject<HTMLAudioElement>,
    startTime = 0,
    volume = 1,
  ) => {
    const audio = ref.current
    if (!audio) return

    const ctx = audioContextRef.current
    if (ctx?.state === 'suspended') {
      void ctx.resume()
    }

    audio.currentTime = startTime
    audio.volume = volume
    void audio.play().catch(() => {})
  }

  const stopSound = (ref: React.RefObject<HTMLAudioElement>) => {
    const audio = ref.current

    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
  }

  const renderAudioElements = (): JSX.Element[] => {
    return Object.entries(sounds).map(([key, { ref, src, loop, preload }]) => (
      <audio key={key} ref={ref} src={src} loop={loop} preload={preload} />
    ))
  }

  const renderLoadingScreen = () => (
    <StyledLoadingScreen>Loading Sounds...</StyledLoadingScreen>
  )

  const audioList: AudioList = {
    menuTapSound: menuTapSoundRef,
    closeTapSound: closeTapSoundRef,
    correctionCorrect: correctionCorrectRef,
    correctionIncorrect: correctionIncorrectRef,
  }

  return {
    isReady,
    audioList,
    playSound,
    stopSound,
    renderAudioElements,
    renderLoadingScreen,
  }
}

const StyledLoadingScreen = styled.div`
  width: 100vw;
  height: 100vh;
  background: black;
  color: white;
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
`
