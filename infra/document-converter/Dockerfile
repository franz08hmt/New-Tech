FROM node:24-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends libreoffice-writer fonts-dejavu-core fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/converter
COPY infra/document-converter/*.mjs ./
USER node
ENV HOME=/tmp
EXPOSE 3010
CMD ["node", "server.mjs"]
