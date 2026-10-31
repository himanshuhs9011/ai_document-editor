/** Shapes the Studio receives from /api/studio. */

export interface PlaybookField {
  id: string;
  label: string;
  hint: string;
  kind: 'text' | 'long' | 'choice';
  options: string[];
  required: boolean;
}

export interface CrewMember {
  id: string;
  name: string;
  craft: string;
}

export interface Playbook {
  id: string;
  name: string;
  group: string;
  summary: string;
  notice: string;
  formats: { id: string; name: string }[];
  fields: PlaybookField[];
  specialists: CrewMember[];
  reviewers: CrewMember[];
  max_sections: number;
}

export interface Issue {
  reviewer: string;
  section: number | null;
  severity: 'high' | 'medium' | 'low';
  problem: string;
  fix: string;
  resolved: boolean;
}

export interface RunResult {
  markdown: string;
  sources: { n: number; filename: string }[];
  issues: Issue[];
  stock_phrases: { phrase: string; count: number }[];
  notice: string;
  warning: string;
}

export interface RunRequest {
  playbook: string;
  format: string;
  brief: string;
  fields: Record<string, string>;
  document_ids: string[];
  depth: 'quick' | 'thorough';
}
