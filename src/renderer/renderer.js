// AudioWorklet-based PCM audio recorder
let audioContext = null
let mediaStream = null
let workletNode = null

// 开始录音
async function startRecording() {
  // 请求麦克风权限
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: 16000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    },
  })

  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  audioContext = new AudioContextClass({ sampleRate: 16000 })

  await audioContext.audioWorklet.addModule('src/renderer/pcm-processor.js')

  // 创建音频源和 worklet 节点
  const source = audioContext.createMediaStreamSource(mediaStream)
  workletNode = new AudioWorkletNode(audioContext, 'pcm-processor')

  // 处理 worklet 发送的 PCM 数据
  workletNode.port.onmessage = (event) => {
    const pcmBuffer = event.data
    // 发送音频数据到主进程
    window.api.sendAudioChunk(pcmBuffer)
  }

  source.connect(workletNode)
  console.warn('AudioWorklet recording started (16kHz PCM)')
}

// 停止录音
function stopRecording() {
  if (workletNode) {
    workletNode.disconnect()
    workletNode = null
  }

  if (mediaStream) {
    const tracks = mediaStream.getTracks()
    tracks.forEach(track => track.stop())
    mediaStream = null
  }

  if (audioContext) {
    audioContext.close()
    audioContext = null
  }

  console.warn('Recording stopped')
}

// 监听主进程的消息
window.api.onStart(startRecording)
window.api.onStop(stopRecording)
