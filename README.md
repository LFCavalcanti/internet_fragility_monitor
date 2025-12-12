# 🌐 Internet Fragility Monitor

![License](https://img.shields.io/badge/license-MIT-blue)

**Internet Fragility Monitor** is a tool designed to provide a simple, independent way to monitor the various important service providers used for web applications.

### Core Framework & UI

- ![Next.js](https://img.shields.io/badge/Next.js-v16.0.10-000000?style=flat&logo=next.js&logoColor=white)
- ![React](https://img.shields.io/badge/React-v19.2.3-61DAFB?style=flat&logo=react&logoColor=black)
- ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.1.18-38B2AC?style=flat&logo=tailwind-css&logoColor=white)
- ![Lucide React](https://img.shields.io/badge/Lucide_React-v0.556.0-F56565?style=flat&logo=lucide&logoColor=white)

### Backend & Database

- ![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-v0.45.1-C5F74F?style=flat&logo=drizzle&logoColor=black)
- ![Better SQLite3](https://img.shields.io/badge/Better_SQLite3-v12.5.0-003B57?style=flat&logo=sqlite&logoColor=white)
- ![Node Cron](https://img.shields.io/badge/Node_Cron-v4.2.1-339933?style=flat&logo=node.js&logoColor=white)

### Utilities & Testing

- ![TypeScript](https://img.shields.io/badge/TypeScript-v5.4.3-3178C6?style=flat&logo=typescript&logoColor=white)
- ![Vitest](https://img.shields.io/badge/Vitest-v4.0.15-729B1B?style=flat&logo=vitest&logoColor=white)
- ![Zod](https://img.shields.io/badge/Zod-v4.1.13-3E67B1?style=flat&logo=zod&logoColor=white)
- ![Date-fns](https://img.shields.io/badge/Date--fns-v4.1.0-770C56?style=flat&logo=date-fns&logoColor=white)

## ✨ Features

- **🔍 Independent Monitoring**: Perform autonomous checks on service providers.
- **⏱️ Scheduled Jobs**: Automated background monitoring tasks powered by cron jobs.
- **🛡️ Type-Safe**: Built with TypeScript and Zod for robust data handling.

## 🚀 Getting Started

Follow these steps to set up the project locally.

### 1. Installation

Clone the repository and install the dependencies:

```bash
git clone https://github.com/LFCavalcanti/internet_fragility_monitor.git
cd internet_fragility_monitor
npm install
```

### 2. Database Setup

Initialize the SQLite database using Drizzle Kit:

```bash
npm run db:push
```

### 3. Running the App

Start the development server:

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the application.

## 📜 Available Scripts

| Command             | Description                                   |
| :------------------ | :-------------------------------------------- |
| `npm run dev`       | Runs the app in development mode.             |
| `npm run build`     | Builds the app for production.                |
| `npm start`         | Starts the production server.                 |
| `npm run db:studio` | Opens Drizzle Studio to explore the database. |
| `npm test`          | Runs unit tests with Vitest.                  |
| `npm run lint`      | Lints the codebase using ESLint.              |

---

_Generated for Internet Fragility Monitor_
