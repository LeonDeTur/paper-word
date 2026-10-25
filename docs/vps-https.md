# HTTPS for your own VPS

Example address: **https://paperword.example.com**. MCP: **https://paperword.example.com/mcp**. Replace these with your domain. A free sslip.io name can use `paperword.<hyphenated-IPv4>.sslip.io`, for example `paperword.203-0-113-10.sslip.io`. `203.0.113.10` is reserved for documentation and is not a production server address.

sslip.io resolves the IPv4 embedded in the name. It provides a free third-party DNS name without registration, rather than your own `.ru` domain. [Service details and HTTPS](https://nip.io/). VPS region does not restrict name choice; check DNS availability from your network. Changing the IP also changes the name.

Compose includes Caddy, which obtains and renews a publicly trusted certificate automatically. [Automatic HTTPS](https://caddyserver.com/docs/automatic-https). Open the certificate's hostname in Chrome, rather than `https://203.0.113.10`. Self-signed certificates do not meet the requirement for warning-free access and are not used.

On a VPS with Docker and Compose installed:

```sh
cp .env.vps.example .env
# Edit .env and set a unique APP_PASSWORD with at least 12 characters.
# Configure AI_BASE_URL, AI_MODEL and, if needed, AI_API_KEY.
docker compose up -d --build
docker compose logs --tail=80 caddy
```

Allow inbound TCP 80 and 443 in the VPS firewall and hosting control panel. These ports must be available; do not run another web server on them. Certificate issuance requires external reachability and outbound HTTPS. Preserve `caddy_data`, which holds certificate state and keys, between updates. Issuance and verification happen on the VPS after startup; a local build does not prove success.

Check from another computer with TLS verification enabled:

```sh
curl --fail https://paperword.example.com/api/config
curl --fail https://paperword.example.com/.well-known/oauth-protected-resource/mcp
curl -i -X POST https://paperword.example.com/mcp
```

The first two requests should return JSON; the last should return `401` with `WWW-Authenticate` and an OAuth metadata link. Then open the website in Chrome and verify there is no TLS error. Do not use `curl -k` for this check.

If issuance hits shared DNS-provider limits, try `paperword.203-0-113-10.nip.io` (update APP_DOMAIN, APP_ORIGIN and the ChatGPT app URL together) or obtain a separate [DuckDNS](https://www.duckdns.org/) name. These are alternatives, not automatic failover.

An IPv4 certificate is another option: Let's Encrypt announced general availability of IP certificates in January 2026. They last about six days and require a compatible ACME client and automated renewal. [Official announcement](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability). The current configuration uses a standard DNS-name certificate.

To transfer the two imported articles, stop the local server and copy the entire `data` directory. Start Compose, stop `app`, copy the directory into `/app/data` using `docker compose cp data/. app:/app/data/`, then restart `app`. Back up the VPS volume first: copying replaces matching files. Check file ownership: the container runs as `node` (UID 1000). If needed, restore ownership through a one-off Compose container with `--user root`, then start the service.
