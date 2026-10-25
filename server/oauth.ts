import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import express from "express";
import { z } from "zod";
import { AppError } from "./content.ts";
import { createAgentAccess } from "./agent-access.ts";
import type { Store } from "./store.ts";

const scope = "articles:import";
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const secret = (prefix: string) =>
  `${prefix}_${randomBytes(32).toString("base64url")}`;
type SavedParams = {
  state?: string;
  scopes?: string[];
  codeChallenge: string;
  redirectUri: string;
  resource: string;
};
type Pending = {
  id: string;
  client_id: string;
  params: string;
  csrf_hash: string;
  expires: number;
  decided: number;
};
type TokenRow = {
  hash: string;
  kind: string;
  client_id: string;
  agent_id: string;
  resource: string;
  expires: number;
  used: number;
};

export function createOAuth(
  store: Store,
  origin: string | undefined,
  passwordConfigured: boolean,
  production = false,
) {
  const enabled = Boolean(origin && passwordConfigured);
  const issuer = origin ? new URL(origin).origin : "http://127.0.0.1:3001";
  if (origin && new URL(origin).href !== `${issuer}/` && origin !== issuer)
    throw new Error("APP_ORIGIN must contain only scheme and host.");
  const resource = `${issuer}/mcp`;
  const metadataUrl = `${issuer}/.well-known/oauth-protected-resource/mcp`;
  const challenge = `Bearer resource_metadata="${metadataUrl}", scope="${scope}"`;
  const { db } = store;
  const access = createAgentAccess(store);
  const requireResource = (value: URL | undefined) => {
    if (value?.href !== resource)
      throw new InvalidTargetError(
        "The resource must match the advertised Paperword MCP resource.",
      );
  };
  const requireScopes = (scopes: string[] | undefined) => {
    if (scopes?.some((s) => s !== scope))
      throw new InvalidScopeError("Only articles:import is supported.");
  };
  function checkRedirect(value: string) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new InvalidClientMetadataError("Invalid redirect URI.");
    }
    const chatgpt =
      url.protocol === "https:" &&
      url.hostname === "chatgpt.com" &&
      (url.pathname === "/connector_platform_oauth_redirect" ||
        /^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(url.pathname));
    const development =
      !production &&
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      (!chatgpt && !development)
    )
      throw new InvalidClientMetadataError(
        "Only ChatGPT OAuth callbacks are allowed; loopback callbacks are allowed in development.",
      );
  }
  const clientsStore: OAuthRegisteredClientsStore = {
    getClient(id) {
      const row = db
        .prepare("SELECT metadata FROM oauth_clients WHERE id=?")
        .get(id) as { metadata: string } | undefined;
      return row
        ? (JSON.parse(row.metadata) as OAuthClientInformationFull)
        : undefined;
    },
    registerClient(input) {
      input.redirect_uris.forEach(checkRedirect);
      requireScopes(input.scope?.split(" ").filter(Boolean));
      if (
        input.grant_types?.some(
          (t) => !["authorization_code", "refresh_token"].includes(t),
        )
      )
        throw new InvalidClientMetadataError("Unsupported grant.");
      // Public client + PKCE: no client secrets are persisted or handed out.
      const client = {
        ...input,
        client_id: randomUUID(),
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_secret: undefined,
        client_secret_expires_at: undefined,
        token_endpoint_auth_method: "none" as const,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope,
      };
      db.prepare("INSERT INTO oauth_clients(id,metadata) VALUES(?,?)").run(
        client.client_id,
        JSON.stringify(client),
      );
      return client;
    },
  };
  function activeGrant(id: string) {
    return db
      .prepare(
        "SELECT id FROM agent_tokens WHERE id=? AND revoked_at IS NULL AND expires_at>?",
      )
      .get(id, new Date().toISOString());
  }
  function tokens(clientId: string, agentId: string): OAuthTokens {
    const token = secret("pwo"),
      refresh = secret("pwr");
    const now = Date.now();
    for (const [value, kind, expires] of [
      [token, "access", now + 3600_000],
      [refresh, "refresh", now + 90 * 86400_000],
    ] as const)
      db.prepare(
        "INSERT INTO oauth_tokens(hash,kind,client_id,agent_id,resource,expires) VALUES(?,?,?,?,?,?)",
      ).run(digest(value), kind, clientId, agentId, resource, expires);
    return {
      access_token: token,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: refresh,
      scope,
    };
  }
  const provider: OAuthServerProvider = {
    clientsStore,
    async authorize(client, params, res) {
      requireResource(params.resource);
      requireScopes(params.scopes);
      checkRedirect(params.redirectUri);
      if (!/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge))
        throw new InvalidGrantError("S256 PKCE is required.");
      const id = randomUUID();
      const csrf = secret("csrf");
      db.prepare("DELETE FROM oauth_requests WHERE expires<?").run(Date.now());
      const saved: SavedParams = { ...params, resource: resource };
      db.prepare(
        "INSERT INTO oauth_requests(id,client_id,params,csrf_hash,expires) VALUES(?,?,?,?,?)",
      ).run(
        id,
        client.client_id,
        JSON.stringify(saved),
        digest(csrf),
        Date.now() + 10 * 60_000,
      );
      // A separate HttpOnly nonce binds consent to the initiating browser.
      res.cookie(`pw_consent_${id}`, csrf, {
        httpOnly: true,
        secure: production,
        sameSite: "lax",
        maxAge: 10 * 60_000,
        path: "/api/oauth",
      });
      res.redirect(`${issuer}/oauth/consent?request=${id}`);
    },
    async challengeForAuthorizationCode(client, code) {
      const row = db
        .prepare(
          "SELECT challenge FROM oauth_codes WHERE hash=? AND client_id=? AND used=0 AND expires>?",
        )
        .get(digest(code), client.client_id, Date.now()) as
        { challenge: string } | undefined;
      if (!row)
        throw new InvalidGrantError("Invalid or expired authorization code.");
      return row.challenge;
    },
    async exchangeAuthorizationCode(
      client,
      code,
      _verifier,
      redirectUri,
      audience,
    ) {
      requireResource(audience);
      return store.transaction(() => {
        const row = db
          .prepare(
            "SELECT * FROM oauth_codes WHERE hash=? AND client_id=? AND used=0 AND expires>?",
          )
          .get(digest(code), client.client_id, Date.now()) as
          | { agent_id: string; redirect_uri: string; resource: string }
          | undefined;
        if (
          !row ||
          row.redirect_uri !== redirectUri ||
          row.resource !== resource ||
          !activeGrant(row.agent_id)
        )
          throw new InvalidGrantError(
            "Invalid authorization code, redirect or grant.",
          );
        db.prepare("UPDATE oauth_codes SET used=1 WHERE hash=?").run(
          digest(code),
        );
        return tokens(client.client_id, row.agent_id);
      });
    },
    async exchangeRefreshToken(client, refresh, scopes, audience) {
      requireResource(audience);
      requireScopes(scopes);
      const row = db
        .prepare(
          "SELECT * FROM oauth_tokens WHERE hash=? AND kind=? AND client_id=?",
        )
        .get(digest(refresh), "refresh", client.client_id) as
        TokenRow | undefined;
      if (row?.used) {
        access.revoke(row.agent_id);
        throw new InvalidGrantError(
          "Refresh token reuse detected. Reconnect this integration.",
        );
      }
      if (
        !row ||
        row.expires <= Date.now() ||
        row.resource !== resource ||
        !activeGrant(row.agent_id)
      )
        throw new InvalidGrantError("Invalid or expired refresh token.");
      return store.transaction(() => {
        db.prepare("UPDATE oauth_tokens SET used=1 WHERE hash=?").run(
          digest(refresh),
        );
        return tokens(client.client_id, row.agent_id);
      });
    },
    async verifyAccessToken(token): Promise<AuthInfo> {
      const row = db
        .prepare(
          "SELECT * FROM oauth_tokens WHERE hash=? AND kind=? AND expires>?",
        )
        .get(digest(token), "access", Date.now()) as TokenRow | undefined;
      if (!row || row.resource !== resource || !activeGrant(row.agent_id))
        throw new InvalidTokenError(
          "Invalid, expired or revoked access token.",
        );
      return {
        token,
        clientId: row.client_id,
        scopes: [scope],
        expiresAt: Math.floor(row.expires / 1000),
        resource: new URL(resource),
        extra: { agentTokenId: row.agent_id },
      };
    },
    async revokeToken(client, request) {
      const row = db
        .prepare(
          "SELECT agent_id FROM oauth_tokens WHERE hash=? AND client_id=?",
        )
        .get(digest(request.token), client.client_id) as
        { agent_id: string } | undefined;
      if (row) access.revoke(row.agent_id);
    },
  };
  function pending(id: string): Pending {
    const row = db
      .prepare(
        "SELECT * FROM oauth_requests WHERE id=? AND expires>? AND decided=0",
      )
      .get(z.uuid().parse(id), Date.now()) as Pending | undefined;
    if (!row)
      throw new AppError(
        404,
        "The connection request has expired or was already processed. Start again in ChatGPT.",
      );
    return row;
  }
  function browserNonce(cookie: string | undefined, id: string) {
    return cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(`pw_consent_${id}=`))
      ?.slice(`pw_consent_${id}=`.length);
  }
  function consentDetails(id: string, cookie: string | undefined) {
    const row = pending(id);
    const nonce = browserNonce(cookie, id);
    if (!nonce || digest(nonce) !== row.csrf_hash)
      throw new AppError(
        403,
        "Open the connection in the same browser where you started it.",
      );
    const client = clientsStore.getClient(
      row.client_id,
    ) as OAuthClientInformationFull;
    const params = JSON.parse(row.params) as SavedParams;
    return {
      client_name: client.client_name || "MCP client",
      redirect_uri: params.redirectUri,
      scope,
      expires_at: new Date(row.expires).toISOString(),
    };
  }
  function decide(id: string, allow: boolean, cookie: string | undefined) {
    consentDetails(id, cookie);
    return store.transaction(() => {
      const row = pending(id);
      const params = JSON.parse(row.params) as SavedParams;
      const redirect = new URL(params.redirectUri);
      db.prepare("UPDATE oauth_requests SET decided=1 WHERE id=?").run(id);
      if (params.state) redirect.searchParams.set("state", params.state);
      if (!allow) {
        redirect.searchParams.set("error", "access_denied");
        return { redirect_url: redirect.href };
      }
      const client = clientsStore.getClient(
        row.client_id,
      ) as OAuthClientInformationFull;
      const grant = access.issue({
        name: `ChatGPT: ${(client.client_name || "Paperword").slice(0, 60)}`,
        days: 365,
      });
      const code = secret("pwc");
      db.prepare(
        "INSERT INTO oauth_codes(hash,client_id,agent_id,redirect_uri,challenge,resource,expires) VALUES(?,?,?,?,?,?,?)",
      ).run(
        digest(code),
        row.client_id,
        grant.id,
        params.redirectUri,
        params.codeChallenge,
        resource,
        Date.now() + 5 * 60_000,
      );
      redirect.searchParams.set("code", code);
      return { redirect_url: redirect.href };
    });
  }
  const router = express.Router();
  if (enabled)
    router.use(
      mcpAuthRouter({
        provider,
        issuerUrl: new URL(issuer),
        resourceServerUrl: new URL(resource),
        scopesSupported: [scope],
        resourceName: "Paperword articles",
      }),
    );
  return {
    enabled,
    issuer,
    resource,
    metadataUrl,
    challenge,
    router,
    provider,
    consentDetails,
    decide,
  };
}
