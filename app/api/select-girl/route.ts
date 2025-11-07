import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTelegramUserId } from '@/lib/telegram-utils'
import { sendFirstMessageToUser } from '@/lib/bot-handlers'
import { ensureDefaultGirls } from '@/lib/default-girls'

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

    await ensureDefaultGirls()

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

    const previousSelectedGirlId = user?.selectedGirlId ?? null

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: BigInt(telegramUserId),
          selectedGirlId: girlId,
          messageBalance: 10, // Начальный баланс - 10 бесплатных сообщений
        } as any, // Type assertion для временного обхода ошибки типов
      })
    } else {
      // Обновляем выбранную девочку
      user = await prisma.user.update({
        where: { id: user.id },
        data: { selectedGirlId: girlId },
      })
    }

    // Пытаемся отправить первое сообщение пользователю
    // Это работает, если пользователь уже писал боту (бот знает его chatId)
    try {
      const forceFirstMessage = previousSelectedGirlId !== girlId
      await sendFirstMessageToUser(telegramUserId, {
        force: forceFirstMessage,
      })
    } catch (error) {
      console.error('Ошибка отправки первого сообщения:', error)
      // Не блокируем ответ, если не удалось отправить сообщение
      // Бот отправит его при первом сообщении от пользователя
    }

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

