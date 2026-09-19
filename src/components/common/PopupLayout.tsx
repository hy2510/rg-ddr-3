import type { ReactNode } from 'react'
import styled from 'styled-components'

import { PopupButton } from '@components/common/Buttons'

type PopupLayoutProps = {
  contents: ReactNode
  confirm: boolean
  /** true 이면 하단 기본 버튼 영역을 렌더하지 않음(contents 안에서 버튼 처리) */
  hideButtons?: boolean
  onClose?: () => void
  onConfirm?: () => void
  onOk?: () => void
  onCancel?: () => void
  okText?: string
  cancelText?: string
  confirmText?: string
  children?: ReactNode
}

export default function PopupLayout({
  contents,
  confirm,
  hideButtons = false,
  onConfirm,
  onOk,
  onCancel,
  onClose,
  okText = 'OK',
  cancelText = 'No',
  confirmText = 'Confirm',
  children,
}: PopupLayoutProps) {
  return (
    <StyledPopupLayout>
      <div className='popup-container'>
        <div className='contents'>{contents}</div>
        {!hideButtons && (
          <div className='buttons'>
            {confirm ? (
              <>
                <PopupButton
                  onClick={onCancel}
                  text={cancelText}
                  buttonColor='gray'
                />
                <PopupButton onClick={onOk} text={okText} buttonColor='green' />
              </>
            ) : (
              <PopupButton
                onClick={onConfirm}
                text={confirmText}
                buttonColor='green'
              />
            )}
          </div>
        )}
        {hideButtons && children}
      </div>
      <div className='back-space' onClick={onClose} />
    </StyledPopupLayout>
  )
}

const StyledPopupLayout = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;

  .popup-container {
    min-width: 500px;
    min-height: 400px;
    border-radius: 50px;
    padding: 30px;
    background-color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 50px;
    position: relative;
    z-index: 1001;

    .contents {
      font-family: var(--sans);
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5em;
      font-weight: 600;
    }

    .buttons {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
    }
  }

  .back-space {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
  }

  position: fixed;
  box-sizing: border-box;
  padding: calc(12px + env(safe-area-inset-top, 0px)) calc(12px + env(safe-area-inset-right, 0px)) calc(12px + env(safe-area-inset-bottom, 0px)) calc(12px + env(safe-area-inset-left, 0px));
  .popup-container {
    box-sizing: border-box;
    max-width: 100%;
    max-height: 100%;
    overflow-y: auto;
    flex-shrink: 1;
    .contents { height: auto; flex-shrink: 0; text-align: center; }
  }
  @media (max-width: 767px), (max-height: 500px) {
    .popup-container {
      width: min(100%, 560px);
      min-width: 0;
      min-height: 0;
      padding: 20px 16px;
      border-radius: 28px;
      gap: 24px;
      justify-content: flex-start;
      .contents { font-size: 20px; }
      .buttons, .action-row {
        width: 100%;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        gap: 12px;
        flex-wrap: nowrap;
      }
    }
  }

`
