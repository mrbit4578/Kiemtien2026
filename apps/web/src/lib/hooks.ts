'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from './api'
import type {
  AnalyticsOverview,
  ApiConnection,
  ApiContentItem,
  PublishQueued,
  AiProviderMeta,
  AiConnectionInfo,
  ChatMessage,
  ChatResponse,
  AgentRunResponse,
  RagDocument,
  RagQueryBody,
  RagQueryResult,
} from './types'

function toMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Lỗi không xác định.'
}

/* ─── Analytics ─────────────────────────────────────────────── */

export function useAnalytics() {
  const [data, setData] = useState<AnalyticsOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await api.get<AnalyticsOverview>('/analytics/overview'))
    } catch (err) {
      // 401 đã được api.ts redirect về /settings/connections
      setError(toMessage(err))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}

/* ─── Connections ───────────────────────────────────────────── */

export function useConnections() {
  const [connections, setConnections] = useState<ApiConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unauthorized, setUnauthorized] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setConnections(await api.get<ApiConnection[]>('/connections'))
      setUnauthorized(false)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUnauthorized(true)
        setConnections([])
      } else {
        setError(toMessage(err))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  /** Rút quyền: revoke token ở provider + xóa token trong DB (API thật) */
  const revoke = useCallback(
    async (id: string) => {
      await api.post<{ revoked: boolean; id: string }>(`/connections/${id}/revoke`)
      await refresh()
    },
    [refresh],
  )

  /** Bắt đầu OAuth: chuyển trình duyệt sang backend, backend redirect tiếp sang provider */
  const connect = useCallback((provider: string) => {
    window.location.href = api.oauthStartUrl(provider)
  }, [])

  return { connections, loading, error, unauthorized, refresh, revoke, connect }
}

/* ─── Content ───────────────────────────────────────────────── */

export interface CreateContentInput {
  caption: string
  assetUrl?: string
  /** ISO datetime string */
  scheduledAt?: string
}

export function useContent() {
  const [items, setItems] = useState<ApiContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await api.get<ApiContentItem[]>('/content'))
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const create = useCallback(
    async (input: CreateContentInput) => {
      const item = await api.post<ApiContentItem>('/content', input)
      await refresh()
      return item
    },
    [refresh],
  )

  const approve = useCallback(
    async (id: string, approved: boolean, note?: string) => {
      await api.post<ApiContentItem>(`/content/${id}/approve`, { approved, note })
      await refresh()
    },
    [refresh],
  )

  /**
   * Đẩy vào queue publish. Backend kiểm tra: đã approve + connection active +
   * consent hợp lệ, rồi tạo Job idempotent (worker BullMQ xử lý tiếp).
   */
  const publish = useCallback(
    async (id: string, connectionId: string) => {
      const res = await api.post<PublishQueued>(`/content/${id}/publish`, {
        connectionId,
      })
      await refresh()
      return res
    },
    [refresh],
  )

  /**
   * Cập nhật content: lịch đăng, link ảnh-video và/hoặc nội dung caption.
   * scheduledAt = null → xóa lịch (đăng ngay); assetUrl = null → xóa media.
   * caption = nội dung mới (backend trim + từ chối chuỗi rỗng).
   * Backend đồng bộ nextRunAt của job đang pending.
   */
  const updateContent = useCallback(
    async (id: string, input: { scheduledAt?: string | null; assetUrl?: string | null; caption?: string }) => {
      await api.patch<ApiContentItem>(`/content/${id}`, input)
      await refresh()
    },
    [refresh],
  )

  /** Thử lại job publish đã thất bại (giữ idempotency key, chạy ngay). */
  const retryPublish = useCallback(
    async (id: string, connectionId: string) => {
      const res = await api.post<PublishQueued>(`/content/${id}/retry-publish`, {
        connectionId,
      })
      await refresh()
      return res
    },
    [refresh],
  )

  /**
   * Upload một hoặc nhiều ảnh từ máy lên host (imgbb) → trả về danh sách
   * direct URL để gắn assetUrl (nhiều ảnh → Instagram đăng carousel).
   * Backend trả 503 nếu chưa cấu hình IMGBB_API_KEY.
   */
  const uploadImages = useCallback(async (files: File[]) => {
    const form = new FormData()
    for (const f of files) form.append('files', f)
    const res = await api.uploadFile<{ urls: string[] }>('/content/upload-image', form)
    return res.urls
  }, [])

  /**
   * Upload một hoặc vài video từ máy lên host (Cloudinary) → trả về danh sách
   * direct URL để gắn assetUrl (1 video → Instagram đăng Reels).
   * Backend trả 503 nếu chưa cấu hình CLOUDINARY_*.
   */
  const uploadVideos = useCallback(async (files: File[]) => {
    const form = new FormData()
    for (const f of files) form.append('files', f)
    const res = await api.uploadFile<{ urls: string[] }>('/content/upload-video', form)
    return res.urls
  }, [])

  /** Xóa 1 bài viết (kèm job publish liên quan). Backend từ chối nếu job đang running. */
  const removeContent = useCallback(
    async (id: string) => {
      await api.del<{ deleted: boolean }>(`/content/${id}`)
      await refresh()
    },
    [refresh],
  )

  /** Xóa nhiều bài viết (gọi tuần tự để backend xử lý từng cái + audit đầy đủ). */
  const removeMany = useCallback(
    async (ids: string[]) => {
      const failed: string[] = []
      for (const id of ids) {
        try {
          await api.del<{ deleted: boolean }>(`/content/${id}`)
        } catch {
          failed.push(id)
        }
      }
      await refresh()
      if (failed.length > 0) {
        throw new Error(`Xóa thất bại ${failed.length}/${ids.length} bài.`)
      }
    },
    [refresh],
  )

  return { items, loading, error, refresh, create, approve, publish, updateContent, retryPublish, uploadImages, uploadVideos, removeContent, removeMany }
}

/* ─── AI Pro ─────────────────────────────────────────────────────────────── */

export function useAiProviders() {
  const [providers, setProviders] = useState<AiProviderMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setProviders(await api.get<AiProviderMeta[]>('/ai/providers'))
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { providers, loading, error, refresh }
}

export function useAiConnections() {
  const [connections, setConnections] = useState<AiConnectionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setConnections(await api.get<AiConnectionInfo[]>('/ai/connections'))
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  /** Validate key ở backend rồi mã hóa & lưu. Ném ApiError với message thân thiện. */
  const connect = useCallback(
    async (provider: string, apiKey: string) => {
      const res = await api.post<AiConnectionInfo>('/ai/connections', { provider, apiKey })
      await refresh()
      return res
    },
    [refresh],
  )

  const remove = useCallback(
    async (provider: string) => {
      await api.del(`/ai/connections/${provider}`)
      await refresh()
    },
    [refresh],
  )

  return { connections, loading, error, refresh, connect, remove }
}

/** Gửi chat tới provider đã kết nối. */
export async function sendAiChat(
  provider: string,
  messages: ChatMessage[],
  model?: string,
): Promise<ChatResponse> {
  // Chỉ gửi role+content: các meta UI (agentMeta/ragMeta) khiến provider
  // validate schema strict (ExperientialLabs) báo lỗi "property ... should not exist".
  const clean = messages.map((m) => ({ role: m.role, content: m.content }))
  return api.post<ChatResponse>('/ai/chat', { provider, messages: clean, model })
}

/** Chạy agent think→act→observe qua provider đã kết nối. */
export async function sendAgentRun(
  provider: string,
  messages: ChatMessage[],
  model?: string,
  opts?: { maxTurns?: number; tools?: string[]; maxTokens?: number },
): Promise<AgentRunResponse> {
  // Chỉ gửi role+content — xem chú thích ở sendAiChat.
  const clean = messages.map((m) => ({ role: m.role, content: m.content }))
  return api.post<AgentRunResponse>('/ai/agent/run', { provider, messages: clean, model, ...opts })
}

/* ─── RAG / Kho tri thức ───────────────────────────────────────────── */

export function useRagDocuments() {
  const [documents, setDocuments] = useState<RagDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setDocuments(await api.get<RagDocument[]>('/rag/documents'))
    } catch (err) {
      // 401 đã được api.ts redirect về /login
      setError(toMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { documents, loading, error, refresh }
}

export type RagUploadInput =
  | { file: File }
  | { text: string; title: string }
  | { url: string; title?: string }

/** Tải tài liệu lên kho tri thức. File → multipart, còn lại → JSON. */
export async function uploadRagDocument(input: RagUploadInput): Promise<RagDocument> {
  if ('file' in input) {
    const form = new FormData()
    form.append('file', input.file)
    return api.uploadFile<RagDocument>('/rag/documents', form)
  }
  return api.post<RagDocument>('/rag/documents', input)
}

/** Xóa tài liệu khỏi kho tri thức. */
export async function deleteRagDocument(id: string): Promise<{ ok: boolean }> {
  return api.del<{ ok: boolean }>(`/rag/documents/${id}`)
}

/** Hỏi đáp trên kho tri thức với 1 trong 5 kiến trúc RAG. */
export async function queryRag(body: RagQueryBody): Promise<RagQueryResult> {
  return api.post<RagQueryResult>('/rag/query', body)
}
