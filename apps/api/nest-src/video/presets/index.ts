import { TIMELAPSE_CONSTRUCTION_PRESET, VideoPreset } from './timelapse-construction'

/** Registry preset video — thêm preset mới bằng cách import + push vào mảng. */
export const VIDEO_PRESETS: VideoPreset[] = [TIMELAPSE_CONSTRUCTION_PRESET]

export function getPresetById(id: string): VideoPreset | undefined {
  return VIDEO_PRESETS.find((p) => p.id === id)
}

export function listPresetSummaries() {
  return VIDEO_PRESETS.map((p) => ({
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    keyframeCount: p.keyframes.length,
    phaseCount: p.phases.length,
    durations: p.durationMaps.map((d) => ({
      id: d.id,
      label: d.label,
      shotCount: d.keyframeIds.length,
      secondsPerKeyframe: d.secondsPerKeyframe,
    })),
    placeholders: p.placeholders.map((ph) => ({
      key: ph.key,
      label: ph.label,
      hint: ph.hint,
      example: ph.example,
    })),
  }))
}
