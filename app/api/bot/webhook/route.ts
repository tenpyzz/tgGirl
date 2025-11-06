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
    
    console.log('📨 Получено обновление от Telegram через /bot/webhook:', {
      update_id: body.update_id,
      message: body.message ? 'есть' : 'нет',
      callback_query: body.callback_query ? 'есть' : 'нет',
      text: body.message?.text,
      chat_id: body.message?.chat?.id
    })
    
    // Обработка обновлений от Telegram
    console.log('🔄 Обрабатываем обновление...')
    await bot.processUpdate(body)
    console.log('✅ Обновление обработано')
    
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('❌ Ошибка webhook:', error)
    console.error('❌ Детали ошибки:', error instanceof Error ? error.stack : String(error))
    return NextResponse.json(
      { error: 'Ошибка обработки webhook', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

