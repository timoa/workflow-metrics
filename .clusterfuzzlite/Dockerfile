FROM gcr.io/oss-fuzz-base/base-builder-javascript

COPY . $SRC/workflow-metrics
WORKDIR $SRC/workflow-metrics

COPY .clusterfuzzlite/build.sh $SRC/build.sh
