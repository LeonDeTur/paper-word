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
  const [name, setName] = useState("Article agent");
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
          <h2>Agent access</h2>
          <p>Import articles through HTTP API and MCP</p>
        </div>
      </div>
      <p className="hint">
        The token permits article import and receipt checks. Cards, personal
        vocabulary, article deletion and settings remain inaccessible.
      </p>
      <h3>ChatGPT and recurring tasks</h3>
      <p>
        In ChatGPT, open Plugins → Create app, enter the MCP URL and select
        OAuth. Then sign in to Paperword and approve article imports.
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
        <button className="primary" disabled={busy || !name.trim()}>
          Create 90-day token
        </button>
      </form>
      {secret && (
        <div className="agent-secret">
          <p>Copy the token now — it will not be shown again.</p>
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
                  : new Date(t.expires_at) < new Date()
                    ? "Expired"
                    : `Expires ${new Date(t.expires_at).toLocaleDateString("en-GB")}`}
                {t.last_used_at &&
                  ` · Last used ${new Date(t.last_used_at).toLocaleDateString("en-GB")}`}
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
