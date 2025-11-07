import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTelegramUserId } from '@/lib/telegram-utils'

// Проверка прав администратора
function isAdmin(telegramUserId: number | null): boolean {
  if (!telegramUserId) return false
  
  const adminIds = process.env.ADMIN_TELEGRAM_IDS?.split(',').map(id => parseInt(id.trim())) || []
  const adminId = process.env.ADMIN_TELEGRAM_ID ? parseInt(process.env.ADMIN_TELEGRAM_ID) : null
  
  return adminIds.includes(telegramUserId) || adminId === telegramUserId
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const telegramUserId = getTelegramUserId(request)

    if (!isAdmin(telegramUserId)) {
      return NextResponse.json(
        { error: 'Доступ запрещен' },
        { status: 403 }
      )
    }

    const { userId: userIdParam } = await params
    const userId = parseInt(userIdParam)

    if (isNaN(userId)) {
      return NextResponse.json(
        { error: 'Неверный ID пользователя' },
        { status: 400 }
      )
    }

    // Получаем пользователя со всеми данными
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        selectedGirl: {
          select: {
            id: true,
            name: true,
            description: true,
            photoUrl: true,
          },
        },
        chats: {
          include: {
            girl: {
              select: {
                id: true,
                name: true,
              },
            },
            messages: {
              orderBy: {
                createdAt: 'asc',
              },
              take: 100, // Последние 100 сообщений
            },
            _count: {
              select: {
                messages: true,
              },
            },
          },
          orderBy: {
            updatedAt: 'desc',
          },
        },
        payments: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 100, // Последние 100 платежей
        },
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Пользователь не найден' },
        { status: 404 }
      )
    }

    // Форматируем данные для фронтенда
    const formattedUser = {
      id: user.id,
      telegramId: user.telegramId.toString(),
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Без имени',
      messageBalance: (user as any).messageBalance ?? 0,
      selectedGirl: user.selectedGirl,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      chats: user.chats.map(chat => ({
        id: chat.id,
        girl: chat.girl,
        messagesCount: chat._count.messages,
        messages: chat.messages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt.toISOString(),
        })),
        createdAt: chat.createdAt.toISOString(),
        updatedAt: chat.updatedAt.toISOString(),
      })),
      payments: user.payments.map(payment => ({
        id: payment.id,
        packageId: payment.packageId,
        packageName: payment.packageName,
        messages: payment.messages,
        paymentMethod: (payment as any).paymentMethod || 'stars',
        stars: (payment as any).stars,
        usdAmount: (payment as any).usdAmount,
        createdAt: payment.createdAt.toISOString(),
      })),
      stats: {
        totalChats: user.chats.length,
        totalMessages: user.chats.reduce((sum, chat) => sum + chat._count.messages, 0),
        totalPayments: user.payments.length,
        totalStarsSpent: user.payments.reduce((sum, payment) => sum + ((payment as any).stars || 0), 0),
        totalUsdSpent: user.payments.reduce((sum, payment) => sum + ((payment as any).usdAmount || 0), 0),
        totalMessagesBought: user.payments.reduce((sum, payment) => sum + payment.messages, 0),
      },
    }

    return NextResponse.json(formattedUser)
  } catch (error) {
    console.error('Ошибка получения данных пользователя:', error)
    return NextResponse.json(
      { error: 'Ошибка получения данных пользователя' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const telegramUserId = getTelegramUserId(request)

    if (!isAdmin(telegramUserId)) {
      return NextResponse.json(
        { error: 'Доступ запрещен' },
        { status: 403 }
      )
    }

    const { userId: userIdParam } = await params
    const userId = parseInt(userIdParam)

    if (isNaN(userId)) {
      return NextResponse.json(
        { error: 'Неверный ID пользователя' },
        { status: 400 }
      )
    }

    let body: any = null
    try {
      body = await request.json()
    } catch (error) {
      return NextResponse.json(
        { error: 'Некорректные данные запроса' },
        { status: 400 }
      )
    }

    const amount = Number(body?.amount)
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''

    if (!Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'Количество сообщений должно быть положительным целым числом' },
        { status: 400 }
      )
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        messageBalance: {
          increment: amount,
        },
      },
      select: {
        id: true,
        messageBalance: true,
      },
    })

    const packageName = reason
      ? `Ручное начисление (${reason})`
      : 'Ручное начисление'

    try {
      await prisma.paymentHistory.create({
        data: {
          userId: userId,
          packageId: 0,
          packageName,
          messages: amount,
          paymentMethod: 'manual',
          stars: null,
          usdAmount: null,
          invoicePayload: reason ? JSON.stringify({ reason }) : null,
          telegramPaymentId: null,
        },
      })
    } catch (historyError) {
      console.error('Не удалось создать запись истории при ручном начислении:', historyError)
    }

    return NextResponse.json({
      success: true,
      granted: amount,
      balance: updatedUser.messageBalance,
    })
  } catch (error) {
    console.error('Ошибка при ручном начислении сообщений пользователю:', error)
    return NextResponse.json(
      { error: 'Ошибка при начислении сообщений' },
      { status: 500 }
    )
  }
}

