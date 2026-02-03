const { contextBridge, ipcRenderer } = require('electron')

// 安全地暴露 API 到渲染进程
contextBridge.exposeInMainWorld('api', {
  // 监听录音开始
  onStart: callback => ipcRenderer.on('record-start', callback),

  // 监听录音停止
  onStop: callback => ipcRenderer.on('record-stop', callback),

  // 发送音频数据到主进程
  sendAudioChunk: data => ipcRenderer.send('audio-chunk', data),
})
