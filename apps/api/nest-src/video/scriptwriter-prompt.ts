/**
 * Prompt biên kịch dùng lại — playbook mmo-ai-tiktok-roadmap-v1, chương 07.
 *
 * Đưa cho AI viết kịch bản (hoặc dùng làm checklist khi viết tay).
 * Quy tắc: mỗi phát biểu có mã nguồn [Cn]; phần thiếu căn cứ ghi
 * "CHƯA XÁC MINH"; không thêm số liệu/trải nghiệm không có trong nguồn.
 */

export const SCRIPTWRITER_PROMPT_TEMPLATE = `Đối tượng: [nhóm người xem]. Câu hỏi: [một vấn đề]. Chỉ dùng các nguồn đính kèm. Viết kịch bản [thời lượng] gồm thời gian, lời đọc, cảnh, chữ và mã nguồn cho từng phát biểu. Có một tình huống hài được đánh dấu hư cấu. Không thêm số liệu hoặc trải nghiệm không có trong nguồn. Phần thiếu căn cứ ghi CHƯA XÁC MINH. Kết thúc bằng một hành động phù hợp với nội dung.`

/**
 * Checklist đi kèm prompt — hệ thống tự kiểm sau khi có kịch bản.
 * (Ánh xạ sang claim ledger + validateClaimMarkers.)
 */
export const SCRIPTWRITER_CHECKLIST = [
  'Mỗi phát biểu trong kịch bản có mã nguồn [Cn] tương ứng một dòng trong claim ledger.',
  'Mỗi dòng claim có nguồn (primary/secondary) hoặc đoạn căn cứ (evidenceExcerpt).',
  'Phát biểu thiếu căn cứ được ghi rõ "CHƯA XÁC MINH" trong lời đọc.',
  'Tình huống hài được đánh dấu hư cấu, không trình bày hình AI như kết quả thí nghiệm thật.',
  'Không có số liệu, trải nghiệm hoặc tuyên bố hiệu quả nằm ngoài nguồn đính kèm.',
  'Kết thúc bằng một hành động phù hợp với nội dung (CTA học tiếp / nhận tài liệu).',
] as const

/** Điền biến vào template. Biến thiếu được giữ nguyên dạng [tên]. */
export function renderScriptwriterPrompt(vars: {
  audience?: string
  question?: string
  duration?: string
}): string {
  return SCRIPTWRITER_PROMPT_TEMPLATE.replace('[nhóm người xem]', vars.audience ?? '[nhóm người xem]')
    .replace('[một vấn đề]', vars.question ?? '[một vấn đề]')
    .replace('[thời lượng]', vars.duration ?? '[thời lượng]')
}
