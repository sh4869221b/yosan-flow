ARG NODE_IMAGE
ARG PLAYWRIGHT_IMAGE
FROM ${NODE_IMAGE} AS node
FROM ${PLAYWRIGHT_IMAGE}
# Read-only build mounts keep the derived filesystem in one layer, including fonts.
# The context contains no checkout, dependencies, credentials or local D1 data.
RUN --mount=type=bind,from=node,source=/usr/local/bin/node,target=/tmp/yosan-node,readonly \
    --mount=type=bind,source=fonts.conf,target=/tmp/yosan-fonts.conf,readonly \
    --mount=type=bind,source=font.json,target=/tmp/yosan-font.json,readonly \
    --mount=type=bind,source=font.deb,target=/tmp/yosan-font.deb,readonly \
    cp /tmp/yosan-node /usr/local/bin/node \
    && cp /tmp/yosan-fonts.conf /opt/yosan-fonts.conf \
    && chmod 0644 /opt/yosan-fonts.conf \
    && node --input-type=module -e 'import { readFileSync } from "node:fs"; import { createHash } from "node:crypto"; import assert from "node:assert/strict"; const font = JSON.parse(readFileSync("/tmp/yosan-font.json")); const bytes = readFileSync("/tmp/yosan-font.deb"); assert.equal(bytes.length, font.size); assert.equal(createHash("sha256").update(bytes).digest("hex"), font.sha256);' \
    && test "$(dpkg-deb -f /tmp/yosan-font.deb Package)" = "$(node -p 'require("/tmp/yosan-font.json").package')" \
    && test "$(dpkg-deb -f /tmp/yosan-font.deb Version)" = "$(node -p 'require("/tmp/yosan-font.json").version')" \
    && dpkg -i /tmp/yosan-font.deb \
    && mkdir -p /work/yosan-flow
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 FONTCONFIG_FILE=/opt/yosan-fonts.conf
WORKDIR /work/yosan-flow
