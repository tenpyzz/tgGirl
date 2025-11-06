import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { bot } from '@/lib/telegram'

// Получение Telegram user ID из запроса
function getTelegramUserId(request: Request): number | null {
  const url = new URL(request.url)
  const userId = url.searchParams.get('userId')
  
  if (userId) {
    return parseInt(userId)
  }
  
  // Проверяем заголовок с initData (для production)
  const initData = request.headers.get('x-telegram-init-data')
  if (initData) {
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
    }
  }
  
  // Для тестирования на localhost используем дефолтный ID
  if (process.env.NODE_ENV === 'development') {
    return 123456789
  }
  
  return null
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { girlId } = body

    if (!girlId || typeof girlId !== 'number') {
      return NextResponse.json(
        { error: 'ID девочки обязателен' },
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

    // Проверяем, существует ли девочка
    const girl = await prisma.girl.findUnique({
      where: { id: girlId },
    })

    if (!girl) {
      return NextResponse.json(
        { error: 'Девочка не найдена' },
        { status: 404 }
      )
    }

    // Получаем или создаем пользователя
    let user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramUserId) },
    })

    const wasFirstSelection = !user?.selectedGirlId

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: BigInt(telegramUserId),
          selectedGirlId: girlId,
        },
      })
    } else {
      // Обновляем выбранную девочку
      user = await prisma.user.update({
        where: { id: user.id },
        data: { selectedGirlId: girlId },
      })
    }

    // Пытаемся отправить приветственное сообщение от лица девочки
    // Используем chatId из initData, если доступен
    try {
      const initData = request.headers.get('x-telegram-init-data')
      let chatId: number | null = null

      if (initData) {
        try {
          const params = new URLSearchParams(initData)
          const chatParam = params.get('chat_instance')
          // Пытаемся получить chatId из initData
          // Если chat_instance недоступен, попробуем другой способ
          const startParam = params.get('start_param')
          if (startParam) {
            // Можно использовать start_param для передачи chatId
          }
        } catch (e) {
          console.error('Ошибка парсинга initData для chatId:', e)
        }
      }

      // Если chatId не найден, отправляем сообщение через бота
      // Бот отправит приветствие при следующем сообщении пользователя
      // Но попробуем отправить сразу, если возможно
      if (chatId) {
        await bot.sendMessage(
          chatId,
          `Привет! Я ${girl.name} 👋\n\nДавай общаться! Напиши мне что-нибудь.`
        )
      }
    } catch (error) {
      console.error('Ошибка отправки приветственного сообщения:', error)
      // Не критично, бот отправит при следующем сообщении
    }

    return NextResponse.json({
      success: true,
      message: 'Девочка выбрана',
      girl: {
        id: girl.id,
        name: girl.name,
      },
      wasFirstSelection,
    })
  } catch (error) {
    console.error('Ошибка выбора девочки:', error)
    return NextResponse.json(
      { error: 'Ошибка выбора девочки' },
      { status: 500 }
    )
  }
}

