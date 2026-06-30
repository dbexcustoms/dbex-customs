# DBEX Customs — рабочее веб-приложение

Полноценное SaaS-приложение: backend на Node.js/Express + PostgreSQL, статический frontend на чистом HTML/CSS/JS, реальная авторизация, загрузка файлов, email-уведомления, админ-панель.

## Структура проекта

```
dbex-customs/
  backend/           Node.js/Express API + PostgreSQL
    src/
      index.js        точка входа сервера
      db.js            подключение к PostgreSQL (параметризованные запросы)
      migrate.js       раннер миграций
      createAdmin.js   скрипт создания первого администратора
      middleware/
        auth.js          JWT-аутентификация, проверка роли admin
        errorHandler.js  единая обработка ошибок
      routes/
        auth.js          регистрация, вход, /me
        applications.js  заявки, калькулятор, загрузка/скачивание файлов
        admin.js         список всех заявок/пользователей, смена статуса
      utils/
        email.js         отправка писем через SMTP (nodemailer)
    migrations/
      001_init.sql     схема БД (users, applications, application_files, application_events)
    uploads/           файлы клиентов (создаётся автоматически)
    .env.example       шаблон переменных окружения
  frontend/           статические HTML-страницы, обращаются к backend по REST API
    index.html         лендинг + калькулятор (бьёт в реальный API)
    register.html       регистрация
    login.html           вход
    dashboard.html       личный кабинет: список заявок + создание новой
    application.html     карточка заявки: документы, загрузка файлов, история статусов
    admin.html            админ-панель: все заявки, смена статуса
    css/style.css
    js/api.js             общий слой работы с API (fetch, токен, обработка ошибок)
```

## Что реально работает (не демо)

- Регистрация и вход — реальные, с хешированием пароля (bcrypt, 12 раундов) и выдачей JWT.
- Калькулятор — расчёт всегда выполняется на сервере (`POST /api/applications/estimate`), клиент не может подменить цену.
- Создание заявки — пишется в PostgreSQL, привязывается к авторизованному пользователю.
- Загрузка документов — реальная загрузка файлов на диск через multer, с проверкой типа (PDF/изображения/Word/Excel) и ограничением размера (15 МБ по умолчанию), привязкой к заявке и пользователю, кто загрузил.
- Скачивание документов — только владелец заявки или администратор.
- Email-уведомления — реальная отправка через SMTP (nodemailer): приветственное письмо, подтверждение заявки, письмо администратору, уведомление о смене статуса.
- Админ-панель — список всех заявок и пользователей, смена статуса заявки с записью в историю и письмом клиенту.
- Валидация — все поля всех форм валидируются на backend (express-validator), а не только на фронте.
- Безопасность — см. раздел ниже.

## Безопасность

- **SQL-инъекции**: все запросы к БД параметризованы (`$1, $2…` через `pg`), нигде нет конкатенации строк в SQL.
- **XSS**: frontend выводит пользовательские данные через `textContent`/экранирование (`escapeHtml`), а не `innerHTML` с конкатенацией; backend ставит заголовки безопасности через `helmet`.
- **CSRF**: API полностью stateless — авторизация через `Authorization: Bearer <JWT>`, без auth-cookie, поэтому классический CSRF на эти эндпоинты не применим. Если в будущем перейдёте на httpOnly-cookie сессии, добавьте CSRF-токен дополнительно.
- **Brute-force**: отдельный rate-limit на `/api/auth/*` (20 запросов / 15 минут с одного IP), общий rate-limit на весь API.
- **Пароли**: bcrypt, 12 раундов, минимум 8 символов.
- **Файлы**: имя файла на диске генерируется случайно (UUID), оригинальное имя хранится только как метаданные — нельзя выполнить path traversal через имя файла; whitelist MIME-типов; лимит размера.
- **Авторизация на уровне данных**: пользователь видит и скачивает только свои заявки/файлы; админ-маршруты защищены отдельным middleware.

## Запуск локально

### 1. PostgreSQL
Установите PostgreSQL (или используйте Docker):
```bash
docker run --name dbex-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=dbex_customs -p 5432:5432 -d postgres:16
```

### 2. Backend
```bash
cd backend
cp .env.example .env
# отредактируйте .env: DATABASE_URL, JWT_SECRET, данные SMTP
npm install
npm run migrate     # создаст все таблицы
node src/createAdmin.js admin@dbexcustoms.eu "СложныйПароль123" "Admin"
npm start            # сервер поднимется на http://localhost:4000
```

### 3. Frontend
Frontend — статические файлы, backend им не отдаёт. Откройте `frontend/index.html` через любой статический сервер (не через `file://`, иначе fetch к API будет блокироваться браузером):
```bash
cd frontend
npx serve .          # либо python3 -m http.server 5500
```
По умолчанию frontend обращается к `http://localhost:4000/api`. Чтобы указать другой адрес backend в продакшене, добавьте перед подключением `js/api.js` в каждом HTML-файле:
```html
<script>window.DBEX_API_BASE = 'https://api.dbexcustoms.eu/api';</script>
<script src="js/api.js"></script>
```

## Деплой в продакшен

Это нужно сделать вам — потребуется ваш аккаунт и оплата хостинга:

1. **База данных**: создайте управляемый PostgreSQL — например, на Render, Railway, Supabase или DigitalOcean Managed Database. Получите `DATABASE_URL`.
2. **Backend**: задеплойте папку `backend/` на Render/Railway/VPS:
   - Build command: `npm install`
   - Start command: `npm run migrate && npm start`
   - Задайте все переменные из `.env.example` в панели хостинга.
3. **SMTP**: зарегистрируйте аккаунт у любого провайдера (Postmark, SendGrid, Mailgun, или SMTP-relay от Gmail Workspace), впишите `SMTP_HOST/PORT/USER/PASS` в переменные окружения backend.
4. **Frontend**: задеплойте папку `frontend/` как статический сайт (Cloudflare Pages, Netlify, Vercel static, или просто nginx на VPS). Пропишите `window.DBEX_API_BASE` на реальный адрес backend.
5. **Домен и HTTPS**: подключите домен к frontend и backend, включите HTTPS (на Render/Railway/Cloudflare Pages это делается автоматически).
6. **Файлы**: в этой версии файлы хранятся на диске backend-сервера (`UPLOAD_DIR`). Для продакшена с несколькими серверами или большим объёмом документов замените хранение на S3-совместимое хранилище (например, Cloudflare R2 или AWS S3) — это отдельная доработка `routes/applications.js`, дайте знать, если нужно её сделать.

## Производительность

- `compression` middleware сжимает ответы API.
- Frontend — чистый HTML/CSS/JS без сборки и тяжёлых фреймворков, минимальный вес страниц.
- Индексы в БД на `applications.user_id`, `applications.status`, `application_files.application_id`.
- Для продакшена дополнительно: отдавайте frontend через CDN (Cloudflare Pages/Netlify это делают по умолчанию).

## Что дальше можно нарастить

- Сброс пароля по email.
- S3-хранилище файлов вместо локального диска.
- Webhook/интеграция с реальной системой подачи деклараций в таможню конкретной страны.
- Платежи (Stripe) за подтверждённые заявки.
