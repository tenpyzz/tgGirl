import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTelegramUserId } from '@/lib/telegram-utils'

export async function GET(request: Request) {
  try {
    const telegramUserId = getTelegramUserId(request)

    if (!telegramUserId) {
      return NextResponse.json(
        { error: 'Пользователь не авторизован' },
        { status: 401 }
      )
    }

    // Получаем пользователя
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramUserId) },
      select: {
        id: true,
        messageBalance: true,
      } as any, // Type assertion для временного обхода ошибки типов
    })

    if (!user) {
      // Если пользователь не найден, создаем его с начальным балансом
      const newUser = await prisma.user.create({
        data: {
          telegramId: BigInt(telegramUserId),
          messageBalance: 10,
        } as any, // Type assertion для временного обхода ошибки типов
        select: {
          id: true,
          messageBalance: true,
        } as any, // Type assertion для временного обхода ошибки типов
      })
      return NextResponse.json({
        balance: (newUser as any).messageBalance ?? 10,
      })
    }

    return NextResponse.json({
      balance: (user as any).messageBalance ?? 10,
    })
  } catch (error) {
    console.error('Ошибка получения баланса:', error)
    return NextResponse.json(
      { error: 'Ошибка получения баланса' },
      { status: 500 }
    )
  }
}

