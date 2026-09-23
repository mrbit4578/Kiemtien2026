import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Session,
  HttpCode,
  Query,
  Res,
  NotFoundException,
} from '@nestjs/common'
import type { Response } from 'express'
import { createReadStream, existsSync, statSync } from 'fs'
import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  Min,
  Max,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsIn,
  MinLength,
} from 'class-validator'
import { Type } from 'class-transformer'
import { RenderService, type RenderSpec } from './render.service'
import { requireWorkspaceId } from '../common/session'

class ClipDto {
  @IsString()
  @MinLength(1)
  source!: string

  @IsOptional()
  @IsNumber()
  @Min(0)
  start?: number

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  duration?: number
}

class CaptionDto {
  @IsString()
  @MinLength(1)
  text!: string

  @IsNumber()
  @Min(0)
  start!: number

  @IsNumber()
  @Min(0.5)
  duration!: number
}

class CreateRenderJobDto {
  @IsString()
  @MinLength(1)
  name!: string

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ClipDto)
  clips!: ClipDto[]

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CaptionDto)
  captions?: CaptionDto[]

  @IsOptional()
  @IsString()
  effectId?: string

  @IsOptional()
  @IsNumber()
  @Min(144)
  @Max(4096)
  width?: number

  @IsOptional()
  @IsNumber()
  @Min(144)
  @Max(4096)
  height?: number

  @IsOptional()
  @IsNumber()
  @Min(1)
  rateNum?: number

  @IsOptional()
  @IsNumber()
  @Min(1)
  rateDen?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(51)
  crf?: number

  @IsOptional()
  @IsString()
  preset?: string

  @IsOptional()
  @IsIn(['h264', 'hevc', 'av1'])
  codec?: 'h264' | 'hevc' | 'av1'
}

@Controller('render')
export class RenderController {
  constructor(private readonly render: RenderService) {}

  /** GET /render/health — concat-cli có sẵn và nối được không? */
  @Get('health')
  async health() {
    return this.render.health()
  }

  /** GET /render/catalogue?kind=effect — liệt kê effect để chọn effectId */
  @Get('catalogue')
  async catalogue(@Query('kind') kind: string | undefined) {
    return { packages: await this.render.catalogue(kind) }
  }

  /**
   * POST /render/jobs — tạo job render, trả về ngay (202), render chạy nền.
   * Body: { name, clips: [{source, start?, duration?}], captions?, effectId?,
   *         width?, height?, rateNum?, rateDen?, crf?, preset?, codec? }
   * Mặc định xuất dọc 1080x1920 30fps H.264 — khổ TikTok/Reels/Shorts.
   */
  @Post('jobs')
  @HttpCode(202)
  async create(@Body() dto: CreateRenderJobDto, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    const spec: RenderSpec = {
      name: dto.name,
      clips: dto.clips,
      captions: dto.captions,
      effectId: dto.effectId,
      width: dto.width,
      height: dto.height,
      rateNum: dto.rateNum,
      rateDen: dto.rateDen,
      crf: dto.crf,
      preset: dto.preset,
      codec: dto.codec,
    }
    const job = await this.render.createJob(workspaceId, spec)
    return { job }
  }

  /** GET /render/jobs — job gần nhất của workspace */
  @Get('jobs')
  async list(@Query('limit') limit: string | undefined, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    const n = limit ? parseInt(limit, 10) : 20
    return { jobs: await this.render.listJobs(workspaceId, Number.isFinite(n) ? n : 20) }
  }

  /** GET /render/jobs/:id — trạng thái + tiến độ */
  @Get('jobs/:id')
  async get(@Param('id') id: string, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return { job: await this.render.getJob(workspaceId, id) }
  }

  /** DELETE /render/jobs/:id — hủy export đang chạy */
  @Delete('jobs/:id')
  async cancel(@Param('id') id: string, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return { job: await this.render.cancelJob(workspaceId, id) }
  }

  /** GET /render/jobs/:id/file — tải MP4 đã render xong */
  @Get('jobs/:id/file')
  async file(@Param('id') id: string, @Session() session: any, @Res() res: Response) {
    const workspaceId = requireWorkspaceId(session)
    const job = await this.render.getJob(workspaceId, id)
    if (job.status !== 'done' || !job.outputPath || !existsSync(job.outputPath)) {
      throw new NotFoundException('File chưa sẵn sàng (job chưa xong hoặc đã bị xóa).')
    }
    const stat = statSync(job.outputPath)
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Length', stat.size)
    res.setHeader('Content-Disposition', `attachment; filename="${job.id}.mp4"`)
    createReadStream(job.outputPath).pipe(res)
  }
}
