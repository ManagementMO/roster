ARG BASE_IMAGE
FROM ${BASE_IMAGE}
USER root
RUN if command -v apk >/dev/null 2>&1; then apk add --no-cache bash procps strace util-linux coreutils ca-certificates; else apt-get update && apt-get install -y --no-install-recommends bash procps strace util-linux coreutils ca-certificates; fi
USER node
