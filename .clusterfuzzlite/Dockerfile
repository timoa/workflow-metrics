FROM gcr.io/oss-fuzz-base/base-builder-javascript@sha256:26c2e9a9333b120f48c561441976e7de16f194f10e41e18e4798e1911f051c24

COPY . $SRC/workflow-metrics
WORKDIR $SRC/workflow-metrics

COPY .clusterfuzzlite/build.sh $SRC/build.sh
