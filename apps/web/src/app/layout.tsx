import type { Metadata } from 'next'
import './globals.css'
import { Navbar } from '../components/Navbar'
import { Footer } from '../components/Footer'
import { SessionProvider } from '../context/SessionContext'

export const metadata: Metadata = {
  title: 'OpenRemoteHub — Nền Tảng Kiếm Tiền Online Minh Bạch & AI Orchestration',
  description:
    'Quản lý công việc online, tích hợp tư duy RAG tốc độ cao, AI Copilot tự chủ (ReAct Agent) và Biểu đồ tri thức trực quan kế thừa từ WeKnora.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="dark">
      <body className="bg-dark-950 text-slate-100 min-h-screen flex flex-col tech-grid antialiased">
        <SessionProvider>
          <Navbar />
          <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </div>
          <Footer />
        </SessionProvider>
      </body>
    </html>
  )
}
