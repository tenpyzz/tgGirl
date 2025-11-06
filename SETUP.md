# Инструкция по запуску проекта

## Шаг 1: Установка зависимостей

```bash
npm install
```

## Шаг 2: Настройка переменных окружения

1. Создайте файл `.env` на основе `.env.example`:
```bash
cp .env.example .env
```

2. Заполните следующие переменные:

### Telegram Bot Token
- Откройте [@BotFather](https://t.me/BotFather) в Telegram
- Отправьте команду `/newbot`
- Следуйте инструкциям для создания бота
- Скопируйте токен бота и вставьте в `.env`:
```
TELEGRAM_BOT_TOKEN=ваш_токен_бота
```

### OpenRouter API Key
- Зарегистрируйтесь на [OpenRouter](https://openrouter.ai/)
- Перейдите в раздел API Keys
- Создайте новый API ключ
- Вставьте в `.env`:
```
OPENROUTER_API_KEY=ваш_openrouter_ключ
```

### PostgreSQL Database URL
Для локального тестирования:
- Установите PostgreSQL локально или используйте Railway
- Создайте базу данных
- URL будет выглядеть так:
```
DATABASE_URL=postgresql://user:password@localhost:5432/database?schema=public
```

Для Railway:
- Создайте PostgreSQL базу данных в Railway
- Railway автоматически создаст переменную `DATABASE_URL`

## Шаг 3: Настройка базы данных

```bash
# Сгенерируйте Prisma Client
npm run db:generate

# Примените схему к базе данных
npm run db:push

# Заполните базу данных начальными данными (создаст девушку "Анна")
npm run seed
```

## Шаг 4: Запуск приложения

```bash
npm run dev
```

Приложение будет доступно на `http://localhost:3000`

## Шаг 5: Настройка Telegram Mini App

### Для тестирования на localhost:

1. **Установите ngrok** (для создания HTTPS туннеля):
```bash
# Windows (с помощью chocolatey)
choco install ngrok

# Или скачайте с https://ngrok.com/
```

2. **Запустите ngrok**:
```bash
ngrok http 3000
```

3. **Скопируйте HTTPS URL** (например, `https://abc123.ngrok.io`)

4. **Настройте Mini App в BotFather**:
   - Откройте [@BotFather](https://t.me/BotFather)
   - Отправьте `/newapp`
   - Выберите вашего бота
   - Укажите название: `ИИ Чат`
   - Укажите описание: `Общение с ИИ-девушками`
   - Укажите URL: `https://abc123.ngrok.io` (ваш ngrok URL)
   - Загрузите иконку (опционально)

5. **Откройте бота в Telegram** и нажмите на кнопку "Открыть Mini App"

### Для production на Railway:

1. **Деплойте приложение на Railway**:
   - Создайте проект на [Railway](https://railway.app/)
   - Подключите PostgreSQL базу данных
   - Добавьте все переменные окружения из `.env`
   - Деплойте код

2. **Настройте Mini App в BotFather**:
   - Откройте [@BotFather](https://t.me/BotFather)
   - Отправьте `/newapp`
   - Выберите вашего бота
   - Укажите URL: `https://ваш-проект.railway.app`

3. **Настройте webhook для бота** (если нужно):
   - В Railway добавьте переменную окружения:
   ```
   WEBHOOK_URL=https://ваш-проект.railway.app/api/webhook
   ```

## Проверка работы

1. Откройте вашего бота в Telegram
2. Отправьте `/start`
3. Нажмите на кнопку "Открыть Mini App"
4. Вы должны увидеть главную страницу с девушкой "Анна"
5. Нажмите на карточку девушки
6. Откроется чат - попробуйте отправить сообщение

## Важные замечания

1. **Тестирование на localhost**: Telegram требует HTTPS для Mini Apps, поэтому используйте ngrok или подобный сервис.

2. **Telegram User ID**: В development режиме используется дефолтный user ID (123456789). В production это будет приходить автоматически из Telegram WebApp.

3. **OpenRouter API**: Используется модель `deepseek/deepseek-v3-0324` (DeepSeek V3 0324) через OpenRouter. Можете изменить на другую модель в `app/api/chat/[girlId]/send/route.ts`. Список доступных моделей: https://openrouter.ai/models

4. **Системный промпт**: Настройте системный промпт для девушки в `scripts/seed.ts` для изменения поведения ИИ.

5. **Фото девушек**: Пока используется placeholder. Добавьте фото позже через админку или напрямую в базу данных.

## Структура проекта

- `app/` - Next.js приложение (страницы и API)
- `lib/` - Утилиты (Prisma, OpenRouter, Telegram)
- `prisma/` - Схема базы данных
- `scripts/` - Скрипты для заполнения базы данных

## Команды

- `npm run dev` - Запуск в development режиме
- `npm run build` - Сборка для production
- `npm start` - Запуск production версии
- `npm run db:push` - Применить схему к базе данных
- `npm run db:studio` - Открыть Prisma Studio (GUI для БД)
- `npm run seed` - Заполнить базу данных начальными данными

## Помощь

Если что-то не работает:
1. Проверьте, что все переменные окружения заполнены
2. Убедитесь, что база данных настроена и доступна
3. Проверьте логи в консоли
4. Убедитесь, что Telegram Bot Token и OpenRouter API Key корректны

