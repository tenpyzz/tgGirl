import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTelegramUserId } from '@/lib/telegram-utils'

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

    // Бот отправит приветствие автоматически при получении данных от WebApp
    return NextResponse.json({
      success: true,
      message: 'Девочка выбрана',
      girl: {
        id: girl.id,
        name: girl.name,
      },
    })
  } catch (error) {
    console.error('Ошибка выбора девочки:', error)
    return NextResponse.json(
      { error: 'Ошибка выбора девочки' },
      { status: 500 }
    )
  }
}

