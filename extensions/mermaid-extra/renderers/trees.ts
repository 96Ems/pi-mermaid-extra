import { padEnd, stripQuotes, truncate } from "./util.ts";

export interface TreeNode {
	label: string;
	value: number | null;
	children: TreeNode[];
}

export function buildIndentTree(
	rawLines: string[],
	parse: (line: string) => { label: string; value?: number | null } | null,
): TreeNode[] {
	const roots: TreeNode[] = [];
	const stack: { indent: number; node: TreeNode }[] = [];
	for (const raw of rawLines) {
		if (!raw.trim()) continue;
		const indent = raw.search(/\S/);
		const parsed = parse(raw.trim());
		if (!parsed || !parsed.label) continue;
		const node: TreeNode = { label: parsed.label, value: parsed.value ?? null, children: [] };
		while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
		if (stack.length) stack[stack.length - 1].node.children.push(node);
		else roots.push(node);
		stack.push({ indent, node });
	}
	return roots;
}

export function renderTreeLines(nodes: TreeNode[], indentRootChildren = false): string[] {
	const out: string[] = [];
	const walk = (node: TreeNode, prefix: string, isLast: boolean, isRoot: boolean) => {
		out.push(isRoot ? node.label : `${prefix}${isLast ? "└── " : "├── "}${node.label}`);
		const childPrefix = isRoot ? (indentRootChildren ? "    " : "") : prefix + (isLast ? "    " : "│   ");
		node.children.forEach((c, i) => walk(c, childPrefix, i === node.children.length - 1, false));
	};
	nodes.forEach((n, i) => walk(n, "", i === nodes.length - 1, true));
	return out;
}

function cleanTreeLabel(raw: string): string {
	let s = raw;
	let desc = "";
	const dm = /\s*##\s*(.+)$/.exec(s);
	if (dm) {
		desc = dm[1].trim();
		s = s.slice(0, dm.index);
	}
	s = s
		.replace(/:::[\w-]+/g, "")
		.replace(/icon\([^)]*\)/g, "")
		.trim();
	const label = stripQuotes(s);
	return desc ? `${label}  — ${desc}` : label;
}

/** treeView-beta — indentation tree (with annotations) or box-drawing passthrough. */
export function renderTreeView(lines: string[], width: number): string[] | null {
	const body = lines.slice(1).filter((l) => l.trim() !== "");
	if (body.length === 0) return null;
	// Already a box-drawing tree: keep it as-is.
	if (body.some((l) => /[├└┣┗]/.test(l))) {
		return body.map((l) => l.replace(/\s+$/, ""));
	}
	const nodes = buildIndentTree(body, (l) => ({ label: cleanTreeLabel(l) }));
	if (nodes.length === 0) return null;
	return renderTreeLines(nodes);
}

/** ishikawa / ishikawa-beta — problem on top, causes as an indentation tree. */
export function renderIshikawa(lines: string[], width: number): string[] | null {
	const body = lines.slice(1).filter((l) => l.trim() !== "");
	if (body.length === 0) return null;
	const event = body[0].trim().replace(/\s*##.*$/, "");
	const nodes = buildIndentTree(body.slice(1), (l) => ({ label: cleanTreeLabel(l) }));
	if (nodes.length === 0) return [event];
	return [event, ...renderTreeLines(nodes, true)];
}

/** treemap-beta — nested proportional bars. */
export function renderTreemap(lines: string[], width: number): string[] | null {
	const parse = (line: string): { label: string; value: number | null } | null => {
		const m = /^\s*"?([^":]+?)"?\s*(?::\s*([\d.]+))?\s*(?:::[\w-]+)?\s*$/.exec(line);
		if (!m || !m[1].trim()) return null;
		return { label: stripQuotes(m[1].trim()), value: m[2] !== undefined ? parseFloat(m[2]) : null };
	};
	const nodes = buildIndentTree(
		lines.slice(1).filter((l) => l.trim() !== "" && !/^classDef\b/.test(l.trim())),
		parse,
	);
	if (nodes.length === 0) return null;
	const total = (n: TreeNode): number => (n.children.length ? n.children.reduce((a, c) => a + total(c), 0) : (n.value ?? 0));
	const maxTotal = Math.max(...nodes.map(total), 1);
	const rows: { label: string; value: number; depth: number; leaf: boolean }[] = [];
	const walk = (n: TreeNode, depth: number) => {
		rows.push({ label: n.label, value: total(n), depth, leaf: n.children.length === 0 });
		n.children.forEach((c) => walk(c, depth + 1));
	};
	nodes.forEach((n) => walk(n, 0));
	const labelW = Math.min(Math.max(...rows.map((r) => r.label.length + r.depth * 2)), Math.floor(width / 2));
	const valW = Math.max(...rows.map((r) => String(r.value).length));
	const barW = width - labelW - valW - 4;
	if (barW < 4) return null;
	return rows.map((r) => {
		const bar = "█".repeat(Math.max(1, Math.round((r.value / maxTotal) * barW)));
		const label = " ".repeat(r.depth * 2) + r.label;
		return `${padEnd(truncate(label, labelW), labelW)} ${bar} ${r.value}`;
	});
}
