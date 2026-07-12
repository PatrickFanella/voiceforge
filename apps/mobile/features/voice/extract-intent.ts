import type { VoiceLog } from '@/types';

export interface ExtractedVoiceIntent {
  category: VoiceLog['category'];
  confidence: number;
  consequentialAction: 'time' | 'safety' | null;
  matchedTerms: string[];
}

const TERMS: Record<VoiceLog['category'], string[]> = {
  time: ['clock in', 'clock out', 'hours', 'break', 'lunch', 'overtime', 'started work', 'finished work'],
  safety: ['hazard', 'incident', 'injury', 'ppe', 'lockout', 'tagout', 'unsafe', 'live wire', 'fire'],
  materials: ['need to order', 'material', 'wire', 'cable', 'breaker', 'parts', 'running low'],
  communication: ['call', 'tell the client', 'notify', 'email', 'follow up'],
  note: [],
};

export function extractVoiceIntent(transcript: string): ExtractedVoiceIntent {
  const normalized = transcript.trim().toLowerCase();
  if (!normalized) return { category: 'note', confidence: 0, consequentialAction: null, matchedTerms: [] };

  const ranked = (Object.entries(TERMS) as [VoiceLog['category'], string[]][])
    .map(([category, terms]) => ({ category, matchedTerms: terms.filter((term) => normalized.includes(term)) }))
    .sort((a, b) => b.matchedTerms.length - a.matchedTerms.length);
  const best = ranked[0];
  if (!best.matchedTerms.length) return { category: 'note', confidence: 0.35, consequentialAction: null, matchedTerms: [] };

  const confidence = Math.min(0.95, 0.58 + best.matchedTerms.length * 0.12);
  return {
    category: best.category,
    confidence,
    consequentialAction: best.category === 'time' || best.category === 'safety' ? best.category : null,
    matchedTerms: best.matchedTerms,
  };
}
