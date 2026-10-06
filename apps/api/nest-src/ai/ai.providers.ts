/**
 * Metadata các nền tảng AI được hỗ trợ cho chế độ "AI Pro".
 * - `keyUrl`: link chính thức để user tự tạo API key (key của user, không phải của hệ thống).
 * - `baseUrl` + `kind`: dùng NỘI BỘ ở service để validate key và gọi chat — không expose qua API.
 */
export type AiProviderId =
  | 'gemini'
  | 'openai'
  | 'xai'
  | 'anthropic'
  | 'deepseek'
  | 'experientiallabs'
  | 'apmix'
  | 'muse'
  | 'groq'
  | 'moonshot'
  | 'tinyfish'

type ProviderKind = 'gemini' | 'openai-compatible' | 'anthropic' | 'tinyfish'

export interface AiProviderMeta {
  id: AiProviderId
  /** Tên hiển thị */
  name: string
  /** Link chính thức để lấy API key */
  keyUrl: string
  /** Models gợi ý */
  models: string[]
  defaultModel: string
  description: string
  /** Ghi chú ngắn về key (VD: "Key miễn phí") — hiển thị ở UI, không secret */
  keyNote?: string
  /** @internal — chỉ dùng ở service */
  baseUrl: string
  /** @internal — chỉ dùng ở service */
  kind: ProviderKind
}

export const SUPPORTED_PROVIDERS: AiProviderMeta[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    models: ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-pro-preview'],
    defaultModel: 'gemini-3.6-flash',
    description: 'Miễn phí hào phóng, tốc độ nhanh, tốt cho tác vụ hàng ngày.',
    keyNote: 'Key miễn phí',
    baseUrl: 'https://generativelanguage.googleapis.com',
    kind: 'gemini',
  },
  {
    id: 'openai',
    name: 'ChatGPT (OpenAI)',
    keyUrl: 'https://platform.openai.com/api-keys',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
    defaultModel: 'gpt-4o-mini',
    description: 'Chất lượng cao, hệ sinh thái lớn, nhiều model lựa chọn.',
    baseUrl: 'https://api.openai.com/v1',
    kind: 'openai-compatible',
  },
  {
    id: 'xai',
    name: 'Grok (xAI)',
    keyUrl: 'https://console.x.ai',
    models: ['grok-3-mini', 'grok-3', 'grok-4'],
    defaultModel: 'grok-3-mini',
    description: 'Cập nhật kiến thức nhanh, phong cách trả lời thẳng thắn.',
    keyNote: 'Cần tài khoản có thanh toán',
    baseUrl: 'https://api.x.ai/v1',
    kind: 'openai-compatible',
  },
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    keyUrl: 'https://console.anthropic.com',
    models: ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-1'],
    defaultModel: 'claude-haiku-4-5',
    description: 'Viết lách và lập luận xuất sắc, context dài.',
    baseUrl: 'https://api.anthropic.com',
    kind: 'anthropic',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    keyUrl: 'https://platform.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    description: 'Chi phí thấp, mạnh về code và toán.',
    baseUrl: 'https://api.deepseek.com/v1',
    kind: 'openai-compatible',
  },
  {
    id: 'experientiallabs',
    name: 'ExperientialLabs',
    keyUrl: 'https://platform.experientiallabs.ai/models/grok-4.7',
    models: ['gpt-5.6-luna', 'deepseek-v4-flash', 'deepseek-v4.1-flash', 'grok-4.7'],
    defaultModel: 'gpt-5.6-luna',
    description:
      'gpt-5.6-luna FREE (test chạy tốt trên key của bạn). Grok 4.7 cần mua credits mới mở khóa.',
    baseUrl: 'https://api.experientiallabs.ai/v1',
    kind: 'openai-compatible',
  },
  {
    id: 'apmix',
    name: 'Apmix',
    keyUrl: 'https://apmix.ai/dashboard',
    models: ['deepseek/deepseek-v4-flash-free', 'openai/gpt-6-luna-free'],
    defaultModel: 'deepseek/deepseek-v4-flash-free',
    description:
      'Miễn phí — model DeepSeek free + GPT free qua Apmix (ID dạng hãng/tên-model), nhập key là chạy ngay.',
    keyNote: 'Có gói miễn phí',
    baseUrl: 'https://api.apmix.ai/v1',
    kind: 'openai-compatible',
  },
  {
    id: 'muse',
    name: 'Muse (Meta)',
    keyUrl: 'https://dev.meta.ai',
    models: ['muse-spark-1.3', 'muse-spark-1.2', 'muse-spark-1.1'],
    defaultModel: 'muse-spark-1.3',
    description:
      'Model dòng Muse của Meta qua Model API (chuẩn OpenAI). Tạo key tại dev.meta.ai → API keys.',
    baseUrl: 'https://api.meta.ai/v1',
    kind: 'openai-compatible',
  },
  {
    id: 'groq',
    name: 'Groq',
    keyUrl: 'https://console.groq.com/keys',
    models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile'],
    defaultModel: 'openai/gpt-oss-120b',
    description:
      'Inference siêu nhanh trên chip LPU, có key miễn phí. Chuẩn OpenAI.',
    keyNote: 'Key miễn phí',
    baseUrl: 'https://api.groq.com/openai/v1',
    kind: 'openai-compatible',
  },
  {
    id: 'moonshot',
    name: 'Kimi (Moonshot AI)',
    keyUrl: 'https://platform.moonshot.ai/console/api-keys',
    models: ['kimi-k3', 'kimi-k2.5', 'moonshot-v1-8k'],
    defaultModel: 'kimi-k3',
    description: 'Dòng model Kimi của Moonshot AI, mạnh tiếng Trung/Anh, context dài.',
    baseUrl: 'https://api.moonshot.ai/v1',
    kind: 'openai-compatible',
  },
  {
    id: 'tinyfish',
    name: 'TinyFish',
    keyUrl: 'https://agent.tinyfish.ai/api-keys',
    models: [],
    defaultModel: '',
    description:
      'Search & Fetch API cho AI agent (không phải model chat): cấp nguồn tìm kiếm web có cấu trúc cho tool web_search/fetch_url của AI Copilot. Gói Search + Fetch miễn phí.',
    keyNote: 'Search + Fetch miễn phí',
    baseUrl: '',
    kind: 'tinyfish',
  },
]

export function getProviderMeta(id: string): AiProviderMeta | undefined {
  return SUPPORTED_PROVIDERS.find((p) => p.id === id)
}

/** Metadata public trả về cho frontend — KHÔNG chứa baseUrl/kind nội bộ. */
export function publicProviderMeta() {
  return SUPPORTED_PROVIDERS.map(
    ({ id, name, keyUrl, models, defaultModel, description, keyNote, kind }) => ({
      id,
      name,
      keyUrl,
      models,
      defaultModel,
      description,
      ...(keyNote ? { keyNote } : {}),
      // TinyFish là Search/Fetch API, không phải model chat → frontend ẩn khỏi
      // các ô chọn provider chat (AI Chat, Copilot, Studio).
      supportsChat: kind !== 'tinyfish',
    }),
  )
}
