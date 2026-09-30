import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Session,
  Req,
  HttpCode,
  Res,
} from '@nestjs/common'
import { VideogenService } from './videogen.service'
import { ScriptDto, ImageDto, VoiceDto, ClipDto } from './dto'
import { requireWorkspaceId } from '../common/session'
import type { Request, Response } from 'express'

/**
 * Studio tạo video — sinh kịch bản / ảnh / giọng đọc / clip AI ngay trên web
 * bằng API key Pro user đã kết nối ở Cài đặt → AI Pro.
 * Key chỉ dùng ở server, không bao giờ trả về frontend.
 */
@Controller('videogen')
export class VideogenController {
  constructor(private readonly vg: VideogenService) {}

  /** Provider đã kết nối + khả năng (chat/image/voice/video) */
  @Get('providers')
  async providers(@Session() session: any) {
    return this.vg.providers(requireWorkspaceId(session))
  }

  /** Viết kịch bản scenes (JSON) từ chủ đề */
  @Post('script')
  @HttpCode(200)
  async script(@Body() dto: ScriptDto, @Session() session: any, @Req() req: Request) {
    return this.vg.script(requireWorkspaceId(session), dto, req.ip)
  }

  /** Sinh ảnh 1 scene */
  @Post('image')
  @HttpCode(200)
  async image(@Body() dto: ImageDto, @Session() session: any, @Req() req: Request) {
    return this.vg.image(requireWorkspaceId(session), dto, req.ip)
  }

  /** Sinh giọng đọc TTS (trả về audio base64 WAV/MP3) */
  @Post('voice')
  @HttpCode(200)
  async voice(@Body() dto: VoiceDto, @Session() session: any, @Req() req: Request) {
    return this.vg.voice(requireWorkspaceId(session), dto, req.ip)
  }

  /** Khởi job sinh clip AI (Veo/Sora) — poll để lấy tiến độ */
  @Post('clip')
  @HttpCode(200)
  async startClip(@Body() dto: ClipDto, @Session() session: any, @Req() req: Request) {
    return this.vg.startClip(requireWorkspaceId(session), dto, req.ip)
  }

  /** Trạng thái job clip */
  @Get('clip/:jobId')
  async clipStatus(@Param('jobId') jobId: string, @Session() session: any) {
    return this.vg.getClip(requireWorkspaceId(session), jobId)
  }

  /** Tải clip MP4 khi job xong */
  @Get('clip/:jobId/download')
  async clipDownload(
    @Param('jobId') jobId: string,
    @Session() session: any,
    @Res() res: Response,
  ) {
    const { buffer, mime } = this.vg.downloadClip(requireWorkspaceId(session), jobId)
    res.setHeader('Content-Type', mime)
    res.setHeader('Content-Length', buffer.length)
    res.setHeader('Content-Disposition', `attachment; filename="clip-${jobId}.mp4"`)
    res.send(buffer)
  }
}
