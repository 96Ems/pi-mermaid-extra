import { stripQuotes, truncate } from "./util.ts";
import { splitTop } from "./charts2.ts";

/** requirementDiagram — requirement blocks + relations. */
export function renderRequirement(lines: string[], width: number): string[] | null {
	const REQ_TYPES = new Set([
		"requirement",
		"functionalRequirement",
		"performanceRequirement",
		"interfaceRequirement",
		"physicalRequirement",
		"designConstraint",
		"element",
	]);
	const blocks: { type: string; name: string; fields: [string, string][] }[] = [];
	const relations: { from: string; kind: string; to: string }[] = [];
	let current: { type: string; name: string; fields: [string, string][] } | null = null;
	for (const raw of lines.slice(1)) {
		const line = raw.trim();
		if (!line) continue;
		const start = /^(\w+)\s+"?([\w.]+)"?\s*\{\s*$/.exec(line);
		if (start && REQ_TYPES.has(start[1])) {
			current = { type: start[1], name: start[2], fields: [] };
			continue;
		}
		if (line === "}" && current) {
			blocks.push(current);
			current = null;
			continue;
		}
		if (current) {
			const f = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
			if (f) current.fields.push([f[1], stripQuotes(f[2])]);
			continue;
		}
		const rel = /^"?([\w.]+)"?\s*-\s*(\w+)\s*->\s*"?([\w.]+)"?$/.exec(line);
		if (rel) relations.push({ from: rel[1], kind: rel[2], to: rel[3] });
	}
	if (blocks.length === 0 && relations.length === 0) return null;
	const out: string[] = [];
	for (const b of blocks) {
		const short = b.type === "element" ? "element" : b.type.replace(/Requirement$/i, "") || "requirement";
		out.push(`${b.name} (${short})`);
		const inline: string[] = [];
		let text = "";
		for (const [k, v] of b.fields) {
			if (k === "text") text = v;
			else if (k === "type") inline.push(`type: ${v}`);
			else inline.push(`${k}: ${v}`);
		}
		if (text) out.push(`  « ${truncate(text, width - 5)} »`);
		if (inline.length) out.push(`  ${inline.join(" · ")}`);
	}
	if (relations.length) {
		if (out.length) out.push("");
		out.push("Relations:");
		for (const r of relations) out.push(`  ${r.from} ──${r.kind}──▶ ${r.to}`);
	}
	return out;
}

/** C4Context / C4Container / C4Component / C4Dynamic / C4Deployment — nodes, boundaries, relations. */
export function renderC4(lines: string[], width: number): string[] | null {
	const BOUNDARY_KINDS = new Set([
		"Boundary",
		"Enterprise_Boundary",
		"System_Boundary",
		"Container_Boundary",
		"Deployment_Node",
		"Node",
		"Node_L",
		"Node_R",
	]);
	const NODE_KINDS = new Set([
		"Person",
		"Person_Ext",
		"System",
		"System_Ext",
		"SystemDb",
		"SystemDb_Ext",
		"SystemQueue",
		"SystemQueue_Ext",
		"Container",
		"Container_Ext",
		"ContainerDb",
		"ContainerDb_Ext",
		"ContainerQueue",
		"ContainerQueue_Ext",
		"Component",
		"Component_Ext",
		"ComponentDb",
		"ComponentDb_Ext",
		"ComponentQueue",
		"ComponentQueue_Ext",
	]);
	const REL_KINDS = new Set(["Rel", "BiRel", "Rel_U", "Rel_Up", "Rel_D", "Rel_Down", "Rel_L", "Rel_Left", "Rel_R", "Rel_Right", "Rel_Back", "RelIndex"]);
	interface C4Node {
		kind: string;
		alias: string;
		label: string;
		depth: number;
	}
	const nodes: C4Node[] = [];
	const relations: { kind: string; from: string; to: string; label: string }[] = [];
	let title = "";
	let depth = 0;
	for (const raw of lines.slice(1)) {
		let line = raw.trim();
		if (!line) continue;
		const t = /^title\s+(.+)$/.exec(line);
		if (t) {
			title = stripQuotes(t[1]);
			continue;
		}
		if (/^(UpdateElementStyle|UpdateRelStyle|UpdateLayoutConfig)\s*\(/.test(line)) continue;
		const stmt = /^(\w+)\s*\((.*)\)\s*\{?\s*$/.exec(line);
		if (!stmt) {
			const open = line.match(/^(\w+)\s*\((.*)\)\s*\{$/);
			if (open) {
				const args = splitTop(open[2], ",");
				if (BOUNDARY_KINDS.has(open[1]) && args.length >= 2) {
					nodes.push({ kind: open[1], alias: stripQuotes(args[0]), label: stripQuotes(args[1]), depth });
					depth++;
				}
				continue;
			}
			if (line === "}") {
				depth = Math.max(0, depth - 1);
				continue;
			}
			continue;
		}
		const kind = stmt[1];
		const args = splitTop(stmt[2], ",");
		if (REL_KINDS.has(kind) && args.length >= 3) {
			const base = kind === "RelIndex" ? 1 : 0;
			relations.push({
				kind,
				from: stripQuotes(args[base]),
				to: stripQuotes(args[base + 1]),
				label: stripQuotes(args[base + 2] ?? ""),
			});
			continue;
		}
		if (BOUNDARY_KINDS.has(kind) && args.length >= 2) {
			nodes.push({ kind, alias: stripQuotes(args[0]), label: stripQuotes(args[1]), depth });
			if (raw.includes("{") || line.endsWith("{")) depth++;
			continue;
		}
		if (NODE_KINDS.has(kind) && args.length >= 2) {
			nodes.push({ kind, alias: stripQuotes(args[0]), label: stripQuotes(args[1]), depth });
			continue;
		}
	}
	if (nodes.length === 0 && relations.length === 0) return null;
	const labelOf = new Map(nodes.map((n) => [n.alias, n.label]));
	const out: string[] = [];
	if (title) out.push(title);
	for (const n of nodes) {
		const isBoundary = BOUNDARY_KINDS.has(n.kind);
		const kindShort = n.kind.replace(/_Boundary$/, "").replace(/^(Person|System|Container|Component)(_Ext|Db|Queue)?(_Ext)?$/, "$1$2$3");
		out.push(`${"  ".repeat(n.depth)}${isBoundary ? "▌" : "•"} [${kindShort}] ${n.label}${n.label !== n.alias ? ` (${n.alias})` : ""}`);
	}
	if (relations.length) {
		if (out.length) out.push("");
		out.push("Relations:");
		for (const r of relations) {
			const from = labelOf.get(r.from) ?? r.from;
			const to = labelOf.get(r.to) ?? r.to;
			const arrow = r.kind === "BiRel" ? `◀─${r.label ? `${r.label}─` : ""}▶` : `──${r.label ? `${r.label}──` : ""}▶`;
			out.push(`  ${from} ${arrow} ${to}`);
		}
	}
	return out;
}

/** usecase-beta — actors, system boundaries with use cases, relations. */
export function renderUsecase(lines: string[], width: number): string[] | null {
	const actors: { id: string; label: string }[] = [];
	const usecases: { id: string; label: string }[] = [];
	const boundaries: { name: string; items: string[] }[] = [];
	const labelOf = new Map<string, string>();
	let boundary: { name: string; items: string[] } | null = null;
	const edges: { from: string; to: string; label: string; kind: "assoc" | "include" }[] = [];
	for (const raw of lines.slice(1)) {
		const line = raw.trim();
		if (!line) continue;
		if (/^direction\b/.test(line)) continue;
		const sb = /^systemBoundary\s+"?([^"]+?)"?\s*$/.exec(line);
		if (sb) {
			boundary = { name: sb[1].trim(), items: [] };
			boundaries.push(boundary);
			continue;
		}
		if (line === "end") {
			boundary = null;
			continue;
		}
		const actor = /^actor\s+([\w.]+)\s*(?:[([]"?([^")\]]*)"?[)\]])?\s*$/.exec(line);
		if (actor) {
			const a = { id: actor[1], label: actor[2] ?? actor[1] };
			actors.push(a);
			labelOf.set(a.id, a.label);
			continue;
		}
		const uc = /^([\w.]+)\s*(?:[([]"?([^")\]]*)"?[)\]])?\s*$/.exec(line);
		if (uc && !/-->|\.\.>/.test(line) && !/^@/.test(line)) {
			const item = { id: uc[1], label: uc[2] ?? uc[1] };
			usecases.push(item);
			labelOf.set(item.id, item.label);
			if (boundary) boundary.items.push(item.id);
			continue;
		}
		const quoted = /^"([^"]+)"\s*$/.exec(line);
		if (quoted) {
			const id = quoted[1].replace(/\W/g, "_");
			usecases.push({ id, label: quoted[1] });
			labelOf.set(id, quoted[1]);
			if (boundary) boundary.items.push(id);
			continue;
		}
		const em = /^([\w.]+)\s*(-->|\.\.>)\s*(?:\|([^|]*)\|)?\s*:?\s*([\w.]*)\s*$/.exec(line);
		if (em) {
			const kind = em[2] === "..>" ? "include" : "assoc";
			const to = em[4] || em[3] || "";
			if (to) edges.push({ from: em[1], to, label: em[3] ?? "", kind });
		}
	}
	if (actors.length === 0 && usecases.length === 0) return null;
	const out: string[] = [];
	for (const b of boundaries) {
		out.push(`▌ ${b.name}`);
		for (const id of b.items) out.push(`  ○ ${labelOf.get(id) ?? id}`);
	}
	for (const u of usecases) {
		if (!boundaries.some((b) => b.items.includes(u.id))) out.push(`• ${u.label}`);
	}
	if (actors.length) out.push(`Acteurs: ${actors.map((a) => a.label).join(", ")}`);
	if (edges.length) {
		out.push("Relations:");
		for (const e of edges) {
			const from = labelOf.get(e.from) ?? e.from;
			const to = labelOf.get(e.to) ?? e.to;
			out.push(`  ${from} ${e.kind === "include" ? "⇢ include" : `──${e.label ? `${e.label}──` : ""}▶`} ${to}`);
		}
	}
	return out;
}
