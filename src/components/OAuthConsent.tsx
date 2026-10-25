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
      setError("Нет запроса подключения. Начните подключение из ChatGPT.");
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
        <h1>Подключить ChatGPT</h1>
        {details ? (
          <>
            <p>
              Приложение «{details.client_name}» запрашивает доступ к вашей
              библиотеке.
            </p>
            <p>
              Оно сможет загружать статьи и получать подтверждение своих
              загрузок. Доступ к карточкам, настройкам и удалению статей не
              предоставляется.
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
                disabled={busy}
                onClick={() => void decide(true)}
              >
                {busy ? "Подключаем…" : "Разрешить загрузку статей"}
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
