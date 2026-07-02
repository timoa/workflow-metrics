FROM gcr.io/oss-fuzz-base/base-builder-javascript@sha256:01b6f00a2c54557da85701432d23c7a7ce633f34e9e35fbec897fba453719cb1

COPY . $SRC/workflow-metrics
WORKDIR $SRC/workflow-metrics

COPY .clusterfuzzlite/build.sh $SRC/build.sh
