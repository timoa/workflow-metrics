FROM gcr.io/oss-fuzz-base/base-builder-javascript@sha256:5d383584d22928edf02a20e8a7b8ce776aecb9e20c76c9b23d2fdbc92858a966

COPY . $SRC/workflow-metrics
WORKDIR $SRC/workflow-metrics

COPY .clusterfuzzlite/build.sh $SRC/build.sh
