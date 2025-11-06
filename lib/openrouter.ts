import OpenAI from 'openai'

// Функция для получения клиента OpenRouter (lazy initialization)
let openrouterClient: OpenAI | null = null

function getOpenRouterClient(): OpenAI {
  if (!openrouterClient) {
    const apiKey = process.env.OPENROUTER_API_KEY
    
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY не установлен в переменных окружения')
    }
    
    openrouterClient = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || process.env.WEBAPP_URL || 'http://localhost:3000',
        'X-Title': 'Telegram Mini App - AI Chat',
      },
    })
  }
  
  return openrouterClient
}

// Экспортируем клиент OpenRouter (проверка происходит при первом использовании)
export const openrouter = {
  chat: {
    completions: {
      create: async (...args: Parameters<OpenAI['chat']['completions']['create']>) => {
        return getOpenRouterClient().chat.completions.create(...args)
      }
    }
  }
} as OpenAI

