import { IsString, IsOptional, IsInt, Min, Max, IsIn, MaxLength, IsArray, ArrayMinSize, ArrayMaxSize, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { AI_PROVIDER_IDS } from '../ai/dto'

// Provider được chọn ở Studio: mọi provider AI Pro (trừ TinyFish — search/fetch,
// không sinh nội dung) + 'edge' (Edge TTS miễn phí, voice-only).
// Derive từ AI_PROVIDER_IDS để thêm provider mới không phải sửa 2 nơi
// (từng gây lỗi "Provider không được hỗ trợ" / 400 khi thiếu).
const PROVIDERS = [...AI_PROVIDER_IDS.filter((id) => id !== 'tinyfish'), 'edge'] as const

export class ScriptDto {
  /** Chủ đề video */
  @IsString()
  @MaxLength(500)
  topic!: string

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(180)
  duration?: number

  @IsOptional()
  @IsIn([...PROVIDERS])
  provider?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  niche?: string

  /** Kịch bản nguồn từ pipeline Video Faceless (đã duyệt) — AI bám sát để viết lại thành scene */
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  sourceScript?: string
}

export class ImageDto {
  @IsString()
  @MaxLength(2000)
  prompt!: string

  @IsOptional()
  @IsIn([...PROVIDERS])
  provider?: string

  /** '9:16' | '1:1' | '16:9' */
  @IsOptional()
  @IsIn(['9:16', '1:1', '16:9'])
  aspectRatio?: string
}

export class VoiceDto {
  @IsString()
  @MaxLength(4000)
  text!: string

  @IsOptional()
  @IsIn([...PROVIDERS])
  provider?: string

  /** Tên giọng (VD: 'Kore' cho Gemini, 'alloy' cho OpenAI) */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  voice?: string

  /** VD: 'vi-VN' */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  language?: string
}

export class ClipDto {
  @IsString()
  @MaxLength(2000)
  prompt!: string

  /** data URL ảnh tham chiếu (image-to-video) */
  @IsOptional()
  @IsString()
  @MaxLength(15_000_000)
  imageDataUrl?: string

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(30)
  seconds?: number

  @IsOptional()
  @IsIn(['9:16', '16:9'])
  aspectRatio?: string

  @IsOptional()
  @IsIn([...PROVIDERS])
  provider?: string
}

export class VoiceBatchSegmentDto {
  @IsString()
  @MaxLength(50)
  id!: string

  @IsString()
  @MaxLength(4000)
  text!: string
}

/** POST /videogen/voice-batch — sinh giọng đọc hàng loạt theo segment */
export class VoiceBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => VoiceBatchSegmentDto)
  segments!: VoiceBatchSegmentDto[]

  @IsOptional()
  @IsString()
  @MaxLength(100)
  voice?: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  language?: string

  @IsOptional()
  @IsIn(['gemini', 'openai', 'edge'])
  provider?: string

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(16)
  concurrency?: number
}
