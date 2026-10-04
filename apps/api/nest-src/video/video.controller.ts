import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Session,
  Req,
  HttpCode,
} from '@nestjs/common'
import { VideoService } from './video.service'
import {
  CreateVideoProjectDto,
  UpdateVideoProjectDto,
  UpdateGatesDto,
  RiskScoreDto,
  CreateVideoAssetDto,
  CreateVideoClaimDto,
  CreateVideoAiEntryDto,
  AutoBuildVideoDto,
  CreateProjectFromPresetDto,
  SetComplianceDto,
} from './dto'
import { requireWorkspaceId } from '../common/session'
import type { Request } from 'express'

/**
 * Video Faceless — project tracker: pipeline 10 bước, 3 ledgers
 * (rights/claims/AI register), 8 cổng QA, risk score.
 * Spec: docs/faceless-video-system.md
 */
@Controller('video')
export class VideoController {
  constructor(private readonly video: VideoService) {}

  // ─── Projects ───

  @Get('projects')
  async list(@Session() session: any) {
    return this.video.listProjects(requireWorkspaceId(session))
  }

  @Post('projects')
  @HttpCode(200)
  async create(@Body() dto: CreateVideoProjectDto, @Session() session: any) {
    return this.video.createProject(requireWorkspaceId(session), dto)
  }

  /**
   * POST /video/projects/auto-build — tự động dựng project từ nội dung nguồn:
   * AI phân tích theo quy chuẩn pipeline (G0, claim guardrails) rồi tự điền
   * brief, góc, kịch bản, caption, claim ledger, AI register, risk score.
   */
  @Post('projects/auto-build')
  @HttpCode(200)
  async autoBuild(@Body() dto: AutoBuildVideoDto, @Session() session: any) {
    return this.video.autoBuildFromSource(requireWorkspaceId(session), dto)
  }

  // ─── Presets ───

  /**
   * GET /video/presets — liệt kê preset shot-list (timelapse công trình…).
   */
  @Get('presets')
  async listPresets() {
    return this.video.listPresets()
  }

  /**
   * GET /video/presets/:presetId — chi tiết preset (30 keyframes, prompt mẫu).
   */
  @Get('presets/:presetId')
  async getPreset(@Param('presetId') presetId: string) {
    return this.video.getPresetDetail(presetId)
  }

  /**
   * POST /video/projects/from-preset — tạo project từ preset: điền 4 biến
   * bối cảnh → render shot-list → nạp kịch bản, brief, AI register A3.
   */
  @Post('projects/from-preset')
  @HttpCode(200)
  async createFromPreset(@Body() dto: CreateProjectFromPresetDto, @Session() session: any) {
    return this.video.createProjectFromPreset(requireWorkspaceId(session), dto)
  }

  @Get('projects/:id')
  async get(@Param('id') id: string, @Session() session: any) {
    return this.video.getProject(requireWorkspaceId(session), id)
  }

  /**
   * GET /video/projects/:id/director-brief — xuất video brief chuẩn Director
   * Studio (Taovideo2026): mapping toàn bộ kịch bản + claim ledger sang định
   * dạng brief 8 trường để import vào quy trình tiền kỳ 9 bước.
   * Trả về { filename, markdown, warnings } — client tải file .md về.
   */
  @Get('projects/:id/director-brief')
  async directorBrief(@Param('id') id: string, @Session() session: any) {
    return this.video.getDirectorBrief(requireWorkspaceId(session), id)
  }

  @Patch('projects/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateVideoProjectDto,
    @Session() session: any,
  ) {
    return this.video.updateProject(requireWorkspaceId(session), id, dto)
  }

  @Delete('projects/:id')
  async remove(@Param('id') id: string, @Session() session: any, @Req() req: Request) {
    return this.video.deleteProject(requireWorkspaceId(session), id, req.ip)
  }

  // ─── Gates & risk ───

  @Patch('projects/:id/gates')
  async updateGates(
    @Param('id') id: string,
    @Body() dto: UpdateGatesDto,
    @Session() session: any,
  ) {
    return this.video.updateGates(requireWorkspaceId(session), id, dto.gates)
  }

  @Post('projects/:id/risk-score')
  @HttpCode(200)
  async riskScore(
    @Param('id') id: string,
    @Body() dto: RiskScoreDto,
    @Session() session: any,
  ) {
    return this.video.saveRiskScore(requireWorkspaceId(session), id, dto)
  }

  @Get('projects/:id/readiness')
  async readiness(@Param('id') id: string, @Session() session: any) {
    return this.video.checkPublishReadiness(requireWorkspaceId(session), id)
  }

  // ─── Rights ledger ───

  @Post('projects/:id/assets')
  @HttpCode(200)
  async addAsset(
    @Param('id') id: string,
    @Body() dto: CreateVideoAssetDto,
    @Session() session: any,
  ) {
    return this.video.addAsset(requireWorkspaceId(session), id, dto)
  }

  @Patch('projects/:id/assets/:assetId')
  async setAssetStatus(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Body() body: { status: string },
    @Session() session: any,
  ) {
    return this.video.setAssetStatus(requireWorkspaceId(session), id, assetId, body.status)
  }

  @Delete('projects/:id/assets/:assetId')
  async deleteAsset(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Session() session: any,
  ) {
    return this.video.deleteAsset(requireWorkspaceId(session), id, assetId)
  }

  // ─── Claim ledger ───

  @Post('projects/:id/claims')
  @HttpCode(200)
  async addClaim(
    @Param('id') id: string,
    @Body() dto: CreateVideoClaimDto,
    @Session() session: any,
  ) {
    return this.video.addClaim(requireWorkspaceId(session), id, dto)
  }

  @Patch('projects/:id/claims/:claimId')
  async setClaimStatus(
    @Param('id') id: string,
    @Param('claimId') claimId: string,
    @Body() body: { status: string },
    @Session() session: any,
  ) {
    return this.video.setClaimStatus(requireWorkspaceId(session), id, claimId, body.status)
  }

  @Delete('projects/:id/claims/:claimId')
  async deleteClaim(
    @Param('id') id: string,
    @Param('claimId') claimId: string,
    @Session() session: any,
  ) {
    return this.video.deleteClaim(requireWorkspaceId(session), id, claimId)
  }

  /**
   * GET /video/projects/:id/claim-check — quét claim ledger theo quy tắc
   * ghi nhãn (playbook chương 06/07): claim unverified → bắt buộc
   * "CHƯA XÁC MINH" trong kịch bản.
   */
  @Get('projects/:id/claim-check')
  async claimCheck(@Param('id') id: string, @Session() session: any) {
    return this.video.claimCheck(requireWorkspaceId(session), id)
  }

  // ─── Checklist tuân thủ xuất bản (playbook chương 09) ───

  @Get('projects/:id/compliance')
  async getCompliance(@Param('id') id: string, @Session() session: any) {
    return this.video.getCompliance(requireWorkspaceId(session), id)
  }

  @Post('projects/:id/compliance')
  @HttpCode(200)
  async setCompliance(
    @Param('id') id: string,
    @Body() dto: SetComplianceDto,
    @Session() session: any,
  ) {
    return this.video.setCompliance(requireWorkspaceId(session), id, dto)
  }

  // ─── Prompt biên kịch dùng lại (playbook chương 07) ───

  @Get('scriptwriter-prompt')
  scriptwriterPrompt() {
    return this.video.getScriptwriterPrompt({})
  }

  // ─── AI register ───

  @Post('projects/:id/ai-entries')
  @HttpCode(200)
  async addAiEntry(
    @Param('id') id: string,
    @Body() dto: CreateVideoAiEntryDto,
    @Session() session: any,
  ) {
    return this.video.addAiEntry(requireWorkspaceId(session), id, dto)
  }

  @Patch('projects/:id/ai-entries/:entryId')
  async setAiLabel(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body() body: { labelApplied: boolean },
    @Session() session: any,
  ) {
    return this.video.setAiLabel(requireWorkspaceId(session), id, entryId, body.labelApplied)
  }

  @Delete('projects/:id/ai-entries/:entryId')
  async deleteAiEntry(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Session() session: any,
  ) {
    return this.video.deleteAiEntry(requireWorkspaceId(session), id, entryId)
  }

  // ─── Gửi sang Content Studio ───

  @Post('projects/:id/to-content-studio')
  @HttpCode(200)
  async toContentStudio(@Param('id') id: string, @Session() session: any, @Req() req: Request) {
    return this.video.sendToContentStudio(requireWorkspaceId(session), id, req.ip)
  }
}
