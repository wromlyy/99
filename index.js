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

function log(msg) {
  const time = new Date().toLocaleTimeString()
  const text = `[${time}] ${msg}`
  console.log(text)
  io.emit('log', text)
}

function startBot(config) {
  if (isRunning) return log('Бот уже запущен')

  isRunning = true
  log('Запуск бота...')

  bot = mineflayer.createBot({
    host: config.host || 'mc.minehut.com',
    port: parseInt(config.port) || 25565,
    username: config.email,
    auth: 'microsoft',
    version: false
  })

  bot.once('spawn', () => {
    log('Бот зашёл на сервер')
    setTimeout(() => {
      bot.chat(`/join ${config.serverName}`)
      log(`Отправлена команда /join ${config.serverName}`)
    }, 5000)
  })

  // Анти-AFK
  const afk = setInterval(() => {
    if (bot?.entity) {
      bot.setControlState('jump', true)
      setTimeout(() => bot.setControlState('jump', false), 300)
    }
  }, 40000)

  bot.on('kicked', (reason) => {
    log('Кикнули: ' + reason.toString())
  })

  bot.on('error', (err) => {
    log('Ошибка: ' + err.message)
  })

  bot.on('end', () => {
    clearInterval(afk)
    isRunning = false
    log('Отключился. Переподключение через 15 сек...')
    setTimeout(() => {
      if (!isRunning) startBot(config) // авто-реконнект
    }, 15000)
  })
}

function stopBot() {
  if (bot) {
    bot.quit()
    bot = null
  }
  isRunning = false
  log('Бот остановлен')
}

// Socket.io
io.on('connection', (socket) => {
  socket.emit('status', isRunning)

  socket.on('start', (config) => {
    startBot(config)
  })

  socket.on('stop', () => {
    stopBot()
  })
})

// Статус
app.get('/status', (req, res) => {
  res.json({ running: isRunning })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Панель запущена на порту ${PORT}`)
})
