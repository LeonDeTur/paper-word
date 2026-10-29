export const AGENT_SCOPES = [
  "articles:import",
  "articles:read",
  "articles:write",
  "cards:read",
  "cards:write",
  "reviews:write",
  "ai:use",
  "data:delete",
] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];
export const DEFAULT_AGENT_SCOPES: AgentScope[] = ["articles:import"];
export const MANAGE_AGENT_SCOPES = AGENT_SCOPES.filter(
  (s) => s !== "data:delete",
);
export const SCOPE_LABELS: Record<AgentScope, string> = {
  "articles:import": "Import articles",
  "articles:read": "Read and search the entire library",
  "articles:write": "Edit articles and translations",
  "cards:read": "Read vocabulary and review queue",
  "cards:write": "Create and edit cards",
  "reviews:write": "Save review ratings",
  "ai:use": "Use the configured model (may incur costs)",
  "data:delete": "Delete articles and cards",
};
