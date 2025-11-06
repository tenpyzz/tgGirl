import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { openrouter } from '@/lib/openrouter'
import type OpenAI from 'openai'

// Получение Telegram user ID из запроса
function getTelegramUserId(request: Request): number | null {
  // В реальном приложении это будет приходить из Telegram WebApp initData
  // Для тестирования можно использовать body или заголовок
  const url = new URL(request.url)
  const userId = url.searchParams.get('userId')
  
  if (userId) {
    return parseInt(userId)
  }
  
  // Проверяем заголовок с initData (для production)
  const initData = request.headers.get('x-telegram-init-data')
  if (initData) {
    // Парсим initData для получения user ID
    // В production нужно использовать библиотеку для валидации и парсинга
    try {
      const params = new URLSearchParams(initData)
      const userParam = params.get('user')
      if (userParam) {
        const user = JSON.parse(decodeURIComponent(userParam))
        if (user.id) {
          console.log('User ID получен из initData:', user.id)
          return user.id
        }
      }
    } catch (e) {
      console.error('Ошибка парсинга initData:', e)
      console.error('initData:', initData)
    }
  } else {
    console.warn('initData не найден в заголовках')
  }
  
  // Для тестирования на localhost используем дефолтный ID
  if (process.env.NODE_ENV === 'development') {
    return 123456789 // Дефолтный ID для локальной разработки
  }
  
  // В production возвращаем null, если не удалось получить ID
  return null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ girlId: string }> }
) {
  try {
    const { girlId } = await params
    const body = await request.json()
    const { message } = body

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { error: 'Сообщение не может быть пустым' },
        { status: 400 }
      )
    }

    const telegramUserId = getTelegramUserId(request)

    if (!telegramUserId) {
      return NextResponse.json(
        { error: 'Пользователь не авторизован' },
        { status: 401 }
      )
    }

    // Получаем или создаем пользователя
    let user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramUserId) },
    })

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: BigInt(telegramUserId),
        },
      })
    }

    // Получаем девушку и её системный промпт
    const girl = await prisma.girl.findUnique({
      where: { id: parseInt(girlId) },
    })

    if (!girl) {
      return NextResponse.json(
        { error: 'Девушка не найдена' },
        { status: 404 }
      )
    }

    // Получаем или создаем чат
    const chat = await prisma.chat.upsert({
      where: {
        userId_girlId: {
          userId: user.id,
          girlId: parseInt(girlId),
        },
      },
      create: {
        userId: user.id,
        girlId: parseInt(girlId),
      },
      update: {},
    })

    // Сохраняем сообщение пользователя
    const userMessage = await prisma.message.create({
      data: {
        chatId: chat.id,
        role: 'user',
        content: message.trim(),
      },
    })

    // Получаем историю сообщений для контекста
    const chatHistory = await prisma.message.findMany({
      where: {
        chatId: chat.id,
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: 20, // Последние 20 сообщений для контекста
    })

    // Формируем сообщения для OpenRouter
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: girl.systemPrompt,
      },
      ...chatHistory.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    ]

    // Генерируем ответ от ИИ через OpenRouter
    let completion
    try {
      completion = await openrouter.chat.completions.create({
        model: 'deepseek/deepseek-chat-v3-0324', // DeepSeek Chat V3 0324 через OpenRouter
        messages: messages,
        temperature: 0.9, // Больше креативности
        max_tokens: 500,
      })
    } catch (apiError) {
      console.error('Ошибка OpenRouter API:', apiError)
      throw new Error(`Ошибка OpenRouter API: ${apiError instanceof Error ? apiError.message : 'Неизвестная ошибка'}`)
    }

    const aiResponse = completion.choices[0]?.message?.content || 'Извините, я не могу ответить сейчас.'

    // Сохраняем ответ ИИ
    const assistantMessage = await prisma.message.create({
      data: {
        chatId: chat.id,
        role: 'assistant',
        content: aiResponse,
      },
    })

    return NextResponse.json({
      message: {
        id: assistantMessage.id,
        role: assistantMessage.role,
        content: assistantMessage.content,
        createdAt: assistantMessage.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Ошибка отправки сообщения:', error)
    
    // Более детальная информация об ошибке
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка'
    const errorDetails = error instanceof Error ? error.stack : String(error)
    
    console.error('Детали ошибки:', errorDetails)
    
    // Логируем дополнительную информацию для отладки
    console.error('Переменные окружения:', {
      hasOpenRouterKey: !!process.env.OPENROUTER_API_KEY,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV,
    })
    
    return NextResponse.json(
      { 
        error: 'Ошибка отправки сообщения',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    )
  }
}

