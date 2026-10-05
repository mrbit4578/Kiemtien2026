'use client'

import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  Zap,
  Sparkles,
  Image as ImageIcon,
  Mic,
  Film,
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clapperboard,
} from 'lucide-react'
import { api, ApiError, API_BASE_URL } from '../../lib/api'
import { composeVideo } from '../../lib/video-compositor'

/* ─── Types ─── */

type Capability = 'chat' | 'image' | 'voice' | 'video'

interface ProviderInfo {
  id: string
  name: string
  connected: boolean
  keyHint: string | null
  capabilities: Array<Capability>
}

interface GenScene {
  text: string
  imagePrompt: string
  camera: string
  seconds: number
  imageDataUrl: string | null
  imageLoading: boolean
  imageProvider: string | null
  audioUrl: string | null
  voiceLoading: boolean
  voiceProvider: string | null
  srt: string | null
  clipUrl: string | null
  clipJobId: string | null
  clipStatus: string | null
  clipLoading: boolean
}

const inputCls =
  'w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-700 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-brand-emerald/60'
const labelCls = 'block text-xs font-semibold text-slate-400 mb-1.5'
const btnPrimary =
  'px-4 py-2 rounded-xl bg-gradient-to-r from-brand-emerald to-brand-cyan text-dark-950 font-bold text-xs flex items-center gap-2 hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed'
const btnGhost =
  'px-4 py-2 rounded-xl border border-dark-700 text-slate-300 text-xs font-semibold hover:border-brand-emerald/50 hover:text-white transition-all disabled:opacity-50'

function toMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Lỗi không xác định.'
}

function dataUrl(mime: string, b64: string): string {
  return `data:${mime};base64,${b64}`
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/* ─── Component chính ─── */

export function VideoGenStudio({
  onBack,
  onCreatedProject,
  initialProvider,
  projectId,
  backLabel,
  initialTopic,
  initialTitle,
  sourceScript,
}: {
  onBack: () => void
  onCreatedProject?: (id: string) => void
  /** Provider được mapping từ Knowledge Graph → Copilot (qua URL ?provider=) */
  initialProvider?: string | null
  /** Dự án đã tạo bởi auto-build (từ Copilot) — nút pipeline sẽ mở nó thay vì tạo mới */
  projectId?: string | null
  /** Nhãn nút quay lại (mặc định "Về danh sách dự án") */
  backLabel?: string
  /** Prefill chủ đề / tiêu đề từ dự án Video Faceless */
  initialTopic?: string
  initialTitle?: string
  /** Kịch bản nguồn từ pipeline (đã duyệt) — mapping qua để AI bám sát viết scene */
  sourceScript?: string
}) {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  // Key cho từng bước — tick chọn riêng, không mặc định cứng Gemini nữa.
  // chat: provider từ URL (Knowledge Graph) → key đã chọn lần trước → auto
  const [chatProvider, setChatProvider] = useState(() => {
    if (initialProvider) return initialProvider
    try {
      return localStorage.getItem('videogen-provider') || 'auto'
    } catch {
      return 'auto'
    }
  })
  const [imageProvider, setImageProvider] = useState(() => {
    try {
      return localStorage.getItem('videogen-provider-image') || 'auto'
    } catch {
      return 'auto'
    }
  })
  const [voiceProvider, setVoiceProvider] = useState(() => {
    try {
      return localStorage.getItem('videogen-provider-voice') || 'auto'
    } catch {
      return 'auto'
    }
  })
  const [clipProvider, setClipProvider] = useState(() => {
    try {
      return localStorage.getItem('videogen-provider-clip') || 'auto'
    } catch {
      return 'auto'
    }
  })
  // Nhớ key đã chọn cho lần sau
  useEffect(() => {
    try {
      localStorage.setItem('videogen-provider', chatProvider)
      localStorage.setItem('videogen-provider-image', imageProvider)
      localStorage.setItem('videogen-provider-voice', voiceProvider)
      localStorage.setItem('videogen-provider-clip', clipProvider)
    } catch {
      /* bỏ qua */
    }
  }, [chatProvider, imageProvider, voiceProvider, clipProvider])

  // Provider đã chọn nhưng không còn kết nối / không đủ capability → rớt về auto
  const capOk = (id: string, cap: Capability) =>
    id === 'auto' || providers.some((p) => p.connected && p.id === id && p.capabilities.includes(cap))
  useEffect(() => {
    if (providers.length === 0) return
    if (!capOk(chatProvider, 'chat')) setChatProvider('auto')
    if (!capOk(imageProvider, 'image')) setImageProvider('auto')
    if (!capOk(voiceProvider, 'voice')) setVoiceProvider('auto')
    if (!capOk(clipProvider, 'video')) setClipProvider('auto')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers])

  /** Giá trị gửi lên API: 'auto' → undefined (backend tự chọn/fallback) */
  const provParam = (id: string) => (id === 'auto' ? undefined : id)

  const [topic, setTopic] = useState(initialTopic || '')
  const [duration, setDuration] = useState(45)
  const [scriptLoading, setScriptLoading] = useState(false)
  const [title, setTitle] = useState(initialTitle || '')
  const [scenes, setScenes] = useState<GenScene[]>([])

  const [voiceName, setVoiceName] = useState('')
  const [voiceLang, setVoiceLang] = useState('vi-VN')
  const [allVoiceLoading, setAllVoiceLoading] = useState(false)
  const [allImageLoading, setAllImageLoading] = useState(false)

  // Workflow templates (giọng đọc)
  const [tplOpen, setTplOpen] = useState(true)
  const [tplText, setTplText] = useState('')
  const [tplProvider, setTplProvider] = useState('edge')
  const [tplVoice, setTplVoice] = useState('')
  const [tplLoading, setTplLoading] = useState(false)
  const [tplResult, setTplResult] = useState<{
    audioUrl: string
    mime: string
    srt: string
    durationSec: number
  } | null>(null)

  const [composing, setComposing] = useState(false)
  const [composeLabel, setComposeLabel] = useState('')
  const [composeProgress, setComposeProgress] = useState(0)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [resultMime, setResultMime] = useState('video/webm')
  const [resultDuration, setResultDuration] = useState(0)

  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | ''; msg: string }>({
    kind: '',
    msg: '',
  })

  useEffect(() => {
    api
      .get<ProviderInfo[]>('/videogen/providers')
      .then(setProviders)
      .catch((err) => setStatus({ kind: 'err', msg: toMessage(err) }))
  }, [])

  const say = (kind: 'ok' | 'err' | '', msg: string) => setStatus({ kind, msg })

  const providerOptions = (cap: 'chat' | 'image' | 'voice' | 'video') => (
    <>
      <option value="auto">
        {cap === 'voice' ? 'Tự động (Gemini → OpenAI → Edge)' : 'Tự động (Gemini → OpenAI)'}
      </option>
      {providers
        .filter((p) => p.connected && p.capabilities.includes(cap))
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} {p.keyHint ?? ''}
          </option>
        ))}
    </>
  )

  const updateScene = (i: number, patch: Partial<GenScene>) =>
    setScenes((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)))

  /* ─── Bước 1: viết kịch bản ─── */
  const genScript = async () => {
    if (!topic.trim()) {
      say('err', 'Nhập chủ đề video trước.')
      return
    }
    setScriptLoading(true)
    say('', '')
    try {
      const res = await api.post<{
        provider: string
        model: string
        title: string
        scenes: Array<{ text: string; imagePrompt: string; camera: string; seconds: number }>
      }>('/videogen/script', {
        topic: topic.trim(),
        duration,
        provider: provParam(chatProvider),
        sourceScript: sourceScript?.trim() || undefined,
      })
      setTitle(res.title)
      setScenes(
        res.scenes.map((s) => ({
          text: s.text,
          imagePrompt: s.imagePrompt,
          camera: s.camera,
          seconds: s.seconds,
          imageDataUrl: null,
          imageLoading: false,
          imageProvider: null,
          audioUrl: null,
          voiceLoading: false,
          voiceProvider: null,
          srt: null,
          clipUrl: null,
          clipJobId: null,
          clipStatus: null,
          clipLoading: false,
        })),
      )
      say('ok', `Đã viết kịch bản ${res.scenes.length} scene bằng ${res.provider} (${res.model}). Sửa trực tiếp nếu cần rồi sinh ảnh.`)
    } catch (err) {
      say('err', toMessage(err))
    } finally {
      setScriptLoading(false)
    }
  }

  /* ─── Bước 2: sinh ảnh ─── */
  const genImage = async (i: number) => {
    const sc = scenes[i]
    if (!sc.imagePrompt.trim()) {
      say('err', `Scene ${i + 1} chưa có prompt ảnh.`)
      return
    }
    updateScene(i, { imageLoading: true })
    try {
      const res = await api.post<{ provider: string; model: string; url: string; mime: string }>(
        '/videogen/image',
        {
          prompt: sc.imagePrompt,
          aspectRatio: '9:16',
          provider: provParam(imageProvider),
        },
      )
      updateScene(i, { imageDataUrl: res.url, imageLoading: false, imageProvider: res.provider })
    } catch (err) {
      updateScene(i, { imageLoading: false })
      say('err', `Scene ${i + 1}: ${toMessage(err)}`)
    }
  }

  const genAllImages = async () => {
    if (!scenes.length) return
    setAllImageLoading(true)
    for (let i = 0; i < scenes.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await genImage(i)
    }
    setAllImageLoading(false)
    say('ok', 'Đã sinh ảnh cho toàn bộ scene.')
  }

  /* ─── Bước 3: giọng đọc ─── */
  const genVoiceOne = async (i: number): Promise<boolean> => {
    const sc = scenes[i]
    if (!sc.text.trim()) return false
    updateScene(i, { voiceLoading: true })
    try {
      const res = await api.post<{
        provider: string
        model: string
        audioBase64: string
        mime: string
      }>('/videogen/voice', {
        text: sc.text,
        language: voiceLang,
        voice: voiceName.trim() || undefined,
        provider: provParam(voiceProvider),
      })
      updateScene(i, { audioUrl: dataUrl(res.mime, res.audioBase64), voiceLoading: false, voiceProvider: res.provider })
      return true
    } catch (err) {
      updateScene(i, { voiceLoading: false })
      say('err', `Giọng scene ${i + 1}: ${toMessage(err)}`)
      return false
    }
  }

  const genAllVoices = async () => {
    if (!scenes.length) return
    setAllVoiceLoading(true)
    say('', '')
    try {
      const res = await api.post<{
        provider: string
        segments: Array<{ id: string; audioBase64: string; mime: string; durationSec: number; srt: string }>
      }>('/videogen/voice-batch', {
        segments: scenes.map((s, i) => ({ id: String(i), text: s.text })),
        voice: voiceName.trim() || undefined,
        language: voiceLang,
        provider: provParam(voiceProvider),
        concurrency: 8,
      })
      const byId = new Map(res.segments.map((sg) => [sg.id, sg]))
      setScenes((prev) =>
        prev.map((s, i) => {
          const sg = byId.get(String(i))
          if (!sg) return s
          return {
            ...s,
            audioUrl: dataUrl(sg.mime, sg.audioBase64),
            srt: sg.srt,
            voiceLoading: false,
            voiceProvider: res.provider,
          }
        }),
      )
      say('ok', `Đã sinh giọng đọc cho ${res.segments.length}/${scenes.length} scene (chạy song song, via ${res.provider}).`)
    } catch (err) {
      say('', 'Batch lỗi, đang thử lại từng scene…')
      let ok = 0
      for (let i = 0; i < scenes.length; i++) {
        // eslint-disable-next-line no-await-in-loop
        if (await genVoiceOne(i)) ok++
      }
      say(ok ? 'ok' : 'err', ok ? `Đã sinh giọng đọc cho ${ok}/${scenes.length} scene (chế độ từng scene).` : toMessage(err))
    } finally {
      setAllVoiceLoading(false)
    }
  }

  /* ─── Workflow template: text dài → voice + SRT (không qua Bước 1–3) ─── */
  const tplGen = async () => {
    if (!tplText.trim()) {
      say('err', 'Dán đoạn text dài cần đọc trước.')
      return
    }
    setTplLoading(true)
    say('', '')
    try {
      const res = await api.post<{
        provider: string
        segments: Array<{ id: string; audioBase64: string; mime: string; durationSec: number; srt: string }>
      }>('/videogen/voice-batch', {
        segments: [{ id: '0', text: tplText.trim() }],
        voice: tplVoice.trim() || undefined,
        language: 'vi-VN',
        provider: provParam(tplProvider),
        concurrency: 8,
      })
      const sg = res.segments[0]
      if (!sg) throw new Error('Không nhận được audio từ server.')
      setTplResult({
        audioUrl: dataUrl(sg.mime, sg.audioBase64),
        mime: sg.mime,
        srt: sg.srt,
        durationSec: sg.durationSec,
      })
      say('ok', `Đã tạo voiceover (${Math.round(sg.durationSec)}s, via ${res.provider}).`)
    } catch (err) {
      say('err', toMessage(err))
    } finally {
      setTplLoading(false)
    }
  }

  /* ─── Bước 4 (tuỳ chọn): clip AI ─── */
  const genClip = async (i: number) => {
    const sc = scenes[i]
    updateScene(i, { clipLoading: true, clipStatus: 'Đang khởi tạo job…' })
    try {
      const start = await api.post<{ jobId: string; provider: string; model: string }>(
        '/videogen/clip',
        {
          prompt: `${sc.imagePrompt}. Camera: ${sc.camera}. Cinematic, smooth motion, no captions.`,
          imageDataUrl: sc.imageDataUrl ?? undefined,
          seconds: Math.min(8, Math.max(4, sc.seconds)),
          aspectRatio: '9:16',
          provider: provParam(clipProvider),
        },
      )
      updateScene(i, { clipJobId: start.jobId })
      // Poll tiến độ
      for (let t = 0; t < 150; t++) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 5000))
        // eslint-disable-next-line no-await-in-loop
        const st = await api.get<{
          status: string
          progress: string
          error: string | null
        }>(`/videogen/clip/${start.jobId}`)
        updateScene(i, { clipStatus: st.progress })
        if (st.status === 'done') break
        if (st.status === 'failed') throw new Error(st.error || 'Sinh clip thất bại.')
      }
      // Tải clip về blob URL (kèm session cookie)
      const dl = await fetch(`${API_BASE_URL}/videogen/clip/${start.jobId}/download`, {
        credentials: 'include',
      })
      if (!dl.ok) throw new Error('Không tải được clip đã render.')
      const blobUrl = URL.createObjectURL(await dl.blob())
      updateScene(i, { clipUrl: blobUrl, clipLoading: false, clipStatus: 'Hoàn tất' })
      say('ok', `Scene ${i + 1}: đã có clip AI.`)
    } catch (err) {
      updateScene(i, { clipLoading: false, clipStatus: null })
      say('err', `Clip scene ${i + 1}: ${toMessage(err)}`)
    }
  }

  /* ─── Bước 5: dựng video trong trình duyệt ─── */
  const compose = async () => {
    const usable = scenes.filter((s) => s.text || s.imageDataUrl || s.clipUrl)
    if (!usable.length) {
      say('err', 'Chưa có scene nào có nội dung để dựng.')
      return
    }
    setComposing(true)
    setResultUrl(null)
    try {
      const result = await composeVideo(
        usable.map((s) => ({
          text: s.text,
          imageDataUrl: s.imageDataUrl,
          clipUrl: s.clipUrl,
          audioUrl: s.audioUrl,
          seconds: s.seconds,
        })),
        {
          width: 720,
          height: 1280,
          fps: 30,
          onProgress: (p, label) => {
            setComposeProgress(p)
            setComposeLabel(label)
          },
          onScene: (idx, total) => setComposeLabel(`Đang dựng scene ${idx + 1}/${total}…`),
        },
      )
      setResultUrl(result.url)
      setResultMime(result.mime)
      setResultDuration(result.duration)
      say('ok', `Dựng xong — ${Math.round(result.duration)}s. Bấm tải xuống hoặc tạo dự án Video Faceless.`)
    } catch (err) {
      say('err', toMessage(err))
    } finally {
      setComposing(false)
    }
  }

  const createProjectFromResult = async () => {
    if (!resultUrl) return
    // Đã có dự án từ auto-build (luồng Copilot) → mở nó, không tạo trùng
    if (projectId) {
      onCreatedProject?.(projectId)
      return
    }
    try {
      const p = await api.post<{ id: string }>('/video/projects', {
        title: title || topic || 'Video từ Studio',
        series: 'studio',
      })
      say('ok', 'Đã tạo dự án Video Faceless — mở pipeline kiểm duyệt để tiếp tục.')
      onCreatedProject?.(p.id)
    } catch (err) {
      say('err', toMessage(err))
    }
  }

  const connectedCaps = providers.filter((p) => p.connected)
  const canImage = providers.some((p) => p.connected && p.capabilities.includes('image'))
  /** Tên hiển thị của provider (để báo key nào thực sự đã chạy khi có fallback) */
  const provName = (id: string | null) => providers.find((p) => p.id === id)?.name ?? id ?? ''
  const canVoice = providers.some((p) => p.connected && p.capabilities.includes('voice'))
  const canVideo = providers.some((p) => p.connected && p.capabilities.includes('video'))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button onClick={onBack} className={btnGhost + ' mb-3'}>
            <ArrowLeft className="w-4 h-4" /> {backLabel || 'Về danh sách dự án'}
          </button>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-brand-amber" />
            Studio tạo video
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Tạo video faceless hoàn chỉnh ngay trên web: AI viết kịch bản → sinh ảnh →
            sinh giọng đọc → (tuỳ chọn) clip AI → dựng trong trình duyệt. Chạy bằng
            API key Pro bạn đã kết nối — key chỉ dùng ở server, không lộ ra trình duyệt.
          </p>
        </div>
      </div>

      {/* Trạng thái key */}
      <div className="p-4 rounded-xl bg-dark-900/60 border border-dark-700">
        <div className="text-xs font-bold text-slate-300 mb-2">🔑 Key Pro đã kết nối</div>
        {connectedCaps.length === 0 && (
          <p className="text-xs text-brand-amber">
            Chưa kết nối key nào. Vào <a href="/settings/ai" className="underline text-brand-cyan">Cài đặt → AI Pro</a> để
            thêm key Gemini (khuyên dùng: free tier sinh được ảnh + giọng) hoặc OpenAI.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {providers.map((p) => (
            <span
              key={p.id}
              className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold ${
                p.connected
                  ? 'bg-brand-emerald/10 text-brand-emerald border-brand-emerald/30'
                  : 'bg-dark-800 text-slate-500 border-dark-700'
              }`}
              title={p.connected ? `Làm được: ${p.capabilities.join(', ')}` : 'Chưa kết nối'}
            >
              {p.connected ? '✅' : '⚪'} {p.name}
              {p.connected && (
                <span className="opacity-70">
                  {' '}
                  · {p.capabilities.includes('video') ? '🎬' : ''}
                  {p.capabilities.includes('image') ? '🖼️' : ''}
                  {p.capabilities.includes('voice') ? '🎙️' : ''}
                  💬
                </span>
              )}
            </span>
          ))}
        </div>
        <div className="mt-3">
          <p className={labelCls}>Key chạy từng bước (tick chọn — không mặc định cứng Gemini nữa)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>✍️ Viết kịch bản</label>
              <select value={chatProvider} onChange={(e) => setChatProvider(e.target.value)} className={inputCls}>
                <option value="auto">Tự động</option>
                {providers
                  .filter((p) => p.connected)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              {initialProvider && chatProvider === initialProvider && (
                <p className="text-[11px] text-brand-emerald mt-1">↳ Key được mapping từ Knowledge Graph</p>
              )}
            </div>
            <div>
              <label className={labelCls}>🖼️ Sinh ảnh</label>
              <select value={imageProvider} onChange={(e) => setImageProvider(e.target.value)} className={inputCls}>
                <option value="auto">Tự động (Gemini → OpenAI)</option>
                {providers
                  .filter((p) => p.connected && p.capabilities.includes('image'))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>🎙️ Giọng đọc</label>
              <select value={voiceProvider} onChange={(e) => setVoiceProvider(e.target.value)} className={inputCls}>
                <option value="auto">Tự động (Gemini → OpenAI → Edge)</option>
                {providers
                  .filter((p) => p.connected && p.capabilities.includes('voice'))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>🎬 Clip AI</label>
              <select value={clipProvider} onChange={(e) => setClipProvider(e.target.value)} className={inputCls}>
                <option value="auto">Tự động (Gemini → OpenAI)</option>
                {providers
                  .filter((p) => p.connected && p.capabilities.includes('video'))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="text-[11px] text-slate-500 leading-relaxed mt-3">
            🖼️🎬 Ảnh / clip AI cần <b className="text-slate-300">Gemini</b> hoặc{' '}
            <b className="text-slate-300">OpenAI</b> — tick chọn key cho từng bước ở trên; để "Tự động"
            thì hệ thống tự fallback sang key Gemini/OpenAI đã kết nối. 🎙️ Giọng đọc có thêm{' '}
            <b className="text-slate-300">Edge TTS miễn phí (không cần key)</b> — chọn trong ô Giọng đọc ở trên.
            Viết kịch bản dùng được mọi key đã kết nối.
            {!canVideo && (
              <span className="block mt-1 text-brand-amber">
                ⚠️ Chưa có key sinh clip AI (cần Gemini billing hoặc OpenAI credits) — vẫn dựng được video từ ảnh + Ken Burns.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Workflow templates — phím tắt giọng đọc */}
      <section className="p-4 rounded-2xl bg-dark-900/60 border border-dark-700">
        <button onClick={() => setTplOpen(!tplOpen)} className="w-full flex items-start justify-between gap-3 text-left">
          <span>
            <span className="block text-sm font-bold text-white">⚡ Workflow templates</span>
            <span className="block text-[11px] text-slate-500 mt-0.5">
              Phím tắt workflow giọng đọc — chạy ngay không cần đi từng bước.
            </span>
          </span>
          <span className="text-slate-400 text-base shrink-0">{tplOpen ? '▾' : '▸'}</span>
        </button>

        {tplOpen && (
          <div className="grid md:grid-cols-3 gap-3 mt-3">
            {/* Card 1: voiceover song song + subtitle */}
            <div className="p-3 rounded-xl bg-dark-950/60 border border-dark-700 flex flex-col">
              <div className="text-xs font-bold text-white mb-1">🎙️ Voiceover song song + Subtitle</div>
              <p className="text-[11px] text-slate-500 mb-3">
                Sinh giọng cho toàn bộ scene cùng lúc (thay vì từng scene), kèm SRT từng scene.
              </p>
              <button onClick={genAllVoices} disabled={!scenes.length || allVoiceLoading} className={btnPrimary + ' mt-auto'}>
                {allVoiceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                Chạy cho tất cả scene
              </button>
              <p className="text-[10px] text-slate-500 mt-2">Tận dụng Bước 3 — kết quả đổ vào từng scene bên dưới.</p>
            </div>

            {/* Card 2: text dài → voice + SRT */}
            <div className="p-3 rounded-xl bg-dark-950/60 border border-dark-700">
              <div className="text-xs font-bold text-white mb-2">📝 Text dài → Voice + SRT</div>
              <textarea
                value={tplText}
                onChange={(e) => setTplText(e.target.value)}
                rows={5}
                placeholder="Dán đoạn text dài cần đọc…"
                className={inputCls + ' mb-2'}
              />
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className={labelCls}>Provider</label>
                  <select value={tplProvider} onChange={(e) => setTplProvider(e.target.value)} className={inputCls}>
                    {providerOptions('voice')}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Giọng</label>
                  {tplProvider === 'edge' ? (
                    <select value={tplVoice} onChange={(e) => setTplVoice(e.target.value)} className={inputCls}>
                      <option value="">Nam miền Bắc (mặc định)</option>
                      <option value="vi-VN-HoaiMyNeural">Nữ miền Bắc</option>
                    </select>
                  ) : (
                    <input
                      value={tplVoice}
                      onChange={(e) => setTplVoice(e.target.value)}
                      placeholder="Kore / alloy… (để trống = mặc định)"
                      className={inputCls}
                    />
                  )}
                </div>
              </div>
              <button onClick={tplGen} disabled={tplLoading} className={btnPrimary}>
                {tplLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                Tạo voiceover
              </button>
              {tplResult && (
                <div className="mt-3 space-y-2">
                  <audio src={tplResult.audioUrl} controls className="h-8 w-full" />
                  <div className="flex flex-wrap gap-2">
                    <a href={tplResult.audioUrl} download="voiceover.mp3" className={btnGhost}>
                      <Download className="w-4 h-4 inline mr-1" />
                      Tải audio
                    </a>
                    <button onClick={() => downloadText('voiceover.srt', tplResult.srt)} className={btnGhost}>
                      Tải SRT
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    {Math.round(tplResult.durationSec)}s · {tplResult.mime}
                  </p>
                </div>
              )}
            </div>

            {/* Card 3: dub đa ngôn ngữ (sắp có) */}
            <div className="p-3 rounded-xl bg-dark-950/60 border border-dark-700 opacity-60 flex flex-col">
              <div className="text-xs font-bold text-white mb-1 flex items-center gap-2">
                🌍 Dub đa ngôn ngữ
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-amber/20 text-brand-amber border border-brand-amber/30 font-semibold">
                  Sắp có
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mb-3">
                Dịch và lồng tiếng sang nhiều ngôn ngữ trong một lần chạy.
              </p>
              <button disabled className={btnPrimary + ' mt-auto'}>
                Chạy
              </button>
            </div>
          </div>
        )}
      </section>

      {status.msg && (
        <div
          className={`p-3 rounded-xl text-xs border flex items-start gap-2 ${
            status.kind === 'err'
              ? 'bg-red-500/10 border-red-500/30 text-red-200'
              : status.kind === 'ok'
                ? 'bg-brand-emerald/10 border-brand-emerald/30 text-brand-emerald'
                : 'hidden'
          }`}
        >
          {status.kind === 'err' ? (
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          {status.msg}
        </div>
      )}

      {/* Bước 1: kịch bản */}
      <section className="p-4 rounded-2xl bg-dark-900/60 border border-dark-700">
        <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <span className="w-6 h-6 rounded-full bg-brand-emerald/20 text-brand-emerald text-xs font-bold flex items-center justify-center">1</span>
          Kịch bản
        </h2>
        <div className="grid md:grid-cols-[1fr_160px_200px] gap-3">
          <div>
            <label className={labelCls}>Chủ đề video *</label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="VD: 3 sai lầm khi viết CV xin việc"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Thời lượng</label>
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputCls}>
              <option value={30}>30 giây</option>
              <option value={45}>45 giây</option>
              <option value={60}>60 giây</option>
              <option value={90}>90 giây</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={genScript} disabled={scriptLoading} className={btnPrimary}>
              {scriptLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Viết kịch bản
            </button>
          </div>
        </div>
        {sourceScript?.trim() && (
          <p className="text-[11px] text-brand-emerald mt-2">
            ↳ Kịch bản nguồn từ pipeline đã được mapping — AI sẽ bám sát nội dung/góc đã duyệt để viết scene.
          </p>
        )}

        {scenes.length > 0 && (
          <div className="mt-4 space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tiêu đề video"
              className={inputCls + ' font-bold'}
            />
            {scenes.map((s, i) => (
              <div key={i} className="p-3 rounded-xl bg-dark-950/60 border border-dark-700">
                <div className="text-[11px] font-bold text-brand-cyan mb-2">Scene {i + 1} · {s.seconds}s</div>
                <label className={labelCls}>Lời thoại (TTS đọc)</label>
                <textarea
                  value={s.text}
                  onChange={(e) => updateScene(i, { text: e.target.value })}
                  rows={2}
                  className={inputCls + ' mb-2'}
                />
                <label className={labelCls}>Prompt ảnh (EN)</label>
                <textarea
                  value={s.imagePrompt}
                  onChange={(e) => updateScene(i, { imagePrompt: e.target.value })}
                  rows={2}
                  className={inputCls}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Bước 2: ảnh */}
      {scenes.length > 0 && (
        <section className="p-4 rounded-2xl bg-dark-900/60 border border-dark-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-brand-emerald/20 text-brand-emerald text-xs font-bold flex items-center justify-center">2</span>
              Hình ảnh từng scene
            </h2>
            <button onClick={genAllImages} disabled={allImageLoading || !canImage} className={btnPrimary}>
              {allImageLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
              Sinh ảnh tất cả
            </button>
          </div>
          {!canImage && (
            <p className="text-[11px] text-brand-amber mb-2 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Cần key Gemini hoặc OpenAI để sinh ảnh.
            </p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {scenes.map((s, i) => (
              <div key={i} className="rounded-xl overflow-hidden border border-dark-700 bg-dark-950/60">
                <div className="aspect-[9/16] bg-dark-800 flex items-center justify-center">
                  {s.imageLoading ? (
                    <Loader2 className="w-6 h-6 text-brand-cyan animate-spin" />
                  ) : s.imageDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.imageDataUrl} alt={`scene ${i + 1}`} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[11px] text-slate-500">Scene {i + 1}</span>
                  )}
                </div>
                <button
                  onClick={() => genImage(i)}
                  disabled={s.imageLoading || !canImage}
                  className="w-full py-1.5 text-[11px] font-semibold text-brand-cyan hover:bg-dark-800 disabled:opacity-40"
                >
                  {s.imageDataUrl ? 'Sinh lại' : 'Sinh ảnh'}
                </button>
                {s.imageProvider && (
                  <p className="text-center text-[10px] text-slate-500 pb-1">via {provName(s.imageProvider)}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bước 3: giọng đọc */}
      {scenes.length > 0 && (
        <section className="p-4 rounded-2xl bg-dark-900/60 border border-dark-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-brand-emerald/20 text-brand-emerald text-xs font-bold flex items-center justify-center">3</span>
              Giọng đọc
            </h2>
            <button onClick={genAllVoices} disabled={allVoiceLoading || !canVoice} className={btnPrimary}>
              {allVoiceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
              Sinh giọng tất cả
            </button>
          </div>
          <div className="grid md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className={labelCls}>Tên giọng (để trống = mặc định)</label>
              <input
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                placeholder="Gemini: Kore, Puck… · OpenAI: alloy, nova… · Edge: để trống = Nam miền Bắc"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Ngôn ngữ</label>
              <select value={voiceLang} onChange={(e) => setVoiceLang(e.target.value)} className={inputCls}>
                <option value="vi-VN">Tiếng Việt</option>
                <option value="en-US">English (US)</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            {scenes.map((s, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-dark-950/60 border border-dark-700">
                <span className="text-[11px] font-bold text-slate-400 w-14 shrink-0">Scene {i + 1}</span>
                {s.voiceLoading ? (
                  <Loader2 className="w-4 h-4 text-brand-cyan animate-spin" />
                ) : s.audioUrl ? (
                  <>
                    <audio src={s.audioUrl} controls className="h-8 flex-1 min-w-0" />
                    <CheckCircle2 className="w-4 h-4 text-brand-emerald shrink-0" />
                    {s.voiceProvider && (
                      <span className="text-[10px] text-slate-500 shrink-0">via {provName(s.voiceProvider)}</span>
                    )}
                    {s.srt && (
                      <button
                        onClick={() => downloadText(`scene-${i + 1}.srt`, s.srt as string)}
                        className="text-[11px] font-semibold text-brand-amber hover:underline shrink-0"
                      >
                        Tải SRT
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-[11px] text-slate-500 flex-1">chưa có audio</span>
                    <button
                      onClick={() => genVoiceOne(i)}
                      disabled={!canVoice}
                      className="text-[11px] font-semibold text-brand-cyan hover:underline disabled:opacity-40 shrink-0"
                    >
                      Sinh giọng
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bước 4: clip AI (tuỳ chọn) */}
      {scenes.length > 0 && (
        <section className="p-4 rounded-2xl bg-dark-900/60 border border-dark-700">
          <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
            <span className="w-6 h-6 rounded-full bg-dark-700 text-slate-300 text-xs font-bold flex items-center justify-center">4</span>
            Clip AI từng scene <span className="text-[10px] font-normal text-slate-500">(tuỳ chọn — tốn credits, mỗi clip vài phút)</span>
          </h2>
          <p className="text-[11px] text-slate-500 mb-3">
            Dùng Veo (Gemini, cần billing) hoặc Sora (OpenAI, cần credits). Bỏ qua bước này vẫn dựng được video từ ảnh + hiệu ứng Ken Burns.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {scenes.map((s, i) => (
              <div key={i} className="rounded-xl overflow-hidden border border-dark-700 bg-dark-950/60">
                <div className="aspect-[9/16] bg-dark-800 flex items-center justify-center">
                  {s.clipLoading ? (
                    <div className="text-center px-2">
                      <Loader2 className="w-6 h-6 text-brand-cyan animate-spin mx-auto mb-1" />
                      <div className="text-[10px] text-slate-400">{s.clipStatus}</div>
                    </div>
                  ) : s.clipUrl ? (
                    <video src={s.clipUrl} controls muted playsInline className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[11px] text-slate-500">Scene {i + 1}</span>
                  )}
                </div>
                <button
                  onClick={() => genClip(i)}
                  disabled={s.clipLoading || !canVideo}
                  className="w-full py-1.5 text-[11px] font-semibold text-brand-cyan hover:bg-dark-800 disabled:opacity-40"
                >
                  {s.clipUrl ? 'Sinh lại clip' : 'Sinh clip AI'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bước 5: dựng */}
      {scenes.length > 0 && (
        <section className="p-4 rounded-2xl bg-dark-900/60 border border-dark-700">
          <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-brand-emerald/20 text-brand-emerald text-xs font-bold flex items-center justify-center">5</span>
            Dựng video hoàn chỉnh
          </h2>
          <p className="text-[11px] text-slate-500 mb-3">
            Dựng ngay trong trình duyệt (Ken Burns + phụ đề + ghép giọng) — không cần FFmpeg. Render theo thời gian
            thực, giữ tab mở tới khi xong.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={compose} disabled={composing} className={btnPrimary}>
              {composing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
              {composing ? 'Đang dựng…' : '🎬 Dựng video hoàn chỉnh'}
            </button>
            {composing && (
              <div className="flex-1 min-w-[200px]">
                <div className="h-2 rounded-full bg-dark-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-brand-emerald to-brand-cyan transition-all"
                    style={{ width: `${Math.round(composeProgress * 100)}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-400 mt-1">{composeLabel}</div>
              </div>
            )}
          </div>

          {resultUrl && (
            <div className="mt-4 flex flex-col md:flex-row gap-4">
              <video src={resultUrl} controls playsInline className="w-full md:w-64 rounded-xl border border-dark-700" />
              <div className="space-y-2 text-xs text-slate-300">
                <div className="font-bold text-white flex items-center gap-2">
                  <Clapperboard className="w-4 h-4 text-brand-emerald" />
                  {title || 'Video của bạn'}
                </div>
                <div className="text-slate-500">
                  {Math.round(resultDuration)}s · {(resultMime.includes('mp4') ? 'MP4' : 'WebM')}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href={resultUrl}
                    download={`studio-video-${Date.now()}.${resultMime.includes('mp4') ? 'mp4' : 'webm'}`}
                    className={btnPrimary}
                  >
                    <Download className="w-4 h-4" /> Tải video
                  </a>
                  <button onClick={createProjectFromResult} className={btnGhost}>
                    {projectId ? 'Mở pipeline dự án' : 'Đưa vào pipeline Video Faceless'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  💡 Khi đăng TikTok/Shorts: bật nhãn "AI-generated" cho nội dung có ảnh/clip AI.
                </p>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
