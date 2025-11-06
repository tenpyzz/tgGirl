import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTelegramUserId } from '@/lib/telegram-utils'

// Пакеты пополнения
const PACKAGES = {
  1: { messages: 200, stars: 249, name: 'Базовый' },
  2: { messages: 1000, stars: 999, name: 'Стандартный' },
  3: { messages: 3000, stars: 2499, name: 'Премиум' },
} as const

export async function POST(request: Request) {
  try {
    const telegramUserId = getTelegramUserId(request)

    if (!telegramUserId) {
      return NextResponse.json(
        { error: 'Пользователь не авторизован' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { packageId } = body

    if (!packageId || !PACKAGES[packageId as keyof typeof PACKAGES]) {
      return NextResponse.json(
        { error: 'Неверный ID пакета' },
        { status: 400 }
      )
    }

    const pkg = PACKAGES[packageId as keyof typeof PACKAGES]

    // Получаем пользователя
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramUserId) },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Пользователь не найден' },
        { status: 404 }
      )
    }

    // Обновляем баланс
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        messageBalance: {
          increment: pkg.messages,
        },
      } as any,
    })

    // Сохраняем историю платежа
    await prisma.paymentHistory.create({
      data: {
        userId: user.id,
        packageId: packageId,
        packageName: pkg.name,
        messages: pkg.messages,
        stars: pkg.stars,
        invoicePayload: JSON.stringify({ packageId, userId: telegramUserId, messages: pkg.messages }),
      },
    })

    return NextResponse.json({
      success: true,
      balance: (updatedUser as any).messageBalance,
      addedMessages: pkg.messages,
    })
  } catch (error) {
    console.error('Ошибка обработки платежа:', error)
    return NextResponse.json(
      { error: 'Ошибка обработки платежа' },
      { status: 500 }
    )
  }
}

