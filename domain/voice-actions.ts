export type ConsequentialVoiceAction = 'time' | 'safety';

export interface VoiceActionProposal {
  sourceVoiceLogId: string;
  action: ConsequentialVoiceAction;
  confidence: number;
}

export interface ConfirmedVoiceAction extends VoiceActionProposal {
  confirmedAt: string;
}

export function confirmVoiceAction(
  proposal: VoiceActionProposal,
  confirmed: boolean,
  now: Date = new Date(),
): ConfirmedVoiceAction {
  if (!proposal.sourceVoiceLogId.trim()) {
    throw new Error('Source voice log is required');
  }

  if (!confirmed) {
    throw new Error('Explicit confirmation is required');
  }

  return {
    ...proposal,
    confirmedAt: now.toISOString(),
  };
}
