export interface ReleaseEvidence {
  diffReviewed: boolean;
  localTestsPassed: boolean;
  backupVerified: boolean;
  manifestPresent: boolean;
  explicitHumanApproval: boolean;
}

export function canStartApprovedRelease(_evidence: Partial<ReleaseEvidence>): false {
  // Release is deliberately not implemented or activated by this PR.
  return false;
}
