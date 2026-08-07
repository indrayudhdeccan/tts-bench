export type VoteType = "model_vs_model" | "model_vs_human";
export type ClipEntityType = "model" | "human";
export type VoteResult = "a" | "b" | "tie" | "both_bad";
export type RecordingTier = "casual" | "pro" | "studio";
export type ClipStatus = "pending" | "ready" | "failed" | "archived";

export interface Language {
  id: string;
  code: string;
  name: string;
  active: boolean;
  sort_order: number;
}

export interface Domain {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  sort_order: number;
}

export interface IssueTag {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  active: boolean;
  sort_order: number;
}

export interface Speaker {
  id: string;
  slug: string;
  name: string;
  notes: string | null;
  active: boolean;
}

export interface Script {
  id: string;
  script_no: number;
  language_id: string;
  domain_id: string | null;
  speaker_id: string | null;
  named_entity: string | null;
  text: string;
  meaning: string | null;
  transliteration: string | null;
  source_url: string | null;
  active: boolean;
  metadata: Record<string, unknown>;
  languages?: Language;
  domains?: Domain | null;
  speakers?: Speaker | null;
}

export interface Model {
  id: string;
  slug: string;
  name: string;
  provider: string;
  api_slug: string | null;
  default_voice: string | null;
  voice_label: string | null;
  color: string;
  active: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
}

export interface ModelVoice {
  id: string;
  model_id: string;
  voice_key: string;
  label: string;
  active: boolean;
  is_default: boolean;
}

export interface Run {
  id: string;
  slug: string;
  name: string;
  prompt_policy: string;
  notes: string | null;
  is_default: boolean;
  metadata: Record<string, unknown>;
}

export interface ReferenceRecording {
  id: string;
  script_id: string;
  speaker_id: string | null;
  run_id: string | null;
  tier: RecordingTier;
  storage_path: string;
  public_url: string | null;
  mime_type: string | null;
  bytes: number | null;
  active: boolean;
  is_primary: boolean;
}

export interface ModelClip {
  id: string;
  script_id: string;
  model_id: string;
  run_id: string;
  voice_key: string | null;
  storage_path: string;
  public_url: string | null;
  mime_type: string | null;
  bytes: number | null;
  status: ClipStatus;
  error_message: string | null;
  models?: Model;
}

export interface Profile {
  id: string;
  display_name: string | null;
  is_admin: boolean;
  is_rater: boolean;
  native_languages: string[];
  vote_count: number;
}

export interface VotePayload {
  vote_type: VoteType;
  script_id: string;
  run_id?: string | null;
  clip_a_type: ClipEntityType;
  clip_a_model_id?: string | null;
  clip_a_ref_id?: string | null;
  clip_b_type: ClipEntityType;
  clip_b_model_id?: string | null;
  clip_b_ref_id?: string | null;
  result: VoteResult;
  tags_a?: string[];
  tags_b?: string[];
}

export interface EloRow {
  id: string;
  slug: string;
  name: string;
  color: string;
  voice_label: string | null;
  voices: Array<{ voice_key: string; label: string }>;
  elo: number;
  ci: number;
  matchups: number;
}

export interface LeaderboardData {
  models: EloRow[];
  h2h: Record<string, Record<string, number | null>>;
  vsHuman: Array<{
    model_id: string;
    slug: string;
    name: string;
    color: string;
    model_wins_pct: number | null;
    human_wins_pct: number | null;
    total: number;
  }>;
  issueCounts: Record<string, Record<string, number>>;
}

export interface VotePairClip {
  type: ClipEntityType;
  model_id?: string;
  ref_id?: string;
  audio_url: string;
}

export interface VotePair {
  vote_type: VoteType;
  script: Script;
  run_id?: string;
  clip_a: VotePairClip;
  clip_b: VotePairClip;
}
