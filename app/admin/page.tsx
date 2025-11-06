'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { initTelegramWebApp } from '@/lib/telegram-webapp'
import styles from './admin.module.css'

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

export default function AdminPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchUsers = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const initData = typeof window !== 'undefined' && window.Telegram?.WebApp?.initData
      const response = await fetch(`/api/admin/users?page=${page}&limit=50`, {
        headers: {
          ...(initData ? { 'x-telegram-init-data': initData } : {}),
        },
      })

      if (!response.ok) {
        if (response.status === 403) {
          setError('Доступ запрещен. Вы не являетесь администратором.')
        } else {
          setError('Ошибка загрузки пользователей')
        }
        return
      }

      const data = await response.json()
      setUsers(data.users)
      setTotalPages(data.pagination.totalPages)
    } catch (err) {
      console.error('Ошибка загрузки пользователей:', err)
      setError('Ошибка загрузки пользователей')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    initTelegramWebApp()
    fetchUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const handleUserClick = (userId: number) => {
    router.push(`/admin/users/${userId}`)
  }

  const filteredUsers = users.filter(user => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      user.fullName.toLowerCase().includes(query) ||
      user.username?.toLowerCase().includes(query) ||
      user.telegramId.includes(query)
    )
  })

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
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Админ-панель</h1>
        <div className={styles.stats}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Всего пользователей:</span>
            <span className={styles.statValue}>{users.length}</span>
          </div>
        </div>
      </div>

      <div className={styles.searchContainer}>
        <input
          type="text"
          placeholder="Поиск по имени, username или Telegram ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.usersList}>
        {filteredUsers.length === 0 ? (
          <div className={styles.empty}>Пользователи не найдены</div>
        ) : (
          filteredUsers.map((user) => (
            <div
              key={user.id}
              className={styles.userCard}
              onClick={() => handleUserClick(user.id)}
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
                    <span className={styles.infoLabel}>Выбранная девушка:</span>
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
                
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Регистрация:</span>
                  <span className={styles.infoValue}>
                    {new Date(user.createdAt).toLocaleDateString('ru-RU')}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            className={styles.paginationButton}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Назад
          </button>
          <span className={styles.paginationInfo}>
            Страница {page} из {totalPages}
          </span>
          <button
            className={styles.paginationButton}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Вперед
          </button>
        </div>
      )}
    </div>
  )
}

