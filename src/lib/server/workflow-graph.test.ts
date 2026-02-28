import { describe, expect, it } from 'vitest';
import { buildJobGraphFromWorkflow, parseWorkflowYaml } from './workflow-graph';

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

describe('parseWorkflowYaml', () => {
	it('parses valid workflow YAML', () => {
		const result = parseWorkflowYaml(simpleWorkflow);
		expect(result.jobs).toBeDefined();
		expect(Object.keys(result.jobs || {})).toContain('build');
		expect(Object.keys(result.jobs || {})).toContain('lint');
	});

	it('returns empty jobs for empty YAML', () => {
		const result = parseWorkflowYaml('');
		expect(result.jobs).toEqual({});
	});

	it('returns empty jobs for null input', () => {
		const result = parseWorkflowYaml(null as unknown as string);
		expect(result.jobs).toEqual({});
	});

	it('returns empty jobs for malformed YAML', () => {
		const result = parseWorkflowYaml('invalid: yaml: :: ::');
		expect(result.jobs).toEqual({});
	});

	it('returns empty jobs for non-object YAML', () => {
		const result = parseWorkflowYaml('just a string');
		expect(result.jobs).toEqual({});
	});

	it('returns empty jobs for YAML without jobs key', () => {
		const result = parseWorkflowYaml('name: CI\non: push');
		expect(result.jobs).toEqual({});
	});
});

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
		expect(buildNode?.columnIndex).toBe(0);

		expect(lintNode?.stepCount).toBe(1);
		expect(lintNode?.columnIndex).toBe(1);

		expect(edges[0]).toMatchObject({
			source: 'build',
			target: 'lint'
		});
	});

	it('returns empty nodes and edges for empty workflow', () => {
		const { nodes, edges } = buildJobGraphFromWorkflow('');
		expect(nodes).toHaveLength(0);
		expect(edges).toHaveLength(0);
	});

	it('handles jobs with no dependencies', () => {
		const workflow = `
jobs:
  job1:
    runs-on: ubuntu-latest
    steps:
      - run: echo 1
  job2:
    runs-on: ubuntu-latest
    steps:
      - run: echo 2
`;
		const { nodes, edges } = buildJobGraphFromWorkflow(workflow);
		expect(nodes).toHaveLength(2);
		expect(edges).toHaveLength(0);

		const job1 = nodes.find((n) => n.id === 'job1');
		const job2 = nodes.find((n) => n.id === 'job2');
		expect(job1?.columnIndex).toBe(0);
		expect(job2?.columnIndex).toBe(0);
	});

	it('handles multiple needs dependencies', () => {
		const workflow = `
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo build
  test:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - run: echo test
  lint:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - run: echo lint
  deploy:
    needs: [test, lint]
    runs-on: ubuntu-latest
    steps:
      - run: echo deploy
`;
		const { nodes, edges } = buildJobGraphFromWorkflow(workflow);
		expect(nodes).toHaveLength(4);
		expect(edges).toHaveLength(4);

		const deployNode = nodes.find((n) => n.id === 'deploy');
		expect(deployNode?.columnIndex).toBe(2);

		const deployEdges = edges.filter((e) => e.target === 'deploy');
		expect(deployEdges).toHaveLength(2);
	});

	it('handles complex dependency chains', () => {
		const workflow = `
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: echo a
  b:
    needs: a
    runs-on: ubuntu-latest
    steps:
      - run: echo b
  c:
    needs: b
    runs-on: ubuntu-latest
    steps:
      - run: echo c
  d:
    needs: [a, c]
    runs-on: ubuntu-latest
    steps:
      - run: echo d
`;
		const { nodes, edges } = buildJobGraphFromWorkflow(workflow);
		expect(nodes).toHaveLength(4);

		const a = nodes.find((n) => n.id === 'a');
		const b = nodes.find((n) => n.id === 'b');
		const c = nodes.find((n) => n.id === 'c');
		const d = nodes.find((n) => n.id === 'd');

		expect(a?.columnIndex).toBe(0);
		expect(b?.columnIndex).toBe(1);
		expect(c?.columnIndex).toBe(2);
		expect(d?.columnIndex).toBe(3);
	});

	it('handles circular dependencies gracefully', () => {
		const workflow = `
jobs:
  a:
    needs: c
    runs-on: ubuntu-latest
    steps:
      - run: echo a
  b:
    needs: a
    runs-on: ubuntu-latest
    steps:
      - run: echo b
  c:
    needs: b
    runs-on: ubuntu-latest
    steps:
      - run: echo c
`;
		const { nodes, edges } = buildJobGraphFromWorkflow(workflow);
		expect(nodes).toHaveLength(3);
		expect(edges).toHaveLength(3);
	});

	it('handles reusable workflows with uses syntax', () => {
		const workflow = `
jobs:
  build:
    uses: owner/repo/.github/workflows/build.yml@main
  test:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - run: echo test
`;
		const { nodes, edges } = buildJobGraphFromWorkflow(workflow);
		expect(nodes).toHaveLength(2);
		expect(edges).toHaveLength(1);

		const buildNode = nodes.find((n) => n.id === 'build');
		expect(buildNode?.runnerLabel).toBe('');
		expect(buildNode?.stepCount).toBe(0);
	});

	it('handles jobs with custom names', () => {
		const workflow = `
jobs:
  build_job:
    name: Build Application
    runs-on: ubuntu-latest
    steps:
      - run: echo build
`;
		const { nodes } = buildJobGraphFromWorkflow(workflow);
		const buildNode = nodes.find((n) => n.id === 'build_job');
		expect(buildNode?.jobName).toBe('Build Application');
	});

	it('handles jobs without explicit names', () => {
		const workflow = `
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - run: echo test
`;
		const { nodes } = buildJobGraphFromWorkflow(workflow);
		const buildNode = nodes.find((n) => n.id === 'build-and-test');
		expect(buildNode?.jobName).toBe('build-and-test');
	});

	it('handles different runner labels', () => {
		const workflow = `
jobs:
  linux:
    runs-on: ubuntu-latest
    steps:
      - run: echo linux
  windows:
    runs-on: windows-latest
    steps:
      - run: echo windows
  mac:
    runs-on: macos-latest
    steps:
      - run: echo mac
  matrix:
    runs-on: [ubuntu-latest, windows-latest]
    steps:
      - run: echo matrix
`;
		const { nodes } = buildJobGraphFromWorkflow(workflow);
		expect(nodes).toHaveLength(4);

		const linux = nodes.find((n) => n.id === 'linux');
		const windows = nodes.find((n) => n.id === 'windows');
		const mac = nodes.find((n) => n.id === 'mac');
		const matrix = nodes.find((n) => n.id === 'matrix');

		expect(linux?.runnerLabel).toBe('ubuntu-latest');
		expect(windows?.runnerLabel).toBe('windows-latest');
		expect(mac?.runnerLabel).toBe('macos-latest');
		expect(matrix?.runnerLabel).toBe('ubuntu-latest, windows-latest');
	});

	it('skips template expressions in runs-on', () => {
		const workflow = `
jobs:
  dynamic:
    runs-on: \${{ matrix.os }}
    steps:
      - run: echo dynamic
  normal:
    runs-on: ubuntu-latest
    steps:
      - run: echo normal
`;
		const { nodes } = buildJobGraphFromWorkflow(workflow);
		const dynamic = nodes.find((n) => n.id === 'dynamic');
		const normal = nodes.find((n) => n.id === 'normal');

		expect(dynamic?.runnerLabel).toBe('\${{ matrix.os }}');
		expect(normal?.runnerLabel).toBe('ubuntu-latest');
	});

	it('handles jobs with no runs-on (defaults to empty)', () => {
		const workflow = `
jobs:
  no_runner:
    steps:
      - run: echo hello
`;
		const { nodes } = buildJobGraphFromWorkflow(workflow);
		const noRunner = nodes.find((n) => n.id === 'no_runner');
		expect(noRunner?.runnerLabel).toBe('ubuntu-latest');
	});

	it('handles broken references gracefully', () => {
		const workflow = `
jobs:
  a:
    needs: nonexistent
    runs-on: ubuntu-latest
    steps:
      - run: echo a
`;
		const { nodes, edges } = buildJobGraphFromWorkflow(workflow);
		expect(nodes).toHaveLength(1);
		expect(edges).toHaveLength(0);
	});

	it('correctly positions jobs in rows within same column', () => {
		const workflow = `
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: echo a
  b:
    runs-on: ubuntu-latest
    steps:
      - run: echo b
  c:
    needs: [a, b]
    runs-on: ubuntu-latest
    steps:
      - run: echo c
`;
		const { nodes } = buildJobGraphFromWorkflow(workflow);
		const a = nodes.find((n) => n.id === 'a');
		const b = nodes.find((n) => n.id === 'b');

		expect(a?.columnIndex).toBe(0);
		expect(a?.rowIndex).toBe(0);
		expect(b?.columnIndex).toBe(0);
		expect(b?.rowIndex).toBe(1);
	});

	it('includes edge IDs', () => {
		const workflow = `
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: echo a
  b:
    needs: a
    runs-on: ubuntu-latest
    steps:
      - run: echo b
`;
		const { edges } = buildJobGraphFromWorkflow(workflow);
		expect(edges[0].id).toBe('a->b');
	});

	it('initializes node metrics to zero', () => {
		const workflow = `
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo build
`;
		const { nodes } = buildJobGraphFromWorkflow(workflow);
		const build = nodes[0];

		expect(build.avgDurationMs).toBe(0);
		expect(build.minDurationMs).toBe(0);
		expect(build.maxDurationMs).toBe(0);
		expect(build.runCount).toBe(0);
		expect(build.successRate).toBe(0);
		expect(build.minutesShare).toBe(0);
	});
});

