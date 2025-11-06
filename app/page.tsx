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

type Tab = 'main' | 'topup'

export default function Home() {
  const [girl, setGirl] = useState<Girl | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSelecting, setIsSelecting] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('main')
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)

  useEffect(() => {
    // Инициализация Telegram WebApp
    initTelegramWebApp()

    // Загрузка списка девушек
    fetchGirls()
    
    // Загрузка баланса
    fetchBalance()
  }, [])

  const fetchBalance = async () => {
    try {
      const initData = typeof window !== 'undefined' && window.Telegram?.WebApp?.initData
      const response = await fetch('/api/balance', {
        headers: {
          ...(initData ? { 'x-telegram-init-data': initData } : {}),
        },
      })
      if (response.ok) {
        const data = await response.json()
        setBalance(data.balance)
      }
    } catch (error) {
      console.error('Ошибка загрузки баланса:', error)
    }
  }

  const handleTopup = async (packageId: number) => {
    if (isProcessingPayment) return

    setIsProcessingPayment(true)

    try {
      const initData = typeof window !== 'undefined' && window.Telegram?.WebApp?.initData
      
      // Создаем инвойс через API
      const response = await fetch('/api/create-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(initData ? { 'x-telegram-init-data': initData } : {}),
        },
        body: JSON.stringify({ packageId }),
      })

      if (!response.ok) {
        throw new Error('Ошибка создания инвойса')
      }

      const data = await response.json()
      
      // Открываем инвойс через Telegram WebApp
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        window.Telegram.WebApp.openInvoice(data.invoiceUrl, (status: string) => {
          setIsProcessingPayment(false)
          
          if (status === 'paid') {
            // Обновляем баланс после успешной оплаты
            fetchBalance()
            
            // Показываем уведомление
            if (window.Telegram?.WebApp) {
              window.Telegram.WebApp.showAlert('Баланс успешно пополнен! 🎉')
            }
            
            // Возвращаемся на главную вкладку
            setActiveTab('main')
          } else if (status === 'failed') {
            if (window.Telegram?.WebApp) {
              window.Telegram.WebApp.showAlert('Ошибка при оплате. Попробуйте еще раз.')
            }
          } else if (status === 'pending') {
            // Ожидаем подтверждения
          } else if (status === 'cancelled') {
            // Пользователь отменил оплату
          }
        })
      }
    } catch (error) {
      console.error('Ошибка при пополнении баланса:', error)
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert('Ошибка при создании инвойса. Попробуйте еще раз.')
      }
      setIsProcessingPayment(false)
    }
  }

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
    // Предотвращаем повторные нажатия
    if (isSelecting) {
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert('Вы выбрали девочку, подождите')
      }
      return
    }

    setIsSelecting(true)

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
        
        // Открываем чат с ботом (без параметра start)
        webApp.openTelegramLink(`https://t.me/${botUsername}`)
        
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
      // Снимаем блокировку при ошибке
      setIsSelecting(false)
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

  const packages = [
    { 
      id: 1, 
      messages: 200, 
      stars: 249, 
      oldStars: 349, 
      discount: 29, 
      savings: 100, 
      name: 'Базовый' 
    },
    { 
      id: 2, 
      messages: 1000, 
      stars: 999, 
      oldStars: 1299, 
      discount: 23, 
      savings: 300, 
      name: 'Стандартный' 
    },
    { 
      id: 3, 
      messages: 3000, 
      stars: 2499, 
      oldStars: 2999, 
      discount: 17, 
      savings: 500, 
      name: 'Премиум' 
    },
  ]

  return (
    <div className={styles.container}>
      {/* Навигация */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'main' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('main')}
        >
          Главная
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'topup' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('topup')}
        >
          Пополнение
        </button>
      </div>

      {/* Главная вкладка */}
      {activeTab === 'main' && (
        <>
          <h1 className={styles.title}>Выберите девушку</h1>
          
          {balance !== null && (
            <div className={styles.balanceCard}>
              <div className={styles.balanceInfo}>
                <span className={styles.balanceLabel}>💬 Доступно сообщений:</span>
                <div className={styles.balanceValueContainer}>
                  <span className={styles.balanceValue}>{balance}</span>
                  <button
                    className={styles.balanceAddButton}
                    onClick={() => setActiveTab('topup')}
                    title="Пополнить баланс"
                  >
                    ➕
                  </button>
                </div>
              </div>
            </div>
          )}
          
          <div 
            className={`${styles.girlCard} ${isSelecting ? styles.disabled : ''}`}
            onClick={() => !isSelecting && handleGirlClick(girl.id)}
            style={isSelecting ? { opacity: 0.6, pointerEvents: 'none' } : {}}
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
        </>
      )}

      {/* Вкладка пополнения */}
      {activeTab === 'topup' && (
        <>
          <h1 className={styles.title}>Пополнение баланса</h1>
          
          {balance !== null && (
            <div className={styles.balanceCard}>
              <div className={styles.balanceInfo}>
                <span className={styles.balanceLabel}>💬 Текущий баланс:</span>
                <span className={styles.balanceValue}>{balance}</span>
              </div>
            </div>
          )}

          <div className={styles.packagesContainer}>
            {packages.map((pkg) => (
              <div key={pkg.id} className={styles.packageCard}>
                <div className={styles.packageHeader}>
                  <div className={styles.packageTitleContainer}>
                    <h3 className={styles.packageName}>{pkg.name}</h3>
                    <div className={styles.discountBadge}>
                      -{pkg.discount}%
                    </div>
                  </div>
                  <div className={styles.packageMessages}>{pkg.messages} сообщений</div>
                </div>
                <div className={styles.packagePriceContainer}>
                  <div className={styles.packagePrice}>
                    <div className={styles.priceRow}>
                      <span className={styles.oldPrice}>{pkg.oldStars}</span>
                      <span className={styles.packageStars}>{pkg.stars}</span>
                      <span className={styles.packageStarsLabel}>⭐ Telegram Stars</span>
                    </div>
                    <div className={styles.savingsBadge}>
                      💰 Вы экономите {pkg.savings} звезд!
                    </div>
                  </div>
                </div>
                <button
                  className={`${styles.packageButton} ${isProcessingPayment ? styles.packageButtonDisabled : ''}`}
                  onClick={() => handleTopup(pkg.id)}
                  disabled={isProcessingPayment}
                >
                  {isProcessingPayment ? 'Обработка...' : 'Купить со скидкой'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

