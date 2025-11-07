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
        photoBalance: true,
        selectedGirl: {
          select: {
            id: true,
            name: true,
          },
        },
      } as any, // Type assertion для временного обхода ошибки типов
    })

    if (!user) {
      // Если пользователь не найден, создаем его с начальным балансом
      const newUser = await prisma.user.create({
        data: {
          telegramId: BigInt(telegramUserId),
          messageBalance: 10,
          photoBalance: 1,
        } as any, // Type assertion для временного обхода ошибки типов
        select: {
          id: true,
          messageBalance: true,
          photoBalance: true,
          selectedGirl: {
            select: {
              id: true,
              name: true,
            },
          },
        } as any, // Type assertion для временного обхода ошибки типов
      })
      return NextResponse.json({
        balance: (newUser as any).messageBalance ?? 10,
        photoBalance: (newUser as any).photoBalance ?? 1,
        selectedGirl: (newUser as any).selectedGirl
          ? {
              id: (newUser as any).selectedGirl.id,
              name: (newUser as any).selectedGirl.name,
            }
          : null,
      })
    }

    return NextResponse.json({
      balance: (user as any).messageBalance ?? 10,
      photoBalance: (user as any).photoBalance ?? 1,
      selectedGirl: (user as any).selectedGirl
        ? {
            id: (user as any).selectedGirl.id,
            name: (user as any).selectedGirl.name,
          }
        : null,
    })
  } catch (error) {
    console.error('Ошибка получения баланса:', error)
    return NextResponse.json(
      { error: 'Ошибка получения баланса' },
      { status: 500 }
    )
  }
}

