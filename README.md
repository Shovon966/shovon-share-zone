# SHOVON SHARE ZONE

A modern, responsive file-sharing web app inspired by the simplicity of WeTransfer. It includes drag-and-drop uploads, shareable links, expiry dates, optional password protection, and individual file downloads.

## Requirements

- Node.js 20+
- npm

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000

## Configuration

Set environment variables before starting:

- `PORT` — server port (default `3000`)
- `BASE_URL` — public base URL used in generated share links, e.g. `https://files.example.com`
- `MAX_FILE_SIZE` — max bytes per file (default 2 GiB)
- `MAX_FILES` — max files per transfer (default 20)
- `TOKEN_SECRET` — **set a long random secret in production**

Example:

```bash
TOKEN_SECRET="replace-with-a-long-random-secret" BASE_URL="https://files.example.com" npm start
```

## Deploy

Deploy to a Node.js host or VPS that supports persistent disk storage. Upload the project, install dependencies, set the environment variables, and run `npm start` behind HTTPS using a reverse proxy such as Nginx.

**Important:** This starter stores uploads and metadata on the server's local disk. Use a persistent volume; ephemeral hosting filesystems can erase uploads on restart/redeploy. For multi-server production, replace local disk storage and the JSON metadata file with object storage (S3-compatible storage) and a database. Configure server/proxy upload limits and request timeouts to support your chosen maximum file size.

## Production hardening checklist

- Set a strong `TOKEN_SECRET` and `BASE_URL`.
- Serve only over HTTPS.
- Put uploads on persistent, access-controlled storage and back them up as needed.
- Add malware scanning and abuse/reporting controls before accepting public uploads.
- Add authentication, quotas, and billing if needed.
- Consider a database and object storage for concurrency and scale.
- Set reverse-proxy body-size and timeout limits to match `MAX_FILE_SIZE`.

## Notes

- No user account is required.
- Passwords are stored as scrypt hashes.
- Download access tokens are short-lived (10 minutes).
- Expired transfers are cleaned up periodically and whenever transfer routes are accessed.
- The default token secret is for local development only; change it before production.
