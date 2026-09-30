import { IsString, IsInt, IsNumber, IsOptional, IsIn, Min, Max, IsArray, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

/** Đánh dấu một ngách đã được chọn/dùng — từ đó không bao giờ đề xuất lại. */
export class MarkNicheUsedDto {
  @IsString()
  slug!: string

  @IsString()
  label!: string

  @IsString()
  @IsOptional()
  category?: string

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  score?: number

  @IsString()
  @IsOptional()
  rationale?: string

  @IsIn(['scan', 'manual', 'ai'])
  @IsOptional()
  source?: string
}

/** Ghi nhận kết quả sau khi dùng ngách (vòng kaizen). */
export class NicheFeedbackDto {
  @IsIn(['picked', 'in_progress', 'done', 'dropped'])
  @IsOptional()
  status?: string

  @IsString()
  @IsOptional()
  feedback?: string

  @IsIn([-1, 0, 1])
  @IsOptional()
  outcome?: number
}

export class MixCandidateDto {
  @IsString()
  @IsOptional()
  id?: string

  @IsString()
  label!: string

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  score?: number

  @IsString()
  @IsOptional()
  category?: string

  @IsString()
  @IsOptional()
  rationale?: string

  // Các trường AI trả về — giữ lại để frontend vẽ node đầy đủ
  @IsString()
  @IsOptional()
  roi?: string

  @IsString()
  @IsOptional()
  commission?: string

  @IsString()
  @IsOptional()
  trafficStrategy?: string

  @IsString()
  @IsOptional()
  recommendedModel?: string

  @IsString()
  @IsOptional()
  tosCaution?: string

  @IsArray()
  @IsOptional()
  suggestedLinks?: string[]
}

/** Trộn + lọc danh sách ngách AI đề xuất theo ngữ cảnh đã dùng của workspace. */
export class MixNichesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MixCandidateDto)
  candidates!: MixCandidateDto[]

  @IsInt()
  @Min(1)
  @Max(24)
  @IsOptional()
  k?: number

  /** Cân bằng MMR: 1 = chỉ điểm cao, 0 = chỉ đa dạng. Mặc định 0.7. */
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  lambda?: number

  /** Số ngách tối đa mỗi nhóm chủ đề trong picked. Mặc định 2. */
  @IsInt()
  @Min(1)
  @Max(6)
  @IsOptional()
  topicCap?: number
}

/** Thay thế ngách vừa chọn: đánh dấu đã dùng + lấy 1 ngách backfill tốt nhất. */
export class ReplaceNicheDto {
  @IsString()
  pickedSlug!: string

  @IsString()
  pickedLabel!: string

  @IsString()
  @IsOptional()
  pickedCategory?: string

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  pickedScore?: number

  @IsString()
  @IsOptional()
  pickedRationale?: string

  /** Pool ứng viên dự phòng (kết quả AI của lần quét gần nhất). */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MixCandidateDto)
  pool!: MixCandidateDto[]

  /** Slug các ngách đang hiển thị trên graph — backfill không được trùng. */
  @IsArray()
  @IsString({ each: true })
  visibleSlugs!: string[]
}

/**
 * Một dòng bằng chứng ngách (playbook chương 01/02): câu hỏi thật + URL/ngày,
 * tách rõ "người xem hỏi" và "AI suy ra".
 */
export class CreateNicheEvidenceDto {
  @IsString()
  nicheSlug!: string

  @IsString()
  questionText!: string

  @IsString()
  @IsOptional()
  market?: string

  @IsString()
  @IsOptional()
  audience?: string

  @IsString()
  @IsOptional()
  url?: string

  @IsString()
  @IsOptional()
  metricSeen?: string

  @IsString()
  @IsOptional()
  metricNotProven?: string

  @IsString()
  @IsOptional()
  contentIdea?: string

  @IsString()
  @IsOptional()
  relatedOffer?: string

  @IsString()
  @IsOptional()
  checkResult?: string

  /** Ngày thu thập (ISO). Mặc định = hiện tại. */
  @IsString()
  @IsOptional()
  collectedAt?: string
}
