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
  "articles:import": "Загрузка статей",
  "articles:read": "Чтение и поиск по всей библиотеке",
  "articles:write": "Изменение статей и переводов",
  "cards:read": "Чтение словаря и очереди повторений",
  "cards:write": "Создание и изменение карточек",
  "reviews:write": "Сохранение оценок повторения",
  "ai:use": "Запуск настроенной модели (возможны расходы)",
  "data:delete": "Удаление статей и карточек",
};
