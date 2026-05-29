# LittleLoop 🌿

> Small moments. Stronger families.

A gentle daily connection app for busy working parents, stay-at-home parents, and siblings. One prompt a day keeps families genuinely close — even on the hardest days.

---

## What's inside

```
Little_Loop/
├── index.html          Landing page + live dashboard
├── styles.css          All styles
├── app.js              Frontend — fetches from the API
├── server/
│   ├── index.js        Express server entry point
│   ├── db.js           Database layer (SQLite locally / PostgreSQL in prod)
│   ├── seed.js         Demo data seeder
│   └── routes/
│       └── api.js      REST API (/api/*)
├── data/               SQLite database file (auto-created, git-ignored)
├── package.json
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## Option 1 — Run locally (no Docker, no database server)

Uses SQLite automatically. Zero extra setup.

### Prerequisites
- Node.js 18 or later → https://nodejs.org

### Steps

```bash
# 1. Clone the repo
git clone <your-repo-url> Little_Loop
cd Little_Loop

# 2. Install dependencies
npm install

# 3. (Optional) create a .env file — defaults work fine without it
cp .env.example .env

# 4. Seed demo data so the dashboard has something to show
npm run seed

# 5. Start the server
npm start
```

Open **http://localhost:3000** in your browser.

For auto-reload during development:

```bash
npm run dev
```

---

## Option 2 — Run locally with Docker (SQLite, zero config)

### Prerequisites
- Docker Desktop → https://docs.docker.com/desktop/

### Steps

```bash
# 1. Build and start
docker compose up --build

# 2. Seed demo data (first time only)
docker compose exec app node server/seed.js
```

Open **http://localhost:3000**.

To stop: `docker compose down`

---

## Option 3 — Run locally with Docker + PostgreSQL

Mirrors the production database engine.

```bash
# Start app + PostgreSQL together
docker compose --profile postgres up --build

# Seed demo data (first time only)
docker compose exec app-pg node server/seed.js
```

Open **http://localhost:3000**.

---

## Switching to PostgreSQL (local or remote)

Set `DATABASE_URL` in your `.env` file:

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/littleloop
```

The app detects the variable at startup and switches automatically. No code changes needed.

---

## API Reference

All routes are prefixed with `/api`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness probe — returns `{ status: "ok" }` |
| GET | `/dashboard` | Dashboard stats for the default family |
| GET | `/memories` | Memory jar for the default family |
| POST | `/loops/respond` | Save a response to today's loop |
| GET | `/families` | List all families |
| POST | `/families` | Create a family `{ name }` |
| GET | `/families/:id/members` | List family members |
| POST | `/families/:id/members` | Add a member `{ name, role, age_stage }` |
| GET | `/families/:id/loops` | List loops with last response |
| POST | `/families/:id/loops` | Create a loop `{ prompt, loop_type }` |
| GET | `/families/:id/memories` | List memories |
| POST | `/families/:id/memories` | Save a memory `{ content }` |
| POST | `/families/:id/care-steps` | Log a care step |

---

## Deploy to AWS (high availability)

### Architecture

```
Internet
   |
   v
Application Load Balancer (ALB)
   |  HTTPS :443  ->  HTTP :3000
   |---------------------------------------|
   v                                       v
ECS Fargate Task (AZ-1)         ECS Fargate Task (AZ-2)
   LittleLoop container              LittleLoop container
   |                                       |
   |-----------------|---------------------|
                     v
            RDS PostgreSQL  (Multi-AZ)
            Primary  <--replication-->  Standby
```

- **ALB** distributes traffic and handles SSL termination.
- **ECS Fargate** runs 2+ container replicas across availability zones — scale up/down without managing servers.
- **RDS PostgreSQL Multi-AZ** provides automatic failover in under 60 seconds if the primary fails.
- The app is **stateless** — all state is in the database, so any task can handle any request.

---

### Step-by-step AWS deployment

#### Prerequisites
- AWS account + AWS CLI configured (`aws configure`)
- Docker installed

#### Step 1 — Push image to Amazon ECR

```bash
# Create a registry
aws ecr create-repository --repository-name littleloop --region us-east-1

# Authenticate Docker to ECR
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS \
    --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Build and push
docker build -t littleloop .
docker tag littleloop:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/littleloop:latest
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/littleloop:latest
```

#### Step 2 — Create RDS PostgreSQL (Multi-AZ)

In the AWS console:

1. Go to **RDS -> Create database**
2. Engine: **PostgreSQL 16**
3. Template: **Production**
4. Availability: check **Multi-AZ DB Instance**
5. Instance: `db.t3.micro` (start small, scale later)
6. Database name: `littleloop`
7. Note the endpoint, username, and password

#### Step 3 — Create ECS cluster + service

1. **ECS -> Clusters -> Create cluster** (Fargate)
2. **Task definition** — container image: your ECR URL
3. Environment variables:
   - `DATABASE_URL` = `postgresql://USER:PASS@RDS_ENDPOINT:5432/littleloop`
   - `NODE_ENV` = `production`
   - `PORT` = `3000`
4. **Service** — desired count: `2`, spread across AZs
5. Attach to a new **Application Load Balancer**
   - Target group health check: `GET /api/health`

#### Step 4 — Seed the database (first deploy only)

```bash
# Run seed as a one-off ECS task
aws ecs run-task \
  --cluster littleloop-cluster \
  --task-definition littleloop \
  --overrides '{"containerOverrides":[{"name":"littleloop","command":["node","server/seed.js"]}]}' \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[SUBNET_ID],securityGroups=[SG_ID]}"
```

#### Step 5 — Add HTTPS (recommended)

1. **AWS Certificate Manager -> Request certificate** for your domain
2. ALB listener: redirect HTTP :80 -> HTTPS :443
3. HTTPS listener forwards to the target group

#### Step 6 — Auto scaling (optional)

In ECS service -> Auto Scaling:
- Scale out when CPU > 70%
- Min tasks: 2 | Max tasks: 10

---

## Environment variables reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port the server listens on |
| `NODE_ENV` | `development` | `production` enables PostgreSQL SSL |
| `DATABASE_URL` | _(blank)_ | PostgreSQL URL; blank = SQLite |
| `SQLITE_PATH` | `./data/littleloop.db` | SQLite file location |

---

## Database schema

```
families      id, name, created_at
members       id, family_id, name, role, age_stage, created_at
loops         id, family_id, loop_type, prompt, created_at
responses     id, loop_id, member_id, content, created_at
memories      id, family_id, member_id, content, created_at
care_steps    id, family_id, member_id, step_date, created_at
```

Tables are created automatically on first startup. No migrations to run.

---

## Development tips

```bash
# Watch server logs + auto-reload
npm run dev

# Re-seed fresh demo data
npm run seed

# Check the API from the terminal
curl http://localhost:3000/api/health
curl http://localhost:3000/api/dashboard
curl http://localhost:3000/api/memories
```
