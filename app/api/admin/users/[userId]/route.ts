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
  { params }: { params: { userId: string } }
) {
  try {
    const telegramUserId = getTelegramUserId(request)

    if (!isAdmin(telegramUserId)) {
      return NextResponse.json(
        { error: 'Доступ запрещен' },
        { status: 403 }
      )
    }

    const userId = parseInt(params.userId)

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
        stars: payment.stars,
        createdAt: payment.createdAt.toISOString(),
      })),
      stats: {
        totalChats: user.chats.length,
        totalMessages: user.chats.reduce((sum, chat) => sum + chat._count.messages, 0),
        totalPayments: user.payments.length,
        totalStarsSpent: user.payments.reduce((sum, payment) => sum + payment.stars, 0),
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

