import { useEffect, useId, useState } from "react";
import { KeyRound, Copy, Check } from "lucide-react";
import { api, json } from "../api";
import {
  localDateTime,
  parseTokenExpiryCommand,
  parseTokenExpiryDate,
  resolveTokenExpiry,
  type TokenExpiryInput,
} from "../token-expiry";

type TokenInfo = {
  id: string;
  name: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
};
export function AgentAccess() {
  const [chatgpt, setChatgpt] = useState<{
    enabled: boolean;
    mcp_url: string;
    version: string;
  } | null>(null);
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [name, setName] = useState("Агент статей");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [expiryMode, setExpiryMode] = useState<"calendar" | "command">(
    "calendar",
  );
  const [expiryDate, setExpiryDate] = useState(() =>
    localDateTime(new Date(Date.now() + 90 * 86400000)),
  );
  const [expiryCommand, setExpiryCommand] = useState("90d");
  const [issuedExpiry, setIssuedExpiry] = useState("");
  const [checkedAt, setCheckedAt] = useState(Date.now);
  const helpId = useId();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const displayDate = (value: string | Date) =>
    new Date(value).toLocaleString("ru-RU", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  let expiryInput: TokenExpiryInput | undefined,
    expiryPreview = "",
    expiryError = "";
  try {
    expiryInput =
      expiryMode === "calendar"
        ? parseTokenExpiryDate(expiryDate)
        : parseTokenExpiryCommand(expiryCommand);
    expiryPreview = displayDate(resolveTokenExpiry(expiryInput));
  } catch (e) {
    expiryError = (e as Error).message;
  }
  const selectedExpiry = expiryInput?.expires_at;
  useEffect(() => {
    const next = Math.min(
      ...tokens
        .filter((t) => !t.revoked_at)
        .map((t) => Date.parse(t.expires_at))
        .concat(selectedExpiry ? [Date.parse(selectedExpiry)] : [])
        .filter((time) => time > checkedAt),
    );
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(
      () => setCheckedAt(Date.now()),
      Math.min(Math.max(1, next - Date.now() + 1), 2_147_483_647),
    );
    return () => clearTimeout(timer);
  }, [tokens, checkedAt, selectedExpiry]);
  async function load() {
    setTokens(await api<TokenInfo[]>("/agent-tokens"));
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    void api<{ enabled: boolean; mcp_url: string; version: string }>(
      "/chatgpt/config",
    )
      .then(setChatgpt)
      .catch((e) => setError(e.message));
  }, []);
  async function issue(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSecret("");
    setCopied(false);
    try {
      const expiry =
        expiryMode === "calendar"
          ? parseTokenExpiryDate(expiryDate)
          : parseTokenExpiryCommand(expiryCommand);
      const result = await api<{ token: string; expires_at: string }>(
        "/agent-tokens",
        {
          method: "POST",
          body: json({ name, ...expiry }),
        },
      );
      setSecret(result.token);
      setIssuedExpiry(result.expires_at);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-section">
      <div className="settings-title">
        <KeyRound size={22} />
        <div>
          <h2>Доступ агента</h2>
          <p>Загрузка статей через HTTP API и MCP</p>
        </div>
      </div>
      <p className="hint">
        Токен разрешает загрузку и проверку её результата. Карточки, личный
        словарь, удаление статей и настройки ему недоступны.
      </p>
      <h3>ChatGPT и регулярные задачи</h3>
      <p>
        В ChatGPT откройте Plugins → создание приложения, укажите адрес MCP и
        выберите OAuth. Затем войдите в Paperword и разрешите загрузку статей.
      </p>
      <div className="endpoint-info">
        <span>MCP URL</span>
        <code>
          {chatgpt?.enabled
            ? chatgpt.mcp_url
            : "https://paperword.example.com/mcp"}
        </code>
      </div>
      {!chatgpt?.enabled && (
        <p className="hint">
          OAuth включится после настройки APP_PASSWORD и APP_ORIGIN на VPS.
          Сейчас открыт локальный режим.
        </p>
      )}
      <p className="hint">
        Готовые HTML и PDF агент передаёт через import_chatgpt_file. Каждое
        подключение появляется ниже и может быть отозвано. Версия{" "}
        {chatgpt?.version || "…"}.
      </p>
      <div className="endpoint-info">
        <span>HTTP</span>
        <code>/api/agent/articles</code>
      </div>
      <div className="endpoint-info">
        <span>MCP</span>
        <code>/mcp</code>
      </div>
      <form className="stack settings-form" onSubmit={issue}>
        <label>
          Название агента
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <fieldset className="token-expiry stack" disabled={busy}>
          <legend>Срок действия</legend>
          <div className="expiry-modes">
            <label>
              <input
                type="radio"
                name={helpId}
                checked={expiryMode === "calendar"}
                onChange={() => setExpiryMode("calendar")}
              />
              Календарь
            </label>
            <label>
              <input
                type="radio"
                name={helpId}
                checked={expiryMode === "command"}
                onChange={() => setExpiryMode("command")}
              />
              Команда
            </label>
          </div>
          {expiryMode === "calendar" ? (
            <label>
              Дата и время окончания
              <input
                type="datetime-local"
                required
                step={60}
                min={localDateTime(new Date())}
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                aria-describedby={helpId}
                aria-invalid={Boolean(expiryError)}
              />
            </label>
          ) : (
            <label>
              Срок или дата
              <input
                type="text"
                required
                maxLength={80}
                value={expiryCommand}
                onChange={(e) => setExpiryCommand(e.target.value)}
                placeholder="30d или 31.12.2027 18:00"
                aria-describedby={helpId}
                aria-invalid={Boolean(expiryError)}
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
          )}
          <p className="hint" id={helpId}>
            {expiryMode === "command"
              ? "30d — дней, 12h — часов, 2w — недель, 15m — минут. Дата без времени — до конца дня. "
              : "Выберите дату и время в календаре. "}
            Часовой пояс: {timezone}.
          </p>
          <p className={expiryError ? "error" : "hint"} role="status">
            {expiryError || `Действует до ${expiryPreview}`}
          </p>
        </fieldset>
        <button
          className="primary"
          disabled={busy || !name.trim() || !expiryInput}
        >
          Создать токен
        </button>
      </form>
      {secret && (
        <div className="agent-secret">
          <p>Скопируйте токен сейчас — повторно он не показывается.</p>
          <p>
            Действует до {displayDate(issuedExpiry)} ({timezone}).
          </p>
          <code>{secret}</code>
          <button
            className="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(secret);
                setCopied(true);
              } catch {
                setError(
                  "Не удалось скопировать. Выделите и скопируйте токен вручную.",
                );
              }
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
            {copied ? "Скопировано" : "Копировать токен"}
          </button>
          <button className="text-button" onClick={() => setSecret("")}>
            Скрыть токен
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="agent-token-list">
        {tokens.map((t) => (
          <div key={t.id} className="agent-token">
            <div>
              <strong>{t.name}</strong>
              <p className="hint">
                {t.revoked_at
                  ? "Отозван"
                  : Date.parse(t.expires_at) <= checkedAt
                    ? "Истёк"
                    : `Действует до ${displayDate(t.expires_at)}`}
                {t.last_used_at &&
                  ` · Использован ${new Date(t.last_used_at).toLocaleDateString("ru-RU")}`}
              </p>
            </div>
            <button
              className="secondary compact"
              disabled={busy || Boolean(t.revoked_at)}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await api(`/agent-tokens/${t.id}/revoke`, { method: "POST" });
                  setSecret("");
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Отозвать
            </button>
          </div>
        ))}
      </div>
      <p className="hint">
        Агент передаёт токен в Authorization: Bearer. Инструкция и примеры — в
        docs/agent-integration.md.
      </p>
    </section>
  );
}
