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
  MinLength,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import type { AiProviderId } from './ai.providers'

export const AI_PROVIDER_IDS = ['gemini', 'openai', 'xai', 'anthropic', 'deepseek'] as const

/** POST /ai/connections — KHÔNG bao giờ log apiKey. */
export class ConnectAiDto {
  @IsString()
  @IsIn(AI_PROVIDER_IDS as unknown as string[], { message: 'Provider không được hỗ trợ.' })
  provider!: AiProviderId

  @IsString()
  @MinLength(8, { message: 'API key quá ngắn.' })
  @MaxLength(500, { message: 'API key quá dài.' })
  apiKey!: string
}

export class ChatMessageDto {
  @IsIn(['user', 'assistant', 'system'], { message: 'role phải là user | assistant | system.' })
  role!: 'user' | 'assistant' | 'system'

  @IsString()
  @MinLength(1, { message: 'Nội dung tin nhắn không được rỗng.' })
  @MaxLength(20000, { message: 'Tin nhắn quá dài (tối đa 20.000 ký tự).' })
  content!: string
}

/** POST /ai/chat — chat với model của provider đã kết nối. */
export class ChatDto {
  @IsString()
  @IsIn(AI_PROVIDER_IDS as unknown as string[], { message: 'Provider không được hỗ trợ.' })
  provider!: AiProviderId

  @IsArray()
  @ArrayMinSize(1, { message: 'Cần ít nhất 1 tin nhắn.' })
  @ArrayMaxSize(50, { message: 'Tối đa 50 tin nhắn mỗi request.' })
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
}
