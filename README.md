# IsoDisplay

IsoDisplay is a Docker-first digital signage platform. Upload media, arrange playlists, and stream them to remote displays backed by PostgreSQL and real-time WebSockets.

## Features

- Upload images, videos, PDFs, and YouTube links
- Build playlists and assign them to displays instantly
- Role-based administration with real-time updates
- Blank slate install — no demo content bundled

## Quick Start (Docker Compose)

1. **Clone the repository and prepare environment variables**

   ```bash
   git clone https://github.com/your-org/isodisplay.git
   cd isodisplay
   cp .env.example .env
   ```

   Update `.env` with your database password, NextAuth secret, and initial admin credentials.

2. **Launch the stack**

   Edit `docker-compose.yml` so the `app` service points at the image published to GHCR (for example `ghcr.io/your-org/isodisplay:v1.0.0`). Then start the services:

   ```bash
   docker compose pull
   docker compose up -d
   ```

   The container automatically runs pending Prisma migrations and seeds the administrator account on startup. If you ever need to reapply them manually, run:

   ```bash
   docker compose exec app npx prisma migrate deploy
   docker compose exec app npx prisma db seed
   ```

3. **Log in**

   Open [http://localhost:3000](http://localhost:3000) and sign in with the admin email/username/password you defined in `.env`.

### Compose Reference

```yaml
services:
  postgres:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-isodisplay}
      POSTGRES_USER: ${POSTGRES_USER:-isodisplay}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
    volumes:
      - ./data/postgres/db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-isodisplay} -d ${POSTGRES_DB:-isodisplay}"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    image: ghcr.io/<owner>/<repo>:<tag>
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-isodisplay}:${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}@postgres:5432/${POSTGRES_DB:-isodisplay}?schema=public
      NEXTAUTH_URL: ${NEXTAUTH_URL:-http://localhost:3000}
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET:?NEXTAUTH_SECRET is required}
      ADMIN_EMAIL: ${ADMIN_EMAIL:-admin@example.com}
      ADMIN_USERNAME: ${ADMIN_USERNAME:-admin}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:-change-me}
      FILE_STORAGE_PATH: /app/uploads
    volumes:
      - ./uploads:/app/uploads
    ports:
      - "3000:3000"

networks:
  default:
    driver: bridge
```

Replace `<owner>/<repo>:<tag>` with the tag produced by the release workflow. When running in Portainer, set the same variables on the stack’s **Environment** tab so the placeholders resolve correctly.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `POSTGRES_DB` | Database name (default `isodisplay`) |
| `POSTGRES_USER` | Database user (default `isodisplay`) |
| `POSTGRES_PASSWORD` | Database password (required) |
| `NEXTAUTH_SECRET` | 32+ character secret for NextAuth (required) |
| `NEXTAUTH_URL` | Public URL for callbacks (default `http://localhost:3000`) |
| `ADMIN_EMAIL` | Email for the initial administrator account |
| `ADMIN_USERNAME` | Username for the initial administrator account |
| `ADMIN_PASSWORD` | Password for the initial administrator account |

Uploads live in `./uploads`, which ships empty apart from a `.gitkeep` so you can populate it with your own media.

## GitHub Actions (GHCR Release)

`.github/workflows/manual-build.yml` defines a manual workflow that builds the Docker image and pushes it to GitHub Container Registry. Trigger it from the Actions tab and supply a tag (for example `v1.0.0`). If you leave the tag blank, the workflow falls back to the commit SHA. The workflow publishes two tags:

```
ghcr.io/<owner>/<repo>:<tag>
ghcr.io/<owner>/<repo>:latest
```

To deploy using the published image:

```bash
docker login ghcr.io -u <owner> --password-stdin <<< "$GH_TOKEN"
docker compose pull
docker compose up -d
```

## Operations Tips

- `docker compose logs -f app` – follow runtime logs
- `docker compose exec app npx prisma studio` – inspect the database UI
- Keep `data/postgres` and `uploads` backed up regularly
- Re-run `docker compose exec app npx prisma db seed` whenever you change admin credentials in `.env`

## License

Provided as-is. Review secrets, TLS, and network controls before deploying to production.
