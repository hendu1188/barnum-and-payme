FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node . .
USER node
ENV PARLAY_PORT=8787
EXPOSE 8787
# Hosted mode requires an HTTPS origin, owner password and a writable persistent
# PARLAY_DATA_DIR. Collection defaults to off on a new database and then resumes
# the persisted owner setting. The Render Blueprint uses its native Node runtime.
CMD ["node","--no-warnings","server/main.cjs"]
