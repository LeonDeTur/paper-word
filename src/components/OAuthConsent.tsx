import { useEffect, useState } from "react";
import { api, json } from "../api";

export function OAuthConsent() {
  const request = new URLSearchParams(location.search).get("request");
  const [details, setDetails] = useState<{
    client_name: string;
    redirect_uri: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!request) {
      setError("No connection request. Start from ChatGPT.");
      return;
    }
    void api<{ client_name: string; redirect_uri: string }>(
      `/oauth/requests/${encodeURIComponent(request)}`,
    )
      .then(setDetails)
      .catch((e) => setError(e.message));
  }, [request]);
  async function decide(allow: boolean) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ redirect_url: string }>(
        `/oauth/requests/${encodeURIComponent(request || "")}/decision`,
        { method: "POST", body: json({ allow }) },
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
        <h1>Connect ChatGPT</h1>
        {details ? (
          <>
            <p>
              The application “{details.client_name}” is requesting access to
              your library.
            </p>
            <p>
              It can upload articles and receive confirmation of its own
              uploads. Access to cards, settings and article deletion is not
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
                disabled={busy}
                onClick={() => void decide(true)}
              >
                {busy ? "Connecting…" : "Allow article imports"}
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
