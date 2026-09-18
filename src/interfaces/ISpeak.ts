type SpeakPageProps = {
  ChallengeNumber: number
  BookId: string
  Page: number
  QuizNo: number
  Css: string
  Contents: string
  FontColor: string
  ImagePath: string
  Sequence: number
  SoundPath: string
  DataPath: string
  MarginTop: number
  MarginLeft: number
  Sentence: string
}

interface ISpeakRecord {
  Page: number
  Sequence: number
  QuizNo: number
  Sentence: string
  ScoreOverall: number
  ScoreWord: number
  ScorePronunciation: number
  ScoreProsody: number
  ScoreIntonation: number
  ScoreTiming: number
  ScoreLoudness: number
}

interface ISpeakUserAnswer {
  studyId: string
  studentHistoryId: string
  challengeNumber: number
  page: number
  sequence: number
  quizNo: number
  sentence: string
  scoreOverall: number
  wordsJson: string
  isLastQuiz: boolean
}

interface ISpeakSaveResult {
  result: number
  resultMessage: string
}

interface IRecordResultData {
  best_answer: string
  total_score: number
  matched_words: number[]
}

type PageState = '' | 'play' | 'left' | 'right'
type PageSequenceProps = {
  playPage: number
  sequnce: number
}

// 오디오 상태
type PlayState = '' | 'play' | 'play-sentence' | 'play-user-sound'
type RecordState = '' | 'recording'

export type {
  IRecordResultData,
  ISpeakRecord,
  ISpeakSaveResult,
  ISpeakUserAnswer,
  PageSequenceProps,
  PageState,
  PlayState,
  RecordState,
  SpeakPageProps,
}
