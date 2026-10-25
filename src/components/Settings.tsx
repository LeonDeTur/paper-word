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
      setStatus(
        `Соединение установлено. Доступно моделей: ${result.models.length}.`,
      );
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
      setStatus("Модель сохранена.");
      onSaved();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page settings-page">
      <div className="eyebrow">ВАШ СЕРВИС, ВАШИ ДАННЫЕ</div>
      <div className="page-heading">
        <div>
          <h1>Настройки</h1>
          <p className="subtitle">
            Подключение модели и сохранность библиотеки.
          </p>
        </div>
      </div>
      <AgentAccess />
      <section className="settings-section">
        <div className="settings-title">
          <Server size={22} />
          <div>
            <h2>Модель для перевода</h2>
            <p>Ollama или другой OpenAI-совместимый сервер</p>
          </div>
        </div>
        <div className="endpoint-info">
          <span>Сервер</span>
          <code>{config.ai_host}</code>
        </div>
        <p className="hint">
          Адрес с окончанием /v1 задаётся на сервере в AI_BASE_URL.
          Необязательный ключ AI_API_KEY остаётся на сервере.
        </p>
        <button className="secondary" disabled={busy} onClick={connect}>
          <RefreshCw size={16} className={busy ? "spin" : ""} />
          Проверить подключение и список моделей
        </button>
        {connectionError && (
          <p className="error" role="alert">
            {connectionError}
          </p>
        )}
        <form className="stack settings-form" onSubmit={save}>
          <label>
            Название модели
            <input
              list="models"
              required
              maxLength={160}
              placeholder="Точное имя установленной модели"
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
            Сохранить модель
          </button>
        </form>
        {status && (
          <p className="notice" role="status">
            <Check size={17} />
            {status}
          </p>
        )}
        <p className="hint">
          Перевод выполняется последовательно по фрагментам. Если связь
          прервётся, готовая часть сохранится. Начальную форму и значение слова
          можно проверить перед добавлением.
        </p>
      </section>
      <section className="settings-section">
        <div className="settings-title">
          <Download size={22} />
          <div>
            <h2>Экспорт библиотеки</h2>
            <p>Статьи, переводы, слова и расписание повторений</p>
          </div>
        </div>
        <a className="secondary link-button" href="/api/export">
          <Download size={16} />
          Скачать JSON
        </a>
        <p className="hint">
          JSON — переносимая копия текстовых данных. Для полного резервного
          копирования с исходными файлами сохраните серверную папку data при
          остановленном приложении. Восстановление JSON через интерфейс пока не
          предусмотрено.
        </p>
      </section>
      <section className="settings-section">
        <div className="settings-title">
          <LockKeyhole size={22} />
          <div>
            <h2>Личный доступ</h2>
            <p>
              {config.password_required
                ? "Библиотека защищена паролем"
                : "Локальный запуск на этом компьютере"}
            </p>
          </div>
        </div>
        <p className="hint">
          Для размещения на VPS задайте APP_PASSWORD и HTTPS-адрес APP_ORIGIN.
          Инструкции запуска находятся в README проекта.
        </p>
      </section>
    </div>
  );
}
