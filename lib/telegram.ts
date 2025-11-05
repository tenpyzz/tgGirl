import TelegramBot from 'node-telegram-bot-api'

// Проверка наличия токена бота
if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN не установлен в переменных окружения')
}

// Создаем экземпляр бота
export const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: process.env.NODE_ENV === 'development',
})

// Инициализация вебхука для production (Railway)
if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
  bot.setWebHook(process.env.WEBHOOK_URL)
    .then(() => {
      console.log('✅ Webhook установлен:', process.env.WEBHOOK_URL)
    })
    .catch((error: unknown) => {
      console.error('❌ Ошибка установки webhook:', error)
    })
}

