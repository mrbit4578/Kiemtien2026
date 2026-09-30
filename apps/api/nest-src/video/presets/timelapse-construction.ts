/**
 * Preset: Timelapse công trình ("Nể phục")
 * ─────────────────────────────────────────
 * Đúc kết từ phân tích video viral 1.3M views (@constructionandrestaura):
 *  - 1 góc camera khóa cứng tuyệt đối, 0 cú cắt, morph liên tục
 *  - Vật neo bất khả thi (nghịch lý không gian) giữ nguyên suốt video
 *  - 8 pha theo tỉ lệ % thời lượng — áp dụng cho mọi độ dài
 *  - Ánh sáng kể chuyện song song: sáng sớm → trưa gắt → hoàng hôn → đêm
 *
 * Nguồn: docs/timelapse-construction-shotlist.md
 */

export interface PresetPlaceholder {
  key: 'boiCanh' | 'vatNeo' | 'kienTruc' | 'chu'
  label: string
  hint: string
  example: string
}

export interface PresetPhase {
  id: string
  label: string
  pctStart: number
  pctEnd: number
}

export interface ShotKeyframe {
  id: string // KF01 … KF30
  phaseId: string
  title: string // tiêu đề tiếng Việt
  change: string // mô tả thay đổi (tiếng Việt)
  light: string // ghi chú ánh sáng (tiếng Anh, ghép vào prompt)
  /** Prompt tiếng Anh, chứa {{boiCanh}} {{vatNeo}} {{kienTruc}} {{chu}} */
  prompt: string
}

export interface DurationMap {
  id: 'short' | 'long'
  label: string
  keyframeIds: string[]
  secondsPerKeyframe: number
}

export interface VideoPreset {
  id: string
  name: string
  tagline: string
  description: string
  cameraLock: string
  placeholders: PresetPlaceholder[]
  ironRules: string[]
  phases: PresetPhase[]
  keyframes: ShotKeyframe[]
  durationMaps: DurationMap[]
  audio: { music: string; level: string; ambient: string; voiceover: string }
  overlay: { text: string; position: string; safeZone: string; aiLabel: string }
}

export type PresetVars = Record<'boiCanh' | 'vatNeo' | 'kienTruc' | 'chu', string>

const CAMERA_LOCK = `Same exact camera position, same focal length, same horizon line,
same neighbouring buildings and street in foreground, pixel-identical framing.
Aerial 3/4 view, 35-degree elevation, vertical 9:16.`

const kf = (
  id: string,
  phaseId: string,
  title: string,
  change: string,
  light: string,
  prompt: string,
): ShotKeyframe => ({ id, phaseId, title, change, light, prompt })

export const TIMELAPSE_CONSTRUCTION_PRESET: VideoPreset = {
  id: 'timelapse-construction',
  name: 'Timelapse công trình (Nể phục)',
  tagline: 'Before → After một góc máy: lô đất bất khả thi biến thành công trình hoàn chỉnh',
  description:
    'Preset dựng video timelapse xây dựng theo format viral "Nể phục": camera khóa cứng 1 góc, ' +
    '0 cú cắt, vật neo bất khả thi giữ nguyên suốt video, ánh sáng chạy song song tiến độ ' +
    '(sáng sớm → trưa → hoàng hôn → đêm đèn vàng).',

  cameraLock: CAMERA_LOCK,

  placeholders: [
    {
      key: 'boiCanh',
      label: 'Bối cảnh',
      hint: 'Lô đất kiểu gì, xung quanh ra sao (tiếng Anh, dùng trong prompt)',
      example: 'narrow urban lot between two concrete houses, paved street in foreground, dense city skyline behind',
    },
    {
      key: 'vatNeo',
      label: 'Vật neo (nghịch lý)',
      hint: 'Vật thể bất khả thi, KHÔNG BAO GIỜ di chuyển/xê dịch suốt video',
      example: 'giant granite boulder, 8 meters tall, occupying half the lot',
    },
    {
      key: 'kienTruc',
      label: 'Kiến trúc cuối',
      hint: 'Phong cách công trình hoàn chỉnh',
      example: 'modern minimalist 3-storey villa, raw concrete, floor-to-ceiling glass, vertical wood slats',
    },
    {
      key: 'chu',
      label: 'Chữ overlay',
      hint: '1–2 từ cảm xúc giữ nguyên giữa khung suốt video',
      example: 'Nể phục',
    },
  ],

  ironRules: [
    'Camera lệch >5–10px giữa 2 keyframe = mất ảo giác timelapse. Luôn image-to-image từ cùng plate + cùng seed.',
    'Bước tiến độ quá lớn = morph nhão. Bản 5 phút cần ≥25 keyframe; bản 60s cần ≥7.',
    'Không cắt cảnh. Nối bằng cross-dissolve 8–12 frame; giữ 24fps xuyên suốt.',
    'Giữ ~4% đầu trên hiện trạng bất khả thi — không có hook "làm sao xây nổi?" thì khán giả không ở lại.',
    'Vật neo không bao giờ di chuyển, xê dịch hay biến mất — đó là nhân vật chính.',
  ],

  phases: [
    { id: 'before', label: 'Before — hiện trạng bất khả thi', pctStart: 0, pctEnd: 4 },
    { id: 'clearing', label: 'Phá dỡ & phát quang', pctStart: 4, pctEnd: 20 },
    { id: 'foundation', label: 'Phần ngầm (móng)', pctStart: 20, pctEnd: 43 },
    { id: 'structure', label: 'Phần thân (khung)', pctStart: 43, pctEnd: 63 },
    { id: 'envelope', label: 'Vỏ & hoàn thiện', pctStart: 63, pctEnd: 77 },
    { id: 'interior', label: 'Nội thất + hồ + đèn', pctStart: 77, pctEnd: 89 },
    { id: 'landscape', label: 'Cảnh quan + reveal', pctStart: 89, pctEnd: 96 },
    { id: 'beauty', label: 'Beauty shot', pctStart: 96, pctEnd: 100 },
  ],

  keyframes: [
    // ── PHA 0: BEFORE ──
    kf('KF01', 'before', 'Hook: giữ yên trên hiện trạng',
      'Toàn cảnh lô đất hoang, vật neo nổi bật giữa khung, đổ nát xung quanh.',
      'Soft early-morning light, long gentle shadows.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{vatNeo}} dominates the centre of the frame, untouched. Scattered debris, broken bricks, overgrown weeds, rusted metal sheets. Soft early-morning light, long gentle shadows. Photorealistic, cinematic, architectural photography, ultra detailed.`),
    kf('KF02', 'before', 'Con người xuất hiện',
      '2 công nhân đội mũ bảo hộ đứng đo đạc, thước dây/cọc — gợi "sắp bắt đầu".',
      'Morning light.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{vatNeo}} centre frame, untouched. Two construction workers in orange helmets surveying with measuring tape and wooden stakes, one wheelbarrow at the gate. Morning light. Photorealistic, cinematic.`),

    // ── PHA 1: PHÁ DỠ & PHÁT QUANG ──
    kf('KF03', 'clearing', 'Dọn dẹp bắt đầu',
      'Công nhân xúc rác lên xe cút kít, bao tải trắng chất đống.',
      'Morning sun climbing.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{vatNeo}} centre frame. Four workers clearing rubble, wheelbarrows in motion (slight motion blur), white rubble sacks piled near the gate, dust in the air. Morning sun climbing. Photorealistic.`),
    kf('KF04', 'clearing', 'Vật neo lộ rõ',
      'Mặt bằng trống một nửa, vật neo hiện nguyên hình — khoảnh khắc "à, vấn đề là đây".',
      'Bright late-morning light, crisp shadows.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{vatNeo}} fully exposed, centre frame, half the lot now bare earth. Remaining debris pushed to one corner. Bright late-morning light, crisp shadows. Photorealistic, cinematic.`),
    kf('KF05', 'clearing', 'Mặt bằng sạch',
      'Đất san phẳng, chỉ còn vật neo + dụng cụ thi công.',
      'Harsh midday sun, hard shadows falling left.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{vatNeo}} centre frame, untouched. Lot graded flat, bare compacted earth, shovels and a cement mixer at the side. Harsh midday sun, hard shadows falling left. Photorealistic.`),
    kf('KF06', 'clearing', 'Đánh dấu mặt bằng',
      'Vạch trắng, cọc gỗ, dây căng layout móng quanh vật neo.',
      'Midday sun.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{vatNeo}} centre frame. White painted layout lines, wooden stakes and yellow string lines marking foundation grid AROUND {{vatNeo}}. A worker kneeling with spray paint. Midday sun. Photorealistic.`),

    // ── PHA 2: PHẦN NGẦM ──
    kf('KF07', 'foundation', 'Đào móng',
      'Hố móng đào quanh vật neo, đất đắp thành đống.',
      'Midday sun.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{vatNeo}} centre frame, untouched. Foundation trenches dug in a grid around {{vatNeo}}, excavated soil piled at edges, two workers with shovels inside trenches. Midday sun. Photorealistic.`),
    kf('KF08', 'foundation', 'Bê tông lót',
      'Đáy hố lót đá + lớp bê tông lót xám.',
      'Harsh midday light.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{vatNeo}} centre frame. Trenches lined with gravel and a fresh grey lean-concrete layer, steel reinforcement bars stacked nearby. Harsh midday light. Photorealistic, cinematic.`),
    kf('KF09', 'foundation', 'Cốt thép móng',
      'Lồng thép móng + thép chờ cột dựng đứng.',
      'Bright afternoon sun.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{vatNeo}} centre frame. Steel rebar cages laid in trenches, vertical column starter bars rising, workers tying rebar with wire. Bright afternoon sun. Photorealistic.`),
    kf('KF10', 'foundation', 'Đổ bê tông móng',
      'Bê tông tươi xám ướt trong hố, xe trộn mini.',
      'Afternoon sun.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{vatNeo}} centre frame. Wet grey concrete freshly poured into foundation trenches, portable cement mixer churning, workers screeding the surface. Afternoon sun. Photorealistic.`),
    kf('KF11', 'foundation', 'Cột tầng trệt đầu tiên',
      'Coffa gỗ dựng, cột bê tông đầu tiên mọc lên.',
      'Afternoon light softening.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{vatNeo}} centre frame. Timber formwork for ground-floor columns erected, first concrete columns cast, low scaffolding, red brick pallets arriving. Afternoon light softening. Photorealistic.`),
    kf('KF12', 'foundation', 'Sàn tầng 1',
      'Sàn bê tông tầng 1 hoàn thành, thép chờ lên tầng 2.',
      'Late-afternoon warm light.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{vatNeo}} centre frame, now framed by fresh concrete slab of the first floor. Vertical rebar waiting for the next level, ladders leaning. Late-afternoon warm light. Photorealistic, cinematic.`),

    // ── PHA 3: PHẦN THÂN ──
    kf('KF13', 'structure', 'Khung tầng 2 + cầu thang ôm vật neo',
      'Cột tầng 2, cầu thang bê tông đầu tiên uốn quanh vật neo.',
      'Golden late-afternoon light.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{vatNeo}} centre frame, now embraced by rising concrete frame. First raw concrete staircase curving around {{vatNeo}}, second-floor columns cast. Golden late-afternoon light. Photorealistic.`),
    kf('KF14', 'structure', 'Sàn tầng 2 & khung mái',
      'Sàn tầng 2, dầm mái, giàn giáo cao.',
      'Warm sunset light.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{vatNeo}} centre frame, towered over by two concrete floor slabs and roof beams. Tall scaffolding wrapping the structure, workers silhouetted on top. Warm sunset light. Photorealistic.`),
    kf('KF15', 'structure', 'Tường xây chèn',
      'Tường gạch bắt đầu lấp đầy khung, vật neo lọt thỏm giữa nhà.',
      'Sunset glow.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{vatNeo}} centre frame, nestled inside the concrete skeleton. Red-brick infill walls half-built, mortar buckets and trowels visible, {{vatNeo}} now an indoor-outdoor feature. Sunset glow. Photorealistic, cinematic.`),
    kf('KF16', 'structure', 'Tường bao gần kín',
      'Tường kín, chừa ô kính lớn hướng vào vật neo.',
      'Dusk approaching, sky turning orange.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{vatNeo}} centre frame, framed by near-complete walls with large window openings facing it. Scaffolding partially removed. Dusk approaching, sky turning orange. Photorealistic.`),
    kf('KF17', 'structure', 'Mái hoàn thành',
      'Mái đúc xong, giàn giáo bao quanh, đường nét kiến trúc rõ.',
      'Deep-orange dusk sky.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{kienTruc}} structural shell complete around untouched {{vatNeo}} centre frame. Flat concrete roof cast, scaffolding still up, building silhouette crisp against deep-orange dusk sky. Photorealistic.`),
    kf('KF18', 'structure', 'Tháo giàn giáo',
      'Giàn giáo dỡ một nửa, khối nhà hiện hình.',
      'Blue-hour sky.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{kienTruc}} revealed as scaffolding comes half-down, {{vatNeo}} centre frame integrated into the design. Workers carrying scaffold poles away. Blue-hour sky. Photorealistic, cinematic.`),

    // ── PHA 4: VỎ & HOÀN THIỆN ──
    kf('KF19', 'envelope', 'Lắp kính mặt tiền',
      'Khung nhôm + kính lớn được lắp.',
      'Early blue hour, interior still dark.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{kienTruc}}, {{vatNeo}} centre frame. Floor-to-ceiling glass panels being installed in aluminium frames, reflections of the sky on glass. Early blue hour, interior still dark. Photorealistic.`),
    kf('KF20', 'envelope', 'Ốp mặt tiền',
      'Lam gỗ / vật liệu ốp lên mặt tiền.',
      'Blue hour deepening.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{kienTruc}}, {{vatNeo}} centre frame. Vertical wood-slat cladding going up on the facade, warm wood tone against raw concrete. Blue hour deepening. Photorealistic, cinematic.`),
    kf('KF21', 'envelope', 'Sân, tường rào, cổng mới',
      'Lát sân, cổng sắt mới, tường rào sơn.',
      'Night falling, first landscape lights glowing.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{kienTruc}}, {{vatNeo}} centre frame. New stone-paved courtyard, modern steel gate installed, boundary walls freshly rendered. First landscape lights glowing. Night falling. Photorealistic.`),
    kf('KF22', 'envelope', 'Vệ sinh công nghiệp',
      'Vật liệu thừa dọn sạch, công trình sạch bong.',
      'Night, warm light spilling from windows.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{kienTruc}} pristine, {{vatNeo}} centre frame washed clean. Last material piles removed, workers sweeping the courtyard. Warm light spilling from windows. Night. Photorealistic.`),

    // ── PHA 5: NỘI THẤT + HỒ + ĐÈN ──
    kf('KF23', 'interior', 'Đèn vàng bật lần đầu',
      'Nội thất lấp ló, đèn vàng bật sáng — nhịp cảm xúc thứ hai, khoảnh khắc "wow".',
      'Magical night mood.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{kienTruc}} at night, {{vatNeo}} centre frame dramatically uplighted. Warm golden interior lights switched on for the first time, furniture silhouettes visible through glass. Magical night mood. Photorealistic, cinematic.`),
    kf('KF24', 'interior', 'Hồ bơi đổ nước',
      'Hồ bơi cạnh vật neo đầy nước xanh, lát đá quanh hồ.',
      'Luxurious night atmosphere.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{kienTruc}} at night, {{vatNeo}} centre frame beside a new infinity pool filled with glowing blue water, stone decking, underwater lights on. Luxurious night atmosphere. Photorealistic.`),
    kf('KF25', 'interior', 'Sân vườn & đèn cảnh quan',
      'Ghế ngoài trời, đèn lối đi, cây trồng mới.',
      'Warm and inviting night.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{kienTruc}} at night, {{vatNeo}} centre frame with artistic uplighting. Outdoor lounge chairs, path lights lining the walkway, young palm trees planted. Warm and inviting. Photorealistic.`),
    kf('KF26', 'interior', 'Toàn nhà rực sáng',
      'Mọi đèn bật, vật neo thành tác phẩm nghệ thuật.',
      'Peak beauty, night.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{kienTruc}} fully lit at night, {{vatNeo}} centre frame as a sculptural centrepiece with museum-grade uplighting, pool glowing, every window warm. Peak beauty, wide and still. Photorealistic.`),

    // ── PHA 6: CẢNH QUAN + REVEAL ──
    kf('KF27', 'landscape', 'Tiểu cảnh quanh vật neo',
      'Lối đá, cây bụi, đèn âm đất quanh chân vật neo.',
      'Serene luxury night.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{kienTruc}} at night, {{vatNeo}} centre frame surrounded by finished landscaping: stepping-stone path, shrubs, in-ground spotlights at its base. Serene luxury. Photorealistic, cinematic.`),
    kf('KF28', 'landscape', 'Reveal: cổng mở, toàn cảnh',
      'Cổng mở hé, nhìn xuyên vào toàn bộ công trình hoàn chỉnh.',
      'Grand night reveal.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{kienTruc}} grand night reveal, {{vatNeo}} centre frame, modern gate swung open, full view of the illuminated villa, pool and landscaped garden. The impossible made real. Photorealistic.`),

    // ── PHA 7: BEAUTY SHOT ──
    kf('KF29', 'beauty', 'Giữ yên cho người xem ngắm',
      'Không thêm gì — frame đẹp nhất giữ 4% cuối.',
      'Absolute stillness, night.',
      `${CAMERA_LOCK}\n{{boiCanh}}. {{kienTruc}} in its most beautiful night composition, {{vatNeo}} centre frame glowing under accent lights, pool mirror-calm, stars faint in the sky. Absolute stillness, hold for the viewer. Photorealistic, cinematic masterpiece.`),
    kf('KF30', 'beauty', 'End card',
      'Nền đen + chữ overlay.',
      'n/a',
      `Black screen. Centre: "{{chu}}" in large white serif type. Below, small: TikTok logo. Minimal, elegant, 3 seconds.`),
  ],

  durationMaps: [
    {
      id: 'short',
      label: 'Bản 45–60s (khuyên dùng)',
      keyframeIds: ['KF01', 'KF04', 'KF08', 'KF13', 'KF19', 'KF24', 'KF29', 'KF30'],
      secondsPerKeyframe: 7,
    },
    {
      id: 'long',
      label: 'Bản dài 5 phút (đầy đủ)',
      keyframeIds: [
        'KF01', 'KF02', 'KF03', 'KF04', 'KF05', 'KF06', 'KF07', 'KF08',
        'KF09', 'KF10', 'KF11', 'KF12', 'KF13', 'KF14', 'KF15', 'KF16',
        'KF17', 'KF18', 'KF19', 'KF20', 'KF21', 'KF22', 'KF23', 'KF24',
        'KF25', 'KF26', 'KF27', 'KF28', 'KF29', 'KF30',
      ],
      secondsPerKeyframe: 10,
    },
  ],

  audio: {
    music: 'Nhạc nền êm, leo thang nhẹ theo tiến độ công trình.',
    level: 'Rất nhỏ: −35 đến −45 dBFS — không cạnh tranh với hình.',
    ambient: 'Lớp ambient công trường xa (búa, máy trộn) ở mức thì thầm.',
    voiceover: 'KHÔNG voice-over — để hình kể chuyện.',
  },

  overlay: {
    text: '{{chu}} — 1–2 từ cảm xúc, giữ nguyên suốt video.',
    position: 'Đặt ở ~40% chiều cao khung hình.',
    safeZone: 'Chừa đáy-phải ~25% chiều rộng cho UI TikTok.',
    aiLabel: 'Nội dung AI chân thực → gắn nhãn AI khi đăng (TikTok 2026 bắt buộc).',
  },
}

/** Điền 4 biến bối cảnh vào prompt của 1 keyframe. */
export function renderPresetPrompt(preset: VideoPreset, kfId: string, vars: PresetVars): string {
  const k = preset.keyframes.find((x) => x.id === kfId)
  if (!k) throw new Error(`Không tìm thấy keyframe ${kfId} trong preset ${preset.id}.`)
  return k.prompt
    .replaceAll('{{boiCanh}}', vars.boiCanh)
    .replaceAll('{{vatNeo}}', vars.vatNeo)
    .replaceAll('{{kienTruc}}', vars.kienTruc)
    .replaceAll('{{chu}}', vars.chu)
}

/** Lấy bản đồ thời lượng (mặc định 'short'). */
export function getDurationMap(preset: VideoPreset, durationId?: string): DurationMap {
  return (
    preset.durationMaps.find((d) => d.id === durationId) ??
    preset.durationMaps[0]
  )
}

/** Render toàn bộ shot-list cho 1 thời lượng: [{id, title, change, prompt}]. */
export function renderShotList(
  preset: VideoPreset,
  durationId: string | undefined,
  vars: PresetVars,
) {
  const map = getDurationMap(preset, durationId)
  const byId = new Map(preset.keyframes.map((k) => [k.id, k]))
  return {
    duration: map,
    shots: map.keyframeIds.map((id) => {
      const k = byId.get(id)
      if (!k) throw new Error(`Keyframe ${id} không tồn tại trong preset ${preset.id}.`)
      const phase = preset.phases.find((p) => p.id === k.phaseId)
      return {
        id: k.id,
        phase: phase?.label ?? k.phaseId,
        title: k.title,
        change: k.change,
        light: k.light,
        prompt: renderPresetPrompt(preset, id, vars),
      }
    }),
  }
}
