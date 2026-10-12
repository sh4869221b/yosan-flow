ARG NODE_IMAGE
ARG PLAYWRIGHT_IMAGE
FROM ${NODE_IMAGE} AS node
FROM ${PLAYWRIGHT_IMAGE}
# Only the upstream Node binary is needed; retain Noble's libraries and tools.
COPY --from=node /usr/local/bin/node /usr/local/bin/node
RUN rm -f /etc/apt/sources.list.d/nodesource.list \
    && apt-get update -o APT::Update::Error-Mode=any && apt-get install -y --no-install-recommends fonts-noto-cjk=1:20230817+repack1-3 \
    && rm -rf /var/lib/apt/lists/*
COPY fonts.conf /opt/yosan-fonts.conf
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 FONTCONFIG_FILE=/opt/yosan-fonts.conf
WORKDIR /work/yosan-flow
