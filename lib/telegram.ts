import TelegramBot from 'node-telegram-bot-api'

// Lazy initialization для бота (чтобы не падать при сборке)
let botInstance: TelegramBot | null = null
let handlersImported = false

function getBot(): TelegramBot {
  if (!botInstance) {
    const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN
    
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN или BOT_TOKEN не установлен в переменных окружения')
    }
    
    // В production используем webhook, в development - polling
    const usePolling = process.env.NODE_ENV === 'development' && !process.env.WEBHOOK_URL
    
    botInstance = new TelegramBot(token, {
      polling: usePolling,
    })
    
    // Если используем webhook, отключаем polling
    if (!usePolling && process.env.NODE_ENV === 'production') {
      botInstance.stopPolling().catch(() => {
        // Игнорируем ошибки, если polling не запущен
      })
    }
    
    // Загружаем обработчики при инициализации бота
    if (!handlersImported) {
      try {
        // Динамический импорт обработчиков
        require('./bot-handlers')
        handlersImported = true
        console.log('Обработчики бота загружены')
      } catch (error) {
        console.error('Ошибка импорта обработчиков бота:', error)
      }
    }
    
    // Инициализация вебхука для production (Railway)
    if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
      // Убеждаемся, что URL правильный
      let webhookUrl = process.env.WEBHOOK_URL
      
      // Если URL не содержит /api/webhook, добавляем его
      if (!webhookUrl.includes('/api/webhook')) {
        if (webhookUrl.endsWith('/webhook')) {
          // Если просто /webhook, заменяем на /api/webhook
          webhookUrl = webhookUrl.replace('/webhook', '/api/webhook')
        } else {
          // Добавляем /api/webhook если его нет
          webhookUrl = webhookUrl.replace(/\/$/, '') + '/api/webhook'
        }
      }
      
      botInstance.setWebHook(webhookUrl)
        .then(() => {
          console.log('Webhook установлен:', webhookUrl)
        })
        .catch((error: unknown) => {
          console.error('Ошибка установки webhook:', error)
        })
    }
  }
  
  return botInstance
}

// Экспортируем бота с lazy initialization
export const bot = new Proxy({} as TelegramBot, {
  get(_target, prop) {
    return getBot()[prop as keyof TelegramBot]
  }
})

