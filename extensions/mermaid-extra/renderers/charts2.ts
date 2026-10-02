import { clamp, padEnd, stripQuotes, truncate } from "./util.ts";

/** Split on a separator at the top level, respecting quotes, brackets and braces. */
export function splitTop(s: string, sep: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let quote = "";
	let cur = "";
	for (const ch of s) {
		if (quote) {
			cur += ch;
			if (ch === quote) quote = "";
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			cur += ch;
			continue;
		}
		if (ch === "(" || ch === "[" || ch === "{") depth++;
		if (ch === ")" || ch === "]" || ch === "}") depth--;
		if (ch === sep && depth === 0) {
			parts.push(cur);
			cur = "";
			continue;
		}
		cur += ch;
	}
	parts.push(cur);
	return parts.map((p) => p.trim()).filter(Boolean);
}

/** radar-beta — one row per axis and curve, bar proportional to the value. */
export function renderRadar(lines: string[], width: number): string[] | null {
	let title = "";
	let min: number | null = null;
	let max: number | null = null;
	const axes: { id: string; label: string }[] = [];
	interface RawCurve {
		id: string;
		label: string;
		raw: string;
	}
	const rawCurves: RawCurve[] = [];
	for (const raw of lines.slice(1)) {
		const line = raw.trim();
		if (!line) continue;
		const t = /^title\s+(.+)$/.exec(line);
		if (t) {
			title = stripQuotes(t[1]);
			continue;
		}
		const mn = /^min\s+([\d.-]+)/.exec(line);
		if (mn) {
			min = parseFloat(mn[1]);
			continue;
		}
		const mx = /^max\s+([\d.-]+)/.exec(line);
		if (mx) {
			max = parseFloat(mx[1]);
			continue;
		}
		if (/^axis\b/.test(line)) {
			for (const entry of splitTop(line.replace(/^axis\b/, ""), ",")) {
				const m = /^([\w-]+)\s*(?:\["([^"]*)"\])?$/.exec(entry);
				if (m) axes.push({ id: m[1], label: m[2] ?? m[1] });
			}
			continue;
		}
		if (/^curve\b/.test(line)) {
			for (const entry of splitTop(line.replace(/^curve\b/, ""), ",")) {
				const m = /^([\w-]+)\s*(?:\["([^"]*)"\])?\s*\{(.*)\}$/.exec(entry);
				if (m) rawCurves.push({ id: m[1], label: m[2] ?? m[1], raw: m[3] });
			}
			continue;
		}
	}
	if (axes.length === 0 || rawCurves.length === 0) return null;
	const curves = rawCurves.map((c) => {
		const values: number[] = [];
		const items = splitTop(c.raw, ",");
		for (const item of items) {
			const kv = /^([\w-]+)\s*:\s*([\d.-]+)$/.exec(item);
			if (kv) {
				const idx = axes.findIndex((a) => a.id === kv[1]);
				if (idx >= 0) values[idx] = parseFloat(kv[2]);
			} else if (/^[\d.-]+$/.test(item)) {
				values.push(parseFloat(item));
			}
		}
		return { label: c.label, values };
	});
	const flat = curves.flatMap((c) => c.values).filter((v) => !isNaN(v));
	if (flat.length === 0) return null;
	const lo = min ?? Math.min(...flat);
	let hi = max ?? Math.max(...flat);
	if (hi < lo) return null;
	if (hi === lo) hi = lo + 1;
	const axisW = Math.min(Math.max(...axes.map((a) => a.label.length)), 20);
	const curveW = Math.min(Math.max(...curves.map((c) => c.label.length)), 16);
	const barW = width - axisW - curveW - 10;
	if (barW < 4) return null;
	const out: string[] = [];
	if (title) out.push(title);
	for (let i = 0; i < axes.length; i++) {
		const values = curves.map((c) => (i < c.values.length ? c.values[i] : null));
		if (values.every((v) => v === null || isNaN(v))) continue;
		out.push(axes[i].label);
		curves.forEach((c, ci) => {
			const v = values[ci];
			if (v === null || isNaN(v)) return;
			const n = Math.max(1, Math.round(((v - lo) / (hi - lo)) * barW));
			out.push(`  ${padEnd(truncate(c.label, curveW), curveW)} ${"█".repeat(n)} ${v}`);
		});
	}
	return out.length > (title ? 1 : 0) ? out : null;
}

/** venn-beta — sets and unions listed as set notation. */
export function renderVenn(lines: string[], width: number): string[] | null {
	let title = "";
	const sets: { id: string; label: string; size: number | null }[] = [];
	const unions: { members: string[]; label: string; size: number | null }[] = [];
	const parseEntry = (entry: string): { id: string; label: string; size: number | null } | null => {
		const m = /^"?([^"]+?)"?\s*(?:\["([^"]*)"\])?\s*(?::\s*(\d+))?$/.exec(entry.trim());
		if (!m || !m[1].trim()) return null;
		return { id: stripQuotes(m[1].trim()), label: m[2] ?? stripQuotes(m[1].trim()), size: m[3] !== undefined ? parseInt(m[3], 10) : null };
	};
	for (const raw of lines.slice(1)) {
		const line = raw.trim();
		if (!line) continue;
		const t = /^title\s+(.+)$/.exec(line);
		if (t) {
			title = stripQuotes(t[1]);
			continue;
		}
		if (/^set\b/.test(line)) {
			const e = parseEntry(line.replace(/^set\b/, ""));
			if (e) sets.push(e);
			continue;
		}
		if (/^union\b/.test(line)) {
			const u = /^union\s+([^{]*?)(?:\["([^"]*)"\])?\s*(?::\s*(\d+))?\s*$/.exec(line);
			if (!u) continue;
			const members = splitTop(u[1], ",").map((x) => stripQuotes(x.replace(/\[.*$/, "").trim()));
			if (members.length) unions.push({ members, label: u[2] ?? "", size: u[3] !== undefined ? parseInt(u[3], 10) : null });
			continue;
		}
	}
	if (sets.length === 0 && unions.length === 0) return null;
	const labelOf = (id: string) => sets.find((s) => s.id === id)?.label ?? id;
	const out: string[] = [];
	if (title) out.push(title);
	if (sets.length) {
		out.push("Sets:");
		for (const s of sets) out.push(`  ${s.label}${s.size !== null ? ` (${s.size})` : ""}`);
	}
	if (unions.length) {
		out.push("Unions:");
		for (const u of unions) {
			const names = u.members.map(labelOf).join(" ∩ ");
			out.push(`  ${names}${u.label ? ` = ${u.label}` : ""}${u.size !== null ? ` (${u.size})` : ""}`);
		}
	}
	return out;
}

/** cynefin-beta — 2x2 domains with items + transitions. */
export function renderCynefin(lines: string[], width: number): string[] | null {
	let title = "";
	const domains: Record<string, string[]> = { complex: [], complicated: [], chaotic: [], clear: [], confusion: [] };
	const transitions: { from: string; to: string; label: string }[] = [];
	let current: string | null = null;
	for (const raw of lines.slice(1)) {
		const line = raw.trim();
		if (!line) continue;
		const t = /^title\s+(.+)$/.exec(line);
		if (t) {
			title = stripQuotes(t[1]);
			continue;
		}
		const tr = /^(\w+)\s*-->\s*(\w+)(?:\s*:\s*"([^"]*)")?$/.exec(line);
		if (tr) {
			transitions.push({ from: tr[1], to: tr[2], label: tr[3] ?? "" });
			continue;
		}
		if (line in domains) {
			current = line;
			continue;
		}
		if (current && /^"/.test(line)) {
			domains[current].push(stripQuotes(line));
			continue;
		}
	}
	const anyItems = Object.values(domains).some((d) => d.length > 0);
	if (!anyItems && transitions.length === 0) return null;
	const cellW = Math.max(10, Math.floor((width - 3) / 2));
	const cell = (name: string): string[] => {
		const linesOut = [`▌ ${name.toUpperCase()}`];
		for (const item of domains[name]) linesOut.push(`  • ${truncate(item, cellW - 4)}`);
		return linesOut;
	};
	const topLeft = cell("complex");
	const topRight = cell("complicated");
	const botLeft = cell("chaotic");
	const botRight = cell("clear");
	const boxRow = (a: string[], b: string[]) => {
		const h = Math.max(a.length, b.length);
		const cells: string[] = [];
		for (let i = 0; i < h; i++) cells.push(` ${padEnd(truncate(a[i] ?? "", cellW - 3), cellW - 3)} │ ${padEnd(truncate(b[i] ?? "", cellW - 3), cellW - 3)} `);
		return cells;
	};
	const top = boxRow(topLeft, topRight);
	const bot = boxRow(botLeft, botRight);
	const out: string[] = [];
	if (title) out.push(title);
	out.push(`┌${"─".repeat(cellW - 1)}┬${"─".repeat(cellW - 1)}┐`);
	for (const l of top) out.push(`│${l}│`);
	out.push(`├${"─".repeat(cellW - 1)}┼${"─".repeat(cellW - 1)}┤`);
	for (const l of bot) out.push(`│${l}│`);
	out.push(`└${"─".repeat(cellW - 1)}┴${"─".repeat(cellW - 1)}┘`);
	if (domains.confusion.length) out.push(`◆ confusion : ${domains.confusion.join(" · ")}`);
	if (transitions.length) {
		out.push("Transitions:");
		for (const tr of transitions) out.push(`  ${tr.from} ──▶ ${tr.to}${tr.label ? `  (${tr.label})` : ""}`);
	}
	return out;
}

/** wardley-beta — map on visibility (y) / evolution (x) axes + links, evolve, notes. */
export function renderWardley(lines: string[], width: number): string[] | null {
	let title = "";
	const items: { name: string; kind: "anchor" | "component"; vis: number; evo: number }[] = [];
	const links: { from: string; to: string }[] = [];
	const evolves: { name: string; target: number }[] = [];
	const notes: { text: string; vis: number; evo: number }[] = [];
	for (const raw of lines.slice(1)) {
		const line = raw.trim();
		if (!line) continue;
		const t = /^title\s+(.+)$/.exec(line);
		if (t) {
			title = stripQuotes(t[1]);
			continue;
		}
		const nm = /^(anchor|component)\s+"?([^"[\]]+?)"?\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/.exec(line);
		if (nm) {
			items.push({ kind: nm[1] as "anchor" | "component", name: nm[2].trim(), vis: parseFloat(nm[3]), evo: parseFloat(nm[4]) });
			continue;
		}
		const lk = /^"?([^"->]+?)"?\s*->\s*"?([^"[\]()]+?)"?\s*(?:\[.*\])?$/.exec(line);
		if (lk) {
			links.push({ from: lk[1].trim(), to: lk[2].trim() });
			continue;
		}
		const ev = /^evolve\s+"?([^"[\]]+?)"?\s+([\d.]+)/.exec(line);
		if (ev) {
			evolves.push({ name: ev[1].trim(), target: parseFloat(ev[2]) });
			continue;
		}
		const nt = /^note\s+"([^"]*)"\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/.exec(line);
		if (nt) {
			notes.push({ text: nt[1], vis: parseFloat(nt[2]), evo: parseFloat(nt[3]) });
			continue;
		}
	}
	if (items.length === 0) return null;
	const labW = 4;
	const W = Math.min(width - labW - 4, 46);
	const H = 12;
	if (W < 16) return null;
	const grid: string[][] = Array.from({ length: H }, () => Array(W).fill(" "));
	items.forEach((it, i) => {
		const cx = clamp(Math.round(it.evo * (W - 1)), 0, W - 5);
		const cy = clamp(Math.round((1 - it.vis) * (H - 1)), 0, H - 1);
		const tag = `${i + 1}`;
		for (let k = 0; k < tag.length; k++) grid[cy][cx + k] = tag[k];
	});
	const midX = (W - 1) >> 1;
	const out: string[] = [];
	if (title) out.push(title);
	for (let r = 0; r < H; r++) {
		let row = "";
		for (let c = 0; c < W; c++) {
			const ch = grid[r][c];
			row += ch !== " " ? ch : c === midX ? "│" : " ";
		}
		const lab = r === 0 ? "1.0" : r === H - 1 ? "0.0" : "";
		out.push(`${padEnd(lab, labW)} │${row}`);
	}
	out.push(`${" ".repeat(labW)} └${"─".repeat(W)}`);
	out.push(`${" ".repeat(labW + 1)}0.0${" ".repeat(Math.max(1, W - 8))}1.0  (évolution →)`);
	for (let i = 0; i < items.length; i++) {
		const it = items[i];
		out.push(`${i + 1}. ${it.name}${it.kind === "anchor" ? " (anchor)" : ""} [${it.vis}, ${it.evo}]`);
	}
	if (links.length) {
		const idx = (name: string) => {
			const i = items.findIndex((x) => x.name === name);
			return i >= 0 ? `${i + 1}` : name;
		};
		out.push(`Liens: ${links.map((l) => `${idx(l.from)} ──▶ ${idx(l.to)}`).join(" · ")}`);
	}
	if (evolves.length) out.push(`Évolution: ${evolves.map((e) => `${e.name} ⟶ ${e.target}`).join(" · ")}`);
	for (const n of notes) out.push(`✎ ${n.text} [${n.vis}, ${n.evo}]`);
	return out;
}
