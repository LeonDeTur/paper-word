import { useEffect, useState } from "react";
import { KeyRound, Copy, Check } from "lucide-react";
import { api, json } from "../api";

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
      const result = await api<{ token: string }>("/agent-tokens", {
        method: "POST",
        body: json({ name, days: 90 }),
      });
      setSecret(result.token);
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
        <button className="primary" disabled={busy || !name.trim()}>
          Создать токен на 90 дней
        </button>
      </form>
      {secret && (
        <div className="agent-secret">
          <p>Скопируйте токен сейчас — повторно он не показывается.</p>
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
                  : new Date(t.expires_at) < new Date()
                    ? "Истёк"
                    : `Действует до ${new Date(t.expires_at).toLocaleDateString("ru-RU")}`}
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
