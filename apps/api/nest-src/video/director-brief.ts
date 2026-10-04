/**
 * director-brief.ts — Cầu nối Kiemtien2026 → Director Studio (Taovideo2026).
 *
 * Khi một kịch bản video được tạo ra trên Kiemtien2026 (pipeline video faceless:
 * auto-build hoặc viết tay ở tab Kịch bản), mapper này chuyển toàn bộ kịch bản
 * sang định dạng "video brief" chuẩn 8 trường của Director Studio để import
 * nguyên vẹn vào quy trình tiền kỳ 9 bước (brief → claim ledger → hook →
 * casting → shot list → prompt → VO/sub → caption → QC).
 *
 * Quy ước mapping (trung thực, không thổi phồng):
 * - Claim KT2K KHÔNG BAO GIỜ map sang VERIFIED của Director Studio, vì sổ
 *   đối chiếu evidence của Director Studio là sổ riêng (xem shared/evidence.ts).
 *   Claim fact/forecast/... → UNVERIFIED (reviewer đối chiếu ở bước 2);
 *   claim opinion → EDITORIAL.
 * - Dàn ý cảnh được tách từ kịch bản; nếu kịch bản không có cấu trúc phân cảnh
 *   rõ ràng, để trống để Director Studio dùng template chuẩn (có warning).
 * - Hook/CTA suy ra từ caption theo đúng caption contract (1 HOOK + CTA +
 *   hashtag); không đoán bừa khi thiếu dữ kiện.
 */

export interface DirectorBriefProject {
  id: string
  title: string
  series?: string | null
  viralSourceUrl?: string | null
  sourceNote?: string | null
  angle?: string | null
  briefJson?: string | null
  script?: string | null
  caption?: string | null
  publishNotes?: string | null
  riskBreakdown?: string | null
}

export interface DirectorBriefClaim {
  claimText: string
  claimType: string // fact|interpretation|forecast|allegation|opinion
  riskLevel: string // low|medium|high|critical
  confidence: string // confirmed|probable|disputed|unverified
  primarySource?: string | null
  secondarySource?: string | null
}

export interface DirectorBriefResult {
  filename: string
  markdown: string
  /** Cảnh báo mapping (thiếu hook, thiếu dàn ý, không có claim...) — hiển thị cho người dùng. */
  warnings: string[]
}

/* ─── Helpers ─── */

const oneLine = (s: string | null | undefined, max = 500): string =>
  (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

const nonEmptyLines = (s: string | null | undefined): string[] =>
  (s ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

function safeJson<T>(raw: string | null | undefined): T {
  try {
    return raw ? (JSON.parse(raw) as T) : ({} as T)
  } catch {
    return {} as T
  }
}

function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'video'
  )
}

/** Giá trị frontmatter: một dòng, không dính comment `#...` của parser brief. */
const fmValue = (s: string | null | undefined): string =>
  oneLine(s).replace(/#/g, '').trim()

/* ─── Trích xuất hook / CTA ─── */

/** Hook: ưu tiên briefJson.hook (auto-build) → dòng đầu caption → dòng đầu script. */
function extractHook(project: DirectorBriefProject, brief: Record<string, any>): string {
  const fromBrief = oneLine(brief['hook'], 300)
  if (fromBrief) return fromBrief
  // Caption contract: dòng đầu = HOOK.
  const capLines = nonEmptyLines(project.caption)
  if (capLines.length) return oneLine(capLines[0].replace(/^hook\s*[:\-–]\s*/i, ''), 300)
  const scriptLines = nonEmptyLines(project.script)
  if (scriptLines.length) return oneLine(scriptLines[0], 300)
  return ''
}

/**
 * CTA: dòng cuối caption không phải hashtag, khớp từ khóa CTA
 * (link trong bio, bình luận, theo dõi, lưu...). Không đoán khi thiếu.
 */
function extractCta(project: DirectorBriefProject): string {
  const lines = nonEmptyLines(project.caption).filter((l) => !/^#[\p{L}\p{N}_]+(\s+#[\p{L}\p{N}_]+)*$/u.test(l))
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]
    if (/link trong bio|bình luận|comment|theo dõi|follow|lưu video|chia sẻ|share|đăng ký|inbox|nhắn tin/i.test(l)) {
      return fmValue(l.replace(/#[\p{L}\p{N}_]+/gu, ''))
    }
  }
  return ''
}

/* ─── Tách dàn ý cảnh từ kịch bản ─── */

/** Tách timestamp/duration thừa ở đầu/cuối beat: "[0:00-0:05]", "(5s)", "0:00–0:08". */
const stripTiming = (s: string): string =>
  s
    .replace(/^\s*[\[(]?\d{1,2}:\d{2}\s*(?:[-–—]\s*\d{1,2}:\d{2})?[\])]?\s*[:\-–]?\s*/, '')
    .replace(/^\s*\(\d+\s*s(?:econds?)?\)\s*/i, '')
    .replace(/\s*[\[(]?\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}[\])]?\s*$/, '')
    .replace(/\s*\(\d+(?:\s*[-–—]\s*\d+)?\s*s(?:econds?)?\)\s*$/i, '')
    .trim()

function extractBeats(script: string | null | undefined): string[] {
  const lines = nonEmptyLines(script)
  if (!lines.length) return []
  const beats: string[] = []

  const sceneRe = /^(?:cảnh|scene|shot|phân cảnh|phân đoạn|đoạn)\s*\d+\s*[:.\-–]?\s*(.+)$/i
  const numberedRe = /^\d{1,2}[.)]\s*(.+)$/
  const headingRe = /^#{2,}\s*(.+)$/
  const bulletRe = /^[-•–]\s*(.+)$/

  for (const line of lines) {
    const m = line.match(sceneRe) ?? line.match(numberedRe) ?? line.match(headingRe)
    if (m) {
      const beat = oneLine(stripTiming(m[1]), 220)
      if (beat && !/^kết\s*[:\-–]?$/i.test(beat)) beats.push(beat)
    }
  }
  // Fallback: gạch đầu dòng (khi kịch bản viết dạng bullet).
  if (!beats.length) {
    for (const line of lines) {
      const m = line.match(bulletRe)
      if (m && m[1].length > 12) beats.push(oneLine(stripTiming(m[1]), 220))
    }
  }
  // Fallback cuối: gom câu thành beat (tối đa 5 beat, mỗi beat ~2 câu).
  if (!beats.length) {
    const sentences = oneLine(script, 4000)
      .split(/(?<=[.!?…])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10)
    for (let i = 0; i < sentences.length && beats.length < 5; i += 2) {
      beats.push(oneLine([sentences[i], sentences[i + 1]].filter(Boolean).join(' '), 220))
    }
  }
  return beats.slice(0, 10)
}

/* ─── Risk ─── */

function riskAccuracy(
  claims: DirectorBriefClaim[],
  riskBreakdown: Record<string, any>,
): 'low' | 'medium' | 'high' {
  const levels = claims.map((c) => c.riskLevel)
  const nums = ['c', 'p', 'l', 'a', 'm', 'h'].map((k) => Number(riskBreakdown[k] ?? 0))
  const sum = nums.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)
  if (levels.includes('critical') || levels.includes('high') || sum >= 8) return 'high'
  if (levels.includes('medium') || sum >= 4) return 'medium'
  if (!claims.length && sum === 0) return 'medium' // không đủ dữ kiện → trung bình
  return 'low'
}

/* ─── Mapper chính ─── */

export function buildDirectorBriefMd(
  project: DirectorBriefProject,
  claims: DirectorBriefClaim[],
): DirectorBriefResult {
  const warnings: string[] = []
  const brief = safeJson<Record<string, any>>(project.briefJson)
  const riskBreakdown = safeJson<Record<string, any>>(project.riskBreakdown)

  const briefId = `KT-${String(project.id).replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || 'XXXXXX'}`
  const title = oneLine(project.title, 120) || 'Video chưa đặt tên'
  const topic = oneLine(brief['topic'], 200)
  const angle = oneLine(project.angle, 400)
  const hook = extractHook(project, brief)
  const cta = extractCta(project)
  const beats = extractBeats(project.script)
  const accuracy = riskAccuracy(claims, riskBreakdown)
  const audience = topic ? `Người quan tâm: ${topic}` : 'Người xem TikTok'

  if (!hook) warnings.push('Không tìm được hook — Director Studio sẽ dùng hook mặc định, nên bổ sung ở bước 3.')
  if (!beats.length) warnings.push('Kịch bản chưa có phân cảnh rõ ràng — Director Studio sẽ dùng template chuẩn, nên rà lại dàn ý ở bước 1.')
  if (!claims.length) warnings.push('Project chưa có claim nào — mọi số liệu trong lời đọc sẽ bị đánh UNVERIFIED.')
  if (!cta) warnings.push('Không tách được CTA từ caption — Director Studio sẽ dùng CTA mặc định của series.')

  // — Frontmatter —
  const fm: string[] = [
    '---',
    `brief_id: ${briefId}`,
    `series: ${fmValue(project.series) || 'kiemtien2026'}`,
    'doc_id: kiemtien2026-video',
    'section: auto-build',
    `audience: ${fmValue(audience)}`,
    'duration: 60',
    `risk_accuracy: ${accuracy}`,
  ]
  if (cta) fm.push(`cta: ${cta}`)
  fm.push('---')

  // — Nguồn —
  const sourceParts: string[] = []
  if (project.viralSourceUrl) {
    sourceParts.push(`Video viral tham khảo (chỉ phân tích, không copy câu chữ/hình ảnh): ${oneLine(project.viralSourceUrl, 300)}`)
  } else {
    sourceParts.push('Kịch bản do AI dựng từ nội dung nguồn trên Kiemtien2026 (pipeline video faceless, qua G0 originality).')
  }
  const sourceNote = oneLine(project.sourceNote, 600)
  if (sourceNote) sourceParts.push(`Phân tích nguồn: ${sourceNote}`)

  // — Claim ledger —
  const claimLines = claims.slice(0, 20).map((c) => {
    const text = oneLine(c.claimText, 300).replace(/"/g, "'")
    const provenance = [`KT2K:${c.claimType}/${c.riskLevel}/${c.confidence}`]
    if (c.primarySource) provenance.push(`nguồn: ${oneLine(c.primarySource, 200)}`)
    // TRUNG THỰC: không bao giờ VERIFIED ở đây — sổ evidence của Director Studio
    // là sổ riêng, reviewer đối chiếu ở bước 2 rồi mới lên VERIFIED.
    const status = c.claimType === 'opinion' ? 'EDITORIAL (biên soạn)' : 'UNVERIFIED'
    return `  - "${text}" — ${provenance.join('; ')} — ${status}`
  })

  // — Rủi ro / gate —
  const riskParts: string[] = []
  const rbNums = ['c', 'p', 'l', 'a', 'm', 'h']
    .map((k) => `${k.toUpperCase()}=${Number(riskBreakdown[k] ?? 0)}`)
    .join(' ')
  if (/[1-9]/.test(rbNums)) riskParts.push(`Điểm rủi ro AI đánh giá (${rbNums}).`)
  const notes = oneLine(project.publishNotes, 500)
  if (notes) riskParts.push(`Lưu ý đăng bài: ${notes}`)
  riskParts.push(
    'Claim KT2K chuyển sang ở trạng thái UNVERIFIED/EDITORIAL — đối chiếu bằng chứng ở bước 2 Director Studio trước khi đưa số liệu vào lời đọc.',
  )

  const md: string[] = [
    ...fm,
    `# Video brief ${briefId} — ${title}`,
    '',
    `- **Nguồn:** ${sourceParts.join(' ')}`,
    `- **Đối tượng:** ${fmValue(audience)}`,
    `- **Góc mới (original-first):** ${angle ? `${angle} (đã qua G0 originality O1–O5 trên Kiemtien2026).` : 'Chưa chốt góc mới — bổ sung ở bước 1.'}`,
    `- **Hook gợi ý (0–3s):** ${hook ? `"${hook.replace(/"/g, "'")}"` : 'Chưa có — bổ sung ở bước 3.'}`,
    '- **Dàn ý cảnh:**',
    ...beats.map((b, i) => `  ${i + 1}. ${b}`),
    ...(beats.length ? [] : ['  (để trống — Director Studio dùng template chuẩn)']),
    '- **Claim ledger:**',
    ...(claimLines.length ? claimLines : ['  (chưa có claim)']),
    `- **Rủi ro / gate:** ${riskParts.join(' ')}`,
    '- **Thời lượng:** 60s',
    '',
  ]

  return {
    filename: `brief-${briefId.toLowerCase()}-${slugify(title)}.md`,
    markdown: md.join('\n'),
    warnings,
  }
}
