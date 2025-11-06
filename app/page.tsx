'use client'

import { useEffect, useState } from 'react'
import { initTelegramWebApp } from '@/lib/telegram-webapp'
import styles from './page.module.css'

interface Girl {
  id: number
  name: string
  description: string | null
  photoUrl: string | null
}

export default function Home() {
  const [girl, setGirl] = useState<Girl | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Инициализация Telegram WebApp
    initTelegramWebApp()

    // Загрузка списка девушек
    fetchGirls()
  }, [])

  const fetchGirls = async () => {
    try {
      const response = await fetch('/api/girls')
      if (response.ok) {
        const data = await response.json()
        if (data.length > 0) {
          setGirl(data[0]) // Берем первую девушку
        }
      }
    } catch (error) {
      console.error('Ошибка загрузки девушек:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleGirlClick = async (girlId: number) => {
    try {
      // Получаем initData для отправки на сервер
      const initData = typeof window !== 'undefined' && window.Telegram?.WebApp?.initData
      
      // Вызываем API для сохранения выбора девочки
      const response = await fetch('/api/select-girl', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(initData ? { 'x-telegram-init-data': initData } : {}),
        },
        body: JSON.stringify({ girlId }),
      })

      if (!response.ok) {
        throw new Error('Ошибка сохранения выбора')
      }

      // Получаем имя бота из API
      const botInfoResponse = await fetch('/api/bot-info')
      let botUsername = 'your_bot_username'
      
      if (botInfoResponse.ok) {
        const botInfo = await botInfoResponse.json()
        botUsername = botInfo.username || botUsername
      }
      
      // Закрываем мини-приложение и перекидываем в чат с ботом
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        const webApp = window.Telegram.WebApp
        
        // Отправляем данные боту о выборе девочки
        // Бот получит эти данные и отправит приветствие
        try {
          webApp.sendData(JSON.stringify({ 
            action: 'girl_selected', 
            girlId: girlId 
          }))
        } catch (e) {
          console.error('Ошибка отправки данных боту:', e)
        }
        
        // Открываем чат с ботом
        // Бот попытается отправить первое сообщение через API endpoint
        webApp.openTelegramLink(`https://t.me/${botUsername}?start=girl_selected`)
        
        // Закрываем мини-приложение с небольшой задержкой
        // чтобы дать время боту отправить сообщение
        setTimeout(() => {
          webApp.close()
        }, 1000)
      }
    } catch (error) {
      console.error('Ошибка при выборе девочки:', error)
      // Показываем ошибку пользователю
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert('Ошибка при выборе девочки. Попробуйте еще раз.')
      }
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Загрузка...</div>
      </div>
    )
  }

  if (!girl) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>Девушки не найдены</div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Выберите девушку</h1>
      
      <div 
        className={styles.girlCard}
        onClick={() => handleGirlClick(girl.id)}
      >
        <div className={styles.girlPhoto}>
          {girl.photoUrl ? (
            <img src={girl.photoUrl} alt={girl.name} />
          ) : (
            <div className={styles.placeholderPhoto}>
              <span>Фото</span>
            </div>
          )}
        </div>
        <div className={styles.girlInfo}>
          <h2 className={styles.girlName}>{girl.name}</h2>
          {girl.description && (
            <p className={styles.girlDescription}>{girl.description}</p>
          )}
        </div>
      </div>
    </div>
  )
}

