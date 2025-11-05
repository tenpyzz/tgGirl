import TelegramBot from 'node-telegram-bot-api'

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN не установлен в переменных окружения')
}

export const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: process.env.NODE_ENV === 'development',
})

// Инициализация вебхука для production (Railway)
if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
  bot.setWebHook(process.env.WEBHOOK_URL)
}

