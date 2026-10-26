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
      setError(
        "Нет запроса подключения. Начните подключение из ChatGPT или Claude.",
      );
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
        <h1>Подключить ИИ-ассистента</h1>
        {details ? (
          <>
            <p>
              Приложение «{details.client_name}» запрашивает доступ к вашей
              библиотеке.
            </p>
            <fieldset className="agent-permissions stack" disabled={busy}>
              <legend>Разрешения приложения</legend>
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
              Удаление по умолчанию выключено. Доступ к паролю и ключам модели
              не предоставляется.
            </p>
            <p className="hint">
              После подтверждения вы вернётесь на{" "}
              {new URL(details.redirect_uri).host}. Подключение можно отозвать в
              настройках Paperword. Срок доступа — до одного года.
            </p>
            <div className="button-row">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void decide(false)}
              >
                Отмена
              </button>
              <button
                className="primary"
                disabled={busy || !scopes.length}
                onClick={() => void decide(true)}
              >
                {busy ? "Подключаем…" : "Разрешить выбранные действия"}
              </button>
            </div>
          </>
        ) : (
          !error && <p role="status">Проверяем запрос подключения…</p>
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
