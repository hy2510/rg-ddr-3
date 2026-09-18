import '@src/index.css'

import React from 'react'

import ReactDOM from 'react-dom/client'

import App from '@src/App'

// iOS Safari/WKWebView 핀치 줌 차단 (viewport meta로는 막히지 않음)
const preventGesture = (e: Event) => e.preventDefault()
document.addEventListener('gesturestart', preventGesture, { passive: false })
document.addEventListener('gesturechange', preventGesture, { passive: false })
document.addEventListener('gestureend', preventGesture, { passive: false })

// Android/iOS 공통 - 두 손가락 이상 터치 시에만 핀치 줌 차단 (단일 터치 스크롤은 영향 없음)
const preventMultiTouchZoom = (e: TouchEvent) => {
  if (e.touches.length > 1) e.preventDefault()
}
document.addEventListener('touchmove', preventMultiTouchZoom, {
  passive: false,
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
