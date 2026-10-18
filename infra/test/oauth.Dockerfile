# Test-only image: existing Nest testing dependency, isolated fake provider.
# Production Dockerfile remains pruned and never launches the fixture.
FROM node:24-slim
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts packages/contracts
RUN npm ci --ignore-scripts --workspace @examate/api --include-workspace-root
COPY apps/api apps/api
COPY infra/postgres infra/postgres
RUN npm run build --workspace @examate/api
CMD ["node", "apps/api/test/oauth-browser-fixture.mjs"]
