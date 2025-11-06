'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { initTelegramWebApp } from '@/lib/telegram-webapp'
import styles from './user-detail.module.css'

interface Message {
  id: number
  role: string
  content: string
  createdAt: string
}

interface Chat {
  id: number
  girl: {
    id: number
    name: string
  }
  messagesCount: number
  messages: Message[]
  createdAt: string
  updatedAt: string
}

interface Payment {
  id: number
  packageId: number
  packageName: string
  messages: number
  stars: number
  createdAt: string
}

interface UserDetail {
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
    description: string | null
    photoUrl: string | null
  } | null
  createdAt: string
  updatedAt: string
  chats: Chat[]
  payments: Payment[]
  stats: {
    totalChats: number
    totalMessages: number
    totalPayments: number
    totalStarsSpent: number
    totalMessagesBought: number
  }
}

export default function UserDetailPage() {
  const router = useRouter()
  const params = useParams()
  const userId = params.userId as string
  
  const [user, setUser] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'chats' | 'payments'>('info')

  useEffect(() => {
    initTelegramWebApp()
    fetchUser()
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
        if (response.status === 403) {
          setError('Доступ запрещен. Вы не являетесь администратором.')
        } else if (response.status === 404) {
          setError('Пользователь не найден')
        } else {
          setError('Ошибка загрузки данных пользователя')
        }
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
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Загрузка...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
        <button className={styles.backButton} onClick={() => router.push('/admin')}>
          Назад к списку
        </button>
      </div>
    )
  }

  if (!user) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>Пользователь не найден</div>
        <button className={styles.backButton} onClick={() => router.push('/admin')}>
          Назад к списку
        </button>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={() => router.push('/admin')}>
          ← Назад
        </button>
        <h1 className={styles.title}>Информация о пользователе</h1>
      </div>

      {/* Основная информация */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Основная информация</h2>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>ID:</span>
            <span className={styles.infoValue}>{user.id}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Telegram ID:</span>
            <span className={styles.infoValue}>{user.telegramId}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Имя:</span>
            <span className={styles.infoValue}>{user.fullName}</span>
          </div>
          {user.username && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Username:</span>
              <span className={styles.infoValue}>@{user.username}</span>
            </div>
          )}
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Баланс:</span>
            <span className={styles.infoValue}>{user.messageBalance} сообщений</span>
          </div>
          {user.selectedGirl && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Выбранная девушка:</span>
              <span className={styles.infoValue}>{user.selectedGirl.name}</span>
            </div>
          )}
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Регистрация:</span>
            <span className={styles.infoValue}>
              {new Date(user.createdAt).toLocaleString('ru-RU')}
            </span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Последнее обновление:</span>
            <span className={styles.infoValue}>
              {new Date(user.updatedAt).toLocaleString('ru-RU')}
            </span>
          </div>
        </div>
      </div>

      {/* Статистика */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Статистика</h2>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{user.stats.totalChats}</div>
            <div className={styles.statLabel}>Чатов</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{user.stats.totalMessages}</div>
            <div className={styles.statLabel}>Сообщений</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{user.stats.totalPayments}</div>
            <div className={styles.statLabel}>Платежей</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{user.stats.totalStarsSpent}</div>
            <div className={styles.statLabel}>Звезд потрачено</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{user.stats.totalMessagesBought}</div>
            <div className={styles.statLabel}>Сообщений куплено</div>
          </div>
        </div>
      </div>

      {/* Вкладки */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'info' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('info')}
        >
          Информация
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'chats' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('chats')}
        >
          Диалоги ({user.chats.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'payments' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('payments')}
        >
          Платежи ({user.payments.length})
        </button>
      </div>

      {/* Контент вкладок */}
      <div className={styles.tabContent}>
        {activeTab === 'info' && (
          <div className={styles.infoContent}>
            {user.selectedGirl && (
              <div className={styles.girlInfo}>
                <h3 className={styles.girlName}>{user.selectedGirl.name}</h3>
                {user.selectedGirl.description && (
                  <p className={styles.girlDescription}>{user.selectedGirl.description}</p>
                )}
                {user.selectedGirl.photoUrl && (
                  <img
                    src={user.selectedGirl.photoUrl}
                    alt={user.selectedGirl.name}
                    className={styles.girlPhoto}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'chats' && (
          <div className={styles.chatsContent}>
            {user.chats.length === 0 ? (
              <div className={styles.empty}>Диалогов нет</div>
            ) : (
              user.chats.map((chat) => (
                <div key={chat.id} className={styles.chatCard}>
                  <div className={styles.chatHeader}>
                    <h3 className={styles.chatTitle}>
                      Диалог с {chat.girl.name}
                    </h3>
                    <div className={styles.chatMeta}>
                      <span>Сообщений: {chat.messagesCount}</span>
                      <span>
                        Обновлен: {new Date(chat.updatedAt).toLocaleString('ru-RU')}
                      </span>
                    </div>
                  </div>
                  
                  <div className={styles.messagesList}>
                    {chat.messages.length === 0 ? (
                      <div className={styles.empty}>Сообщений нет</div>
                    ) : (
                      chat.messages.map((message) => (
                        <div
                          key={message.id}
                          className={`${styles.message} ${
                            message.role === 'user' ? styles.messageUser : styles.messageAssistant
                          }`}
                        >
                          <div className={styles.messageRole}>
                            {message.role === 'user' ? '👤 Пользователь' : '🤖 ' + chat.girl.name}
                          </div>
                          <div className={styles.messageContent}>{message.content}</div>
                          <div className={styles.messageTime}>
                            {new Date(message.createdAt).toLocaleString('ru-RU')}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'payments' && (
          <div className={styles.paymentsContent}>
            {user.payments.length === 0 ? (
              <div className={styles.empty}>Платежей нет</div>
            ) : (
              <div className={styles.paymentsList}>
                {user.payments.map((payment) => (
                  <div key={payment.id} className={styles.paymentCard}>
                    <div className={styles.paymentHeader}>
                      <h3 className={styles.paymentTitle}>{payment.packageName}</h3>
                      <div className={styles.paymentDate}>
                        {new Date(payment.createdAt).toLocaleString('ru-RU')}
                      </div>
                    </div>
                    <div className={styles.paymentInfo}>
                      <div className={styles.paymentRow}>
                        <span className={styles.paymentLabel}>Сообщений:</span>
                        <span className={styles.paymentValue}>{payment.messages}</span>
                      </div>
                      <div className={styles.paymentRow}>
                        <span className={styles.paymentLabel}>Звезд:</span>
                        <span className={styles.paymentValue}>{payment.stars} ⭐</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

