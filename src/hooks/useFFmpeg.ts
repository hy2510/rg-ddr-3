import { useCallback, useRef, useState } from 'react'

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

import type { CaptionCue } from '@components/dubbing/caption/captionTimeline'

const BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm'

type RecFile = {
  file: File
  sentenceIndex: number
}

type TransOptions = {
  videoPath: string
  captionTimeline: CaptionCue[]
  recFiles: RecFile[]
  onProgress?: (progress: number, message: string) => void
}

export default function useFFmpeg() {
  const [outputFile, setOutputFile] = useState('')
  const ffmpegRef = useRef<FFmpeg | null>(null)

  /**
   * FFmpeg 인스턴스를 새로 생성하고 로드한다.
   * terminate() 이후 재사용 문제를 방지하기 위해 매번 새 인스턴스를 만든다.
   */
  const loadFFmpeg = async (
    onProgress?: (progress: number, message: string) => void,
  ): Promise<FFmpeg> => {
    const ffmpeg = new FFmpeg()
    ffmpegRef.current = ffmpeg

    ffmpeg.on('progress', ({ progress }) => {
      onProgress?.(Math.min(0.95, 0.3 + progress * 0.65), 'Encoding...')
    })

    onProgress?.(0.05, 'Loading FFmpeg...')
    await ffmpeg.load({
      coreURL: await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(
        `${BASE_URL}/ffmpeg-core.wasm`,
        'application/wasm',
      ),
    })
    onProgress?.(0.15, 'FFmpeg loaded')

    return ffmpeg
  }

  /**
   * 확장자 추출
   */
  const getExtension = (filename: string): string => {
    const match = filename.match(/\.[0-9a-z]+$/i)
    return match ? match[0] : '.webm'
  }

  /**
   * 유저 동영상 만들기
   *
   * 전략:
   * 1. 원본 영상에서 오디오를 추출한다.
   * 2. 각 큐 구간에서 원본 오디오를 무음으로 만들고, 유저 녹음으로 대체한다.
   * 3. filter_complex의 amix/volume 필터로 정밀하게 합성한다.
   * 4. 원본 비디오 스트림은 재인코딩 없이 복사한다.
   */
  const trans = async ({
    videoPath,
    captionTimeline,
    recFiles,
    onProgress,
  }: TransOptions): Promise<string> => {
    const ffmpeg = await loadFFmpeg(onProgress)

    try {
      onProgress?.(0.2, 'Loading video file...')
      await ffmpeg.writeFile('video.mp4', await fetchFile(videoPath))

      // recFiles를 sentenceIndex → file 맵으로 변환
      const recFileMap = new Map<number, File>(
        recFiles.map((r) => [r.sentenceIndex, r.file]),
      )

      // captionTimeline과 recFiles를 매핑
      // sentenceIndex는 captionTimeline의 인덱스(i)와 대응
      const segments: Array<{
        cue: CaptionCue
        file: File | null
        userAudioName: string
      }> = captionTimeline.map((cue, i) => ({
        cue,
        file: recFileMap.get(i) ?? null,
        userAudioName: `userAudio${i}.mp3`,
      }))

      const recordedSegments = segments.filter((s) => s.file !== null)

      onProgress?.(0.25, 'Loading recorded audio files...')
      // 유저 녹음 파일들을 FFmpeg 가상 파일시스템에 기록 + mp3 변환
      for (const seg of recordedSegments) {
        const ext = getExtension(seg.file!.name)
        const inputName = `input_${seg.cue.start}${ext}`
        await ffmpeg.writeFile(inputName, await fetchFile(seg.file!))
        // 모든 녹음을 동일한 스펙(44100Hz, stereo, 128k)으로 변환해 concat 안정성 확보
        await ffmpeg.exec([
          '-i',
          inputName,
          '-ar',
          '44100',
          '-ac',
          '2',
          '-b:a',
          '128k',
          seg.userAudioName,
        ])
        await ffmpeg.deleteFile(inputName)
      }

      onProgress?.(0.3, 'Compositing audio...')

      /**
       * filter_complex 전략:
       *
       * [0:a] = 원본 오디오
       * 각 큐 구간마다 원본 볼륨을 0으로 ducking:
       *   volume=0:enable='between(t, start, end)'
       * 유저 녹음은 adelay로 해당 시각에 배치 후 amix로 합산
       *
       * 예시 (큐가 2개인 경우):
       * [0:a]volume=0:enable='between(t,1.2,3.5)',volume=0:enable='between(t,7.1,9.0)'[orig];
       * [1:a]adelay=1200|1200[d0];
       * [2:a]adelay=7100|7100[d1];
       * [orig][d0][d1]amix=inputs=3:normalize=0[aout]
       */
      const buildFilterComplex = (): {
        filterComplex: string
        inputArgs: string[]
        audioInputCount: number
      } => {
        const inputArgs: string[] = []
        let audioInputCount = 0

        // 원본 오디오 ducking 필터 체인 구성
        const duckingParts = recordedSegments.map((seg) => {
          const s = seg.cue.start.toFixed(3)
          const e = seg.cue.end.toFixed(3)
          return `volume=0:enable='between(t,${s},${e})'`
        })
        const origLabel =
          duckingParts.length > 0
            ? `[0:a]${duckingParts.join(',')}[orig]`
            : '[0:a]acopy[orig]'

        // 유저 녹음을 각 큐 시작 시각으로 delay
        const delayLabels: string[] = []
        recordedSegments.forEach((seg, i) => {
          const delayMs = Math.round(seg.cue.start * 1000)
          const label = `[d${i}]`
          // -i 입력 인덱스는 video(0) 다음부터 순번
          inputArgs.push('-i', seg.userAudioName)
          audioInputCount++
          delayLabels.push(
            `[${audioInputCount}:a]adelay=${delayMs}|${delayMs}${label}`,
          )
        })

        const mixInputs = ['[orig]', ...delayLabels.map((_, i) => `[d${i}]`)]
        const amix = `${mixInputs.join('')}amix=inputs=${mixInputs.length}:normalize=0[aout]`

        const filterParts = [origLabel, ...delayLabels, amix]
        return {
          filterComplex: filterParts.join(';'),
          inputArgs,
          audioInputCount,
        }
      }

      const { filterComplex, inputArgs } = buildFilterComplex()

      onProgress?.(0.35, 'Merging video and audio...')
      await ffmpeg.exec([
        '-i',
        'video.mp4',
        ...inputArgs,
        '-filter_complex',
        filterComplex,
        '-map',
        '0:v:0',
        '-map',
        '[aout]',
        '-c:v',
        'copy', // 비디오는 재인코딩 없이 복사 (빠름)
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        'faststart',
        'user.mp4',
      ])

      onProgress?.(0.95, 'Reading output file...')
      const data = await ffmpeg.readFile('user.mp4')
      // readFile()은 Uint8Array | string을 반환한다.
      // 영상 파일은 항상 바이너리이므로 Uint8Array로 단언하되,
      // 혹시 string으로 오는 엣지 케이스도 방어한다.
      // readFile()은 Uint8Array | string 반환.
      // Uint8Array의 buffer가 SharedArrayBuffer일 수 있으므로
      // slice()로 일반 ArrayBuffer 복사본을 만들어 Blob에 넘긴다.
      const rawData =
        data instanceof Uint8Array
          ? data
          : new TextEncoder().encode(data as string)
      // .slice(0)은 항상 일반 ArrayBuffer를 반환하지만 TS는
      // ArrayBuffer | SharedArrayBuffer 로 추론하므로 명시적으로 단언한다.
      const arrayBuffer = rawData.buffer.slice(0) as ArrayBuffer
      const blob = new Blob([arrayBuffer], { type: 'video/mp4' })
      const url = URL.createObjectURL(blob)

      setOutputFile(url)

      // 가상 파일시스템 정리
      const filesToDelete = [
        'video.mp4',
        'user.mp4',
        ...recordedSegments.map((s) => s.userAudioName),
      ]
      await Promise.allSettled(filesToDelete.map((f) => ffmpeg.deleteFile(f)))

      onProgress?.(1, 'Done')
      return url
    } finally {
      try {
        ffmpegRef.current?.terminate()
      } catch {
        // noop
      }
      ffmpegRef.current = null
    }
  }

  /**
   * 진행 중인 FFmpeg 작업 강제 중단
   */
  const terminate = useCallback(() => {
    try {
      ffmpegRef.current?.terminate()
    } catch {
      // noop
    }
    ffmpegRef.current = null
  }, [])

  const clearOutputFile = useCallback(() => {
    setOutputFile((prev) => {
      if (prev.startsWith('blob:')) URL.revokeObjectURL(prev)
      return ''
    })
  }, [])

  return { outputFile, trans, terminate, clearOutputFile }
}
