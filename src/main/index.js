require('dotenv').config()
const { Buffer } = require('node:buffer')
const process = require('node:process')
const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron')
const { clipboard } = require('electron')
const { v4: uuidv4 } = require('uuid')
const WebSocket = require('ws')

const API_KEY = process.env.API_KEY || ''
const WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference/'
const HEARTBEAT_INTERVAL = 30000

if (!API_KEY)
  console.error('API_KEY not found in environment variables. Please create .env file with API_KEY=your_key')

// 全局变量
let mainWindow = null
let ws = null
let isRecording = false
let heartbeatTimer = null
let currentTaskId = null

// 初始化 WebSocket 连接
function initWebSocket() {
  console.warn('Connecting with API_KEY:', API_KEY ? `${API_KEY.slice(0, 10)}...` : 'MISSING')
  ws = new WebSocket(WS_URL, {
    headers: { Authorization: `bearer ${API_KEY}` },
  })

  ws.on('open', () => {
    console.warn('WebSocket connected')

    // 启动心跳
    heartbeatTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(new Uint8Array(0))
        console.warn('Heartbeat sent')
      }
    }, HEARTBEAT_INTERVAL)
  })

  ws.on('message', (data) => {
    let msg = {}
    try {
      msg = JSON.parse(data)
    }
    catch (error) {
      console.error('JSON parse error:', error)
      return
    }

    switch (msg.header.event) {
      case 'task-started':
        console.warn('Task started, ready to receive audio stream')
        break

      case 'result-generated':
        if (msg.payload.output?.transcription) {
          console.warn('Recognition result:', msg.payload.output.transcription.text)
          if (msg.payload.output.transcription.sentence_end) {
            clipboard.writeText(msg.payload.output.transcription.text)
          }
        }
        break

      case 'task-finished':
        console.warn('Task finished')
        break

      case 'task-failed':
        console.error('Task failed:', msg.header.error_message)
        break

      case 'error':
        console.error('Error event:', msg.header.error_message || msg)
        break

      default:
        console.warn('Unknown event:', msg.header.event, msg)
    }
  })

  ws.on('close', () => {
    console.warn('WebSocket closed')
    if (heartbeatTimer)
      clearInterval(heartbeatTimer)
    // 尝试重连
    setTimeout(initWebSocket, 3000)
  })

  ws.on('error', (error) => {
    console.error('WebSocket error:', error)
  })
}

// 发送任务启动消息
function sendRunTask() {
  currentTaskId = uuidv4().replace(/-/g, '').slice(0, 32)
  const taskId = currentTaskId

  ws.send(JSON.stringify({
    header: {
      action: 'run-task',
      task_id: taskId,
      streaming: 'duplex',
    },
    payload: {
      task_group: 'audio',
      task: 'asr',
      function: 'recognition',
      model: 'gummy-realtime-v1',
      parameters: {
        sample_rate: 16000,
        format: 'pcm',
        transcription_enabled: true,
      },
      input: {},
    },
  }))
}

// 发送任务结束消息
function sendFinishTask() {
  if (!currentTaskId) {
    console.warn('No current task to finish')
    return
  }

  ws.send(JSON.stringify({
    header: {
      action: 'finish-task',
      task_id: currentTaskId,
      streaming: 'duplex',
    },
    payload: { input: {} },
  }))

  console.warn('Task finished:', currentTaskId)
  currentTaskId = null
}

function sendAudioChunk(chunk) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(chunk)
  }
  else {
    console.error('WebSocket not ready, dropping chunk')
  }
}

// 创建主窗口
function createMainWindow() {
  mainWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: require.resolve('../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  mainWindow.loadFile('index.html')
}

// 应用准备就绪
app.whenReady().then(() => {
  initWebSocket()
  createMainWindow()

  // 注册全局快捷键
  globalShortcut.register('Alt+`', () => {
    isRecording = !isRecording

    if (isRecording) {
      // 开始录音：启动 ASR 任务
      console.warn('Start recording and ASR task...')
      sendRunTask()
      mainWindow.webContents.send('record-start')
    }
    else {
      // 停止录音：结束 ASR 任务
      console.warn('Stop recording and finish ASR task...')
      sendFinishTask()
      mainWindow.webContents.send('record-stop')
    }
  })

  // 监听来自渲染进程的音频数据
  ipcMain.on('audio-chunk', (event, chunk) => {
    sendAudioChunk(Buffer.from(chunk))
  })
})

// 退出时清理资源
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  if (ws)
    ws.close()
  if (heartbeatTimer)
    clearInterval(heartbeatTimer)
})
