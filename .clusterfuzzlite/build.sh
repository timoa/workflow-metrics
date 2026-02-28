#!/bin/bash -eu

npm install --no-save yaml@2.8.2 @jazzer.js/core@2.1.0

compile_javascript_fuzzer workflow-metrics .clusterfuzzlite/fuzz_workflow_yaml.js --sync
