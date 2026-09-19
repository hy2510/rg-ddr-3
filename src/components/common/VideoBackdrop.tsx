import styled from 'styled-components'

import { useAppContext } from '@contexts/AppContext'

/** 영상 비율 밖의 공간은 해당 콘텐츠 표지를 흐리게 채운다. */
export default function VideoBackdrop() {
  const { detailContentInfo, contentInfo } = useAppContext()
  const image = detailContentInfo.StudyImagePath || contentInfo.StudyImagePath
  return <Backdrop $image={image} aria-hidden='true' />
}

const Backdrop = styled.div<{ $image: string }>`
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background: #222;
  background-image: url(${({ $image }) => $image});
  background-size: cover;
  background-position: center;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.25);
    -webkit-backdrop-filter: blur(50px);
    backdrop-filter: blur(50px);
  }
`
