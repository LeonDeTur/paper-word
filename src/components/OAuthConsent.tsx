import { useEffect, useState } from "react";
import { api, json } from "../api";
import { SCOPE_LABELS, type AgentScope } from "../agent-scopes";

export function OAuthConsent() {
  const request = new URLSearchParams(location.search).get("request");
  const [details, setDetails] = useState<{
    client_name: string;
    redirect_uri: string;
    scopes: AgentScope[];
  } | null>(null);
  const [scopes, setScopes] = useState<AgentScope[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!request) {
      setError("No connection request. Start from ChatGPT or Claude.");
      return;
    }
    void api<{
      client_name: string;
      redirect_uri: string;
      scopes: AgentScope[];
    }>(`/oauth/requests/${encodeURIComponent(request)}`)
      .then((value) => {
        setDetails(value);
        setScopes(value.scopes.filter((s) => s !== "data:delete"));
      })
      .catch((e) => setError(e.message));
  }, [request]);
  async function decide(allow: boolean) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ redirect_url: string }>(
        `/oauth/requests/${encodeURIComponent(request || "")}/decision`,
        { method: "POST", body: json({ allow, ...(allow ? { scopes } : {}) }) },
      );
      location.assign(result.redirect_url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="login-screen">
      <div className="login-panel">
        <div className="brand">
          paperword<span>↗</span>
        </div>
        <h1>Connect an AI assistant</h1>
        {details ? (
          <>
            <p>
              The application “{details.client_name}” is requesting access to
              your library.
            </p>
            <fieldset className="agent-permissions stack" disabled={busy}>
              <legend>Application permissions</legend>
              {details.scopes.map((scope) => (
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
            </fieldset>
            <p className="hint">
              Deletion is disabled by default. Your password and model keys not
              granted.
            </p>
            <p className="hint">
              After approval you will return to{" "}
              {new URL(details.redirect_uri).host}. You can revoke this
              connection in Paperword Settings. Access lasts up to one year.
            </p>
            <div className="button-row">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void decide(false)}
              >
                Cancel
              </button>
              <button
                className="primary"
                disabled={busy || !scopes.length}
                onClick={() => void decide(true)}
              >
                {busy ? "Connecting…" : "Allow selected actions"}
              </button>
            </div>
          </>
        ) : (
          !error && <p role="status">Checking the connection request…</p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
