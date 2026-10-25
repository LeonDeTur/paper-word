import { useState } from "react";
import { Server, Download, Check, RefreshCw, LockKeyhole } from "lucide-react";
import { api, json } from "../api";
import type { Config } from "../types";
import { AgentAccess } from "./AgentAccess";

export function Settings({
  config,
  onSaved,
  onError,
}: {
  config: Config;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState(config.ai_model);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [connectionError, setConnectionError] = useState("");
  async function connect() {
    setBusy(true);
    setStatus("");
    setConnectionError("");
    try {
      const result = await api<{ models: string[] }>("/models");
      setModels(result.models);
      setStatus(`Connected. Available models: ${result.models.length}.`);
    } catch (error) {
      setConnectionError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      await api("/settings/model", { method: "PUT", body: json({ model }) });
      setStatus("Model saved.");
      onSaved();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page settings-page">
      <div className="eyebrow">YOUR SERVICE, YOUR DATA</div>
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p className="subtitle">
            Connect a model and keep your library safe.
          </p>
        </div>
      </div>
      <AgentAccess />
      <section className="settings-section">
        <div className="settings-title">
          <Server size={22} />
          <div>
            <h2>Translation model</h2>
            <p>Ollama or another OpenAI-compatible server</p>
          </div>
        </div>
        <div className="endpoint-info">
          <span>Server</span>
          <code>{config.ai_host}</code>
        </div>
        <p className="hint">
          Set the URL ending in /v1 on the server using AI_BASE_URL. The
          optional AI_API_KEY stays on the server.
        </p>
        <button className="secondary" disabled={busy} onClick={connect}>
          <RefreshCw size={16} className={busy ? "spin" : ""} />
          Check connection and list models
        </button>
        {connectionError && (
          <p className="error" role="alert">
            {connectionError}
          </p>
        )}
        <form className="stack settings-form" onSubmit={save}>
          <label>
            Model name
            <input
              list="models"
              required
              maxLength={160}
              placeholder="Exact name of an installed model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
            <datalist id="models">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <button className="primary" disabled={busy || !model.trim()}>
            Save model
          </button>
        </form>
        {status && (
          <p className="notice" role="status">
            <Check size={17} />
            {status}
          </p>
        )}
        <p className="hint">
          Translation runs one block at a time. If the connection drops,
          completed blocks are saved. You can check the base form and meaning
          before saving a word.
        </p>
      </section>
      <section className="settings-section">
        <div className="settings-title">
          <Download size={22} />
          <div>
            <h2>Export library</h2>
            <p>Articles, translations, vocabulary and review schedules</p>
          </div>
        </div>
        <a className="secondary link-button" href="/api/export">
          <Download size={16} />
          Download JSON
        </a>
        <p className="hint">
          JSON is a portable copy of text data. For a complete backup including
          source files, copy the server's data folder while the application is
          stopped. Restoring JSON through the interface is not yet supported.
        </p>
      </section>
      <section className="settings-section">
        <div className="settings-title">
          <LockKeyhole size={22} />
          <div>
            <h2>Private access</h2>
            <p>
              {config.password_required
                ? "Your library is password protected"
                : "Running locally on this computer"}
            </p>
          </div>
        </div>
        <p className="hint">
          For VPS hosting, set APP_PASSWORD and an HTTPS APP_ORIGIN. See the
          project README for setup instructions.
        </p>
      </section>
    </div>
  );
}
