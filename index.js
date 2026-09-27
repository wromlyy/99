const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const mineflayer = require('mineflayer')
const path = require('path')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

let bot = null
let isRunning = false
let currentConfig = null
let afkInterval = null

function log(msg) {
  const time = new Date().toLocaleTimeString('ru-RU')
  const text = `[${time}] ${msg}`
  console.log(text)
  io.emit('log', text)
}

function startBot(config) {
  if (isRunning) {
    log('Бот уже запущен')
    return
  }

  currentConfig = config
  isRunning = true
  log(`Запуск бота...`)
  log(`Хост: \( {config.host}: \){config.port}`)
  log(`Аккаунт: ${config.email}`)
  log(`Сервер: ${config.serverName}`)

  bot = mineflayer.createBot({
    host: config.host,
    port: parseInt(config.port),
    username: config.email,
    auth: 'microsoft',
    version: false,
    hideErrors: false
  })

  bot.once('login', () => {
    log('Успешный вход в аккаунт Microsoft')
  })

  bot.once('spawn', () => {
    log('Бот появился в мире')

    // Если это лобби Minehut — заходим на свой сервер
    if (config.host.includes('minehut.com') || config.host.includes('minehut.gg')) {
      setTimeout(() => {
        bot.chat(`/join ${config.serverName}`)
        log(`Отправлена команда: /join ${config.serverName}`)
      }, 4000)
    }
  })

  // Анти-AFK
  afkInterval = setInterval(() => {
    if (bot && bot.entity) {
      bot.setControlState('jump', true)
      setTimeout(() => {
        if (bot) bot.setControlState('jump', false)
      }, 400)
    }
  }, 35000)

  bot.on('messagestr', (msg) => {
    // Показываем важные сообщения в логах
    if (msg.toLowerCase().includes('join') || msg.toLowerCase().includes('server')) {
      log(`Сообщение сервера: ${msg}`)
    }
  })

  bot.on('kicked', (reason) => {
    log(`Кикнули: ${reason}`)
  })

  bot.on('error', (err) => {
    log(`Ошибка: ${err.message}`)
  })

  bot.on('end', (reason) => {
    log(`Отключился (${reason || 'неизвестно'})`)
    cleanup()
    
    // Авто-реконнект
    log('Переподключение через 18 секунд...')
    setTimeout(() => {
      if (currentConfig) {
        startBot(currentConfig)
      }
    }, 18000)
  })
}

function cleanup() {
  if (afkInterval) {
    clearInterval(afkInterval)
    afkInterval = null
  }
  bot = null
  isRunning = false
  io.emit('status', false)
}

function stopBot() {
  if (bot) {
    try {
      bot.quit('Остановлен через панель')
    } catch (e) {}
  }
  currentConfig = null
  cleanup()
  log('Бот полностью остановлен')
}

// Socket
io.on('connection', (socket) => {
  socket.emit('status', isRunning)

  socket.on('start', (config) => {
    if (!config.email || !config.serverName) {
      log('Ошибка: не указан email или название сервера')
      return
    }
    startBot({
      email: config.email.trim(),
      serverName: config.serverName.trim(),
      host: (config.host || 'mc.minehut.com').trim(),
      port: config.port || '25565'
    })
    io.emit('status', true)
  })

  socket.on('stop', () => {
    stopBot()
  })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Панель запущена: http://localhost:${PORT}`)
})
