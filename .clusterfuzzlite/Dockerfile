FROM gcr.io/oss-fuzz-base/base-builder-javascript@sha256:b8ef4dc295d577eac4281a43b02af37fd7268ac0144978ac17103f46fc76393c

COPY . $SRC/workflow-metrics
WORKDIR $SRC/workflow-metrics

COPY .clusterfuzzlite/build.sh $SRC/build.sh
