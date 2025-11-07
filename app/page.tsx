'use client'

import Image from 'next/image'
import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { initTelegramWebApp } from '@/lib/telegram-webapp'
import { PACKAGES, getPackageUsdPrice, getPackageOldUsdPrice, type PackageId } from '@/lib/packages'
import { GIRL_PROFILES, type GirlProfile } from '@/lib/girl-profiles'
import styles from './page.module.css'

interface Girl {
  id: number
  name: string
  description: string | null
  photoUrl: string | null
}

interface SelectedGirlSummary {
  id: number
  name: string
}

type Tab = 'main' | 'topup' | 'admin'

const DESCRIPTION_STOP_WORDS = new Set([
  'и',
  'а',
  'но',
  'как',
  'который',
  'которая',
  'которые',
  'которое',
  'что',
  'чтобы',
  'с',
  'со',
  'в',
  'во',
  'на',
  'к',
  'ко',
  'по',
  'из',
  'за',
  'от',
  'до',
  'для',
  'при',
  'об',
  'обо',
  'у',
  'же',
  'бы',
  'ли',
  'не',
  'его',
  'ее',
  'их',
  'ты',
  'она',
  'он',
  'мы',
  'вы',
  'они',
  'это',
  'тот',
  'та',
  'такая',
  'такой',
  'такие',
  'самая',
  'самый',
  'самое',
  'самые'
])

interface User {
  id: number
  telegramId: string
  username: string | null
  firstName: string | null
  lastName: string | null
  fullName: string
  messageBalance: number
  selectedGirl: {
    id: number
    name: string
  } | null
  chatsCount: number
  paymentsCount: number
  createdAt: string
  updatedAt: string
}

export default function Home() {
  const [girls, setGirls] = useState<Girl[]>([])
  const [loading, setLoading] = useState(true)
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectedGirl, setSelectedGirl] = useState<Girl | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [currentGirl, setCurrentGirl] = useState<SelectedGirlSummary | null>(null)
  const [isChangeMode, setIsChangeMode] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('main')
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'stars' | 'usd'>('stars')

  // Предотвращаем выбор оплаты картой (в разработке)
  useEffect(() => {
    if (paymentMethod === 'usd') {
      setPaymentMethod('stars')
    }
  }, [paymentMethod])
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminUsers, setAdminUsers] = useState<User[]>([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [adminStats, setAdminStats] = useState<{
    totalPayments: number
    totalStars: number
    totalUsd: number
    totalMessages: number
    starsPayments: number
    usdPayments: number
  } | null>(null)

  const fetchAdminStats = useCallback(async () => {
    try {
      const initData = typeof window !== 'undefined' && window.Telegram?.WebApp?.initData
      const response = await fetch('/api/admin/stats', {
        headers: {
          ...(initData ? { 'x-telegram-init-data': initData } : {}),
        },
      })
      if (response.ok) {
        const data = await response.json()
        setAdminStats(data)
      }
    } catch (error) {
      console.error('Ошибка загрузки статистики:', error)
    }
  }, [])

  const fetchAdminUsers = useCallback(async () => {
    try {
      setAdminLoading(true)
      setAdminError(null)
      
      const initData = typeof window !== 'undefined' && window.Telegram?.WebApp?.initData
      const response = await fetch('/api/admin/users?page=1&limit=50', {
        headers: {
          ...(initData ? { 'x-telegram-init-data': initData } : {}),
        },
      })

      if (!response.ok) {
        if (response.status === 403) {
          setAdminError('Доступ запрещен')
          setIsAdmin(false)
        } else {
          setAdminError('Ошибка загрузки пользователей')
        }
        return
      }

      const data = await response.json()
      setAdminUsers(data.users)
    } catch (err) {
      console.error('Ошибка загрузки пользователей:', err)
      setAdminError('Ошибка загрузки пользователей')
    } finally {
      setAdminLoading(false)
    }
  }, [])

  const checkAdmin = useCallback(async () => {
    try {
      const initData = typeof window !== 'undefined' && window.Telegram?.WebApp?.initData
      const response = await fetch('/api/admin/check', {
        headers: {
          ...(initData ? { 'x-telegram-init-data': initData } : {}),
        },
      })
      if (response.ok) {
        const data = await response.json()
        setIsAdmin(data.isAdmin)
        if (data.isAdmin) {
          fetchAdminUsers()
          fetchAdminStats()
        }
      }
    } catch (error) {
      console.error('Ошибка проверки прав администратора:', error)
    }
  }, [fetchAdminUsers, fetchAdminStats])

  const fetchBalance = useCallback(async () => {
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
        setCurrentGirl(data.selectedGirl ?? null)
      }
    } catch (error) {
      console.error('Ошибка загрузки баланса:', error)
    }
  }, [])

  const fetchGirls = useCallback(async () => {
    try {
      const response = await fetch('/api/girls')
      if (response.ok) {
        const data = await response.json()
        setGirls(data)
      }
    } catch (error) {
      console.error('Ошибка загрузки девушек:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Инициализация Telegram WebApp
    initTelegramWebApp()

    // Загрузка списка девушек
    fetchGirls()
    
    // Загрузка баланса
    fetchBalance()

    // Проверка прав администратора
    checkAdmin()
  }, [checkAdmin, fetchBalance, fetchGirls])

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
        body: JSON.stringify({ packageId, paymentMethod }),
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

  const handleGirlCardClick = (girl: Girl) => {
    if (isSelecting) {
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert('Подождите, мы уже запускаем общение')
      }
      return
    }

    setIsChangeMode(false)
    setSelectedGirl(girl)

    if (typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback) {
      try {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium')
      } catch (e) {
        console.warn('Haptic feedback недоступен:', e)
      }
    }
  }

  const startConversationWithGirl = async (girlId: number) => {
    const matchedGirl = girls.find((item) => item.id === girlId) || null

    if (isSelecting) {
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert('Вы уже запускаете общение с выбранной девушкой')
      }
      return
    }

    setIsSelecting(true)

    try {
      const initData = typeof window !== 'undefined' && window.Telegram?.WebApp?.initData

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

      const botInfoResponse = await fetch('/api/bot-info')
      let botUsername = 'your_bot_username'

      if (botInfoResponse.ok) {
        const botInfo = await botInfoResponse.json()
        botUsername = botInfo.username || botUsername
      }

      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        const webApp = window.Telegram.WebApp

        try {
          webApp.sendData(
            JSON.stringify({
              action: 'girl_selected',
              girlId,
            })
          )
        } catch (e) {
          console.error('Ошибка отправки данных боту:', e)
        }

        if (matchedGirl) {
          setCurrentGirl({ id: matchedGirl.id, name: matchedGirl.name })
        }
        setIsChangeMode(false)
        setSelectedGirl(null)

        webApp.openTelegramLink(`https://t.me/${botUsername}`)

        setTimeout(() => {
          try {
            webApp.close()
          } finally {
            setIsSelecting(false)
          }
        }, 900)
      } else {
        setIsSelecting(false)
        if (matchedGirl) {
          setCurrentGirl({ id: matchedGirl.id, name: matchedGirl.name })
        }
        setIsChangeMode(false)
        setSelectedGirl(null)
      }
    } catch (error) {
      console.error('Ошибка при запуске общения с девушкой:', error)
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert('Не удалось начать общение. Попробуйте еще раз.')
      }
      setIsSelecting(false)
    }
  }

  const handleCloseGirlDetail = () => {
    if (isSelecting) {
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert('Подождите пару секунд, мы уже подключаем девушку')
      }
      return
    }

    setSelectedGirl(null)
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Загрузка...</div>
      </div>
    )
  }

  if (!girls.length) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>Девушки не найдены</div>
      </div>
    )
  }

  // Используем пакеты из lib/packages.ts
  const packages = Object.entries(PACKAGES).map(([id, pkg]) => {
    const packageId = Number(id) as PackageId
    const usdPrice = getPackageUsdPrice(packageId)
    const oldUsdPrice = getPackageOldUsdPrice(packageId)
    return {
      id: packageId,
      messages: pkg.messages,
      stars: pkg.stars,
      oldStars: pkg.oldStars,
      usdPrice: usdPrice,
      oldUsdPrice: oldUsdPrice,
      discount: pkg.discount,
      savings: pkg.savings,
      name: pkg.name,
    }
  })

  const getShortDescription = (description: string | null) => {
    if (!description) return ''

    const meaningfulWords = description
      .split(/\s+/)
      .map((word) => word.trim())
      .map((word) => word.replace(/^[^A-Za-zА-Яа-яЁё0-9]+|[^A-Za-zА-Яа-яЁё0-9]+$/g, ''))
      .filter(Boolean)
      .filter((word) => !DESCRIPTION_STOP_WORDS.has(word.toLowerCase()))

    if (meaningfulWords.length >= 2) {
      return `${meaningfulWords[0]} ${meaningfulWords[1]}`
    }

    if (meaningfulWords.length === 1) {
      return meaningfulWords[0]
    }

    return ''
  }

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
        {isAdmin && (
          <button
            className={`${styles.tab} ${activeTab === 'admin' ? styles.tabActive : ''}`}
            onClick={() => {
              setActiveTab('admin')
              if (adminUsers.length === 0) {
                fetchAdminUsers()
              }
            }}
          >
            Админ
          </button>
        )}
      </div>

      {/* Главная вкладка */}
      {activeTab === 'main' && (
        <>
          <h1 className={styles.title}>Выберите девушку</h1>
          
          {currentGirl && (
            <div className={styles.currentGirlCard}>
              <div className={styles.currentGirlInfo}>
                <span className={styles.currentGirlLabel}>Текущая муза</span>
                <div className={styles.currentGirlName}>{currentGirl.name}</div>
              </div>
              <div className={styles.currentGirlActions}>
                <button
                  type="button"
                  className={styles.currentGirlActionButton}
                  onClick={() => {
                    const girl = girls.find((item) => item.id === currentGirl.id)
                    if (girl) {
                      handleGirlCardClick(girl)
                    }
                  }}
                >
                  Посмотреть профиль
                </button>
                <button
                  type="button"
                  className={styles.changeGirlButton}
                  onClick={() => {
                    setIsChangeMode(true)
                    if (typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback) {
                      try {
                        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success')
                      } catch (error) {
                        console.warn('Haptic feedback недоступен:', error)
                      }
                    }
                  }}
                >
                  Сменить девушку
                </button>
              </div>
            </div>
          )}

          {isChangeMode && (
            <div className={styles.changeGirlNotice}>
              <span>Выберите новую девушку из списка ниже.</span>
              <button
                type="button"
                className={styles.changeGirlCancelButton}
                onClick={() => setIsChangeMode(false)}
              >
                Отмена
              </button>
            </div>
          )}

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
          
          <div className={styles.girlsList}>
            {girls.map((item) => {
              const shortDescription = getShortDescription(item.description) || 'Очаровательная муза'
              const isCurrentGirl = currentGirl?.id === item.id

              return (
                <div
                  key={item.id}
                  className={`${styles.girlCard} ${isCurrentGirl ? styles.girlCardSelected : ''}`}
                  onClick={() => handleGirlCardClick(item)}
                  style={
                    isSelecting
                      ? { opacity: 0.6, pointerEvents: 'none', cursor: 'not-allowed' }
                      : {}
                  }
                >
                  {isCurrentGirl && (
                    <div className={styles.girlCardBadge}>Выбрана</div>
                  )}
                  {item.photoUrl ? (
                    <Image
                      src={item.photoUrl}
                      alt={item.name}
                      className={styles.girlBackground}
                      fill
                      priority={item.id === girls[0]?.id}
                      sizes="(max-width: 600px) 100vw, 600px"
                    />
                  ) : (
                    <div className={`${styles.girlBackground} ${styles.placeholderPhoto}`}>
                      <span>Фото</span>
                    </div>
                  )}
                  <div className={styles.girlOverlay}>
                    <h2 className={styles.girlName}>{item.name}</h2>
                    <p className={styles.girlDescription}>{shortDescription}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {selectedGirl && (
            <GirlDetailModal
              girl={selectedGirl}
              profile={GIRL_PROFILES[selectedGirl.id]}
              teaser={getShortDescription(selectedGirl.description) || 'Всегда умеет удивить'}
              onClose={handleCloseGirlDetail}
              onStart={() => startConversationWithGirl(selectedGirl.id)}
              isStarting={isSelecting}
            />
          )}
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

          {/* Переключатель метода оплаты */}
          <div className={styles.paymentMethodSelector}>
            <button
              className={`${styles.paymentMethodButton} ${paymentMethod === 'stars' ? styles.paymentMethodButtonActive : ''}`}
              onClick={() => setPaymentMethod('stars')}
            >
              ⭐ Telegram Stars
            </button>
            <button
              className={`${styles.paymentMethodButton} ${styles.paymentMethodButtonDisabled}`}
              onClick={() => {
                if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
                  window.Telegram.WebApp.showAlert('Оплата картой в разработке. Пожалуйста, используйте Telegram Stars.')
                }
              }}
              disabled
              title="В разработке"
            >
              <span>💳 Карта (USD)</span>
              <span className={styles.inDevelopmentBadge}>В разработке</span>
            </button>
          </div>

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
                    {paymentMethod === 'stars' ? (
                      <>
                        <div className={styles.priceRow}>
                          <span className={styles.oldPrice}>{pkg.oldStars}</span>
                          <span className={styles.packageStars}>{pkg.stars}</span>
                          <span className={styles.packageStarsLabel}>⭐ Telegram Stars</span>
                        </div>
                        <div className={styles.savingsBadge}>
                          💰 Вы экономите {pkg.savings} звезд!
                        </div>
                      </>
                    ) : (
                      <>
                        <div className={styles.priceRow}>
                          <span className={styles.oldPrice}>${pkg.oldUsdPrice.toFixed(2)}</span>
                          <span className={styles.packageStars}>${pkg.usdPrice.toFixed(2)}</span>
                          <span className={styles.packageStarsLabel}>💵 USD</span>
                        </div>
                        <div className={styles.savingsBadge}>
                          💰 Вы экономите ${(pkg.oldUsdPrice - pkg.usdPrice).toFixed(2)}!
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <button
                  className={`${styles.packageButton} ${isProcessingPayment || paymentMethod === 'usd' ? styles.packageButtonDisabled : ''}`}
                  onClick={() => {
                    if (paymentMethod === 'usd') {
                      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
                        window.Telegram.WebApp.showAlert('Оплата картой в разработке. Пожалуйста, переключитесь на Telegram Stars.')
                      }
                      return
                    }
                    handleTopup(pkg.id)
                  }}
                  disabled={isProcessingPayment || paymentMethod === 'usd'}
                >
                  {paymentMethod === 'usd' 
                    ? 'В разработке' 
                    : isProcessingPayment 
                    ? 'Обработка...' 
                    : 'Купить со скидкой'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Вкладка админ-панели */}
      {activeTab === 'admin' && isAdmin && (
        <>
          <h1 className={styles.title}>Админ-панель</h1>
          
          {adminLoading ? (
            <div className={styles.loading}>Загрузка...</div>
          ) : adminError ? (
            <div className={styles.error}>{adminError}</div>
          ) : selectedUserId ? (
            <AdminUserDetail 
              userId={selectedUserId} 
              onBack={() => setSelectedUserId(null)}
            />
          ) : (
            <div className={styles.adminContent}>
              <div className={styles.adminStats}>
                <div className={styles.statCard}>
                  <div className={styles.statValue}>{adminUsers.length}</div>
                  <div className={styles.statLabel}>Пользователей</div>
                </div>
                {adminStats && (
                  <>
                    <div className={styles.statCard}>
                      <div className={styles.statValue}>{adminStats.totalPayments}</div>
                      <div className={styles.statLabel}>Всего платежей</div>
                    </div>
                    <div className={styles.statCard}>
                      <div className={styles.statValue}>{adminStats.totalStars.toLocaleString()}</div>
                      <div className={styles.statLabel}>⭐ Stars получено</div>
                    </div>
                    <div className={styles.statCard}>
                      <div className={styles.statValue}>${adminStats.totalUsd.toFixed(2)}</div>
                      <div className={styles.statLabel}>💵 USD получено</div>
                    </div>
                  </>
                )}
              </div>
              
              {adminStats && (
                <div className={styles.paymentInfoCard}>
                  <h3 className={styles.paymentInfoTitle}>💰 Информация о выводе средств</h3>
                  <div className={styles.paymentInfoContent}>
                    <p><strong>⭐ Telegram Stars:</strong> {adminStats.totalStars.toLocaleString()} stars</p>
                    <p><strong>💵 USD:</strong> ${adminStats.totalUsd.toFixed(2)}</p>
                    <p className={styles.paymentInfoNote}>
                      💡 <strong>Важно:</strong> Средства поступают на баланс бота в Telegram.
                      Для вывода откройте @BotFather → My Bots → выберите бота → Payments
                    </p>
                    <p className={styles.paymentInfoNote}>
                      📖 Подробная инструкция по выводу средств находится в файле PAYMENTS_SETUP.md
                    </p>
                  </div>
                </div>
              )}
              
              <div className={styles.usersList}>
                {adminUsers.length === 0 ? (
                  <div className={styles.empty}>Пользователи не найдены</div>
                ) : (
                  adminUsers.map((user) => (
                    <div
                      key={user.id}
                      className={styles.userCard}
                      onClick={() => setSelectedUserId(user.id)}
                    >
                      <div className={styles.userHeader}>
                        <div className={styles.userName}>
                          {user.fullName}
                          {user.username && (
                            <span className={styles.username}>@{user.username}</span>
                          )}
                        </div>
                        <div className={styles.userId}>ID: {user.telegramId}</div>
                      </div>
                      
                      <div className={styles.userInfo}>
                        <div className={styles.infoRow}>
                          <span className={styles.infoLabel}>Баланс:</span>
                          <span className={styles.infoValue}>{user.messageBalance} сообщений</span>
                        </div>
                        
                        {user.selectedGirl && (
                          <div className={styles.infoRow}>
                            <span className={styles.infoLabel}>Девушка:</span>
                            <span className={styles.infoValue}>{user.selectedGirl.name}</span>
                          </div>
                        )}
                        
                        <div className={styles.infoRow}>
                          <span className={styles.infoLabel}>Чатов:</span>
                          <span className={styles.infoValue}>{user.chatsCount}</span>
                        </div>
                        
                        <div className={styles.infoRow}>
                          <span className={styles.infoLabel}>Платежей:</span>
                          <span className={styles.infoValue}>{user.paymentsCount}</span>
                        </div>
                  <div className={styles.userCardActions}>
                    <button
                      type="button"
                      className={styles.userCardButton}
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedUserId(user.id)
                      }}
                    >
                      Выдать сообщения
                    </button>
                  </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

interface GirlDetailModalProps {
  girl: Girl
  profile?: GirlProfile
  teaser: string
  onClose: () => void
  onStart: () => void
  isStarting: boolean
}

function GirlDetailModal({ girl, profile, teaser, onClose, onStart, isStarting }: GirlDetailModalProps) {
  const handleCardClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation()
  }

  const canRenderProfile = Boolean(profile)

  return (
    <div className={styles.girlDetailOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.girlDetailCard} onClick={handleCardClick}>
        <button
          type="button"
          className={styles.girlDetailCloseButton}
          onClick={onClose}
          disabled={isStarting}
          aria-label="Закрыть профиль"
        >
          ×
        </button>

        <div className={styles.girlDetailHero}>
          <div className={styles.girlDetailPhoto}>
            {girl.photoUrl ? (
              <Image
                src={girl.photoUrl}
                alt={girl.name}
                fill
                className={styles.girlDetailPhotoImage}
                sizes="140px"
              />
            ) : (
              <div className={styles.girlDetailPhotoPlaceholder}>
                <span>{girl.name[0]}</span>
              </div>
            )}
          </div>
          <div className={styles.girlDetailInfo}>
            {profile?.tagline ? (
              <span className={styles.girlDetailTagline}>{profile.tagline}</span>
            ) : (
              <span className={styles.girlDetailTagline}>Всегда особенная</span>
            )}
            <h2 className={styles.girlDetailName}>{girl.name}</h2>
            <div className={styles.girlDetailChips}>
              {profile?.age ? <span className={styles.girlDetailChip}>{profile.age} лет</span> : null}
              {profile?.archetype ? <span className={styles.girlDetailChip}>{profile.archetype}</span> : null}
              {teaser ? <span className={styles.girlDetailChip}>{teaser}</span> : null}
            </div>
          </div>
        </div>

        <div className={styles.girlDetailSection}>
          <div className={styles.girlDetailSectionTitle}>
            <span>💫</span>
            <h3>О ней</h3>
          </div>
          <p className={styles.girlDetailText}>
            {profile?.personality || girl.description || 'Описание обновляется, но ты уже заинтересовал её.'}
          </p>
        </div>

        {profile?.desires && (
          <div className={styles.girlDetailSection}>
            <div className={styles.girlDetailSectionTitle}>
              <span>🔥</span>
              <h3>Что она хочет</h3>
            </div>
            <p className={styles.girlDetailText}>{profile.desires}</p>
          </div>
        )}

        {profile?.pleasures?.length ? (
          <div className={styles.girlDetailSection}>
            <div className={styles.girlDetailSectionTitle}>
              <span>💖</span>
              <h3>Её слабости</h3>
            </div>
            <ul className={styles.girlDetailList}>
              {profile.pleasures.map((item) => (
                <li key={item} className={styles.girlDetailListItem}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {profile?.conversationHooks?.length ? (
          <div className={styles.girlDetailSection}>
            <div className={styles.girlDetailSectionTitle}>
              <span>🗝️</span>
              <h3>Что обсудить с ней</h3>
            </div>
            <ul className={styles.girlDetailList}>
              {profile.conversationHooks.map((item) => (
                <li key={item} className={styles.girlDetailListItem}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {profile?.openingLine && (
          <div className={styles.girlDetailHighlight}>
            <div className={styles.girlDetailHighlightTitle}>Фраза, чтобы растопить лёд</div>
            <p className={styles.girlDetailHighlightText}>{profile.openingLine}</p>
          </div>
        )}

        {canRenderProfile && profile?.funFact && (
          <p className={styles.girlDetailFootnote}>💡 {profile.funFact}</p>
        )}

        <div className={styles.girlDetailActions}>
          <button
            type="button"
            className={styles.girlDetailStartButton}
            onClick={onStart}
            disabled={isStarting}
          >
            {isStarting ? 'Запускаем общение...' : 'Начать общение'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Компонент детальной информации о пользователе
function AdminUserDetail({ userId, onBack }: { userId: number; onBack: () => void }) {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'chats' | 'payments'>('info')
  const [grantAmount, setGrantAmount] = useState<string>('')
  const [grantReason, setGrantReason] = useState<string>('')
  const [grantLoading, setGrantLoading] = useState(false)
  const [grantError, setGrantError] = useState<string | null>(null)
  const [grantSuccess, setGrantSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetchUser()
    setGrantAmount('')
    setGrantReason('')
    setGrantError(null)
    setGrantSuccess(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const fetchUser = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const initData = typeof window !== 'undefined' && window.Telegram?.WebApp?.initData
      const response = await fetch(`/api/admin/users/${userId}`, {
        headers: {
          ...(initData ? { 'x-telegram-init-data': initData } : {}),
        },
      })

      if (!response.ok) {
        setError('Ошибка загрузки данных пользователя')
        return
      }

      const data = await response.json()
      setUser(data)
    } catch (err) {
      console.error('Ошибка загрузки данных пользователя:', err)
      setError('Ошибка загрузки данных пользователя')
    } finally {
      setLoading(false)
    }
  }

  const handleGrantMessages = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setGrantError(null)
    setGrantSuccess(null)

    const parsedAmount = parseInt(grantAmount, 10)

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setGrantError('Введите положительное целое число сообщений')
      return
    }

    try {
      setGrantLoading(true)
      const initData = typeof window !== 'undefined' && window.Telegram?.WebApp?.initData
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(initData ? { 'x-telegram-init-data': initData } : {}),
        },
        body: JSON.stringify({ amount: parsedAmount, reason: grantReason }),
      })

      let data: any = null
      try {
        data = await response.json()
      } catch (jsonError) {
        // Игнорируем ошибку парсинга, обработаем по статусу
      }

      if (!response.ok) {
        setGrantError(data?.error || 'Не удалось начислить сообщения пользователю')
        return
      }

      await fetchUser()
      setGrantAmount('')
      setGrantReason('')
      setGrantSuccess(`Добавлено ${data?.granted ?? parsedAmount} сообщений`)
    } catch (err) {
      console.error('Ошибка ручного начисления сообщений пользователю:', err)
      setGrantError('Произошла ошибка. Попробуйте еще раз.')
    } finally {
      setGrantLoading(false)
    }
  }

  if (loading) {
    return <div className={styles.loading}>Загрузка...</div>
  }

  if (error || !user) {
    return (
      <>
        <div className={styles.error}>{error || 'Пользователь не найден'}</div>
        <button className={styles.backButton} onClick={onBack}>Назад</button>
      </>
    )
  }

  return (
    <div className={styles.userDetail}>
      <button className={styles.backButton} onClick={onBack}>← Назад</button>
      
      <div className={styles.userDetailHeader}>
        <h2>{user.fullName}</h2>
        {user.username && <div className={styles.username}>@{user.username}</div>}
        <div className={styles.userId}>Telegram ID: {user.telegramId}</div>
      </div>

      <div className={styles.userDetailTabs}>
        <button
          className={`${styles.detailTab} ${activeTab === 'info' ? styles.detailTabActive : ''}`}
          onClick={() => setActiveTab('info')}
        >
          Инфо
        </button>
        <button
          className={`${styles.detailTab} ${activeTab === 'chats' ? styles.detailTabActive : ''}`}
          onClick={() => setActiveTab('chats')}
        >
          Диалоги ({user.chats.length})
        </button>
        <button
          className={`${styles.detailTab} ${activeTab === 'payments' ? styles.detailTabActive : ''}`}
          onClick={() => setActiveTab('payments')}
        >
          Платежи ({user.payments.length})
        </button>
      </div>

      <div className={styles.userDetailContent}>
        {activeTab === 'info' && (
          <>
            <div className={styles.userDetailInfo}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Баланс:</span>
                <span className={styles.infoValue}>{user.messageBalance} сообщений</span>
              </div>
              {user.selectedGirl && (
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Девушка:</span>
                  <span className={styles.infoValue}>{user.selectedGirl.name}</span>
                </div>
              )}
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Чатов:</span>
                <span className={styles.infoValue}>{user.stats.totalChats}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Сообщений:</span>
                <span className={styles.infoValue}>{user.stats.totalMessages}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Платежей:</span>
                <span className={styles.infoValue}>{user.stats.totalPayments}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Звезд потрачено:</span>
                <span className={styles.infoValue}>{user.stats.totalStarsSpent}</span>
              </div>
              {user.stats.totalUsdSpent > 0 && (
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>USD потрачено:</span>
                  <span className={styles.infoValue}>${user.stats.totalUsdSpent.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className={styles.grantCard}>
              <h3>Выдать сообщения</h3>
              <p className={styles.grantDescription}>
                Начислите дополнительные сообщения вручную. Пользователь получит уведомление от бота при следующем использовании.
              </p>
              <form className={styles.grantForm} onSubmit={handleGrantMessages}>
                <div className={styles.grantRow}>
                  <input
                    type="number"
                    min={1}
                    className={styles.grantInput}
                    placeholder="Количество сообщений"
                    value={grantAmount}
                    onChange={(event) => setGrantAmount(event.target.value)}
                    disabled={grantLoading}
                  />
                  <button
                    type="submit"
                    className={styles.grantButton}
                    disabled={grantLoading}
                  >
                    {grantLoading ? 'Начисляем...' : 'Начислить'}
                  </button>
                </div>
                <input
                  type="text"
                  className={styles.grantReasonInput}
                  placeholder="Комментарий для истории (необязательно)"
                  value={grantReason}
                  onChange={(event) => setGrantReason(event.target.value)}
                  disabled={grantLoading}
                />
              </form>
              {grantError && <div className={styles.grantError}>{grantError}</div>}
              {grantSuccess && <div className={styles.grantSuccess}>{grantSuccess}</div>}
            </div>
          </>
        )}

        {activeTab === 'chats' && (
          <div className={styles.userDetailChats}>
            {user.chats.length === 0 ? (
              <div className={styles.empty}>Диалогов нет</div>
            ) : (
              user.chats.map((chat: any) => (
                <div key={chat.id} className={styles.chatCard}>
                  <h3>Диалог с {chat.girl.name}</h3>
                  <div className={styles.chatMessages}>
                    {chat.messages.slice(-10).map((msg: any) => (
                      <div key={msg.id} className={styles.message}>
                        <div className={styles.messageRole}>
                          {msg.role === 'user' ? '👤' : '🤖'}
                        </div>
                        <div className={styles.messageContent}>{msg.content}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'payments' && (
          <div className={styles.userDetailPayments}>
            {user.payments.length === 0 ? (
              <div className={styles.empty}>Платежей нет</div>
            ) : (
              user.payments.map((payment: any) => (
                <div key={payment.id} className={styles.paymentCard}>
                  <div className={styles.paymentHeader}>
                    <h3>{payment.packageName}</h3>
                    <div>{new Date(payment.createdAt).toLocaleDateString('ru-RU')}</div>
                  </div>
                  <div className={styles.paymentInfo}>
                    <div>Сообщений: {payment.messages}</div>
                    {payment.paymentMethod === 'stars' && (
                      <div>Звезд: {payment.stars} ⭐</div>
                    )}
                    {payment.paymentMethod === 'usd' && (
                      <div>USD: ${payment.usdAmount?.toFixed(2) || '0.00'} 💵</div>
                    )}
                    {payment.paymentMethod === 'manual' && (
                      <div>Начислено администратором</div>
                    )}
                    <div>
                      Метод:{' '}
                      {payment.paymentMethod === 'stars'
                        ? 'Telegram Stars'
                        : payment.paymentMethod === 'usd'
                        ? 'Карта (USD)'
                        : 'Ручное начисление'}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

