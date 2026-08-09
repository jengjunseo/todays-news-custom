import { girlsBandCryPreset } from "@/lib/presets/girls-band-cry";
import type { NewspaperPreset } from "@/lib/presets/schema";
import { wonjuPreset } from "@/lib/presets/wonju";

export const NEWSPAPER_PRESETS = [girlsBandCryPreset, wonjuPreset] as const satisfies readonly NewspaperPreset[];
export const DEFAULT_PRESET_ID = girlsBandCryPreset.id;

const presetById = new Map<string, NewspaperPreset>(
  NEWSPAPER_PRESETS.map((preset) => [preset.id, preset]),
);

export function getPreset(presetId: string | undefined | null) {
  return presetById.get(presetId ?? DEFAULT_PRESET_ID) ?? null;
}

export function getPresetOrDefault(presetId: string | undefined | null) {
  return getPreset(presetId) ?? girlsBandCryPreset;
}
