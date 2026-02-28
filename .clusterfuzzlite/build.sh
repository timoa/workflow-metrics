#!/bin/bash -eu

npm install
npm install --save-dev @jazzer.js/core

compile_javascript_fuzzer workflow-metrics .clusterfuzzlite/fuzz_workflow_yaml.js --sync
