import { createContext, type ReactNode, useContext, useEffect } from 'react'

import { useWhisper } from '@hooks/useWhisper'

export type WhisperContextValue = ReturnType<typeof useWhisper>

const WhisperContext = createContext<WhisperContextValue | null>(null)

type WhisperProviderProps = {
  children: ReactNode
}

/**
 * 더빙룸 컨테이너 마운트 시 Whisper 모델 로드를 시작합니다.
 * 중복 호출 방지 로직이 포함되어 있어 안전하게 마운트 시점에 실행할 수 있습니다.
 */
export function WhisperProvider({ children }: WhisperProviderProps) {
  const whisper = useWhisper()

  useEffect(() => {
    // 이미 로드되었거나 로딩 중이 아닐 때만 최초 로드 실행
    if (!whisper.isModelLoaded && whisper.status === 'idle') {
      whisper.loadModel()
    }
  }, [whisper.loadModel, whisper.isModelLoaded, whisper.status])

  return (
    <WhisperContext.Provider value={whisper}>
      {children}
    </WhisperContext.Provider>
  )
}

export function useWhisperContext(): WhisperContextValue {
  const context = useContext(WhisperContext)
  if (!context) {
    throw new Error('useWhisperContext must be used within a WhisperProvider')
  }
  return context
}
