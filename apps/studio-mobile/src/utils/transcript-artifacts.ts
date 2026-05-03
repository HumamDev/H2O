// Known ChatGPT metadata strings that must never appear as visible chat turns.
const KNOWN_TRANSCRIPT_ARTIFACTS = new Set([
  'original custom instructions no longer available',
]);

export function isKnownTranscriptArtifact(raw: unknown): boolean {
  return KNOWN_TRANSCRIPT_ARTIFACTS.has(String(raw ?? '').toLowerCase().trim());
}
