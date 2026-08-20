# syntax=docker/dockerfile:1
#
# Level One — CV & Application Generator
#
# Why this file exists: the app turns your CV into a PDF by driving headless
# Chromium itself (lib/pdf.ts). That is the same engine Gotenberg wraps in a
# container, minus the container and the network hop — but it does mean a
# Chromium has to exist wherever the app runs. Your laptop already has one.
# A plain Node image does not, so without this Dockerfile a deployed copy gets
# all the way through Gemini and then fails on the last step.
#
# Build:  docker build -t levelone-cv .
# Run:    docker run -p 3000:3000 --env-file .env.local levelone-cv
#
# On Coolify: set the build pack to "Dockerfile" and the port to 3000.
# See SETUP.md, "Putting it on a server".

# --------------------------------------------------------------------------
FROM node:22-bookworm-slim AS base

# PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: playwright-core ships no browsers and
# downloads none. Stated anyway so a future dependency cannot start pulling
# 150MB during an image build.
ENV NEXT_TELEMETRY_DISABLED=1
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# --------------------------------------------------------------------------
# Dependencies. Copied on their own so editing a component does not throw away
# the npm cache and reinstall everything.
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# --------------------------------------------------------------------------
FROM base AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# --------------------------------------------------------------------------
FROM base AS runtime
WORKDIR /app

# chromium            — what actually prints the PDF.
#
# fonts-liberation    — NOT optional. The CV asks for
#                       "Helvetica Neue", Helvetica, Arial, sans-serif, and
#                       Liberation Sans is the metric-compatible stand-in
#                       Arial and Helvetica resolve to. Measured, not assumed:
#                       rendering the same CV in Liberation Sans gives one A4
#                       page, and in DejaVu Sans — the default sans Chromium
#                       drops to when Liberation is absent — it runs to TWO.
#                       Remove this package and every CV silently gains a
#                       second page.
#
# fonts-dejavu-core   — the last-resort fallback, for any glyph Liberation
#                       lacks. Small, and better than a row of blank boxes.
#
# ca-certificates     — HTTPS to PocketBase and to Gemini.
# python3 + pip       — job searching runs python-jobspy in a subprocess. It is
#                       the mature scraper for LinkedIn, Indeed and Google, and
#                       it is Python. The TypeScript port is a few dozen commits
#                       old and says itself most of its backends do not work.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium \
        fonts-liberation \
        fonts-dejavu-core \
        ca-certificates \
        python3 \
        python3-pip \
    && rm -rf /var/lib/apt/lists/*

# --break-system-packages because Debian marks the system Python as externally
# managed (PEP 668). In a container there is no other Python to protect, and a
# virtualenv here would only add a path to get wrong.
RUN pip3 install --no-cache-dir --break-system-packages python-jobspy

ENV NODE_ENV=production
ENV PORT=3000

# Strictly optional: /usr/bin/chromium is already in the auto-detect list in
# lib/pdf.ts. Set here so the choice is stated rather than guessed, and so a
# missing binary fails loudly instead of falling through to "none of the
# fifteen places I looked".
ENV PDF_CHROMIUM_PATH=/usr/bin/chromium

# Which python runs scripts/scrape_jobs.py. Same reasoning as the line above:
# stated rather than guessed, so a missing interpreter fails loudly.
ENV PYTHON_BIN=/usr/bin/python3

COPY --from=build --chown=node:node /app ./

# Chromium normally needs root for its own sandbox. lib/pdf.ts already launches
# with --no-sandbox, so the sandbox is off and root buys nothing — which means
# this can drop to the unprivileged user the Node image ships with.
USER node

EXPOSE 3000

CMD ["npm", "run", "start"]
