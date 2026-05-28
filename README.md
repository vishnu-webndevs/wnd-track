# 📊 WND Tracker & Employee Management System

> A premium, decoupled desktop and web-based employee time tracking and management system designed for modern developers and teams.

---

## 👨‍💻 Developer
Developed with ❤️ by **[Vishnu](https://github.com/vishnu-webndevs)**

---

## 🏛️ System Architecture

This project is built on a high-performance **Decoupled Architecture**, splitting responsibilities perfectly between UI interactions and backend security:

```
                  ┌─────────────────────────────────────────┐
                  │                FRONTEND                 │
                  │        (React + Vite + Electron)        │
                  └────────────────────┬────────────────────┘
                                       │ (REST API & WebRTC)
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │                 BACKEND                 │
                  │           (Laravel API Engine)          │
                  └────────────────────┬────────────────────┘
                                       │ (Eloquent ORM)
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │                DATABASE                 │
                  │                 (MySQL)                 │
                  └─────────────────────────────────────────┘
```

1. **Frontend (`/frontend`)**: A gorgeous, interactive client running on **React**, compiled via **Vite**, and packed inside a desktop-native shell using **Electron**. It manages the local time-tracker widget, activity state, screenshots, and live WebRTC streaming.
2. **Backend (`/employee-management-system`)**: A robust, headless **Laravel** API server that manages all secure API endpoints, database connections, authentication, cron jobs, and communications like **Telegram log alerts**.
3. **Database (MySQL)**: Holds timesheets, credentials, system settings, and user mappings securely.

---

## ✨ Key Features

- ⏱️ **Advanced Tracker**: Start, pause, and stop timesheets. Allows dynamic project/task changes even when paused!
- 📝 **Smart Notes**: Optional notes on tracker startup that fallback to the active task title to save time and effort.
- 👁️ **WebRTC Live View**: Secure, high-speed live screen viewing that stops instantly without any memory leaks or infinite reconnect loops.
- 💬 **Telegram Logging Alerts**: Instant notifications sent to your Telegram channels/chats when tracking starts or stops, featuring administrative fallback database lookups.
- 📂 **Truncated Timesheet Logs**: Sleek logs showing 3-word truncated summaries with absolute hover cards displaying full details seamlessly.
- 📧 **Independent Notification Channels**: Zero connection failures. Telegram logging runs independently of local SMTP or mail service health.

---

## 🚀 Installation & Setup

### 1. Prerequisites
- **PHP >= 8.1** & **Composer**
- **Node.js >= 18** & **npm**
- **XAMPP / MySQL**

---

### 2. Backend Setup (`employee-management-system`)

1. Open your terminal in the backend folder:
   ```bash
   cd employee-management-system
   ```
2. Install dependencies:
   ```bash
   composer install
   ```
3. Configure your environment:
   - Copy `.env.example` to `.env`
   - Configure database credentials:
     ```env
     DB_DATABASE=wnd_tracker
     DB_USERNAME=root
     DB_PASSWORD=
     ```
   - Add your Telegram details:
     ```env
     TELEGRAM_BOT_TOKEN=your-telegram-bot-token
     TELEGRAM_CHAT_ID=default-group-chat-id-or-empty
     ```
4. Run migrations & seeders:
   ```bash
   php artisan migrate
   ```
5. Start the backend local development server:
   ```bash
   php artisan serve
   ```
   *The API will be available at `http://localhost:8000`.*

---

### 3. Frontend Setup (`frontend`)

1. Open your terminal in the frontend folder:
   ```bash
   cd ../frontend
   ```
2. Install Node modules:
   ```bash
   npm install
   ```
3. Configure the environment `.env`:
   ```env
   VITE_API_URL=http://localhost:8000/api
   ```
4. Start the frontend web dev server (Vite):
   ```bash
   npm run dev
   ```
5. Launch the Electron Desktop application:
   ```bash
   npm run electron:start
   ```

---

## 🛠️ Tech Stack & Technologies

- **Frontend**: React.js, TypeScript, Vite, TailwindCSS
- **Desktop Shell**: Electron.js (Native desktop capabilities)
- **Backend API**: Laravel (PHP Framework)
- **Database**: MySQL
- **Real-Time Communication**: WebRTC / WebSocket APIs
- **Log Notifications**: Telegram Bot API

---

*This project is crafted for absolute speed, sleek UI/UX, and robust performance.*
