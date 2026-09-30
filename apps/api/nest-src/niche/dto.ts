import { IsString, IsInt, IsOptional, IsIn, Min, Max, IsArray, ValidateNested } from 'class-validator'
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
  @Max(20)
  @IsOptional()
  k?: number
}
