'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { initTelegramWebApp } from '@/lib/telegram-webapp'
import styles from './page.module.css'

interface Girl {
  id: number
  name: string
  description: string | null
  photoUrl: string | null
}

export default function Home() {
  const router = useRouter()
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

  const handleGirlClick = (girlId: number) => {
    router.push(`/chat/${girlId}`)
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

