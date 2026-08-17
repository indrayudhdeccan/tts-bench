export type ApprovalStatus = "pending" | "approved" | "revoked";

export interface AccessProfile {
  is_admin?: boolean;
  is_rater?: boolean;
  approval_status?: ApprovalStatus;
}

/** Whether the user may cast votes in the arena. */
export function canVote(profile: AccessProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.is_admin) return true;
  if (profile.is_rater === false) return false;
  return profile.approval_status === "approved";
}

export function accessRedirectPath(profile: AccessProfile | null | undefined): string | null {
  if (!profile || profile.is_admin) return null;
  if (profile.approval_status === "pending") return "/pending-approval";
  if (profile.approval_status === "revoked") return "/access-revoked";
  if (profile.is_rater === false) return "/access-revoked";
  return null;
}
