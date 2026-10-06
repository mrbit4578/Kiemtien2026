import { Injectable, HttpException, HttpStatus } from '@nestjs/common'
import { fetchTimeout } from '../common/safe-fetch'
import { AiService } from './ai.service'

/**
 * TinyFishService — Search & Fetch API cho AI agent (không phải LLM chat).
 *
 * - Search: GET https://api.search.tinyfish.ai?query=..&limit=..[&location=..][&language=..]
 *   header X-API-Key → { query, results: [{position, site_name, title, snippet, url}], total_results }
 * - Fetch: POST https://api.fetch.tinyfish.ai { urls: [...], format: 'markdown' }
 *   → { results: [{url, final_url, title, text}], errors: [...] }
 *
 * Gói Search + Fetch miễn phí. Key của user được lưu mã hóa qua AI Pro
 * (provider 'tinyfish'), KHÔNG bao giờ log hay trả về client.
 */
export interface TinyFishSearchResult {
  title: string
  url: string
  snippet: string
  siteName: string
}

export interface TinyFishFetchResult {
  url: string
  title: string
  text: string
}

const SEARCH_URL = 'https://api.search.tinyfish.ai'
const FETCH_URL = 'https://api.fetch.tinyfish.ai'
const AGENT_RUN_URL = 'https://agent.tinyfish.ai/v1/automation/run'
const SEARCH_TIMEOUT_MS = 20_000
const FETCH_TIMEOUT_MS = 45_000
const AGENT_TIMEOUT_MS = 180_000
const MAX_SNIPPET_CHARS = 300
const MAX_FETCH_CHARS = 12_000
const MAX_AGENT_CHARS = 8_000

@Injectable()
export class TinyFishService {
  constructor(private readonly aiService: AiService) {}

  /**
   * Lấy API key TinyFish đã giải mã của workspace, hoặc null khi chưa kết nối.
   * Dùng cho tool agent — thiếu key thì tool tự fallback, không ném lỗi.
   */
  async getApiKey(workspaceId: string): Promise<string | null> {
    try {
      const { apiKey } = await this.aiService.getChatKey(workspaceId, 'tinyfish')
      return apiKey
    } catch {
      return null
    }
  }

  /** Che key nếu chẳng may lọt vào message lỗi. */
  private sanitize(message: string, apiKey: string): string {
    return message.split(apiKey).join('[redacted]')
  }

  private apiError(resStatus: number, body: string, apiKey: string, action: string): HttpException {
    const hint =
      resStatus === 401 || resStatus === 403
        ? 'Key TinyFish bị từ chối — hãy kiểm tra lại key ở Cài đặt → AI Pro.'
        : resStatus === 429
          ? 'TinyFish báo hết quota (gói mặc định giới hạn ~5 search/phút). Hãy thử lại sau ít phút.'
          : `TinyFish ${action} thất bại (HTTP ${resStatus}).`
    return new HttpException(
      `${hint} Chi tiết: ${this.sanitize(body.slice(0, 300), apiKey)}`,
      HttpStatus.BAD_GATEWAY,
    )
  }

  async search(
    apiKey: string,
    query: string,
    opts?: { limit?: number; location?: string; language?: string },
  ): Promise<{ results: TinyFishSearchResult[]; totalResults: number }> {
    const params = new URLSearchParams({
      query: query.slice(0, 300),
      limit: String(Math.min(Math.max(opts?.limit ?? 5, 1), 10)),
    })
    if (opts?.location) params.set('location', opts.location.slice(0, 8))
    if (opts?.language) params.set('language', opts.language.slice(0, 8))
    const res = await fetchTimeout(`${SEARCH_URL}?${params.toString()}`, {
      headers: { 'X-API-Key': apiKey },
    }, SEARCH_TIMEOUT_MS)
    const text = await res.text()
    if (!res.ok) throw this.apiError(res.status, text, apiKey, 'tìm kiếm')
    let data: {
      results?: Array<{ title?: string; url?: string; snippet?: string; site_name?: string }>
      total_results?: number
    }
    try {
      data = JSON.parse(text)
    } catch {
      throw new HttpException('TinyFish trả về không đúng định dạng.', HttpStatus.BAD_GATEWAY)
    }
    const results = (data.results ?? []).map((r) => ({
      title: (r.title ?? '').trim(),
      url: (r.url ?? '').trim(),
      snippet: (r.snippet ?? '').trim().slice(0, MAX_SNIPPET_CHARS),
      siteName: (r.site_name ?? '').trim(),
    })).filter((r) => r.title && r.url)
    return { results, totalResults: data.total_results ?? results.length }
  }

  async fetchUrls(apiKey: string, urls: string[]): Promise<TinyFishFetchResult[]> {
    const list = urls.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, 5)
    if (list.length === 0) return []
    const res = await fetchTimeout(
      FETCH_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ urls: list, format: 'markdown' }),
      },
      FETCH_TIMEOUT_MS,
    )
    const text = await res.text()
    if (!res.ok) throw this.apiError(res.status, text, apiKey, 'đọc trang')
    let data: {
      results?: Array<{ url?: string; final_url?: string; title?: string; text?: string }>
      errors?: Array<{ url?: string; message?: string }>
    }
    try {
      data = JSON.parse(text)
    } catch {
      throw new HttpException('TinyFish trả về không đúng định dạng.', HttpStatus.BAD_GATEWAY)
    }
    return (data.results ?? []).map((r) => ({
      url: (r.final_url || r.url || '').trim(),
      title: (r.title ?? '').trim(),
      text: (r.text ?? '').trim().slice(0, MAX_FETCH_CHARS),
    })).filter((r) => r.text)
  }

  /**
   * Web Agent (METERED — trừ tiền ví TinyFish): giao URL + mục tiêu tiếng Việt/Anh,
   * agent tự duyệt web nhiều bước trên trình duyệt thật rồi trả kết quả.
   * Dùng bản đồng bộ /run (blocking). Giới hạn bước/thời gian để kiểm soát chi phí.
   */
  async runAgent(
    apiKey: string,
    url: string,
    goal: string,
    opts?: { maxSteps?: number; maxDurationSeconds?: number },
  ): Promise<string> {
    const cleanUrl = url.trim()
    if (!/^https?:\/\//i.test(cleanUrl)) {
      throw new HttpException('URL web agent phải bắt đầu bằng http(s)://', HttpStatus.BAD_REQUEST)
    }
    const res = await fetchTimeout(
      AGENT_RUN_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({
          url: cleanUrl,
          goal: goal.trim().slice(0, 1000),
          agent_config: {
            max_steps: Math.min(Math.max(opts?.maxSteps ?? 15, 1), 30),
            max_duration_seconds: Math.min(Math.max(opts?.maxDurationSeconds ?? 120, 30), 300),
          },
        }),
      },
      AGENT_TIMEOUT_MS,
    )
    const text = await res.text()
    if (!res.ok) throw this.apiError(res.status, text, apiKey, 'chạy web agent')
    let data: { result?: unknown; status?: string; error?: unknown }
    try {
      data = JSON.parse(text)
    } catch {
      throw new HttpException('TinyFish trả về không đúng định dạng.', HttpStatus.BAD_GATEWAY)
    }
    if (data.error) {
      throw new HttpException(
        `Web agent báo lỗi: ${this.sanitize(JSON.stringify(data.error).slice(0, 300), apiKey)}`,
        HttpStatus.BAD_GATEWAY,
      )
    }
    // result: object JSON trực tiếp, hoặc text/list nằm trong result.result
    const payload = data.result ?? data
    let out: string
    if (typeof payload === 'string') out = payload
    else if (payload && typeof payload === 'object' && 'result' in (payload as Record<string, unknown>)) {
      const inner = (payload as Record<string, unknown>)['result']
      out = typeof inner === 'string' ? inner : JSON.stringify(inner)
    } else out = JSON.stringify(payload)
    out = out.trim().slice(0, MAX_AGENT_CHARS)
    if (!out) throw new HttpException('Web agent không trả về kết quả.', HttpStatus.BAD_GATEWAY)
    return out
  }
}
