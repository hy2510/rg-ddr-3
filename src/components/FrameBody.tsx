import 'animate.css'

import type { ReactNode } from 'react'

import styled from 'styled-components'

type FrameBodyProps = {
  children?: ReactNode
  bgImage?: string
  bgColor?: string
  viewStarfield?: boolean
  activeFadeIn?: boolean
}

/** 영상과 UI가 공유하는 뷰포트. 영상 크기는 각 video의 object-fit에서 처리한다. */
export default function FrameBody({ children }: FrameBodyProps) {
  return <StyledFrameBodyOuter>{children}</StyledFrameBodyOuter>
}

const StyledFrameBodyOuter = styled.div`
  width: 100vw;
  height: 100vh; /* fallback: svh 미지원 브라우저 */
  height: 100dvh; /* 주소창 변화에 맞춰 영상 영역만 다시 배치 */
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #000;
  box-sizing: border-box;
`
