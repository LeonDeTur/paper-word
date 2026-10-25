export type Block = {
  id: number;
  kind: "paragraph" | "heading" | "figure";
  text: string;
  ru: string;
  image?: string;
};
export type Article = {
  id: string;
  title: string;
  source_url: string;
  tags: string[];
  created_at: string;
  status: "inbox" | "reading" | "done";
  read_block: number;
  starred: boolean;
  blocks: Block[];
  dictionary: Record<string, string>;
  job_state: "idle" | "running" | "error";
  job_error: string;
  has_original: boolean;
};
export type Direction = "en-ru" | "ru-en";
export type Schedule = {
  direction: Direction;
  due_at: string;
  interval_days: number;
  ease: number;
  reps: number;
  lapses: number;
};
export type Card = {
  id: string;
  article_id: string | null;
  article_title: string | null;
  block_id: number;
  lemma: string;
  source_form: string;
  translation: string;
  context: string;
  notes: string;
  created_at: string;
  schedules: Schedule[];
};
export type Review = Card & { direction: Direction; due_at: string };
export type Config = {
  authenticated: boolean;
  password_required: boolean;
  ai_configured: boolean;
  ai_model: string;
  ai_host: string;
};
