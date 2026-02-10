import type { ApprovalDecision, ApprovalMode } from '../types';

export class ApprovalManager {
  constructor(private mode: ApprovalMode) {}

  decideTool(): ApprovalDecision {
    return this.mode === 'yolo' ? 'accept' : 'decline';
  }

  decideFileChange(): ApprovalDecision {
    return this.mode === 'yolo' ? 'accept' : 'decline';
  }
}
