import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Получение Telegram user ID из заголовков (будет передаваться из Mini App)
function getTelegramUserId(request: Request): number | null {
  // В реальном приложении это будет приходить из Telegram WebApp initData
  // Для тестирования можно использовать query параметр или заголовок
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
          return user.id
        }
      }
    } catch (e) {
      console.error('Ошибка парсинга initData:', e)
    }
  }
  
  // Для тестирования на localhost используем дефолтный ID
  // В production это должно приходить из Telegram WebApp
  return 123456789 // Замените на реальный ID для тестирования
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ girlId: string }> }
) {
  try {
    const { girlId } = await params
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
      // Создаем пользователя если его нет
      user = await prisma.user.create({
        data: {
          telegramId: BigInt(telegramUserId),
        },
      })
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

    // Получаем сообщения
    const messages = await prisma.message.findMany({
      where: {
        chatId: chat.id,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    return NextResponse.json(messages)
  } catch (error) {
    console.error('Ошибка получения сообщений:', error)
    return NextResponse.json(
      { error: 'Ошибка получения сообщений' },
      { status: 500 }
    )
  }
}

