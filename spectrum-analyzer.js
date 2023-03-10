'use strick'

class SpectrumAnalyzer {
  audioCtx = null      // AudioContext
  analyserNode = null  // AnalyserNode
  dataArray = null     // Buffer for FFT
  canvas = null        // Canvas

  constructor(audioCtx, canvas) {
    this.audioCtx = audioCtx
    this.canvas = canvas

    this.analyserNode = this.audioCtx.createAnalyser()

    this.setUpWork()
  }

  setUpWork() {
    const bufferLength = this.analyserNode.frequencyBinCount
    this.dataArray = new Uint8Array(bufferLength)

    const n = this.canvas.width
    this.peakAmplitude = [...Array(n)].map(_ => 0)
    this.peakFallVel = [...Array(n)].map(_ => 0)
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

  update() {
    const dataArray = this.dataArray
    this.analyserNode.getByteFrequencyData(dataArray)

    const canvasCtx = this.canvas.getContext('2d')
    canvasCtx.fillStyle = 'rgb(0,0,0)'
    canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    if (this.analyserNode.minDecibels >= this.analyserNode.maxDecibels)
      return

    const WIDTH = this.canvas.width
    const HEIGHT = this.canvas.height

    const scale = HEIGHT / 255
    const sampleRate = this.audioCtx.sampleRate
    const minHz = 20
    const maxHz = Math.min(20000, sampleRate * 0.5)
    const minHzVal = Math.log10(minHz)
    const maxHzVal = Math.log10(maxHz)
    const gravity = HEIGHT / (64 * 64)

    const bufferLength = dataArray.length
    const range = (maxHzVal - minHzVal) / WIDTH
    const binScale = bufferLength / (sampleRate * 0.5)

    const calcBin = (i) => {
      const e = i * range + minHzVal
      const freq = 10 ** e
      return (freq * binScale) | 0
    }

    let prevBin = calcBin(0)
    for (let i = 0; i < WIDTH; ++i) {
      const nextBin = calcBin(i + 1)
      let v = 0
      for (let bin = prevBin; bin <= nextBin; ++bin)
        v = Math.max(v, dataArray[bin])
      prevBin = nextBin

      const h = (v * scale) | 0
      const x = i
      canvasCtx.fillStyle = `rgb(${v>>2},${v},${160-(v>>1)})`
      canvasCtx.fillRect(x, HEIGHT - h, 1, h)

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

    const table = [
      {freq: 100, text: '100Hz'},
      {freq: 1000, text: '1kHz'},
      {freq: 10000, text: '10kHz'},
    ]
    canvasCtx.strokeStyle = 'rgb(255,255,255)'
    canvasCtx.setLineDash([2, 2])
    canvasCtx.font = '12px serif'
    for (let i = 0; i < table.length; ++i) {
      const {freq, text} = table[i]
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
}

const initialData = (() => {
  const FftSizeOptions = [512, 1024, 2048, 4096, 8192]

  let audioCtx = null
  let spectrumAnalyzer = null
  let audioSource = null
  let rafId = null    // requestAnimationFrame
  let loopFn = null
  let audioElement = null

  function stopAudio() {
    audioElement.pause()
    audioElement.removeAttribute('src')
  }

  return {
    maxDecibels: -30,
    minDecibels: -70,
    fftSize: 4096,
    FftSizeOptions,
    smoothing: 0.0,
    playing: false,

    init() {
      const canvas = document.getElementById('mycanvas')
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
      const canvasCtx = canvas.getContext('2d')
      canvasCtx.fillStyle = 'rgb(0,0,0)'
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height)

      audioElement = document.getElementById('audio-player')

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
    onFileChange(files) {
      if (files == null || files.length === 0)
        return
      stopAudio()

      if (audioCtx == null) {
        audioCtx = new AudioContext()

        const canvas = document.getElementById('mycanvas')
        spectrumAnalyzer = new SpectrumAnalyzer(audioCtx, canvas)
        spectrumAnalyzer.setDecibels(this.maxDecibels, this.minDecibels)
        spectrumAnalyzer.setFftSize(this.fftSize)
        spectrumAnalyzer.analyserNode.smoothingTimeConstant = this.smoothing

        audioSource = audioCtx.createMediaElementSource(audioElement)
        spectrumAnalyzer.connectFrom(audioSource)
        audioSource.connect(audioCtx.destination)
      }

      const fileBlob = files[0]
      audioElement.src = URL.createObjectURL(fileBlob)
      audioElement.play()

      this.playing = true
      this.startAnimation()
    },

    startAnimation() {
      if (rafId != null)
        return
      loopFn = (_timestamp) => {
        spectrumAnalyzer.update()
        rafId = requestAnimationFrame(loopFn)
      }
      rafId = requestAnimationFrame(loopFn)
    },
    stopAnimation() {
      if (rafId != null) {
        cancelAnimationFrame(rafId)
        rafId = null
        loopFn = null
      }
    },
  }
})()
