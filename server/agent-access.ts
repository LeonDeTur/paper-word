import { randomBytes, randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { AppError } from "./content.ts";
import type { Store } from "./store.ts";
import type { RequestHandler } from "express";
import { resolveTokenExpiry } from "../src/token-expiry.ts";
import { AGENT_SCOPES, DEFAULT_AGENT_SCOPES } from "../src/agent-scopes.ts";

export function createAgentAccess(
  store: Store,
  oauth?: {
    enabled: boolean;
    challenge: string;
    provider: {
      verifyAccessToken(
        token: string,
      ): Promise<{ scopes: string[]; extra?: Record<string, unknown> }>;
    };
  },
) {
  const { db } = store;
  const tokenHash = (token: string) =>
    createHash("sha256").update(token).digest("hex");
  function list() {
    return db
      .prepare(
        "SELECT id,name,created_at,expires_at,revoked_at,last_used_at,scopes FROM agent_tokens ORDER BY created_at DESC",
      )
      .all()
      .map((row) => ({ ...row, scopes: JSON.parse(String(row.scopes)) }));
  }
  function issue(raw: unknown) {
    const input = z
      .object({
        name: z.string().trim().min(1).max(80),
        days: z.number().int().positive().optional(),
        expires_in: z.number().int().positive().safe().optional(),
        expires_at: z.string().datetime({ offset: true }).optional(),
        scopes: z
          .array(z.enum(AGENT_SCOPES))
          .min(1)
          .max(AGENT_SCOPES.length)
          .default(DEFAULT_AGENT_SCOPES),
      })
      .strict()
      .parse(raw);
    const now = new Date();
    let expiresAt: string;
    try {
      expiresAt = resolveTokenExpiry(input, now).toISOString();
    } catch (error) {
      throw new AppError(422, (error as Error).message);
    }
    const token = `pw_${randomBytes(32).toString("base64url")}`;
    const id = randomUUID();
    db.prepare(
      "INSERT INTO agent_tokens(id,name,hash,created_at,expires_at,scopes) VALUES(?,?,?,?,?,?)",
    ).run(
      id,
      input.name,
      tokenHash(token),
      now.toISOString(),
      expiresAt,
      JSON.stringify([...new Set(input.scopes)]),
    );
    return {
      id,
      token,
      name: input.name,
      expires_at: expiresAt,
      scopes: [...new Set(input.scopes)],
    };
  }
  function revoke(id: string) {
    db.prepare(
      "UPDATE agent_tokens SET revoked_at=? WHERE id=? AND revoked_at IS NULL",
    ).run(new Date().toISOString(), z.uuid().parse(id));
  }
  const authenticate: RequestHandler = async (req, res, next) => {
    const bearer = req
      .get("Authorization")
      ?.match(/^Bearer (pwo_[A-Za-z0-9_-]{43})$/)?.[1];
    if (bearer && oauth?.enabled) {
      try {
        const info = await oauth.provider.verifyAccessToken(bearer);
        res.locals.agentTokenId = info.extra?.agentTokenId;
        res.locals.agentScopes = info.scopes;
        db.prepare("UPDATE agent_tokens SET last_used_at=? WHERE id=?").run(
          new Date().toISOString(),
          String(res.locals.agentTokenId),
        );
        res.set("Cache-Control", "no-store");
        next();
        return;
      } catch {
        /* An invalid OAuth token receives the same challenge as a missing one. */
      }
    }
    const value = req
      .get("Authorization")
      ?.match(/^Bearer (pw_[A-Za-z0-9_-]{43})$/)?.[1];
    const row = value
      ? (db
          .prepare(
            "SELECT id,scopes FROM agent_tokens WHERE hash=? AND revoked_at IS NULL AND expires_at>?",
          )
          .get(tokenHash(value), new Date().toISOString()) as
          { id: string; scopes: string } | undefined)
      : undefined;
    if (!row) {
      res.set(
        "WWW-Authenticate",
        oauth?.enabled ? oauth.challenge : 'Bearer realm="paperword-agent"',
      );
      return next(new AppError(401, "A valid agent token is required."));
    }
    db.prepare("UPDATE agent_tokens SET last_used_at=? WHERE id=?").run(
      new Date().toISOString(),
      row.id,
    );
    res.locals.agentTokenId = row.id;
    res.locals.agentScopes = JSON.parse(row.scopes);
    res.set("Cache-Control", "no-store");
    next();
  };
  return { list, issue, revoke, authenticate };
}
