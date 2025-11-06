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
    
    botInstance = new TelegramBot(token, {
      polling: process.env.NODE_ENV === 'development',
    })
    
    // Загружаем обработчики при инициализации бота
    if (!handlersImported) {
      try {
        // Динамический импорт обработчиков
        require('./bot-handlers')
        handlersImported = true
        console.log('✅ Обработчики бота загружены')
      } catch (error) {
        console.error('❌ Ошибка импорта обработчиков бота:', error)
      }
    }
    
    // Инициализация вебхука для production (Railway)
    if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
      botInstance.setWebHook(process.env.WEBHOOK_URL)
        .then(() => {
          console.log('✅ Webhook установлен:', process.env.WEBHOOK_URL)
        })
        .catch((error: unknown) => {
          console.error('❌ Ошибка установки webhook:', error)
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

