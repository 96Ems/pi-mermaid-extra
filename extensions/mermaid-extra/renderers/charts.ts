import { clamp, padEnd, stripQuotes, truncate } from "./util.ts";

function parseNumList(s: string): number[] {
	const m = /\[(.*)\]/.exec(s);
	if (!m) return [];
	return m[1]
		.split(",")
		.map((x) => parseFloat(x.trim()))
		.filter((x) => !isNaN(x));
}

function parseLabels(s: string): string[] {
	const m = /\[(.*)\]/.exec(s);
	if (!m) return [];
	return m[1].split(",").map((x) => stripQuotes(x.trim()));
}

/** xychart-beta — vertical bar chart with optional line overlay (first series of each). */
export function renderXyChart(lines: string[], width: number): string[] | null {
	let title = "";
	let yMin: number | null = null;
	let yMax: number | null = null;
	let xLabels: string[] = [];
	const bars: number[][] = [];
	const lineSeries: number[][] = [];
	for (const raw of lines.slice(1)) {
		const line = raw.trim();
		const t = /^title\s+(.+)$/.exec(line);
		if (t) {
			title = stripQuotes(t[1]);
			continue;
		}
		if (/^x-axis/.test(line)) {
			xLabels = parseLabels(line);
			continue;
		}
		const y = /^y-axis\s+(?:"[^"]*")?\s*([\d.-]+)?\s*-->\s*([\d.-]+)?/.exec(line);
		if (y) {
			yMin = y[1] !== undefined ? parseFloat(y[1]) : null;
			yMax = y[2] !== undefined ? parseFloat(y[2]) : null;
			continue;
		}
		if (/^bar\b/.test(line)) {
			bars.push(parseNumList(line));
			continue;
		}
		if (/^line\b/.test(line)) {
			lineSeries.push(parseNumList(line));
			continue;
		}
	}
	const bar = bars[0] ?? [];
	const ln = lineSeries[0] ?? [];
	const n = Math.max(bar.length, ln.length, xLabels.length);
	if (n === 0 || (bar.length === 0 && ln.length === 0)) return null;
	const all = [...bar, ...ln];
	const lo = yMin ?? Math.min(0, ...all);
	const hi = yMax ?? Math.max(...all, 1);
	if (hi <= lo) return null;
	const labW = Math.min(Math.max(String(hi).length, String(lo).length), 8);
	const H = 10;
	const slotW = Math.floor((width - labW - 3) / n);
	if (slotW < 2) return null;
	const fillW = slotW - 1;
	const lvl = (v: number) => clamp(Math.round(((v - lo) / (hi - lo)) * H), 0, H);
	const out: string[] = [];
	if (title) out.push(title);
	for (let r = H; r >= 1; r--) {
		let cells = "";
		for (let i = 0; i < n; i++) {
			const b = i < bar.length ? lvl(bar[i]) : 0;
			const l = i < ln.length ? lvl(ln[i]) : -1;
			let cell: string;
			if (bar.length && b >= r) cell = l === r ? "▲".repeat(fillW) : "█".repeat(fillW);
			else if (l === r) cell = padEnd("●", fillW);
			else cell = " ".repeat(fillW);
			cells += cell + (i < n - 1 ? " " : "");
		}
		const axisLab = r === H ? String(hi) : r === 1 ? String(lo) : "";
		out.push(`${padEnd(axisLab, labW)} │${cells}`);
	}
	out.push(`${" ".repeat(labW)} └${"─".repeat(n * slotW - 1)}`);
	if (xLabels.length) {
		let row = "";
		for (let i = 0; i < n; i++) row += padEnd(truncate(xLabels[i] ?? "", slotW - 1), slotW);
		out.push(`${" ".repeat(labW + 2)}${row.trimEnd()}`);
	}
	return out;
}

/** quadrantChart — points on a grid with middle axes + legend. */
export function renderQuadrant(lines: string[], width: number): string[] | null {
	let title = "";
	let xLow = "";
	let xHigh = "";
	let yLow = "";
	let yHigh = "";
	const points: { name: string; x: number; y: number }[] = [];
	for (const raw of lines.slice(1)) {
		const line = raw.trim();
		let m = /^title\s+(.+)$/.exec(line);
		if (m) {
			title = stripQuotes(m[1]);
			continue;
		}
		m = /^x-axis\s*(.*?)\s*-->\s*(.*)$/.exec(line);
		if (m) {
			xLow = stripQuotes(m[1]);
			xHigh = stripQuotes(m[2]);
			continue;
		}
		m = /^y-axis\s*(.*?)\s*-->\s*(.*)$/.exec(line);
		if (m) {
			yLow = stripQuotes(m[1]);
			yHigh = stripQuotes(m[2]);
			continue;
		}
		if (/^quadrant-\d/.test(line)) continue;
		m = /^(.+?)\s*:\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/.exec(line);
		if (m) points.push({ name: m[1].trim(), x: parseFloat(m[2]), y: parseFloat(m[3]) });
	}
	if (points.length === 0) return null;
	const labW = Math.min(Math.max(yLow.length, yHigh.length), 16);
	const W = Math.min(width - labW - 3, 50);
	const H = 12;
	if (W < 16) return null;
	const grid: string[][] = Array.from({ length: H }, () => Array(W).fill(" "));
	for (const p of points) {
		const cx = clamp(Math.round(p.x * (W - 1)), 0, W - 1);
		const cy = clamp(Math.round((1 - p.y) * (H - 1)), 0, H - 1);
		grid[cy][cx] = "●";
	}
	const midX = (W - 1) >> 1;
	const midY = (H - 1) >> 1;
	const out: string[] = [];
	if (title) out.push(title);
	for (let r = 0; r < H; r++) {
		let row = "";
		for (let c = 0; c < W; c++) {
			let ch = grid[r][c];
			if (ch === " ") ch = r === midY && c === midX ? "┼" : r === midY ? "─" : c === midX ? "│" : " ";
			row += ch;
		}
		const lab = r === 0 ? yHigh : r === H - 1 ? yLow : "";
		out.push(`${padEnd(truncate(lab, labW), labW)} │${row}│`);
	}
	out.push(`${" ".repeat(labW)} └${"─".repeat(W)}┘`);
	const gap = Math.max(1, W - xLow.length - xHigh.length);
	out.push(`${" ".repeat(labW + 2)}${truncate(xLow, W >> 1)}${" ".repeat(gap)}${truncate(xHigh, W >> 1)}`);
	for (const p of points) out.push(`● ${p.name} (${p.x}, ${p.y})`);
	return out;
}

const DAY = 86400000;

function fmtToParser(fmt: string): (s: string) => number | null {
	const tokens: string[] = [];
	const rx = fmt.replace(/YYYY|MM|DD|HH|mm/g, (t) => {
		tokens.push(t);
		return "(\\d{1,4})";
	});
	const re = new RegExp(`^\\s*${rx}\\s*$`);
	return (s) => {
		const m = re.exec(s);
		if (!m) return null;
		let y = 1970;
		let mo = 1;
		let d = 1;
		let h = 0;
		let mi = 0;
		tokens.forEach((t, i) => {
			const v = parseInt(m[i + 1], 10);
			if (t === "YYYY") y = v;
			else if (t === "MM") mo = v;
			else if (t === "DD") d = v;
			else if (t === "HH") h = v;
			else if (t === "mm") mi = v;
		});
		return Date.UTC(y, mo - 1, d, h, mi);
	};
}

function parseDuration(s: string): number | null {
	const m = /^(\d+(?:\.\d+)?)\s*(min|h|d|w|s)$/i.exec(s.trim());
	if (!m) return null;
	const v = parseFloat(m[1]);
	switch (m[2].toLowerCase()) {
		case "w":
			return v * 7 * DAY;
		case "d":
			return v * DAY;
		case "h":
			return v * 3600000;
		case "min":
			return v * 60000;
		default:
			return v * 1000;
	}
}

interface GanttTask {
	name: string;
	id: string | null;
	startRaw: string | null;
	afterIds: string[];
	endRaw: string | null;
	dur: number | null;
	milestone: boolean;
	start: number;
	end: number;
}

/** gantt — task bars on a day-scaled timeline. */
export function renderGantt(lines: string[], width: number): string[] | null {
	let title = "";
	let fmt = "YYYY-MM-DD";
	type Row = { section: string } | { task: GanttTask };
	const rows: Row[] = [];
	for (const raw of lines.slice(1)) {
		const line = raw.trim();
		if (!line) continue;
		let m = /^title\s+(.+)$/.exec(line);
		if (m) {
			title = m[1].trim();
			continue;
		}
		m = /^dateFormat\s+(.+)$/.exec(line);
		if (m) {
			fmt = m[1].trim();
			continue;
		}
		if (/^(axisFormat|todayMarker|excludes|includes|weekends|inclusiveEndDates|displayMode)\b/.test(line)) continue;
		m = /^section\s+(.+)$/.exec(line);
		if (m) {
			rows.push({ section: m[1].trim() });
			continue;
		}
		const ci = line.indexOf(":");
		if (ci < 0) continue;
		const task: GanttTask = {
			name: line.slice(0, ci).trim(),
			id: null,
			startRaw: null,
			afterIds: [],
			endRaw: null,
			dur: null,
			milestone: false,
			start: 0,
			end: 0,
		};
		for (const tok of line
			.slice(ci + 1)
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean)) {
			const low = tok.toLowerCase();
			if (["crit", "done", "active", "milestone"].includes(low)) {
				if (low === "milestone") task.milestone = true;
				continue;
			}
			const am = /^after\s+(.+)$/.exec(low);
			if (am) {
				task.afterIds.push(...am[1].split(/\s+/));
				continue;
			}
			const du = parseDuration(tok);
			if (du !== null) {
				task.dur = du;
				continue;
			}
			if (!task.startRaw) task.startRaw = tok;
			else if (!task.endRaw) task.endRaw = tok;
		}
		rows.push({ task });
	}
	const tasks = rows.filter((r): r is { task: GanttTask } => "task" in r).map((r) => r.task);
	if (tasks.length === 0) return null;
	const parseDate = fmtToParser(fmt);
	// A startRaw that isn't a date is actually the task id.
	for (const t of tasks) {
		if (t.startRaw && parseDate(t.startRaw) === null) {
			t.id = t.startRaw;
			t.startRaw = t.endRaw;
			t.endRaw = null;
		}
	}
	const byId = new Map(tasks.filter((t) => t.id).map((t) => [t.id as string, t]));
	let prevEnd: number | null = null;
	for (const t of tasks) {
		let s = t.startRaw ? parseDate(t.startRaw) : null;
		if (s === null && t.afterIds.length) {
			const ends = t.afterIds
				.map((id) => byId.get(id)?.end)
				.filter((x): x is number => typeof x === "number");
			if (ends.length) s = Math.max(...ends);
		}
		if (s === null) s = prevEnd ?? Date.now();
		t.start = s;
		let e = t.endRaw ? parseDate(t.endRaw) : null;
		if (e === null && t.dur !== null) e = s + t.dur;
		if (t.milestone) e = e === null || e < s ? s : e;
		else if (e === null || e <= s) e = s + DAY;
		t.end = e;
		prevEnd = e;
	}
	const minT = Math.min(...tasks.map((t) => t.start));
	const maxT = Math.max(...tasks.map((t) => t.end));
	const span = Math.max(maxT - minT, DAY);
	const labelW = Math.min(
		Math.max(...rows.map((r) => ("task" in r ? r.task.name.length + 2 : r.section.length))),
		24,
	);
	const chartW = width - labelW - 2;
	if (chartW < 10) return null;
	const col = (t: number) => clamp(Math.floor(((t - minT) / span) * chartW), 0, chartW - 1);
	const fmtDate = (t: number) => new Date(t).toISOString().slice(0, 10);
	const out: string[] = [];
	if (title) out.push(title);
	out.push(
		`${" ".repeat(labelW)}  ${fmtDate(minT)}${" ".repeat(Math.max(1, chartW - 20))}${fmtDate(maxT)}`,
	);
	for (const r of rows) {
		if ("section" in r) {
			out.push(truncate(r.section, labelW + chartW));
			continue;
		}
		const t = r.task;
		const bar = new Array(chartW).fill(" ");
		if (t.milestone) {
			bar[col(t.start)] = "◆";
		} else {
			const a = col(t.start);
			const b = clamp(col(t.end), a + 1, chartW);
			for (let i = a; i < b; i++) bar[i] = "█";
		}
		out.push(`${padEnd("  " + truncate(t.name, labelW - 2), labelW)} │${bar.join("").replace(/\s+$/, "")}`);
	}
	return out;
}
