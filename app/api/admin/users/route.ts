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

export async function GET(request: Request) {
  try {
    const telegramUserId = getTelegramUserId(request)

    if (!isAdmin(telegramUserId)) {
      return NextResponse.json(
        { error: 'Доступ запрещен' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const skip = (page - 1) * limit

    // Получаем пользователей с их данными
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          selectedGirl: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              chats: true,
              payments: true,
            },
          },
        },
      }),
      prisma.user.count(),
    ])

    // Форматируем данные для фронтенда
    const formattedUsers = users.map(user => ({
      id: user.id,
      telegramId: user.telegramId.toString(),
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Без имени',
      messageBalance: (user as any).messageBalance ?? 0,
      selectedGirl: user.selectedGirl ? {
        id: user.selectedGirl.id,
        name: user.selectedGirl.name,
      } : null,
      chatsCount: user._count.chats,
      paymentsCount: user._count.payments,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    }))

    return NextResponse.json({
      users: formattedUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Ошибка получения списка пользователей:', error)
    return NextResponse.json(
      { error: 'Ошибка получения списка пользователей' },
      { status: 500 }
    )
  }
}

