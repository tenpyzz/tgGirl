import { NextResponse } from 'next/server'
import { bot } from '@/lib/telegram'

// Загружаем обработчики
try {
  require('@/lib/bot-handlers')
} catch (error) {
  console.error('Ошибка загрузки обработчиков:', error)
}

export async function GET() {
  try {
    // Проверяем, что бот работает
    const botInfo = await bot.getMe()
    
    // Проверяем, что обработчики зарегистрированы
    // К сожалению, node-telegram-bot-api не предоставляет способ проверить зарегистрированные обработчики
    
    return NextResponse.json({
      success: true,
      bot: {
        id: botInfo.id,
        username: botInfo.username,
        first_name: botInfo.first_name,
      },
      message: 'Бот работает, обработчики должны быть загружены',
    })
  } catch (error) {
    console.error('Ошибка тестирования бота:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Ошибка тестирования бота',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

