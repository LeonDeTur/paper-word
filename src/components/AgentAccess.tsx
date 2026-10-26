import { useEffect, useId, useState } from "react";
import { KeyRound, Copy, Check } from "lucide-react";
import { api, json } from "../api";
import {
  AGENT_SCOPES,
  DEFAULT_AGENT_SCOPES,
  MANAGE_AGENT_SCOPES,
  SCOPE_LABELS,
  type AgentScope,
} from "../agent-scopes";
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
  scopes: AgentScope[];
};
export function AgentAccess() {
  const [chatgpt, setChatgpt] = useState<{
    enabled: boolean;
    mcp_url: string;
    version: string;
  } | null>(null);
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [name, setName] = useState("Article agent");
  const [scopes, setScopes] = useState<AgentScope[]>(DEFAULT_AGENT_SCOPES);
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
    new Date(value).toLocaleString("en-GB", {
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
          body: json({ name, scopes, ...expiry }),
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
          <h2>Agent access</h2>
          <p>Articles, translations, cards and reviews over HTTP API and MCP</p>
        </div>
      </div>
      <p className="hint">
        Choose permissions for each connection. Existing tokens keep only
        article import. Deletion requires a separate permission; agents cannot
        access the password or server settings.
      </p>
      <h3>ChatGPT, Claude and recurring tasks</h3>
      <p>
        In ChatGPT, open Plugins → Create app, enter the MCP URL and select
        OAuth. In Claude, add the same URL as a custom connector with automatic
        OAuth client registration. Then sign in to Paperword and choose
        permissions.
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
          OAuth becomes available after configuring APP_PASSWORD and APP_ORIGIN
          on your VPS. Local mode is currently active.
        </p>
      )}
      <p className="hint">
        Agents upload prepared HTML and PDF through import_chatgpt_file. Each
        connection appears below and can be revoked. Version{" "}
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
          Agent name
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <fieldset className="agent-permissions stack" disabled={busy}>
          <legend>Permissions</legend>
          <div className="button-row">
            <button
              type="button"
              className="secondary compact"
              onClick={() => setScopes([...DEFAULT_AGENT_SCOPES])}
            >
              Import only
            </button>
            <button
              type="button"
              className="secondary compact"
              onClick={() => setScopes([...MANAGE_AGENT_SCOPES])}
            >
              Manage without deletion
            </button>
          </div>
          {AGENT_SCOPES.map((scope) => (
            <label key={scope}>
              <input
                type="checkbox"
                checked={scopes.includes(scope)}
                onChange={(e) =>
                  setScopes((current) =>
                    e.target.checked
                      ? [...current, scope]
                      : current.filter((s) => s !== scope),
                  )
                }
              />
              {SCOPE_LABELS[scope]}
            </label>
          ))}
          {!scopes.length && (
            <p className="error">Select at least one permission.</p>
          )}
        </fieldset>
        <fieldset className="token-expiry stack" disabled={busy}>
          <legend>Token expiry</legend>
          <div className="expiry-modes">
            <label>
              <input
                type="radio"
                name={helpId}
                checked={expiryMode === "calendar"}
                onChange={() => setExpiryMode("calendar")}
              />
              Calendar
            </label>
            <label>
              <input
                type="radio"
                name={helpId}
                checked={expiryMode === "command"}
                onChange={() => setExpiryMode("command")}
              />
              Command
            </label>
          </div>
          {expiryMode === "calendar" ? (
            <label>
              Expiration date and time
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
              Duration or date
              <input
                type="text"
                required
                maxLength={80}
                value={expiryCommand}
                onChange={(e) => setExpiryCommand(e.target.value)}
                placeholder="30d or 2027-12-31 18:00"
                aria-describedby={helpId}
                aria-invalid={Boolean(expiryError)}
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
          )}
          <p className="hint" id={helpId}>
            {expiryMode === "command"
              ? "30d — days, 12h — hours, 2w — weeks, 15m — minutes. Dates without a time end at the end of the day. "
              : "Choose a date and time in the calendar. "}
            Timezone: {timezone}.
          </p>
          <p className={expiryError ? "error" : "hint"} role="status">
            {expiryError || `Expires ${expiryPreview}`}
          </p>
        </fieldset>
        <button
          className="primary"
          disabled={busy || !name.trim() || !expiryInput || !scopes.length}
        >
          Create token
        </button>
      </form>
      {secret && (
        <div className="agent-secret">
          <p>Copy the token now — it will not be shown again.</p>
          <p>
            Expires {displayDate(issuedExpiry)} ({timezone}).
          </p>
          <code>{secret}</code>
          <button
            className="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(secret);
                setCopied(true);
              } catch {
                setError("Could not copy. Select and copy the token manually.");
              }
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
            {copied ? "Copied" : "Copy token"}
          </button>
          <button className="text-button" onClick={() => setSecret("")}>
            Hide token
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
                  ? "Revoked"
                  : Date.parse(t.expires_at) <= checkedAt
                    ? "Expired"
                    : `Expires ${displayDate(t.expires_at)}`}
                {t.last_used_at &&
                  ` · Last used ${new Date(t.last_used_at).toLocaleDateString("en-GB")}`}
              </p>
              <p className="hint">
                {t.scopes.map((scope) => SCOPE_LABELS[scope]).join(" · ")}
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
              Revoke
            </button>
          </div>
        ))}
      </div>
      <p className="hint">
        The agent sends the token in Authorization: Bearer. Instructions and
        examples: docs/agent-integration.md.
      </p>
    </section>
  );
}
