'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Lock, Mail, User, Eye, EyeOff, UserPlus, Loader2, AlertCircle } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useSession } from '../../context/SessionContext'

export default function RegisterPage() {
  const router = useRouter()
  const { user, sessionLoading, refreshSession } = useSession()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Đã đăng nhập → về trang chính
  useEffect(() => {
    if (!sessionLoading && user) router.replace('/')
  }, [user, sessionLoading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email.trim()) {
      setError('Vui lòng nhập email.')
      return
    }
    if (password.length < 8) {
      setError('Mật khẩu phải có ít nhất 8 ký tự.')
      return
    }
    if (password !== confirm) {
      setError('Mật khẩu nhập lại không khớp.')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/auth/register', {
        email: email.trim(),
        password,
        ...(name.trim() ? { name: name.trim() } : {}),
      })
      await refreshSession()
      router.push('/')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Có lỗi xảy ra. Hãy thử lại.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md glass-panel rounded-3xl border border-white/10 p-8 space-y-6 shadow-2xl">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-brand-violet to-brand-cyan flex items-center justify-center shadow-glow-emerald">
            <UserPlus className="w-7 h-7 text-dark-950" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Tạo tài khoản</h1>
          <p className="text-sm text-slate-400">
            Miễn phí — workspace riêng và mã hóa đầu cuối cho mọi kết nối
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-1.5 block">
              Tên hiển thị <span className="text-slate-500 font-normal">(tùy chọn)</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tên của bạn"
                autoComplete="name"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-dark-950/70 border border-white/10 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-brand-violet/60 focus:ring-1 focus:ring-brand-violet/30"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ban@example.com"
                autoComplete="email"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-dark-950/70 border border-white/10 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-brand-violet/60 focus:ring-1 focus:ring-brand-violet/30"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 mb-1.5 block">
              Mật khẩu <span className="text-slate-500 font-normal">(tối thiểu 8 ký tự)</span>
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full pl-10 pr-11 py-3 rounded-xl bg-dark-950/70 border border-white/10 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-brand-violet/60 focus:ring-1 focus:ring-brand-violet/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Nhập lại mật khẩu</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-dark-950/70 border border-white/10 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-brand-violet/60 focus:ring-1 focus:ring-brand-violet/30"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-violet to-brand-cyan text-dark-950 font-bold text-sm flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-60 shadow-glow-emerald transition-all"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            <span>{submitting ? 'Đang tạo tài khoản…' : 'Đăng ký'}</span>
          </button>
        </form>

        <p className="text-center text-sm text-slate-400">
          Đã có tài khoản?{' '}
          <Link href="/login" className="text-brand-emerald font-bold hover:underline">
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  )
}
