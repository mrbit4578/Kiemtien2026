/**
 * Agent tools cho pipeline Video Faceless — thực thi docs/faceless-video-system.md
 * dưới dạng guardrails: tool TỪ CHỐI khi vi phạm (G0 originality, claim chưa xác
 * minh, veto A4), buộc agent phải làm đúng quy trình trước khi đi tiếp.
 */
import type { ToolDefinition } from './tool-registry'

const ORIGINALITY_QUESTIONS = [
  'O1: Bỏ video nguồn ra, video này vẫn đứng được như sản phẩm độc lập?',
  'O2: Hook, cấu trúc, kết luận là của mình, không dịch/viết lại từ nguồn?',
  'O3: Không dùng lại câu chữ, montage, nhạc, nhịp dựng, thumbnail của nguồn?',
  'O4: Video này KHÔNG thay thế nhu cầu xem video nguồn?',
  'O5: Giải thích được giá trị mới trong 1 câu?',
]

/**
 * video_brief — chốt brief sau khi agent đã phân tích nguồn viral bằng
 * web_search/fetch_url. BẮT BUỘC qua G0 originality test (5 câu YES).
 */
export const videoBriefTool: ToolDefinition = {
  name: 'video_brief',
  description:
    'Chốt brief video faceless từ tín hiệu viral. Gọi SAU KHI đã phân tích nguồn bằng web_search/fetch_url ' +
    '(chỉ phân tích chủ đề/hook/claim — KHÔNG tải, KHÔNG sao chép nội dung nguồn). ' +
    'Đưa ra 3 góc mới, chọn 1, và trả lời trung thực 5 câu originality O1–O5. ' +
    'Tool sẽ TỪ CHỐI nếu bất kỳ câu nào là "không" — khi đó phải đổi góc khác.',
  parameters: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'Chủ đề rút ra từ tín hiệu viral (vấn đề/nhu cầu khán giả)' },
      source_analysis: {
        type: 'string',
        description: 'Phân tích nguồn: hook, claim chính, format, phản ứng khán giả. KHÔNG copy câu chữ nguồn.',
      },
      angles: {
        type: 'array',
        items: { type: 'string' },
        description: 'Đúng 3 góc mới đề xuất (mỗi góc 1 câu)',
      },
      chosen_angle: { type: 'string', description: 'Góc đã chọn (phải là 1 trong 3 góc trên)' },
      originality: {
        type: 'object',
        description: 'Trả lời 5 câu O1–O5, true = YES',
        properties: {
          o1: { type: 'boolean' }, o2: { type: 'boolean' }, o3: { type: 'boolean' },
          o4: { type: 'boolean' }, o5: { type: 'boolean' },
        },
      },
    },
    required: ['topic', 'source_analysis', 'angles', 'chosen_angle', 'originality'],
  },
  execute: async (args) => {
    const angles = args['angles'] as string[]
    if (!Array.isArray(angles) || angles.length !== 3) {
      return 'TỪ CHỐI: cần đúng 3 góc mới (angles). Hãy đề xuất 3 góc khác nhau rồi gọi lại.'
    }
    const chosen = args['chosen_angle'] as string
    if (!angles.includes(chosen)) {
      return 'TỪ CHỐI: chosen_angle phải là một trong 3 góc đã liệt kê.'
    }
    const o = args['originality'] as Record<string, boolean>
    const failed: string[] = []
    ;['o1', 'o2', 'o3', 'o4', 'o5'].forEach((k, i) => {
      if (o?.[k] !== true) failed.push(ORIGINALITY_QUESTIONS[i])
    })
    if (failed.length > 0) {
      return (
        'G0 FAIL — góc này CHƯA ĐẠT originality test, không được đi tiếp:\n' +
        failed.map((q) => `- ${q} → trả lời: KHÔNG`).join('\n') +
        '\nHãy chọn góc khác (hoặc bỏ ý tưởng này) rồi gọi lại video_brief.'
      )
    }
    const brief = {
      topic: args['topic'],
      source_analysis: args['source_analysis'],
      angles,
      chosen_angle: chosen,
      originality: 'G0 PASS (O1–O5 = YES)',
    }
    return (
      'G0 PASS. Brief đã chốt:\n' +
      JSON.stringify(brief, null, 2) +
      '\nBước tiếp theo: nghiên cứu claim bằng web_search (mỗi claim quan trọng cần nguồn độc lập), ' +
      'rồi gọi video_script để viết kịch bản.'
    )
  },
}

/**
 * video_script — viết kịch bản từ brief. CHẶN claim rủi ro cao/critical chưa
 * xác minh. Trả về đúng output contract 3 khối.
 */
export const videoScriptTool: ToolDefinition = {
  name: 'video_script',
  description:
    'Viết kịch bản video faceless từ brief đã chốt. Truyền claims (mỗi claim kèm claim_type/risk_level/confidence) ' +
    'và nhu cầu disclosure. Tool TỪ CHỐI nếu có claim risk high/critical mà confidence là unverified. ' +
    'Trả về đúng 3 khối: ## KỊCH BẢN QUAY, ## CAPTION ĐĂNG BÀI, ## LƯU Ý ĐĂNG BÀI.',
  parameters: {
    type: 'object',
    properties: {
      hook: { type: 'string', description: 'Câu hook mở đầu (tự viết, không copy nguồn)' },
      body: {
        type: 'string',
        description: 'Kịch bản đầy đủ: phân cảnh, lời thoại/voice-over, text trên màn hình, thời lượng từng đoạn',
      },
      caption: {
        type: 'string',
        description: 'Caption đăng bài: 1 HOOK + 2–3 câu ngắn + 1 CTA + 5–8 hashtag. CTA ghi "link trong bio", không dán URL trần.',
      },
      claims: {
        type: 'array',
        description: 'Các claim có thể kiểm chứng trong kịch bản',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            claim_type: { type: 'string', description: 'fact|interpretation|forecast|allegation|opinion' },
            risk_level: { type: 'string', description: 'low|medium|high|critical' },
            confidence: { type: 'string', description: 'confirmed|probable|disputed|unverified' },
          },
        },
      },
      disclosure: {
        type: 'object',
        description: 'Nhu cầu disclosure',
        properties: {
          affiliate: { type: 'boolean', description: 'Có link affiliate/sản phẩm trong video?' },
          sponsored: { type: 'boolean', description: 'Có tài trợ?' },
          ai_voice: { type: 'boolean', description: 'Dùng voice AI nghe như người thật?' },
          ai_visual: { type: 'boolean', description: 'Dùng hình ảnh/video AI chân thực?' },
          music_source: { type: 'string', description: 'Nguồn nhạc (đã có license)' },
        },
      },
    },
    required: ['hook', 'body', 'caption'],
  },
  execute: async (args) => {
    const claims = (args['claims'] as Array<Record<string, string>>) ?? []
    const blocked = claims.filter(
      (c) =>
        ['high', 'critical'].includes(c['risk_level']) && c['confidence'] === 'unverified',
    )
    if (blocked.length > 0) {
      return (
        'TỪ CHỐI: có claim rủi ro cao/critical nhưng chưa xác minh:\n' +
        blocked.map((c) => `- [${c['risk_level']}] ${c['text']}`).join('\n') +
        '\nHãy xác minh bằng nguồn độc lập (web_search), hoặc gỡ claim / hạ wording ' +
        'thành "nguồn X nói", rồi gọi lại.'
      )
    }
    const d = (args['disclosure'] as Record<string, unknown>) ?? {}
    const notes: string[] = []
    if (d['affiliate']) notes.push('Affiliate: thêm disclosure trong video — "Một số đường link là link tiếp thị liên kết; mình có thể nhận hoa hồng nếu bạn mua qua link."')
    if (d['sponsored']) notes.push('Tài trợ: thêm trong video — "Video này có nội dung được tài trợ bởi [brand]."')
    if (d['ai_voice'] || d['ai_visual']) {
      notes.push('AI: nội dung chân thực do AI tạo/sửa — BẮT BUỘC bật label AI của nền tảng (TikTok/YouTube/Meta) + ghi trong video: "Một phần hình ảnh/âm thanh trong video được tạo hoặc chỉnh sửa bằng AI."')
    }
    if (d['music_source']) notes.push(`Nhạc: nguồn "${d['music_source']}" — đảm bảo đã có quyền dùng thương mại.`)
    const unverified = claims.filter((c) => c['confidence'] === 'unverified')
    if (unverified.length > 0) {
      notes.push(
        `Claim chưa xác minh (${unverified.length}): chỉ giữ lại nếu đã hạ wording thành ý kiến/nhận định, không trình bày như fact.`,
      )
    }
    if (notes.length === 0) notes.push('Không có disclosure đặc biệt. Vẫn kiểm tra lại G1–G8 trước khi xuất bản.')

    return (
      '## KỊCH BẢN QUAY\n' +
      `${args['body']}\n\n` +
      '## CAPTION ĐĂNG BÀI\n' +
      `${args['caption']}\n\n` +
      '## LƯU Ý ĐĂNG BÀI\n' +
      notes.map((n) => `- ${n}`).join('\n')
    )
  },
}

/**
 * video_risk_score — chấm điểm rủi ro R = C+P+L+A+M+H kèm single-factor veto.
 */
export const videoRiskScoreTool: ToolDefinition = {
  name: 'video_risk_score',
  description:
    'Chấm điểm rủi ro video: R = C(copyright) + P(privacy/likeness) + L(legal) + A(accuracy) + M(monetization) + H(harm), ' +
    'mỗi yếu tố 0–3. Trả về tổng điểm + quyết định (tiếp tục / dừng 1 ngày / viết lại / reject) và kiểm tra veto: ' +
    'A4 mô phỏng người thật không consent hoặc claim sức khỏe/tài chính critical chưa xác minh → REJECT ngay.',
  parameters: {
    type: 'object',
    properties: {
      c: { type: 'integer', description: 'Copyright & license (0–3)' },
      p: { type: 'integer', description: 'Privacy, likeness, voice (0–3)' },
      l: { type: 'integer', description: 'Legal/reputation (0–3)' },
      a: { type: 'integer', description: 'Accuracy & misinformation (0–3)' },
      m: { type: 'integer', description: 'Monetization/platform policy (0–3)' },
      h: { type: 'integer', description: 'Harm: health, safety, finance (0–3)' },
      a4_no_consent: { type: 'boolean', description: 'Mô phỏng người thật nhưng KHÔNG có consent?' },
      critical_claim_unverified: { type: 'boolean', description: 'Claim sức khỏe/tài chính critical chưa xác minh?' },
    },
    required: ['c', 'p', 'l', 'a', 'm', 'h'],
  },
  execute: async (args) => {
    const get = (k: string) => {
      const v = args[k]
      return typeof v === 'number' && v >= 0 && v <= 3 ? Math.round(v) : 0
    }
    const breakdown = { c: get('c'), p: get('p'), l: get('l'), a: get('a'), m: get('m'), h: get('h') }
    const score = breakdown.c + breakdown.p + breakdown.l + breakdown.a + breakdown.m + breakdown.h

    let veto: string | null = null
    if (args['a4_no_consent'] === true) {
      veto = 'REJECT: mô phỏng người thật (A4) nhưng không có consent văn bản.'
    } else if (args['critical_claim_unverified'] === true) {
      veto = 'REJECT: claim sức khỏe/tài chính mức critical chưa được xác minh.'
    }

    let decision: string
    if (veto) decision = veto
    else if (score <= 3) decision = 'Tiếp tục — self-review theo checklist G1–G8.'
    else if (score <= 7) decision = 'Dừng 1 ngày, bổ sung nguồn/license rồi review lại.'
    else if (score <= 11) decision = 'Viết lại / bỏ asset / xin permission trước khi tiếp tục.'
    else decision = 'Reject — chuyển thành nội dung giáo dục khái quát.'

    return (
      `Risk score: ${score}/18 ` +
      `(C${breakdown.c} P${breakdown.p} L${breakdown.l} A${breakdown.a} M${breakdown.m} H${breakdown.h})\n` +
      `Quyết định: ${decision}`
    )
  },
}

export const videoTools: ToolDefinition[] = [videoBriefTool, videoScriptTool, videoRiskScoreTool]
