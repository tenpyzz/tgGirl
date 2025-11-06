'use client'

import { useEffect, useState } from 'react'
import { initTelegramWebApp } from '@/lib/telegram-webapp'
import { PACKAGES, getPackageUsdPrice, getPackageOldUsdPrice, type PackageId } from '@/lib/packages'
import styles from './page.module.css'

interface Girl {
  id: number
  name: string
  description: string | null
  photoUrl: string | null
}

type Tab = 'main' | 'topup' | 'admin'

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
  const [girl, setGirl] = useState<Girl | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSelecting, setIsSelecting] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
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

  useEffect(() => {
    // Инициализация Telegram WebApp
    initTelegramWebApp()

    // Загрузка списка девушек
    fetchGirls()
    
    // Загрузка баланса
    fetchBalance()

    // Проверка прав администратора
    checkAdmin()
  }, [])

  const checkAdmin = async () => {
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
  }

  const fetchAdminStats = async () => {
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
  }

  const fetchAdminUsers = async () => {
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
  }

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

// Компонент детальной информации о пользователе
function AdminUserDetail({ userId, onBack }: { userId: number; onBack: () => void }) {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'chats' | 'payments'>('info')

  useEffect(() => {
    fetchUser()
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
                    {payment.paymentMethod === 'stars' ? (
                      <div>Звезд: {payment.stars} ⭐</div>
                    ) : (
                      <div>USD: ${payment.usdAmount?.toFixed(2) || '0.00'} 💵</div>
                    )}
                    <div>Метод: {payment.paymentMethod === 'stars' ? 'Telegram Stars' : 'Карта (USD)'}</div>
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

