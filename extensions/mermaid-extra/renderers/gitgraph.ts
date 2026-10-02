import { truncate } from "./util.ts";

/** gitGraph — lanes with commits (●), branch forks (├─╮) and merges (─╯/╰). */
export function renderGitGraph(lines: string[], width: number): string[] | null {
	interface Ev {
		type: "commit" | "branch" | "merge";
		lane: number;
		from?: number;
		label: string;
	}
	const lanes: string[] = ["main"];
	let cur = 0;
	const evs: Ev[] = [];
	let auto = 0;
	for (const raw of lines.slice(1)) {
		const line = raw.trim();
		let m = /^commit\b/.exec(line);
		if (m) {
			const id = /id:\s*"([^"]*)"/.exec(line)?.[1] ?? `c${++auto}`;
			evs.push({ type: "commit", lane: cur, label: id });
			continue;
		}
		m = /^branch\s+([\w/-]+)/.exec(line);
		if (m) {
			const name = m[1];
			let idx = lanes.indexOf(name);
			if (idx < 0) {
				lanes.push(name);
				idx = lanes.length - 1;
			}
			evs.push({ type: "branch", lane: idx, from: cur, label: `⑂ ${name}` });
			continue;
		}
		m = /^(?:checkout|switch)\s+([\w/-]+)/.exec(line);
		if (m) {
			const idx = lanes.indexOf(m[1]);
			if (idx >= 0) cur = idx;
			continue;
		}
		m = /^merge\s+([\w/-]+)/.exec(line);
		if (m) {
			const idx = lanes.indexOf(m[1]);
			if (idx >= 0 && idx !== cur) evs.push({ type: "merge", lane: cur, from: idx, label: `merge ${m[1]}` });
			continue;
		}
	}
	if (evs.length === 0) return null;
	const laneW = 2 * lanes.length - 1;
	const annW = width - laneW - 2;
	if (annW < 8) return null;
	const active = new Array<boolean>(lanes.length).fill(false);
	active[0] = true;
	const out: string[] = [];
	for (const e of evs) {
		const cells = new Array<string>(laneW).fill(" ");
		for (let i = 0; i < lanes.length; i++) if (active[i]) cells[2 * i] = "│";
		if (e.type === "commit") {
			cells[2 * e.lane] = "●";
		} else if (e.type === "branch") {
			const a = Math.min(e.from ?? 0, e.lane);
			const b = Math.max(e.from ?? 0, e.lane);
			cells[2 * (e.from ?? 0)] = "├";
			for (let i = 2 * a + 1; i < 2 * b; i++) cells[i] = "─";
			cells[2 * b] = "╮";
			active[e.lane] = true;
		} else {
			const a = Math.min(e.from ?? 0, e.lane);
			const b = Math.max(e.from ?? 0, e.lane);
			cells[2 * e.lane] = "●";
			for (let i = 2 * a + 1; i < 2 * b; i++) if (cells[i] === " " || cells[i] === "│") cells[i] = "─";
			cells[2 * (e.from ?? 0)] = (e.from ?? 0) > e.lane ? "╯" : "╰";
		}
		out.push(`${cells.join("").padEnd(laneW)} ${truncate(e.label, annW)}`.replace(/\s+$/, ""));
	}
	return out;
}
