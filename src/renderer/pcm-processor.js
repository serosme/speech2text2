/* eslint-disable no-undef */
// PCM Audio Processor - AudioWorklet
// Converts Float32 audio data to Int16 PCM format

class PCMProcessor extends AudioWorkletProcessor {
  process(inputs, _outputs, _parameters) {
    const input = inputs[0]

    if (input.length > 0) {
      const inputData = input[0]

      // Convert Float32 to Int16 PCM
      const pcmData = new Int16Array(inputData.length)
      for (let i = 0; i < inputData.length; i++) {
        const sample = Math.max(-1, Math.min(1, inputData[i]))
        pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
      }

      // Send PCM data to main thread
      this.port.postMessage(pcmData.buffer, [pcmData.buffer])
    }

    return true
  }
}

registerProcessor('pcm-processor', PCMProcessor)
