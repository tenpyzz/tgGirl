import OpenAI from 'openai'

// Функция для получения клиента OpenAI (lazy initialization)
let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY
    
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY не установлен в переменных окружения')
    }
    
    openaiClient = new OpenAI({
      apiKey: apiKey,
    })
  }
  
  return openaiClient
}

// Экспортируем клиент OpenAI (проверка происходит при первом использовании)
export const openai = {
  chat: {
    completions: {
      create: async (...args: Parameters<OpenAI['chat']['completions']['create']>) => {
        return getOpenAIClient().chat.completions.create(...args)
      }
    }
  }
} as OpenAI

