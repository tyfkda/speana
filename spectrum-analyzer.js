const initialData = (() => {
  'use strick'

  const LOGARITHMIC = 'logarithmic'
  const LED = 'led'

  const FreqTable = [
    {freq: 63, min: 0.5, max: 1.0},
    {freq: 160, min: 0.25, max: 1.0},
    {freq: 400, min: 0.0, max: 1.0},
    {freq: 1000, min: 0.0, max: 0.9},
    {freq: 2500, min: 0.0, max: 0.8},
    {freq: 6200, min: 0.0, max: 0.6},
    {freq: 16000, min: 0.0, max: 0.5},
  ]

  const AMP_WAIT0 = 30  // 0.5sec
  const AMP_WAIT1 = 2

  // Colors
  const GREEN = 'rgb(0,224,64)'
  const YELLOW = 'rgb(224,224,0)'
  const RED = 'rgb(224,0,0)'
  const GRAY = 'rgb(40,40,40)'

  function calcBin(freq, bufferLength, sampleRate) {
    return (freq * bufferLength / (sampleRate * 0.5)) | 0
  }

  const minHz = 20
  const maxHz = 20000
  const minHzVal = Math.log10(minHz)
  const maxHzVal = Math.log10(maxHz)

  class SpectrumAnalyzer {
    analyserNode = null  // AnalyserNode
    dataArray = null     // Buffer for FFT
    floatArray = null    // Buffer for FFT
    canvas = null        // Canvas
    xBinTable = null     // index of FFT-array for x

    constructor(audioCtx, canvas) {
      this.audioCtx = audioCtx
      this.canvas = canvas

      this.analyserNode = this.audioCtx.createAnalyser()

      this.setUpWork()

      FreqTable.forEach(e => e.scale = 1.0 / (e.max - e.min))
    }

    setUpWork() {
      const bufferLength = this.analyserNode.frequencyBinCount
      this.dataArray = new Uint8Array(bufferLength)
      this.floatArray = new Float32Array(bufferLength)

      const WIDTH = this.canvas.width
      this.peakAmplitude = [...Array(WIDTH)].map(_ => 0)
      this.peakFallVel = [...Array(WIDTH)].map(_ => 0)

      const sampleRate = this.analyserNode.context.sampleRate
      this.freqBinTable = FreqTable.map(({freq}) => calcBin(freq, bufferLength, sampleRate))
      this.xBinTable = new Int32Array([...Array(WIDTH + 1)].map((_, i) => {
        const e = i / WIDTH * (maxHzVal - minHzVal) + minHzVal
        const freq = 10 ** e
        return calcBin(freq, bufferLength, sampleRate)
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

      switch (renderMode) {
      default:
      case LOGARITHMIC:
        this.renderLogarithmic(canvasCtx)
        break
      case LED:
        this.renderLed(canvasCtx)
        break
      }
    }

    renderLogarithmic(canvasCtx) {
      const WIDTH = this.canvas.width
      const HEIGHT = this.canvas.height
      const scale = HEIGHT / 255
      const gravity = HEIGHT / (64 * 64)

      const dataArray = this.dataArray
      this.analyserNode.getByteFrequencyData(dataArray)

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

    renderLed(canvasCtx) {
      const WIDTH = this.canvas.width
      const HEIGHT = this.canvas.height

      const minDecibels = this.analyserNode.minDecibels
      const maxDecibels = this.analyserNode.maxDecibels
      const n = this.freqBinTable.length
      const barWidth = (WIDTH / n) | 0
      const YDIV = 20
      const H = HEIGHT / YDIV
      const scale = 1.0 / (maxDecibels - minDecibels)

      const dataArray = this.floatArray
      this.analyserNode.getFloatFrequencyData(dataArray)

      let bin = this.freqBinTable[0]
      for (let i = 0; i < n; ++i) {
        bin = this.freqBinTable[i]
        let max = dataArray[bin]
        // const nextBin = this.freqBinTable[i + 1]
        // for (let j = Math.min(bin, nextBin - 1); j < nextBin; ++j) {  // Avoid no bin.
        //   max = Math.max(max, dataArray[j])
        // }
        // bin = nextBin
        const h = Math.min((((max - minDecibels) * scale) - FreqTable[i].min) * FreqTable[i].scale * YDIV, YDIV) | 0
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
    renderMode: LOGARITHMIC,
    RenderModeOptions,
    maxDecibels: -30,
    minDecibels: -100,  //-70,
    fftSize: 2048,  //4096,
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
