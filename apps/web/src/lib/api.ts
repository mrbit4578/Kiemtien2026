/**
 * API client cho backend NestJS thật.
 * - Base URL lấy từ NEXT_PUBLIC_API_URL (mặc định http://localhost:4000)
 * - Dùng `credentials: 'include'` để gửi session cookie (HttpOnly) của backend
 * - 401 → đưa user về /login (route guard). Không redirect khi đang ở
 *   /login hoặc /register để form hiển thị được lỗi đăng nhập.
 */

/** Base URL của API. Đổi qua biến môi trường NEXT_PUBLIC_API_URL khi deploy. */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export class ApiError extends Error {
  /** HTTP status; 0 = không kết nối được tới server (network error) */
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function parseJsonSafe(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

async function request<T>(
  path: string,
  method: HttpMethod = 'GET',
  body?: unknown,
  /** true → body là FormData, không set Content-Type để browser tự thêm boundary */
  asForm?: boolean,
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      // Quan trọng: gửi session cookie để backend nhận diện workspace
      credentials: 'include',
      headers: asForm ? undefined : { 'Content-Type': 'application/json' },
      body:
        body !== undefined
          ? asForm
            ? (body as BodyInit)
            : JSON.stringify(body)
          : undefined,
    })
  } catch {
    throw new ApiError(
      0,
      'Không kết nối được tới API. Kiểm tra backend có đang chạy và NEXT_PUBLIC_API_URL.',
    )
  }

  if (res.status === 401) {
    // Chưa đăng nhập / phiên hết hạn → route guard về /login.
    // Không redirect khi đang ở /login hoặc /register để form hiện được lỗi,
    // và không redirect vòng lặp.
    if (typeof window !== 'undefined') {
      const path = window.location.pathname
      const onAuthPage = path.startsWith('/login') || path.startsWith('/register')
      if (!onAuthPage) {
        window.location.href = '/login'
      }
    }
    throw new ApiError(401, 'Phiên làm việc hết hạn. Hãy đăng nhập lại.')
  }

  const text = await res.text()
  const data = text ? parseJsonSafe(text) : null

  if (!res.ok) {
    const raw = (data && (data.message ?? data.error)) || `API lỗi ${res.status}`
    const message = Array.isArray(raw) ? raw.join(', ') : String(raw)
    throw new ApiError(res.status, message)
  }

  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path, 'GET'),
  post: <T>(path: string, body?: unknown) => request<T>(path, 'POST', body),
  put: <T>(path: string, body?: unknown) => request<T>(path, 'PUT', body),
  patch: <T>(path: string, body?: unknown) => request<T>(path, 'PATCH', body),
  del: <T>(path: string) => request<T>(path, 'DELETE'),

  /**
   * Upload multipart FormData (ví dụ file tài liệu RAG). Dùng fetch trực tiếp
   * với credentials include, không set Content-Type — browser tự thêm boundary.
   */
  uploadFile: <T>(path: string, formData: FormData) =>
    request<T>(path, 'POST', formData, true),

  /**
   * URL bắt đầu OAuth cho 1 provider.
   * Backend redirect thẳng sang trang authorize của provider (không trả JSON).
   * Dùng bằng cách gán window.location.href = api.oauthStartUrl('google').
   */
  oauthStartUrl: (provider: string) => `${API_BASE_URL}/auth/${provider}/start`,
}
