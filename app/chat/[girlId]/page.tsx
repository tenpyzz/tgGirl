'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { initTelegramWebApp, getTelegramUserId } from '@/lib/telegram-webapp'
import styles from './page.module.css'

interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

interface Girl {
  id: number
  name: string
  description: string | null
  photoUrl: string | null
}

export default function ChatPage() {
  const params = useParams()
  const router = useRouter()
  const girlId = Number(params.girlId)
  
  const [girl, setGirl] = useState<Girl | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    initTelegramWebApp()
    
    // Настройка кнопки "Назад"
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      window.Telegram.WebApp.BackButton.show()
      window.Telegram.WebApp.BackButton.onClick(() => {
        router.push('/')
      })
    }

    loadGirl()
    loadMessages()

    return () => {
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        window.Telegram.WebApp.BackButton.hide()
      }
    }
  }, [girlId, router])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadGirl = async () => {
    try {
      const response = await fetch(`/api/girls/${girlId}`)
      if (response.ok) {
        const data = await response.json()
        setGirl(data)
      }
    } catch (error) {
      console.error('Ошибка загрузки девушки:', error)
    }
  }

  const loadMessages = async () => {
    setLoading(true)
    try {
      const userId = getTelegramUserId()
      const initData = typeof window !== 'undefined' && window.Telegram?.WebApp?.initData
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      if (initData) {
        headers['x-telegram-init-data'] = initData
      }
      
      const url = `/api/chat/${girlId}/messages${userId ? `?userId=${userId}` : ''}`
      const response = await fetch(url, { headers })
      if (response.ok) {
        const data = await response.json()
        setMessages(data)
      }
    } catch (error) {
      console.error('Ошибка загрузки сообщений:', error)
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!inputValue.trim() || sending) return

    const userMessage = inputValue.trim()
    setInputValue('')
    setSending(true)

    // Добавляем сообщение пользователя сразу
    const tempUserMessage: Message = {
      id: Date.now(),
      role: 'user',
      content: userMessage,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempUserMessage])

    try {
      const userId = getTelegramUserId()
      const initData = typeof window !== 'undefined' && window.Telegram?.WebApp?.initData
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      if (initData) {
        headers['x-telegram-init-data'] = initData
      }
      
      const url = `/api/chat/${girlId}/send${userId ? `?userId=${userId}` : ''}`
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: userMessage }),
      })

      if (response.ok) {
        const data = await response.json()
        // Добавляем ответ от ИИ
        setMessages((prev) => [...prev, data.message])
      } else {
        const error = await response.json()
        alert(`Ошибка: ${error.error || 'Неизвестная ошибка'}`)
        // Удаляем сообщение пользователя при ошибке
        setMessages((prev) => prev.filter((msg) => msg.id !== tempUserMessage.id))
      }
    } catch (error) {
      console.error('Ошибка отправки сообщения:', error)
      alert('Ошибка отправки сообщения')
      // Удаляем сообщение пользователя при ошибке
      setMessages((prev) => prev.filter((msg) => msg.id !== tempUserMessage.id))
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Загрузка чата...</div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {girl && (
        <div className={styles.header}>
          <div className={styles.girlPhoto}>
            {girl.photoUrl ? (
              <img src={girl.photoUrl} alt={girl.name} />
            ) : (
              <div className={styles.placeholderPhoto}>
                <span>{girl.name[0]}</span>
              </div>
            )}
          </div>
          <div className={styles.girlInfo}>
            <h2 className={styles.girlName}>{girl.name}</h2>
          </div>
        </div>
      )}

      <div className={styles.messagesContainer} ref={chatContainerRef}>
        {messages.length === 0 ? (
          <div className={styles.emptyState}>
            <p>Начните общение с {girl?.name || 'девушкой'}</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`${styles.message} ${
                message.role === 'user' ? styles.userMessage : styles.assistantMessage
              }`}
            >
              <div className={styles.messageContent}>{message.content}</div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className={styles.inputForm}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Введите сообщение..."
          className={styles.input}
          disabled={sending}
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || sending}
          className={styles.sendButton}
        >
          {sending ? '...' : '➤'}
        </button>
      </form>
    </div>
  )
}

