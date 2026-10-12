ARG NODE_IMAGE
ARG PLAYWRIGHT_IMAGE
FROM ${NODE_IMAGE} AS node
FROM ${PLAYWRIGHT_IMAGE}
# Read-only build mounts keep the derived filesystem in one layer, including fonts.
# The context contains no checkout, dependencies, credentials or local D1 data.
RUN --mount=type=bind,from=node,source=/usr/local/bin/node,target=/tmp/yosan-node,readonly \
    --mount=type=bind,source=fonts.conf,target=/tmp/yosan-fonts.conf,readonly \
    cp /tmp/yosan-node /usr/local/bin/node \
    && cp /tmp/yosan-fonts.conf /opt/yosan-fonts.conf \
    && chmod 0644 /opt/yosan-fonts.conf \
    && rm -f /etc/apt/sources.list.d/nodesource.list \
    && apt-get update -o APT::Update::Error-Mode=any \
    && apt-get install -y --no-install-recommends fonts-noto-cjk=1:20230817+repack1-3 \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /work/yosan-flow
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 FONTCONFIG_FILE=/opt/yosan-fonts.conf
WORKDIR /work/yosan-flow
