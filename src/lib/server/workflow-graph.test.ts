import { describe, expect, it } from 'vitest';
import { buildJobGraphFromWorkflow } from './workflow-graph';

const simpleWorkflow = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Install
        run: echo install
      - name: Test
        run: echo test
  lint:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Lint
        run: echo lint
`;

describe('buildJobGraphFromWorkflow', () => {
	it('creates nodes and edges from jobs and needs', () => {
		const { nodes, edges } = buildJobGraphFromWorkflow(simpleWorkflow);

		expect(nodes).toHaveLength(2);
		expect(edges).toHaveLength(1);

		const buildNode = nodes.find((n) => n.id === 'build');
		const lintNode = nodes.find((n) => n.id === 'lint');

		expect(buildNode?.jobName).toBe('build');
		expect(buildNode?.runnerLabel).toBe('ubuntu-latest');
		expect(buildNode?.stepCount).toBe(2);

		expect(lintNode?.stepCount).toBe(1);

		expect(edges[0]).toMatchObject({
			source: 'build',
			target: 'lint'
		});
	});
});

