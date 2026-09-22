import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import { ChatMessageDto, AI_PROVIDER_IDS } from '../ai/dto'
import type { AiProviderId } from '../ai/ai.providers'

/** POST /ai/agent/run — chạy agent loop (think → act → observe) qua provider đã kết nối. */
export class AgentRunDto {
  @IsString()
  @IsIn(AI_PROVIDER_IDS as unknown as string[], { message: 'Provider không được hỗ trợ.' })
  provider!: AiProviderId

  @IsArray()
  @ArrayMinSize(1, { message: 'Cần ít nhất 1 tin nhắn.' })
  @ArrayMaxSize(30, { message: 'Tối đa 30 tin nhắn mỗi request.' })
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[]

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4096)
  maxTokens?: number

  /** Số vòng think→act→observe tối đa. Mặc định 6, trần 12. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  maxTurns?: number

  /** Allowlist tên tool — bỏ trống = dùng tất cả built-in tools. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tools?: string[]
}
