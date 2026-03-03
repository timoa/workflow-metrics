FROM gcr.io/oss-fuzz-base/base-builder-javascript@sha256:376e6ee682d28ffe1c11203b8e34d64e831cb46ee95378bc7dd3d2998386aecd

COPY . $SRC/workflow-metrics
WORKDIR $SRC/workflow-metrics

COPY .clusterfuzzlite/build.sh $SRC/build.sh
