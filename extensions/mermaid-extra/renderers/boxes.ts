import { padEnd, truncate } from "./util.ts";

/** kanban — columns side by side (stacked list fallback when too narrow). */
export function renderKanban(lines: string[], width: number): string[] | null {
	interface Col {
		name: string;
		cards: string[];
	}
	const cols: Col[] = [];
	let cur: Col | null = null;
	let curIndent = -1;
	for (const raw of lines.slice(1)) {
		if (!raw.trim()) continue;
		const indent = raw.search(/\S/);
		const text = raw.trim().replace(/@\{.*$/, "").trim();
		if (!text) continue;
		if (cur === null || indent <= curIndent) {
			cur = { name: text, cards: [] };
			cols.push(cur);
			curIndent = indent;
		} else {
			cur.cards.push(text);
		}
	}
	if (cols.length === 0) return null;
	const n = cols.length;
	const colW = Math.floor((width - (n + 1)) / n);
	if (colW < 8) {
		const out: string[] = [];
		for (const c of cols) {
			out.push(`▌ ${c.name}`);
			for (const card of c.cards) out.push(`  • ${card}`);
		}
		return out;
	}
	const top = `┌${cols.map(() => "─".repeat(colW)).join("┬")}┐`;
	const sep = `├${cols.map(() => "─".repeat(colW)).join("┼")}┤`;
	const bot = `└${cols.map(() => "─".repeat(colW)).join("┴")}┘`;
	const row = (cells: string[]) =>
		`│${cells.map((c) => ` ${padEnd(truncate(c, colW - 2), colW - 2)} `).join("│")}│`;
	const out = [top, row(cols.map((c) => c.name)), sep];
	const maxCards = Math.max(...cols.map((c) => c.cards.length), 0);
	for (let i = 0; i < maxCards; i++) out.push(row(cols.map((c) => c.cards[i] ?? "")));
	out.push(bot);
	return out;
}

/** packet-beta — 32-bit rows with merged field segments, like mermaid's packet diagram. */
export function renderPacket(lines: string[], width: number): string[] | null {
	interface Field {
		start: number;
		end: number;
		label: string;
	}
	const fields: Field[] = [];
	for (const raw of lines.slice(1)) {
		const m = /^(\d+)\s*(?:-\s*(\d+))?\s*:\s*"?([^"]*)"?\s*$/.exec(raw.trim());
		if (m)
			fields.push({
				start: parseInt(m[1], 10),
				end: m[2] !== undefined ? parseInt(m[2], 10) : parseInt(m[1], 10),
				label: m[3].trim(),
			});
	}
	if (fields.length === 0) return null;
	fields.sort((a, b) => a.start - b.start);
	const maxBit = Math.max(...fields.map((f) => f.end));
	const rowCount = Math.floor(maxBit / 32) + 1;
	const cpb = width >= 72 ? 2 : 1; // chars per bit
	const rowW = 32 * cpb;
	if (rowW + 2 > width) return null;
	interface Seg {
		c0: number;
		c1: number;
		label: string;
	}
	const rowSegs: Seg[][] = [];
	for (let r = 0; r < rowCount; r++) {
		const lo = r * 32;
		const hi = lo + 31;
		const segs: Seg[] = [];
		for (const f of fields) {
			if (f.end < lo || f.start > hi) continue;
			const c0 = Math.max(f.start, lo) - lo;
			const c1 = Math.min(f.end, hi) - lo;
			segs.push({ c0: c0 * cpb, c1: (c1 + 1) * cpb - 1, label: f.label });
		}
		rowSegs.push(segs);
	}
	const boundsOf = (segs: Seg[] | null) => new Set<number>((segs ?? []).flatMap((s) => [s.c0, s.c1 + 1]));
	const border = (upper: Seg[] | null, lower: Seg[] | null, kind: "top" | "mid" | "bot") => {
		const A = boundsOf(upper);
		const B = boundsOf(lower);
		let s = "";
		for (let i = 0; i <= rowW; i++) {
			const a = A.has(i);
			const b = B.has(i);
			if (kind === "top") s += i === 0 ? "┌" : i === rowW ? "┐" : b ? "┬" : "─";
			else if (kind === "bot") s += i === 0 ? "└" : i === rowW ? "┘" : a ? "┴" : "─";
			else if (i === 0) s += "├";
			else if (i === rowW) s += "┤";
			else s += a && b ? "┼" : a ? "┴" : b ? "┬" : "─";
		}
		return s;
	};
	const out: string[] = [];
	for (let r = 0; r < rowCount; r++) {
		out.push(border(r > 0 ? rowSegs[r - 1] : null, rowSegs[r], r === 0 ? "top" : "mid"));
		const line = new Array<string>(rowW + 1).fill(" ");
		for (const s of rowSegs[r]) line[s.c0] = "│";
		line[rowW] = "│";
		for (const s of rowSegs[r]) {
			const inner = s.c1 - s.c0; // usable chars after the left border
			const text = truncate(s.label, Math.max(0, inner - 1));
			const startAt = s.c0 + 1 + Math.max(0, Math.floor((inner - 1 - text.length) / 2));
			for (let i = 0; i < text.length && startAt + i <= s.c1; i++) line[startAt + i] = text[i];
		}
		out.push(line.join(""));
	}
	out.push(border(rowSegs[rowCount - 1], null, "bot"));
	return out;
}
