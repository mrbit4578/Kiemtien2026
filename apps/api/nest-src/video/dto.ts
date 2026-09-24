import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

export const VIDEO_STAGES = [
  'intake',
  'analysis',
  'angle',
  'research',
  'script',
  'assets',
  'voice',
  'edit',
  'qa',
  'publish',
] as const

export const VIDEO_STAGE_LABELS: Record<string, string> = {
  intake: 'Tiếp nhận',
  analysis: 'Phân tích nguồn',
  angle: 'Chọn góc',
  research: 'Nghiên cứu',
  script: 'Kịch bản',
  assets: 'Tài sản',
  voice: 'Giọng đọc',
  edit: 'Dựng',
  qa: 'Kiểm duyệt QA',
  publish: 'Xuất bản & học',
}

export const GATE_IDS = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8'] as const
export const GATE_LABELS: Record<string, string> = {
  G1: 'Source — đã lưu URL, owner, bản phân tích',
  G2: 'Rights — mọi asset commercial-use đã cleared',
  G3: 'Originality — qua G0, có giá trị độc lập khi bỏ nguồn',
  G4: 'Accuracy — claim critical có nguồn, wording đúng',
  G5: 'AI/privacy — consent, label, không impersonation',
  G6: 'Platform — đạt rule từng nền tảng mục tiêu',
  G7: 'Commercial — sponsor/affiliate đã disclose',
  G8: 'Accessibility — subtitle đúng, đọc được trên mobile',
}

/** POST /video/projects — tạo dự án video mới. */
export class CreateVideoProjectDto {
  @IsString()
  @MinLength(1, { message: 'Tiêu đề không được rỗng.' })
  @MaxLength(160)
  title!: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  series?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  viralSourceUrl?: string
}

/** PATCH /video/projects/:id — cập nhật dự án. */
export class UpdateVideoProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  series?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  viralSourceUrl?: string

  @IsOptional()
  @IsString()
  sourceNote?: string

  @IsOptional()
  @IsIn(VIDEO_STAGES as unknown as string[], { message: 'stage không hợp lệ.' })
  stage?: (typeof VIDEO_STAGES)[number]

  @IsOptional()
  @IsString()
  angle?: string

  @IsOptional()
  @IsString()
  briefJson?: string

  @IsOptional()
  @IsString()
  script?: string

  @IsOptional()
  @IsString()
  caption?: string

  @IsOptional()
  @IsString()
  publishNotes?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  contentItemId?: string
}

/** PATCH /video/projects/:id/gates — cập nhật cổng QA. */
export class UpdateGatesDto {
  @IsObject()
  gates!: Record<string, { pass: boolean; note?: string }>
}

/** POST /video/projects/:id/risk-score — chấm điểm rủi ro. */
export class RiskScoreDto {
  @IsInt() @Min(0) @Max(3) c!: number // copyright & license
  @IsInt() @Min(0) @Max(3) p!: number // privacy, likeness, voice
  @IsInt() @Min(0) @Max(3) l!: number // legal/reputation
  @IsInt() @Min(0) @Max(3) a!: number // accuracy & misinformation
  @IsInt() @Min(0) @Max(3) m!: number // monetization/platform policy
  @IsInt() @Min(0) @Max(3) h!: number // harm (health, safety, finance)
  @IsOptional()
  @IsBoolean()
  a4NoConsent?: boolean // mô phỏng người thật không consent → veto
  @IsOptional()
  @IsBoolean()
  criticalHealthClaimUnverified?: boolean // claim sức khỏe/tài chính critical chưa xác minh → veto
}

/** POST /video/projects/:id/assets — thêm asset vào rights ledger. */
export class CreateVideoAssetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string

  @IsIn(['video', 'image', 'music', 'voice', 'font', 'template', 'screenshot', 'logo'])
  assetType!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sourceUrl?: string

  @IsOptional()
  @IsString()
  @MaxLength(160)
  owner?: string

  @IsIn(['original', 'license', 'public_domain', 'permission', 'platform_library', 'quotation_review'])
  rightsBasis!: string

  @IsOptional()
  @IsString()
  scope?: string

  @IsOptional()
  @IsString()
  proof?: string

  @IsOptional()
  @IsIn(['cleared', 'conditional', 'pending', 'reject'])
  status?: string
}

/** POST /video/projects/:id/claims — thêm claim vào claim ledger. */
export class CreateVideoClaimDto {
  @IsString()
  @MinLength(1)
  claimText!: string

  @IsIn(['fact', 'interpretation', 'forecast', 'allegation', 'opinion'])
  claimType!: string

  @IsIn(['low', 'medium', 'high', 'critical'])
  riskLevel!: string

  @IsOptional()
  @IsString()
  primarySource?: string

  @IsOptional()
  @IsString()
  secondarySource?: string

  @IsIn(['confirmed', 'probable', 'disputed', 'unverified'])
  confidence!: string

  @IsOptional()
  @IsIn(['open', 'corrected', 'withdrawn'])
  status?: string
}

/** POST /video/projects/:id/ai-entries — thêm mục AI register. */
export class CreateVideoAiEntryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  assetName!: string

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  tool!: string

  @IsOptional()
  @IsString()
  inputSource?: string

  @IsOptional()
  @IsString()
  outputUse?: string

  @IsIn(['A0', 'A1', 'A2', 'A3', 'A4'])
  category!: string

  @IsOptional()
  @IsBoolean()
  realPerson?: boolean

  @IsOptional()
  @IsBoolean()
  labelRequired?: boolean

  @IsOptional()
  @IsBoolean()
  labelApplied?: boolean

  @IsOptional()
  @IsIn(['none', 'obtained', 'na'])
  consentStatus?: string
}
