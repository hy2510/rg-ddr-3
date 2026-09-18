import styled from 'styled-components'

import { PopupButton } from '@components/common/Buttons'
import { splitCueWords } from '@hooks/useCueRecording'
import type { IRecord } from '@interfaces/IDubbing'

type ParsedRawJson = {
  total_score?: number
  matched_words?: number[]
}

function parseRawJson(rawJson: string | undefined): ParsedRawJson {
  if (!rawJson) return {}
  try {
    // DB에 \" 이스케이프된 채로 저장된 값 복원
    const unescaped = rawJson.replace(/\\"/g, '"')
    // 닫는 } 누락 방어
    const fixed = unescaped.trimEnd().endsWith('}')
      ? unescaped
      : unescaped + '}'
    return JSON.parse(fixed) as ParsedRawJson
  } catch {
    return {}
  }
}

type TotalScoreMyMovieProps = {
  records: IRecord[]
  onClose: () => void
  closeText?: string
}

/** 아카이브 조회용 점수 팝업 (intro → my-movie 경로, 서버 저장 결과 표시) */
export function TotalScoreMyMovie({
  records,
  onClose,
  closeText = 'Close',
}: TotalScoreMyMovieProps) {
  const parsedRecords = records.map((record) => {
    const raw = parseRawJson(record.RawJson)
    const words = splitCueWords(record.Sentence)
    const matchedWords = raw.matched_words ?? []
    const totalScore = raw.total_score ?? 0
    return { record, words, matchedWords, totalScore }
  })

  const totalRate =
    parsedRecords.length > 0
      ? Math.round(
          parsedRecords.reduce((acc, r) => acc + r.totalScore, 0) /
            parsedRecords.length,
        )
      : 0

  return (
    <StyledTotalScore>
      <h2 className='header-title'>Your Score</h2>
      <ul className='result-list'>
        {parsedRecords.map(
          ({ record, words, matchedWords, totalScore }, idx) => {
            const matchedSet = new Set(matchedWords)
            const rate = totalScore
            return (
              <li key={record.QuizNo} className='result-item'>
                <span className='result-index'>{idx + 1}.</span>
                <span className='result-text'>
                  {words.map((word, wIdx) => (
                    <span
                      key={`${record.QuizNo}-${wIdx}`}
                      className={matchedSet.has(wIdx) ? 'word matched' : 'word'}
                    >
                      {word}
                      {wIdx < words.length - 1 ? ' ' : ''}
                    </span>
                  ))}
                </span>
                <span
                  className={`result-rate ${
                    rate >= 80 ? 'good' : rate >= 40 ? 'ok' : 'bad'
                  }`}
                >
                  {rate}%
                </span>
              </li>
            )
          },
        )}
      </ul>
      <div className='total-score'>
        <span className='total-label'>✨ Average Score</span>
        <span className='total-value'>{totalRate}%</span>
      </div>

      <div className='action-row'>
        <PopupButton text={closeText} buttonColor='gray' onClick={onClose} />
      </div>
    </StyledTotalScore>
  )
}

const StyledTotalScore = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 24px;
  width: 640px;
  max-width: 80vw;
  padding: 8px 4px;

  .header-title {
    margin: 0;
    font-size: 2em;
    font-weight: 800;
    color: #1f2d17;
    text-align: center;
    letter-spacing: 0.02em;
  }

  .result-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 360px;
    overflow-y: auto;
  }

  .result-item {
    display: grid;
    grid-template-columns: 32px 1fr auto;
    align-items: center;
    gap: 16px;
    padding: 12px 16px;
    background: #f3f6fb;
    border-radius: 14px;
    font-size: 1em;
    font-weight: 500;
    color: #2a3346;
  }

  .result-index {
    font-weight: 700;
    color: #6b7a90;
    text-align: right;
  }

  .result-text {
    text-align: left;
    white-space: normal;
    word-break: break-word;
    line-height: 1.5;

    .word {
      display: inline;
    }

    .word.matched {
      color: #1f5d00;
      background: #cbffb0;
      padding: 2px 6px;
      margin: 0 1px;
      border-radius: 6px;
      font-weight: 700;
    }
  }

  .result-rate {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    padding: 4px 10px;
    border-radius: 999px;
    background: #e0e6ef;
    color: #3c4b62;
    white-space: nowrap;
  }
  .result-rate.good {
    background: #cbffb0;
    color: #1f5d00;
  }
  .result-rate.ok {
    background: #fff1b8;
    color: #7a5a00;
  }
  .result-rate.bad {
    background: #fdeaec;
    color: #b4202e;
  }

  .total-score {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-top: 2px dashed #d6dde8;
    border-radius: 0;
    font-size: 1.2em;
  }

  .total-label {
    font-weight: 700;
    color: #2a3346;
  }

  .total-value {
    font-weight: 600;
    color: #3c4b62;
    font-variant-numeric: tabular-nums;

    strong {
      color: #35a900;
      font-weight: 800;
      margin-left: 4px;
    }
  }

  .download-status {
    font-size: 0.9em;
    color: #5a6780;
  }
  .download-status.error {
    color: #b4202e;
    font-weight: 600;
  }

  .action-row {
    /* PopupLayout .contents(1.5em) 상속을 끊음 — PopupButton 의 1.4em 이 루트 기준과 같게 */
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
    flex-wrap: wrap;
    padding-top: 8px;
  }
`
