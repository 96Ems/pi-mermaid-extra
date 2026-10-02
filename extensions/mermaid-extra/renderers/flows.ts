import { padEnd, stripQuotes, truncate } from "./util.ts";

interface FlowEdge {
	from: string;
	to: string;
	op: "seq" | "ref" | "fail";
	label: string;
}

const AGENT_EDGE_RE = /(-\.-|--x|--\s*"[^"]*"\s*-->|--\s+[^>]*?\s*-->|-->)|([\w-]+)/g;

function parseAgentEdges(line: string, edges: FlowEdge[]) {
	const toks = line.match(AGENT_EDGE_RE) ?? [];
	for (let i = 0; i < toks.length; i++) {
		const t = toks[i];
		if (!/^(-\.-|--x|-->|--\s)/.test(t)) continue;
		const label = /"([^"]*)"/.exec(t)?.[1] ?? (/^--\s+(.+?)\s*-->$/.exec(t)?.[1]?.trim() ?? "");
		const op: FlowEdge["op"] = t.includes("-.-") ? "ref" : t.includes("--x") ? "fail" : "seq";
		const prev = toks[i - 1];
		const next = toks[i + 1];
		if (prev && next && !/^(-\.-|--x|-->|--\s)/.test(prev) && !/^(-\.-|--x|-->|--\s)/.test(next)) {
			edges.push({ from: prev, to: next, op, label });
		}
	}
}

/** agentflow-beta — flows with their nodes + typed edges. */
export function renderAgentflow(lines: string[], width: number): string[] | null {
	interface Flow {
		label: string;
		depth: number;
		nodes: string[];
	}
	const flows: Flow[] = [];
	const stack: Flow[] = [];
	const nodes = new Map<string, { label: string; shape: string }>();
	const edges: FlowEdge[] = [];
	let title = "";
	for (const raw of lines.slice(1)) {
		const line = raw.trim();
		if (!line) continue;
		const t = /^title\s+(.+)$/.exec(line);
		if (t) {
			title = stripQuotes(t[1]);
			continue;
		}
		const fl = /^flow\s*([\w-]*)\s*(?:\["([^"]*)"\])?\s*$/.exec(line);
		if (fl) {
			const flow: Flow = { label: fl[2] ?? fl[1] ?? "flow", depth: stack.length, nodes: [] };
			flows.push(flow);
			stack.push(flow);
			continue;
		}
		if (line === "end") {
			stack.pop();
			continue;
		}
		const nd = /^([\w-]+)\s*(?:\["([^"]*)"\])?\s*(?:@\{([^}]*)\})?\s*$/.exec(line);
		if (nd && !/^(-\.-|--x|-->|--\s)/.test(line) && !line.includes("-->")) {
			const shapeM = /shape:\s*([\w-]+)/.exec(nd[3] ?? "");
			const info = { label: nd[2] ?? nd[1], shape: shapeM?.[1] ?? "" };
			nodes.set(nd[1], info);
			if (stack.length) stack[stack.length - 1].nodes.push(nd[1]);
			continue;
		}
		parseAgentEdges(line, edges);
	}
	if (flows.length === 0 && nodes.size === 0) return null;
	const labelOf = (id: string) => nodes.get(id)?.label ?? id;
	const out: string[] = [];
	if (title) out.push(title);
	for (const flow of flows) {
		out.push(`${"  ".repeat(flow.depth)}▌ ${flow.label}`);
		for (const id of flow.nodes) {
			const n = nodes.get(id);
			out.push(`${"  ".repeat(flow.depth + 1)}• ${n?.label ?? id}${n?.shape ? ` (${n.shape})` : ""}`);
		}
	}
	if (out.length === 0) {
		for (const [id, n] of nodes) out.push(`• ${n.label}${n.shape ? ` (${n.shape})` : ""}${n.label !== id ? ` [${id}]` : ""}`);
	}
	if (edges.length) {
		out.push("Edges:");
		for (const e of edges) {
			const arrow = e.op === "seq" ? `──${e.label ? ` ${e.label} ` : ""}▶` : e.op === "ref" ? "⇢" : `✗${e.label ? ` ${e.label}` : ""}`;
			out.push(`  ${labelOf(e.from)} ${arrow} ${labelOf(e.to)}`);
		}
	}
	return out;
}

/** eventmodeling — timeline of time frames + links + data blocks. */
export function renderEventmodeling(lines: string[], width: number): string[] | null {
	interface Frame {
		num: string;
		kind: string;
		name: string;
		inline: string;
		ref: string;
		reset: boolean;
	}
	const KIND: Record<string, string> = {
		ui: "ui",
		cmd: "cmd",
		command: "cmd",
		evt: "evt",
		event: "evt",
		view: "view",
		pcr: "processor",
		processor: "processor",
		automation: "automation",
	};
	const frames: Frame[] = [];
	const links: string[] = [];
	const dataBlocks = new Map<string, string[]>();
	const body = lines.slice(1).filter((l) => l.trim() !== "");
	for (let i = 0; i < body.length; i++) {
		const line = body[i].trim();
		const dm = /^data\s+([\w.]+)\s*\{/.exec(line);
		if (dm) {
			const fields: string[] = [];
			while (++i < body.length && body[i].trim() !== "}") {
				const f = body[i].trim().replace(/,$/, "");
				if (f) fields.push(f);
			}
			dataBlocks.set(dm[1], fields);
			continue;
		}
		if (/->>/.test(line)) {
			links.push(line);
			continue;
		}
		const tm = /^(tf|timeframe|rf|resetframe)\s+(\d+)\s+(\S+)\s+(\S+)(.*)$/.exec(line);
		if (tm) {
			const kindRaw = tm[3];
			let rest = tm[5].trim();
			let inline = "";
			let ref = "";
			const im = /\{([^}]*)\}/.exec(rest);
			if (im) {
				inline = im[1].trim();
				rest = rest.replace(im[0], "").trim();
			}
			const rm = /\[\[([\w.]+)\]\]/.exec(rest);
			if (rm) {
				ref = rm[1];
				rest = rest.replace(rm[0], "").trim();
			}
			frames.push({
				num: tm[2],
				kind: KIND[kindRaw] ?? kindRaw,
				name: tm[4],
				inline,
				ref,
				reset: tm[1] === "rf" || tm[1] === "resetframe",
			});
			continue;
		}
	}
	if (frames.length === 0) return null;
	const kindW = Math.max(...frames.map((f) => f.kind.length));
	const numW = Math.max(...frames.map((f) => f.num.length));
	const out: string[] = [];
	for (const f of frames) {
		const data = f.inline ? ` { ${f.inline} }` : f.ref ? ` [[${f.ref}]]` : "";
		out.push(`${f.reset ? "⟲ " : "  "}${padEnd(f.num, numW)} ${padEnd(f.kind, kindW)} ${f.name}${data}`);
	}
	if (links.length) out.push(`Liens: ${links.join(" · ")}`);
	if (dataBlocks.size) {
		out.push("Data:");
		for (const [name, fields] of dataBlocks) out.push(`  ${name} { ${fields.join(" · ")} }`);
	}
	return out;
}

const ZEN_BLOCK_KEYWORDS = /^(if|else|else if|par|loop|opt|alt|try|catch|finally|while|for)\b/;

/** zenuml — sequence-style participants and messages. */
export function renderZenuml(lines: string[], width: number): string[] | null {
	let title = "";
	const aliases = new Map<string, string>();
	const messages: { depth: number; kind: "msg" | "self" | "return" | "new" | "block"; text: string }[] = [];
	let depth = 0;
	const participants: string[] = [];
	for (const raw of lines.slice(1)) {
		let line = raw.trim();
		if (!line) continue;
		const t = /^title\s+(.+)$/.exec(line);
		if (t) {
			title = stripQuotes(t[1]);
			continue;
		}
		const al = /^([\w.]+)\s+as\s+(.+)$/.exec(line);
		if (al) {
			aliases.set(al[1], stripQuotes(al[2]));
			continue;
		}
		const ann = /^@\w+\s+(.+)$/.exec(line);
		if (ann) {
			participants.push(stripQuotes(ann[1]));
			continue;
		}
		while (line.startsWith("}")) {
			depth = Math.max(0, depth - 1);
			line = line.slice(1).trim();
			if (!line) break;
		}
		if (!line) continue;
		const bm = ZEN_BLOCK_KEYWORDS.exec(line);
		if (bm) {
			messages.push({ depth, kind: "block", text: truncate(line.replace(/\s*\{$/, ""), width - 4) });
			if (line.endsWith("{")) depth++;
			continue;
		}
		const msg = /^(.+?)\s*->\s*(.+?)\s*:\s*(.*)$/.exec(line);
		if (msg) {
			messages.push({ depth, kind: "msg", text: `${stripQuotes(msg[1])} ──▶ ${stripQuotes(msg[2])}: ${truncate(msg[3], width - 20)}` });
			line = line.replace(/\{$/, "").trim();
			if (raw.trim().endsWith("{")) depth++;
			continue;
		}
		const ret = /^return\s*(.*)$/.exec(line);
		if (ret) {
			messages.push({ depth, kind: "return", text: `◀── return${ret[1] ? ` ${ret[1]}` : ""}` });
			if (raw.trim().endsWith("{")) depth++;
			continue;
		}
		const nw = /^new\s+([\w.]+)/.exec(line);
		if (nw) {
			messages.push({ depth, kind: "new", text: `+ new ${nw[1]}` });
			if (raw.trim().endsWith("{")) depth++;
			continue;
		}
		const self = /^([\w.]+)\s*\(([^)]*)\)/.exec(line);
		if (self) {
			const parts = self[1].split(".");
			const obj = parts[0];
			const method = parts.slice(1).join(".") || parts[0];
			const label = aliases.get(obj) ?? obj;
			messages.push({ depth, kind: "self", text: `${label} ↺ ${method}(${self[2]})` });
			if (raw.trim().endsWith("{")) depth++;
			continue;
		}
		if (/^[\w.]+$/.test(line)) {
			if (!participants.includes(line)) participants.push(line);
			continue;
		}
	}
	if (messages.length === 0 && participants.length === 0) return null;
	const out: string[] = [];
	if (title) out.push(title);
	if (participants.length) out.push(`Participants: ${participants.join(", ")}`);
	for (const m of messages) {
		const indent = "  ".repeat(m.depth);
		out.push(`${indent}${m.kind === "block" ? `· ${m.text}` : m.text}`);
	}
	return out;
}
