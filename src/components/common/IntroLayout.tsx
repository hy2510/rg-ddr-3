import styled, { keyframes } from 'styled-components'

import glassWindowImage from '@assets/images/glass-window.png'

import roundedBold from '@assets/fonts/SDRGGothicNeoRoundTTF-bBd.woff2'

type IntroLayoutProps = {
  thumbnailImage: string
  onClick: () => void
  buttonText?: string
  buttonIcon?: string
  buttonColor?: string
  buttonDisabled?: boolean
  secondaryButton?: {
    text: string
    onClick: () => void
    icon?: string
    bgColor?: string
    disabled?: boolean
  }
  stepComment?: string
}

export function IntroLayout({
  thumbnailImage,
  onClick,
  buttonText,
  buttonDisabled,
  secondaryButton,
  stepComment = 'Let’s watch first!',
}: IntroLayoutProps) {
  return (
    <StyledIntroLayout>
      <StyledIntroBg $thumbnailImage={thumbnailImage} aria-hidden='true' />
      <StyledIntroContent>
        <div className='intro-column'>
          {thumbnailImage && (
            <img src={thumbnailImage} alt='' className='intro-thumbnail' />
          )}
          <h1 className='intro-step-comment'>{stepComment}</h1>
          <div className='intro-button-row'>
            <IntroStartButton type='button' onClick={onClick} disabled={buttonDisabled}>
              {buttonText}
            </IntroStartButton>
            {secondaryButton && (
              <IntroSecondaryButton type='button' onClick={secondaryButton.onClick} disabled={secondaryButton.disabled}>
                {secondaryButton.text}
              </IntroSecondaryButton>
            )}
          </div>
        </div>
      </StyledIntroContent>
    </StyledIntroLayout>
  )
}

const StyledIntroLayout = styled.div`
  @font-face {
    font-family: 'Intro-Rg-B';
    src: url(${roundedBold}) format('woff2');
    font-display: swap;
  }

  width: 100%;
  height: 100%;
  min-height: 0;
  position: relative;
  isolation: isolate;
`

const StyledIntroContent = styled.div`
  position: absolute;
  inset: 0;
  padding: 90px 20px 32px;
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.25);
  -webkit-backdrop-filter: blur(50px);
  backdrop-filter: blur(50px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 2;

  .intro-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 30px;
    width: min(100%, 420px);
    flex: 0 0 auto;
    margin: auto;
    text-align: center;
  }

  .intro-step-comment {
    margin: 0;
    font-family: 'Intro-Rg-B', sans-serif;
    font-size: 1.75em;
    font-weight: 700;
    line-height: 1.3;
    letter-spacing: normal;
    color: #fff;
    text-shadow: 0 2px 0 rgba(0, 0, 0, 0.35);
  }

  .intro-thumbnail {
    display: block;
    width: min(100%, 320px);
    height: auto;
    border: 2px solid #fff;
    border-radius: 20px;
    box-sizing: border-box;
  }

  .intro-button-row {
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: center;
    width: 100%;
  }

  @media (max-width: 1023px) {
    padding: calc(72px + env(safe-area-inset-top, 0px)) 24px calc(24px + env(safe-area-inset-bottom, 0px));
    .intro-column { gap: 24px; }
  }
  @media (max-width: 767px) {
    padding-inline: 20px;
    .intro-column { width: min(100%, 360px); gap: 20px; }
    .intro-thumbnail { width: min(100%, 280px); }
    .intro-step-comment { font-size: 26px; }
  }
  @media (max-height: 500px) and (orientation: landscape) {
    padding: 16px 72px;
    .intro-column {
      width: min(100%, 680px);
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 16px 28px;
    }
    .intro-thumbnail { grid-row: 1 / 3; width: 100%; }
    .intro-step-comment { font-size: 24px; align-self: end; }
    .intro-button-row { align-self: start; }
  }

`

const glassWindowFlow = keyframes`
  0% {
    opacity: 0;
    transform: translateX(-130%) skewX(-18deg) scale(0.8);
  }

  18% {
    opacity: 0.85;
  }

  50% {
    opacity: 0.95;
    transform: translateX(0) skewX(-18deg) scale(1.18);
  }

  82% {
    opacity: 0.75;
  }

  100% {
    opacity: 0;
    transform: translateX(130%) skewX(-18deg) scale(0.8);
  }
`

const IntroStartButton = styled.button`
  position: relative;
  overflow: hidden;
  transform: translateY(0);

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url(${glassWindowImage});
    background-repeat: no-repeat;
    background-position: center;
    background-size: auto 130%;
    pointer-events: none;
    animation: ${glassWindowFlow} 3.4s cubic-bezier(0.34, 0, 0.2, 1) infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    &::before {
      animation: none;
    }
  }

  width: 100%;
  max-width: 400px;
  height: 60px;
  flex-shrink: 0;
  margin-top: 4px;
  padding: 0 16px;
  border: 1.5px solid #1baa70;
  border-radius: 20px;
  background-color: #20ad75;
  color: #fff;
  cursor: pointer;
  font-family: 'Intro-Rg-B', sans-serif;
  font-size: 1.25em;
  font-weight: 800;
  -webkit-text-stroke: 0.35px currentColor;
  box-shadow: 0 3px 0 0 #158b5c;
  transition: transform 0.05s ease, box-shadow 0.05s ease;

  &:not(:disabled):active {
    box-shadow: none;
    transform: translateY(3px);
  }

  &:focus-visible {
    outline: 3px solid #fff;
    outline-offset: 4px;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

const IntroSecondaryButton = styled.button`
  border: none;
  background: none;
  cursor: pointer;
  font-family: 'Intro-Rg-B', sans-serif;
  font-size: 1.1em;
  color: #fff;
  padding: 4px 8px;

  &:not(:disabled):hover { color: #fff; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 4px; }
  &:disabled { opacity: 0.45; cursor: not-allowed; }
`

const StyledIntroBg = styled.div<{ $thumbnailImage: string }>`
  position: absolute;
  inset: 0;
  background-image: url(${({ $thumbnailImage }) => $thumbnailImage});
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  z-index: 1;
`
