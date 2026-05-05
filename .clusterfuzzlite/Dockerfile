FROM gcr.io/oss-fuzz-base/base-builder-javascript@sha256:b988c7e228df699bcfaad34f5853dd5f0a21c5476782516d8b00bab8bc46b724

COPY . $SRC/workflow-metrics
WORKDIR $SRC/workflow-metrics

COPY .clusterfuzzlite/build.sh $SRC/build.sh
