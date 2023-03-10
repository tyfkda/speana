const DC_REMOVE_WORKER_PASS = './dc_remove_worker.js'

const FFT_SIZE = 8192

const LINEAR = 'linear'
const LOGARITHMIC = 'logarithmic'
const BLOCK = 'block'

const FreqTable = [
  // https://www.circuitlib.com/index.php/lessons/digital-real-time-audio-frequency-led-spectrum-analyzer
  6,
  (31.5 + 63) / 2,
  (63 + 94) / 2,
  (94 + 126) / 2,
  (126 + 170) / 2,
  (170 + 230) / 2,
  (230 + 310) / 2,
  (310 + 420) / 2,
  (420 + 563) / 2,
  (563 + 760) / 2,
  (760 + 1000) / 2,
  (1000 + 1370) / 2,
  (1370 + 1870) / 2,
  (1870 + 2550) / 2,
  (2550 + 3400) / 2,
  (3400 + 4600) / 2,
  (4600 + 6150) / 2,
  (6150 + 8360) / 2,
  (8360 + 11200) / 2,
  (11200 + 15000) / 2,
  20000,
]

const AMP_WAIT0 = 30  // 0.5sec
const AMP_WAIT1 = 2

// Colors
const GREEN = 'rgb(0,224,64)'
const YELLOW = 'rgb(224,224,0)'
const RED = 'rgb(224,0,0)'
const GRAY = 'rgb(40,40,40)'

function calcBin(f, bufferLength, sampleRate) {
  return (f * bufferLength / (sampleRate * 0.5)) | 0
}

class SpectrumAnalyzer {
  audioCtx = null      // AudioContext
  analyserNode = null  // AnalyserNode
  floatArray = null    // Buffer for FFT

  canvas = null        // Canvas

  constructor(audioCtx, canvas) {
    this.audioCtx = audioCtx
    this.canvas = canvas

    this.analyserNode = this.audioCtx.createAnalyser()
    this.analyserNode.fftSize = FFT_SIZE

    this.setUpWork()
  }

  setUpWork() {
    const bufferLength = this.analyserNode.frequencyBinCount
    this.floatArray = new Uint8Array(bufferLength)

    const sampleRate = this.audioCtx.sampleRate
    this.freqBinTable = FreqTable.map((f) => calcBin(f, bufferLength, sampleRate))
    this.peekAmplitude = [...Array(FreqTable.length - 1)].map(_ => 0)
    this.ampWait = [...Array(FreqTable.length - 1)].map(_ => 0)
  }

  setDecibels(max, min) {
    this.analyserNode.maxDecibels = max
    this.analyserNode.minDecibels = min
  }

  setFftSize(fftSize) {
    this.analyserNode.fftSize = fftSize
    this.setUpWork()
  }

  connectFrom(source) {
    source.connect(this.analyserNode)
  }

  update(renderMode) {
    const dataArray = this.floatArray
    // this.analyserNode.getFloatFrequencyData(dataArray)
    this.analyserNode.getByteFrequencyData(dataArray)

    const canvasCtx = this.canvas.getContext('2d')
    canvasCtx.fillStyle = 'rgb(0,0,0)'
    canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    if (this.analyserNode.minDecibels >= this.analyserNode.maxDecibels)
      return

    switch (renderMode) {
    default:
    case LINEAR:
      this.renderLinear(canvasCtx, dataArray)
      break
    case LOGARITHMIC:
      this.renderLogarithmic(canvasCtx, dataArray)
      break
    case BLOCK:
      this.renderBlock(canvasCtx, dataArray)
      break
    }
  }

  renderLinear(canvasCtx, dataArray) {
    const WIDTH = this.canvas.width
    const HEIGHT = this.canvas.height

    const minDecibels = 0  //this.analyserNode.minDecibels
    const maxDecibels = 255  //this.analyserNode.maxDecibels
    const scale = HEIGHT / (maxDecibels - minDecibels)

    const bufferLength = dataArray.length
    canvasCtx.fillStyle = 'rgb(0,224,64)'
    for (let i = 0; i < WIDTH; ++i) {
      const bin = (i * bufferLength / WIDTH) | 0
      const h = ((dataArray[bin] - minDecibels) * scale) | 0
      const x = i
      canvasCtx.fillRect(x, HEIGHT - h, 1, h)
    }

    const sampleRate = this.audioCtx.sampleRate
    const minHz = 0
    const maxHz = sampleRate * 0.5

    // const table = [100, 1000, 10000]
    const table = [31, 63, 125, 250, 500, 1024, 2048, 4092, 8196, 16384]
    canvasCtx.strokeStyle = 'rgb(255,255,255)'
    canvasCtx.setLineDash([2, 2])
    for (let i = 0; i < table.length; ++i) {
      const f = table[i]
      const x = (f - minHz) * WIDTH / (maxHz - minHz)
      canvasCtx.beginPath()
      canvasCtx.moveTo(x, 0)
      canvasCtx.lineTo(x, HEIGHT)
      canvasCtx.stroke()
    }
    canvasCtx.setLineDash([])
  }

  renderLogarithmic(canvasCtx, dataArray) {
    const WIDTH = this.canvas.width
    const HEIGHT = this.canvas.height

    const minDecibels = 0  //this.analyserNode.minDecibels
    const maxDecibels = 255  //this.analyserNode.maxDecibels
    const scale = HEIGHT / (maxDecibels - minDecibels)

    const minHz = 20
    const maxHz = 20000
    const minHzVal = Math.log10(minHz)
    const maxHzVal = Math.log10(maxHz)
    const BASE = 10

    const bufferLength = dataArray.length
    const sampleRate = this.audioCtx.sampleRate
    const range = (maxHzVal - minHzVal) / WIDTH
    const binScale = bufferLength / (sampleRate * 0.5)
    canvasCtx.fillStyle = 'rgb(0,224,64)'
    for (let i = 0; i < WIDTH; ++i) {
      const e = i * range + minHzVal
      const freq = BASE ** e
      const bin = (freq * binScale) | 0
      const h = ((dataArray[bin] - minDecibels) * scale) | 0
      const x = i
      canvasCtx.fillRect(x, HEIGHT - h, 1, h)
    }

    // const table = [100, 1000, 10000]
    const table = [31, 63, 125, 250, 500, 1024, 2048, 4092, 8196, 16384]
    canvasCtx.strokeStyle = 'rgb(255,255,255)'
    canvasCtx.setLineDash([2, 2])
    for (let i = 0; i < table.length; ++i) {
      const f = table[i]
      const e = Math.log10(f)
      const x = (e - minHzVal) * WIDTH / (maxHzVal - minHzVal)
      canvasCtx.beginPath()
      canvasCtx.moveTo(x, 0)
      canvasCtx.lineTo(x, HEIGHT)
      canvasCtx.stroke()
    }
    canvasCtx.setLineDash([])
  }

  renderBlock(canvasCtx, dataArray) {
    const WIDTH = this.canvas.width
    const HEIGHT = this.canvas.height

    const minDecibels = 0  //this.analyserNode.minDecibels
    const maxDecibels = 255  //this.analyserNode.maxDecibels
    const n = this.freqBinTable.length - 1
    const barWidth = (WIDTH / n) | 0
    const YDIV = 20
    const H = HEIGHT / YDIV
    const scale = YDIV / (maxDecibels - minDecibels)

    let bin = this.freqBinTable[0]
    for (let i = 0; i < n; ++i) {
      const nextBin = this.freqBinTable[i + 1]
      let max = minDecibels
      for (let j = Math.min(bin, nextBin - 1); j < nextBin; ++j) {  // Avoid no bin.
        max = Math.max(max, dataArray[j])
      }
      bin = nextBin
      const h = Math.min((max - minDecibels) * scale, YDIV) | 0
      const x = i * WIDTH / n
      for (let j = 0; j < YDIV; ++j) {
        canvasCtx.fillStyle = j >= h ? GRAY : j < YDIV - 4 ? GREEN : j < YDIV - 1 ? YELLOW : RED
        const y = (HEIGHT - H) - j * H
        canvasCtx.beginPath()
        canvasCtx.roundRect(x, y, barWidth - 1, H - 1, 2)
        canvasCtx.fill()
      }

      const h2 = this.peekAmplitude[i]
      if (h >= h2) {
        this.peekAmplitude[i] = h
        this.ampWait[i] = AMP_WAIT0
      } else if (h2 > 0) {
        const hh = h2 - 1
        if (hh >= h) {
          canvasCtx.fillStyle = hh < YDIV - 4 ? GREEN : hh < YDIV - 1 ? YELLOW : RED
          const y = (HEIGHT - H) - hh * H
          canvasCtx.beginPath()
          canvasCtx.roundRect(x, y, barWidth - 1, H - 1, 2)
          canvasCtx.fill()
        }

        if (--this.ampWait[i] <= 0) {
          this.peekAmplitude[i] = h2 - 1
          this.ampWait[i] = AMP_WAIT1
        }
      }
    }
  }
}

const initialData = (() => {
  'use strick'

  const RenderModeOptions = [
    {value: LINEAR, text: '線形'},
    {value: LOGARITHMIC, text: '対数'},
    {value: BLOCK, text: 'ブロック'},
  ]
  const FftSizeOptions = [512, 1024, 2048, 4096, 8192]

  let audioCtx = null
  let spectrumAnalyzer = null
  let audioSource = null
  let gainNode = null
  let rafId = null         // requestAnimationFrame
  let loopFn = null
  let audioEl = null


  function stopAudio() {
    if (audioEl != null) {
      audioEl.pause()
      audioEl.src = null
      audioEl = null
      audioSource.disconnect()
      audioSource = null
    }
  }

  return {
    maxDecibels: -30,
    minDecibels: -60,
    renderMode: LOGARITHMIC,
    RenderModeOptions,
    fftSize: FFT_SIZE,
    FftSizeOptions,
    smoothing: 0.1,
    playing: false,

    init() {
      this.$watch('renderMode', value => {
        if (spectrumAnalyzer != null) {
          spectrumAnalyzer.renderMode = value
        }
      })
      this.$watch('maxDecibels', value => {
        const val = parseInt(value)
        if (this.minDecibels > val - 10)
          this.minDecibels = val - 10
        if (spectrumAnalyzer != null)
          spectrumAnalyzer.setDecibels(val, this.minDecibels)
      })
      this.$watch('minDecibels', value => {
        const val = parseInt(value)
        if (this.maxDecibels < val + 10)
          this.maxDecibels = val + 10
        if (spectrumAnalyzer != null)
          spectrumAnalyzer.setDecibels(this.maxDecibels, val)
      })
      this.$watch('fftSize', value => {
        if (spectrumAnalyzer != null)
          spectrumAnalyzer.setFftSize(value)
      })
      this.$watch('smoothing', value => {
        if (spectrumAnalyzer != null)
          spectrumAnalyzer.analyserNode.smoothingTimeConstant = value
      })
    },
    stop() {
      stopAudio()
      document.getElementById('song-file').value = ''
      this.playing = false
    },
    async onFileChange(files) {
      stopAudio()
      if (files == null || files.length === 0)
        return

      if (audioCtx == null) {
        audioCtx = new AudioContext()

        gainNode = audioCtx.createGain()
        gainNode.connect(audioCtx.destination)

        const canvas = document.getElementById('mycanvas')
        spectrumAnalyzer = new SpectrumAnalyzer(audioCtx, canvas)
        spectrumAnalyzer.renderMode = this.renderMode
        spectrumAnalyzer.setDecibels(this.maxDecibels, this.minDecibels)
        spectrumAnalyzer.setFftSize(this.fftSize)
        spectrumAnalyzer.analyserNode.smoothingTimeConstant = this.smoothing
      }

      // const reader = new FileReader()
      // reader.addEventListener('load', async (e) => {
      //   const ab = e.target.result
      //   const context = audioCtx
      //   let audioBuffer = null
      //   try {
      //     audioBuffer = await context.decodeAudioData(ab)
      //   } catch (e) {
      //     console.warn(e)
      //     return
      //   }

      //   audioSource = audioCtx.createBufferSource()
      //   audioSource.buffer = audioBuffer
      //   audioSource.addEventListener('ended', () => this.stop())

      //   spectrumAnalyzer.connectFrom(audioSource)
      //   audioSource.connect(audioCtx.destination)
      //   audioSource.start()
      //   this.playing = true

      //   this.startAnimation()
      // })
      // reader.readAsArrayBuffer(files[0])
      const fileBlob = files[0]
      // audioEl = document.createElement('audio')
      audioEl = document.getElementById('player0')
      audioEl.src = URL.createObjectURL(fileBlob)
      // audioEl.addEventListener('load', () => {
      //   URL.removeObjectURL(audioEl.src)
      // })
      audioEl.play()
      audioEl.onload = () => {
console.log('onload')
        URL.removeObjectURL(audioEl.src)
      }

      audioSource = audioCtx.createMediaElementSource(audioEl)
      spectrumAnalyzer.connectFrom(audioSource)
      // audioSource.connect(audioCtx.destination)
      spectrumAnalyzer.analyserNode.connect(gainNode)

      this.playing = true
      this.startAnimation()
    },


    stopAnimation() {
      if (rafId != null) {
        cancelAnimationFrame(rafId)
        rafId = null
        loopFn = null
      }
    },
    startAnimation() {
      if (rafId != null)
        return
      loopFn = (_timestamp) => {
// if (audioEl != null) {
//   console.log(audioEl.currentTime)
// }
        spectrumAnalyzer.update(this.renderMode)
        rafId = requestAnimationFrame(loopFn)
      }
      rafId = requestAnimationFrame(loopFn)
    },
  }
})()
