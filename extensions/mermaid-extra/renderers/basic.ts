import { clamp, padEnd, stripQuotes, truncate } from "./util.ts";

/** pie [showData] — horizontal bars proportional to each value. */
export function renderPie(lines: string[], width: number): string[] | null {
	let title = "";
	const entries: { label: string; value: number }[] = [];
	for (const raw of lines.slice(1)) {
		const line = raw.trim();
		if (!line) continue;
		const t = /^title\s+(.+)$/.exec(line);
		if (t) {
			title = stripQuotes(t[1]);
			continue;
		}
		const e = /^["']?([^"':]+?)["']?\s*:\s*(-?[\d.]+)\s*$/.exec(line);
		if (e) entries.push({ label: e[1].trim(), value: parseFloat(e[2]) });
	}
	if (entries.length === 0) return null;
	const total = entries.reduce((a, e) => a + Math.max(0, e.value), 0) || 1;
	const labelW = Math.min(Math.max(...entries.map((e) => e.label.length)), 24);
	const valStrs = entries.map((e) => `${e.value} (${((Math.max(0, e.value) / total) * 100).toFixed(1)}%)`);
	const valW = Math.max(...valStrs.map((s) => s.length));
	const barW = width - labelW - valW - 3;
	if (barW < 6) return null;
	const maxV = Math.max(...entries.map((e) => e.value), 1);
	const out: string[] = [];
	if (title) out.push(title);
	entries.forEach((e, i) => {
		const n = e.value <= 0 ? 0 : Math.max(1, Math.round((e.value / maxV) * barW));
		out.push(`${padEnd(truncate(e.label, labelW), labelW)} ${"█".repeat(n)} ${valStrs[i]}`);
	});
	return out;
}

/** sankey-beta — one row per flow, bar width proportional to value. */
export function renderSankey(lines: string[], width: number): string[] | null {
	const flows: { s: string; t: string; v: number }[] = [];
	for (const raw of lines.slice(1)) {
		const m = /^([^,]+),([^,]+),([\d.]+)/.exec(raw.trim());
		if (m) flows.push({ s: m[1].trim(), t: m[2].trim(), v: parseFloat(m[3]) });
	}
	if (flows.length === 0) return null;
	const w1 = Math.min(Math.max(...flows.map((f) => f.s.length)), 16);
	const w2 = Math.min(Math.max(...flows.map((f) => f.t.length)), 16);
	const valW = Math.max(...flows.map((f) => String(f.v).length));
	const barW = width - w1 - w2 - valW - 8;
	if (barW < 4) return null;
	const maxV = Math.max(...flows.map((f) => f.v), 1);
	return flows.map(
		(f) =>
			`${padEnd(truncate(f.s, w1), w1)} ─▶ ${padEnd(truncate(f.t, w2), w2)} ${"█".repeat(Math.max(1, Math.round((f.v / maxV) * barW)))} ${f.v}`,
	);
}

/** timeline — periods with their events as a vertical list. */
export function renderTimeline(lines: string[], width: number): string[] | null {
	let title = "";
	const entries: { period: string; events: string[] }[] = [];
	for (const raw of lines.slice(1)) {
		const line = raw.trim();
		if (!line) continue;
		const t = /^title\s+(.+)$/.exec(line);
		if (t) {
			title = stripQuotes(t[1]);
			continue;
		}
		const parts = line
			.split(/\s*:\s*/)
			.map((s) => s.trim())
			.filter(Boolean);
		if (parts.length) entries.push({ period: parts[0], events: parts.slice(1) });
	}
	if (entries.length === 0) return null;
	const out: string[] = [];
	if (title) out.push(title);
	for (const e of entries) {
		out.push(`● ${e.period}`);
		e.events.forEach((ev, i) => out.push(`  ${i === e.events.length - 1 ? "└─" : "├─"} ${ev}`));
	}
	return out;
}

/** journey — sections, tasks with star ratings and actors. */
export function renderJourney(lines: string[], width: number): string[] | null {
	let title = "";
	interface Task {
		name: string;
		score: number | null;
		actors: string;
	}
	const sections: { name: string; tasks: Task[] }[] = [];
	let cur: { name: string; tasks: Task[] } | null = null;
	for (const raw of lines.slice(1)) {
		const line = raw.trim();
		if (!line) continue;
		let m = /^title\s+(.+)$/.exec(line);
		if (m) {
			title = stripQuotes(m[1]);
			continue;
		}
		m = /^section\s+(.+)$/.exec(line);
		if (m) {
			cur = { name: m[1].trim(), tasks: [] };
			sections.push(cur);
			continue;
		}
		const parts = line.split(":").map((s) => s.trim());
		if (!parts[0]) continue;
		let score: number | null = null;
		let actors = "";
		if (parts.length >= 2 && /^-?[\d.]+$/.test(parts[1])) {
			score = parseFloat(parts[1]);
			actors = parts.slice(2).join(", ");
		} else {
			actors = parts.slice(1).join(", ");
		}
		if (!cur) {
			cur = { name: "", tasks: [] };
			sections.push(cur);
		}
		cur.tasks.push({ name: parts[0], score, actors });
	}
	if (!sections.some((s) => s.tasks.length)) return null;
	const nameW = Math.min(
		Math.max(...sections.flatMap((s) => s.tasks.map((t) => t.name.length))),
		20,
	);
	const out: string[] = [];
	if (title) out.push(title);
	for (const s of sections) {
		if (s.name) out.push(`▌ ${s.name}`);
		for (const t of s.tasks) {
			const stars =
				t.score === null
					? ""
					: " " + "★".repeat(clamp(Math.round(t.score), 0, 5)) + "☆".repeat(clamp(5 - Math.round(t.score), 0, 5));
			out.push(`  ${padEnd(truncate(t.name, nameW), nameW)}${stars}${t.actors ? `  ${t.actors}` : ""}`);
		}
	}
	return out;
}

/** mindmap — indentation tree rendered with box-drawing branches. */
function mindmapNodeText(raw: string): string {
	let s = raw
		.trim()
		.replace(/^root\s*/i, "")
		.replace(/::icon\([^)]*\)/g, "")
		.trim();
	s = s.replace(/^[\w-]+(?=[([{)])/, ""); // optional node id before a shape opener
	s = s.replace(/^[([{)\]]+/, "").replace(/[)\]}]+$/, "");
	return stripQuotes(s).trim();
}

export function renderMindmap(lines: string[], width: number): string[] | null {
	interface Node {
		text: string;
		children: Node[];
	}
	const roots: Node[] = [];
	const stack: { indent: number; node: Node }[] = [];
	for (const raw of lines.slice(1)) {
		if (!raw.trim()) continue;
		const indent = raw.search(/\S/);
		const text = mindmapNodeText(raw);
		if (!text) continue;
		const node: Node = { text, children: [] };
		while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
		if (stack.length) stack[stack.length - 1].node.children.push(node);
		else roots.push(node);
		stack.push({ indent, node });
	}
	if (roots.length === 0) return null;
	const out: string[] = [];
	const walk = (node: Node, prefix: string, isLast: boolean, isRoot: boolean) => {
		out.push(isRoot ? node.text : `${prefix}${isLast ? "└── " : "├── "}${node.text}`);
		const childPrefix = isRoot ? "" : prefix + (isLast ? "    " : "│   ");
		node.children.forEach((c, i) => walk(c, childPrefix, i === node.children.length - 1, false));
	};
	roots.forEach((r, i) => walk(r, "", i === roots.length - 1, true));
	return out;
}
