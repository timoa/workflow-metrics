FROM gcr.io/oss-fuzz-base/base-builder-javascript@sha256:4283764eeacdfb9024c7291c36d9ef5583bfeb245a343fbcaf4bb8d15bbddbd0

COPY . $SRC/workflow-metrics
WORKDIR $SRC/workflow-metrics

COPY .clusterfuzzlite/build.sh $SRC/build.sh
