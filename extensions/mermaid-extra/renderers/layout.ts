import { padEnd, stripQuotes, truncate } from "./util.ts";

/** Single-line box around a label. */
function boxOneLine(label: string, w: number): string[] {
	const inner = Math.max(1, w - 2);
	const text = truncate(label, inner);
	const padL = Math.floor((inner - text.length) / 2);
	const padR = Math.max(0, inner - text.length - padL);
	return [`┌${"─".repeat(inner)}┐`, `│${" ".repeat(padL)}${text}${" ".repeat(padR)}│`, `└${"─".repeat(inner)}┘`];
}

/** Multi-line box with a title and bullet lines (for composites / lanes). */
function boxMulti(title: string, bullets: string[], w: number): string[] {
	const inner = Math.max(1, w - 2);
	const out = [`┌${"─".repeat(inner)}┐`, `│ ${padEnd(truncate(title, inner - 2), inner - 2)} │`];
	for (const b of bullets) out.push(`│ ${padEnd(truncate(b, inner - 2), inner - 2)} │`);
	out.push(`└${"─".repeat(inner)}┘`);
	return out;
}

function joinBoxes(boxes: string[][], gap: number): string[] {
	const h = Math.max(0, ...boxes.map((b) => b.length));
	const out: string[] = [];
	for (let i = 0; i < h; i++) out.push(boxes.map((b) => b[i] ?? "").join(" ".repeat(gap)).replace(/\s+$/, ""));
	return out;
}

interface BlockNode {
	id: string;
	label: string;
	span: number;
	childRows: BlockNode[][] | null;
	isSpace: boolean;
}

/** Whitespace tokenizer that keeps quoted strings and bracketed shapes together. */
function splitTokens(line: string): string[] {
	const toks: string[] = [];
	let quote = false;
	let depth = 0;
	let cur = "";
	for (const ch of line) {
		if (quote) {
			cur += ch;
			if (ch === '"') quote = false;
			continue;
		}
		if (ch === '"') {
			quote = true;
			cur += ch;
			continue;
		}
		if (ch === "(" || ch === "[" || ch === "{") depth++;
		if (ch === ")" || ch === "]" || ch === "}") depth--;
		if (/\s/.test(ch) && depth === 0) {
			if (cur) toks.push(cur);
			cur = "";
			continue;
		}
		cur += ch;
	}
	if (cur) toks.push(cur);
	return toks;
}

function parseBlockEdge(line: string): { from: string; to: string; label: string; both: boolean } | null {
	const m = /^([\w-]+)\s*(?:--\s*"([^"]*)"\s*)?(<?)(--+|==+)(>?)\s*([\w-]+)$/.exec(line.trim());
	if (!m) return null;
	return { from: m[1], to: m[6], label: m[2] ?? "", both: m[3] === "<" && m[5] === ">" };
}

/** block / block-beta — grid of boxes from the source rows + edge list. */
export function renderBlock(lines: string[], width: number): string[] | null {
	let columns = 0;
	const edges: { from: string; to: string; label: string; both: boolean }[] = [];
	const body = lines
		.slice(1)
		.filter((l) => l.trim() !== "" && !/^(%%|style\b|classDef\b|class\b|linkStyle\b|direction\b)/.test(l.trim()));

	const parseToken = (tok: string): BlockNode | null => {
		const t = tok.trim();
		if (!t) return null;
		const sp = /^space(?::(\d+))?$/.exec(t);
		if (sp) return { id: "", label: "", span: parseInt(sp[1] ?? "1", 10), childRows: null, isSpace: true };
		const m = /^([\w-]+)\s*(.*)$/.exec(t);
		if (!m) return null;
		let rest = m[2] ?? "";
		let span = 1;
		const sm = /:\s*(\d+)\s*$/.exec(rest);
		if (sm) {
			span = parseInt(sm[1], 10);
			rest = rest.slice(0, sm.index);
		}
		const q = /"([^"]*)"/.exec(rest);
		const label = q ? q[1].replace(/&nbsp;/g, " ").trim() : "";
		return { id: m[1], label: label || m[1], span, childRows: null, isSpace: false };
	};

	const idx = { v: 0 };
	const parseRows = (): BlockNode[][] => {
		const rows: BlockNode[][] = [];
		let current: BlockNode[] = [];
		const flush = () => {
			if (current.length) rows.push(current);
			current = [];
		};
		while (idx.v < body.length) {
			const line = body[idx.v++].trim();
			if (!line) continue;
			if (line === "end") break;
			const cm = /^columns\s+(\d+)/.exec(line);
			if (cm) {
				columns = parseInt(cm[1], 10);
				continue;
			}
			const bs = /^block\s*(?::\s*([\w-]+))?(?:\s*\["([^"]*)"\])?(?::(\d+))?$/.exec(line);
			if (bs) {
				const node: BlockNode = {
					id: bs[1] ?? "",
					label: bs[2] ?? bs[1] ?? "block",
					span: bs[3] !== undefined ? parseInt(bs[3], 10) : 1,
					childRows: null,
					isSpace: false,
				};
				node.childRows = parseRows();
				current.push(node);
				continue;
			}
			const edge = parseBlockEdge(line);
			if (edge) {
				edges.push(edge);
				continue;
			}
			for (const tok of splitTokens(line)) {
				const node = parseToken(tok);
				if (node) current.push(node);
			}
			flush();
		}
		flush();
		return rows;
	};
	const rows = parseRows();
	if (rows.length === 0 && edges.length === 0) return null;
	const maxCols = Math.max(1, columns, ...rows.map((r) => r.reduce((a, n) => a + n.span, 0)));
	const colW = Math.floor((width - (maxCols - 1)) / maxCols);
	if (colW < 8) return null;
	const idOf = new Map<string, string>();
	const out: string[] = [];
	for (const row of rows) {
		const boxes: string[][] = [];
		for (const node of row) {
			const wNode = node.span * colW + (node.span - 1);
			if (node.isSpace) {
				boxes.push(Array.from({ length: 3 }, () => " ".repeat(wNode)));
				continue;
			}
			if (node.id) idOf.set(node.id, node.label);
			if (node.childRows) {
				const flat = node.childRows.flat();
				for (const c of flat) if (c.id) idOf.set(c.id, c.label);
				boxes.push(boxMulti(node.label, flat.map((c) => `• ${c.label}`), wNode));
			} else {
				boxes.push(boxOneLine(node.label, wNode));
			}
		}
		out.push(...joinBoxes(boxes, 1));
	}
	if (edges.length) {
		if (out.length) out.push("");
		for (const e of edges) {
			const from = idOf.get(e.from) ?? e.from;
			const to = idOf.get(e.to) ?? e.to;
			out.push(`${from} ${e.both ? "◀──▶" : `──${e.label ? `${e.label}──` : ""}▶`} ${to}`);
		}
	}
	return out.map((l) => l.replace(/\s+$/, ""));
}

/** swimlane-beta — lanes as boxes (side by side when wide enough) + flow list. */
export function renderSwimlane(lines: string[], width: number): string[] | null {
	const first = lines[0].trim().split(/\s+/);
	const direction = (first[1] ?? "LR").toUpperCase();
	interface Lane {
		name: string;
		nodes: { id: string; label: string }[];
	}
	const lanes: Lane[] = [];
	let cur: Lane | null = null;
	const edges: { from: string; to: string; label: string }[] = [];
	const labelOf = new Map<string, string>();
	for (const raw of lines.slice(1)) {
		const line = raw.trim();
		if (!line) continue;
		const sg = /^subgraph\s+(.*)$/.exec(line);
		if (sg) {
			cur = { name: stripQuotes(sg[1].trim()), nodes: [] };
			lanes.push(cur);
			continue;
		}
		if (line === "end") {
			cur = null;
			continue;
		}
		const node = /^([\w-]+)\s*(\[.*?\]|\(.*?\)|\{.*?\})?\s*$/.exec(line);
		if (node && cur && !/(-->|==>|-\.->|--x|--o)/.test(line)) {
			const label = node[2] ? stripQuotes(node[2].replace(/^\[|\]$/g, "")) : node[1];
			cur.nodes.push({ id: node[1], label });
			labelOf.set(node[1], label);
			continue;
		}
		const toks = line.match(/\|(?:[^|]*)\||-->|==>|[\w-]+|-\.->|--x|--o/g) ?? [];
		for (let i = 0; i < toks.length; i++) {
			if (!/^(-->|==>|-\.->|--x|--o)$/.test(toks[i])) continue;
			const prev = toks[i - 1];
			let j = i + 1;
			let label = "";
			if (toks[j]?.startsWith("|")) {
				label = toks[j].slice(1, -1);
				j++;
			}
			const to = toks[j];
			if (prev && to && /^[\w-]+$/.test(prev) && /^[\w-]+$/.test(to)) edges.push({ from: prev, to, label });
			i = j - 1;
		}
	}
	if (lanes.length === 0) return null;
	const colW = Math.floor((width - (lanes.length + 1)) / lanes.length);
	const out: string[] = [];
	if (direction === "TD" || direction === "TB" || direction === "BT" || colW < 12) {
		for (const lane of lanes) {
			out.push(...boxMulti(lane.name, lane.nodes.map((x) => `• ${x.label}`), Math.min(width - 1, 46)));
			out.push("");
		}
		if (out[out.length - 1] === "") out.pop();
	} else {
		out.push(...joinBoxes(lanes.map((l) => boxMulti(l.name, l.nodes.map((x) => `• ${x.label}`), colW)), 1));
	}
	if (edges.length) {
		out.push("Flux:");
		for (const e of edges) out.push(`  ${labelOf.get(e.from) ?? e.from} ──${e.label ? ` ${e.label} ` : ""}▶ ${labelOf.get(e.to) ?? e.to}`);
	}
	return out;
}

/** architecture-beta — groups/services tree + typed edges. */
export function renderArchitecture(lines: string[], width: number): string[] | null {
	interface Item {
		id: string;
		label: string;
		icon: string;
		kind: "group" | "service";
		parent: string | null;
	}
	const items: Item[] = [];
	const edges: { from: string; fromSide: string; to: string; toSide: string; arrow: string }[] = [];
	for (const raw of lines.slice(1)) {
		const line = raw.trim();
		if (!line) continue;
		const gm = /^(group|service)\s+([\w-]+)\s*(?:\((\w+)\))?\s*(?:\[([^\]]*)\])?\s*(?:in\s+([\w-]+))?/.exec(line);
		if (gm) {
			items.push({
				id: gm[2],
				label: gm[4] ?? gm[2],
				icon: gm[3] ?? "",
				kind: gm[1] as "group" | "service",
				parent: gm[5] ?? null,
			});
			continue;
		}
		if (/^junction\s+[\w-]+/.test(line)) continue;
		const em = /^([\w-]+)(?:\{(\w+)\})?(?::([TBLR]))?\s*(<?)(--+)(>?)\s*(?:([TBLR]):)?([\w-]+)(?:\{(\w+)\})?$/.exec(line);
		if (em) {
			const arrow = `${em[4] ? "◀" : ""}──${em[6] ? "▶" : ""}`;
			edges.push({ from: em[1], fromSide: em[3] ?? "", to: em[8], toSide: em[7] ?? "", arrow });
		}
	}
	if (items.length === 0) return null;
	const itemById = new Map(items.map((i) => [i.id, i]));
	interface Node {
		item: Item;
		kids: Node[];
	}
	const tree = (parent: string | null): Node[] =>
		items.filter((i) => (i.parent ?? null) === parent).map((item) => ({ item, kids: tree(item.id) }));
	const roots = tree(null);
	const out: string[] = [];
	const walk = (node: Node, prefix: string, isLast: boolean, isRoot: boolean) => {
		const icons = node.item.icon ? ` (${node.item.icon})` : "";
		const label = `${node.item.label}${icons}`;
		out.push(isRoot ? label : `${prefix}${isLast ? "└── " : "├── "}${label}`);
		const childPrefix = isRoot ? "" : prefix + (isLast ? "    " : "│   ");
		node.kids.forEach((c, i) => walk(c, childPrefix, i === node.kids.length - 1, false));
	};
	roots.forEach((r, i) => walk(r, "", i === roots.length - 1, true));
	for (const item of items) {
		if (item.parent && !itemById.has(item.parent)) out.push(`${item.label} (orphelin de ${item.parent})`);
	}
	if (edges.length) {
		out.push("Liens:");
		for (const e of edges) {
			const from = itemById.get(e.from)?.label ?? e.from;
			const to = itemById.get(e.to)?.label ?? e.to;
			out.push(`  ${from}${e.fromSide ? `:${e.fromSide}` : ""} ${e.arrow} ${e.toSide ? `${e.toSide}:` : ""}${to}`);
		}
	}
	return out;
}
