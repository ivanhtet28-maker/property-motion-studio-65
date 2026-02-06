// Map frontend voice names to backend voice IDs
export const VOICE_MAPPING: Record<string, string> = {
  "Australian Male": "australian-male",
  "Australian Female": "australian-female",
  "British Male": "british-male",
  "British Female": "british-female",
  "American Male": "american-male",
  "American Female": "american-female",
};

// Convert frontend voice name to backend ID
export function getVoiceId(voiceName: string): string | null {
  return VOICE_MAPPING[voiceName] || null;
}
