import { NextResponse } from 'next/server'
import { bot } from '@/lib/telegram'

// Импортируем обработчики только при первом запросе (lazy import)
let handlersImported = false

function ensureHandlers() {
  if (!handlersImported) {
    try {
      // Динамический импорт обработчиков только во время выполнения
      require('@/lib/bot-handlers')
      handlersImported = true
      console.log('✅ Обработчики бота загружены через /bot/webhook')
    } catch (error) {
      console.error('❌ Ошибка импорта обработчиков бота:', error)
    }
  }
}

// Webhook для Telegram бота (используется в production на Railway)
export async function POST(request: Request) {
  try {
    // Убеждаемся, что обработчики импортированы
    ensureHandlers()
    
    const body = await request.json()
    
    console.log('📨 Получено обновление от Telegram через /bot/webhook:', body.update_id)
    
    // Обработка обновлений от Telegram
    await bot.processUpdate(body)
    
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('❌ Ошибка webhook:', error)
    return NextResponse.json(
      { error: 'Ошибка обработки webhook', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

