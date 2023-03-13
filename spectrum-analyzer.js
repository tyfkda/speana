const initialData = (() => {
  'use strick'

  const LOGARITHMIC = 'logarithmic'
  const LED = 'led'

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

  const minHz = 20
  const maxHz = 20000
  const minHzVal = Math.log10(minHz)
  const maxHzVal = Math.log10(maxHz)

  class SpectrumAnalyzer {
    analyserNode = null  // AnalyserNode
    dataArray = null     // Buffer for FFT
    canvas = null        // Canvas
    xBinTable = null     // index of FFT-array for x

    constructor(audioCtx, canvas) {
      this.audioCtx = audioCtx
      this.canvas = canvas

      this.analyserNode = this.audioCtx.createAnalyser()

      this.setUpWork()
    }

    setUpWork() {
      const bufferLength = this.analyserNode.frequencyBinCount
      this.dataArray = new Uint8Array(bufferLength)

      const WIDTH = this.canvas.width
      this.peakAmplitude = [...Array(WIDTH)].map(_ => 0)
      this.peakFallVel = [...Array(WIDTH)].map(_ => 0)

      const sampleRate = this.analyserNode.context.sampleRate
      this.freqBinTable = FreqTable.map((f) => calcBin(f, bufferLength, sampleRate))
      this.xBinTable = new Int32Array([...Array(WIDTH + 1)].map((_, i) => {
        const e = i / WIDTH * (maxHzVal - minHzVal) + minHzVal
        const freq = 10 ** e
        return (freq * bufferLength / (sampleRate * 0.5)) | 0
      }))
    }

    setFftSize(fftSize) {
      if (this.analyserNode.fftSize !== fftSize) {
        this.analyserNode.fftSize = fftSize
        this.setUpWork()
      }
    }

    connectFrom(source) {
      source.connect(this.analyserNode)
    }

    update(renderMode) {
      const canvasCtx = this.canvas.getContext('2d')
      canvasCtx.fillStyle = 'rgb(0,0,0)'
      canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height)

      if (this.analyserNode.minDecibels >= this.analyserNode.maxDecibels)
        return

      const dataArray = this.dataArray
      this.analyserNode.getByteFrequencyData(dataArray)

      switch (renderMode) {
      default:
      case LOGARITHMIC:
        this.renderLogarithmic(canvasCtx, dataArray)
        break
      case LED:
        this.renderLed(canvasCtx, dataArray)
        break
      }
    }

    renderLogarithmic(canvasCtx, dataArray) {
      const WIDTH = this.canvas.width
      const HEIGHT = this.canvas.height
      const scale = HEIGHT / 255
      const gravity = HEIGHT / (64 * 64)

      for (let i = 0; i < WIDTH; ++i) {
        // Bar.
        let bin = this.xBinTable[i]
        let v = dataArray[bin]
        for (const nextBin = this.xBinTable[i + 1]; ++bin < nextBin; )
          v = Math.max(v, dataArray[bin])

        const h = (v * scale) | 0
        const x = i
        canvasCtx.fillStyle = `rgb(${v>>2},${v},${160-(v>>1)})`
        canvasCtx.fillRect(x, HEIGHT - h, 1, h)

        // Peak.
        let py = this.peakAmplitude[i]
        if (h >= py) {
          this.peakAmplitude[i] = h
          this.peakFallVel[i] = 0
        } else if (py > 0) {
          this.peakFallVel[i] -= gravity
          this.peakAmplitude[i] += this.peakFallVel[i]

          const v = (py / scale) | 0
          canvasCtx.fillStyle = `rgb(0,${(v>>2)+192},${v>>1})`
          canvasCtx.fillRect(x, HEIGHT - 1 - py, 1, 2)
        }
      }

      // Axis.
      const AxisTable = [
        {freq: 100, text: '100Hz'},
        {freq: 1000, text: '1kHz'},
        {freq: 10000, text: '10kHz'},
      ]
      canvasCtx.strokeStyle = 'rgb(255,255,255)'
      canvasCtx.setLineDash([2, 2])
      canvasCtx.font = '12px serif'
      for (let i = 0; i < AxisTable.length; ++i) {
        const {freq, text} = AxisTable[i]
        const e = Math.log10(freq)
        const x = (e - minHzVal) * WIDTH / (maxHzVal - minHzVal)
        canvasCtx.beginPath()
        canvasCtx.moveTo(x, 0)
        canvasCtx.lineTo(x, HEIGHT)
        canvasCtx.stroke()

        canvasCtx.fillStyle='rgb(255,255,64)'
        canvasCtx.fillText(text, x, HEIGHT)
      }
      canvasCtx.setLineDash([])
    }

    renderLed(canvasCtx, dataArray) {
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

        const h2 = this.peakAmplitude[i]
        if (h >= h2) {
          this.peakAmplitude[i] = h
          this.peakFallVel[i] = AMP_WAIT0
        } else if (h2 > 0) {
          const hh = h2 - 1
          if (hh >= h) {
            canvasCtx.fillStyle = hh < YDIV - 4 ? GREEN : hh < YDIV - 1 ? YELLOW : RED
            const y = (HEIGHT - H) - hh * H
            canvasCtx.beginPath()
            canvasCtx.roundRect(x, y, barWidth - 1, H - 1, 2)
            canvasCtx.fill()
          }

          if (--this.peakFallVel[i] <= 0) {
            this.peakAmplitude[i] = h2 - 1
            this.peakFallVel[i] = AMP_WAIT1
          }
        }
      }
    }
  }

  const RenderModeOptions = [
    {value: LOGARITHMIC, text: '対数'},
    {value: LED, text: 'LED'},
  ]
  const FftSizeOptions = [512, 1024, 2048, 4096, 8192, 16384]

  const HideMenuX = 'translateX(100%)'
  const ShowMenuX = 'translateX(0)'

  return {
    renderMode: LED,
    RenderModeOptions,
    maxDecibels: -30,
    minDecibels: -70,
    fftSize: 4096,
    FftSizeOptions,
    smoothing: 0.0,
    playing: false,
    menuX: HideMenuX,

    audioCtx: null,
    spectrumAnalyzer: null,
    audioSource: null,
    rafId: null,    // requestAnimationFrame
    audioElement: null,

    init() {
      const canvas = document.getElementById('mycanvas')
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
      const canvasCtx = canvas.getContext('2d')
      canvasCtx.fillStyle = 'rgb(0,0,0)'
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height)

      this.audioElement = document.getElementById('audio-player')

      this.$watch('maxDecibels', value => {
        const val = parseInt(value)
        if (this.minDecibels >= val) {
          this.minDecibels = val - 1
          if (this.spectrumAnalyzer != null)
            this.spectrumAnalyzer.analyserNode.minDecibels = this.minDecibels
        }
        if (this.spectrumAnalyzer != null)
          this.spectrumAnalyzer.analyserNode.maxDecibels = val
      })
      this.$watch('minDecibels', value => {
        let val = parseInt(value)
        if (this.maxDecibels <= val) {
          this.maxDecibels = val--
          if (this.spectrumAnalyzer != null)
            this.spectrumAnalyzer.analyserNode.maxDecibels = this.maxDecibels
        }
        if (this.spectrumAnalyzer != null)
          this.spectrumAnalyzer.analyserNode.minDecibels = val
      })
      this.$watch('fftSize', value => {
        if (this.spectrumAnalyzer != null)
          this.spectrumAnalyzer.setFftSize(value)
      })
      this.$watch('smoothing', value => {
        if (this.spectrumAnalyzer != null)
          this.spectrumAnalyzer.analyserNode.smoothingTimeConstant = value
      })
    },
    toggleMenu() {
      this.menuX = (this.menuX === HideMenuX) ? ShowMenuX : HideMenuX
    },
    onFileChange(files) {
      if (files == null || files.length === 0)
        return
      this.stopAudio()

      if (this.audioCtx == null) {
        this.audioCtx = new AudioContext()

        const canvas = document.getElementById('mycanvas')
        this.spectrumAnalyzer = new SpectrumAnalyzer(this.audioCtx, canvas)
        this.spectrumAnalyzer.analyserNode.maxDecibels = this.maxDecibels
        this.spectrumAnalyzer.analyserNode.minDecibels = this.minDecibels
        this.spectrumAnalyzer.setFftSize(this.fftSize)
        this.spectrumAnalyzer.analyserNode.smoothingTimeConstant = this.smoothing

        this.audioSource = this.audioCtx.createMediaElementSource(this.audioElement)
        this.spectrumAnalyzer.connectFrom(this.audioSource)
        this.audioSource.connect(this.audioCtx.destination)
      }

      const fileBlob = files[0]
      this.audioElement.src = URL.createObjectURL(fileBlob)
      this.audioElement.play()

      this.playing = true
      this.startAnimation()
    },

    stopAudio() {
      this.audioElement.pause()
      this.audioElement.removeAttribute('src')
    },

    startAnimation() {
      if (this.rafId != null)
        return
      const loopFn = (_timestamp) => {
        this.spectrumAnalyzer.update(this.renderMode)
        this.rafId = requestAnimationFrame(loopFn)
      }
      this.rafId = requestAnimationFrame(loopFn)
    },
    stopAnimation() {
      if (this.rafId != null) {
        cancelAnimationFrame(this.rafId)
        this.rafId = null
      }
    },
  }
})()
