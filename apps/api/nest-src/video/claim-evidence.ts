/**
 * Kiểm chứng bảng "phát biểu → nguồn → đoạn căn cứ → hình minh họa"
 * (playbook mmo-ai-tiktok-roadmap-v1, chương 06/07).
 *
 * Quy tắc BẤT BIẾN: claim có confidence = "unverified" và đang mở thì câu
 * tương ứng trong kịch bản BẮT BUỘC ghi "CHƯA XÁC MINH" — không được trình
 * bày như sự thật đã kiểm chứng.
 *
 * Pure functions — dễ unit test, không phụ thuộc DB/Nest.
 */

export const UNVERIFIED_MARKER = 'CHƯA XÁC MINH'

export interface ClaimLike {
  id: string
  claimText: string
  claimType: string // fact|interpretation|forecast|allegation|opinion
  confidence: string
  status: string
  scriptCode?: string | null
  primarySource?: string | null
  secondarySource?: string | null
  evidenceExcerpt?: string | null
}

export interface ClaimMarkerIssue {
  id: string
  scriptCode: string | null
  claimText: string
  reason: string
}

export interface ClaimCheckResult {
  /** true khi không còn claim nào vi phạm quy tắc ghi nhãn. */
  ok: boolean
  /** Claim unverified đang mở → bắt buộc ghi CHƯA XÁC MINH trong kịch bản. */
  mustMarkUnverified: ClaimMarkerIssue[]
  /** Claim dạng fact/interpretation nhưng không có nguồn lẫn đoạn căn cứ. */
  missingEvidence: ClaimMarkerIssue[]
  total: number
}

const short = (s: string) => (s.length > 120 ? s.slice(0, 117) + '…' : s)

/**
 * Quét claim ledger của 1 project, trả về các vi phạm quy tắc ghi nhãn.
 * Claim đã corrected/withdrawn được bỏ qua.
 */
export function validateClaimMarkers(claims: ClaimLike[]): ClaimCheckResult {
  const mustMarkUnverified: ClaimMarkerIssue[] = []
  const missingEvidence: ClaimMarkerIssue[] = []
  const open = claims.filter((c) => c.status === 'open')

  for (const c of open) {
    const base = {
      id: c.id,
      scriptCode: c.scriptCode ?? null,
      claimText: short(c.claimText),
    }
    if (c.confidence === 'unverified') {
      mustMarkUnverified.push({
        ...base,
        reason: `Claim chưa xác minh${c.scriptCode ? ` (${c.scriptCode})` : ''} — bắt buộc ghi "${UNVERIFIED_MARKER}" trong kịch bản.`,
      })
    }
    const hasSource = !!(c.primarySource?.trim() || c.secondarySource?.trim() || c.evidenceExcerpt?.trim())
    // Chỉ nhắc với claim mang tính khẳng định (fact/interpretation);
    // opinion/forecast/allegation do risk gate khác xử lý.
    if (!hasSource && (c.claimType === 'fact' || c.claimType === 'interpretation')) {
      missingEvidence.push({
        ...base,
        reason: `Thiếu nguồn và đoạn căn cứ${c.scriptCode ? ` (${c.scriptCode})` : ''} — bổ sung hoặc hạ thành ý kiến.`,
      })
    }
  }

  return {
    ok: mustMarkUnverified.length === 0 && missingEvidence.length === 0,
    mustMarkUnverified,
    missingEvidence,
    total: open.length,
  }
}
