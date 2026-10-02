import { stripQuotes } from "./util.ts";

function splitStatements(text: string, terminator: string): string[] {
	const out: string[] = [];
	let quote = "";
	let cur = "";
	for (const ch of text) {
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
		if (ch === terminator) {
			out.push(cur);
			cur = "";
			continue;
		}
		cur += ch;
	}
	if (cur.trim()) out.push(cur);
	return out.map((s) => s.trim()).filter(Boolean);
}

function splitTopLevel(s: string, sep: string): string[] {
	const out: string[] = [];
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
			out.push(cur);
			cur = "";
			continue;
		}
		cur += ch;
	}
	out.push(cur);
	return out.map((p) => p.trim()).filter(Boolean);
}

function collapseSpaces(s: string): string {
	let quote = "";
	let out = "";
	let pendingSpace = false;
	for (const ch of s) {
		if (quote) {
			out += ch;
			if (ch === quote) quote = "";
			continue;
		}
		if (ch === '"' || ch === "'") {
			if (pendingSpace && out) out += " ";
			pendingSpace = false;
			quote = ch;
			out += ch;
			continue;
		}
		if (/\s/.test(ch)) {
			pendingSpace = true;
			continue;
		}
		if (pendingSpace && out) out += " ";
		pendingSpace = false;
		out += ch;
	}
	return out;
}

function wrapWords(s: string, w: number): string[] {
	const words = s.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let cur = "";
	for (const word of words) {
		if (!cur.length) cur = word;
		else if (cur.length + 1 + word.length <= w) cur += ` ${word}`;
		else {
			lines.push(cur);
			cur = word;
		}
	}
	if (cur) lines.push(cur);
	return lines.length ? lines : [""];
}

function irToText(expr: string): string {
	const trimmed = expr.trim();
	const m = /^(\w+)\s*\(([\s\S]*)\)$/.exec(trimmed);
	if (!m) return trimmed;
	const name = m[1];
	const args = splitTopLevel(m[2], ",");
	const conv = args.map(irToText);
	switch (name) {
		case "terminal":
			return `"${stripQuotes(args[0] ?? "")}"`;
		case "nonterminal":
			return stripQuotes(args[0] ?? "");
		case "special":
			return `? ${stripQuotes(args[0] ?? "")} ?`;
		case "sequence":
			return conv.join(" ");
		case "choice":
			return conv.join(" | ");
		case "optional":
			return `[ ${conv[0] ?? ""} ]`;
		case "zeroOrMore":
			return `${conv[0] ?? ""}*`;
		case "oneOrMore":
			return `${conv[0] ?? ""}+`;
		default:
			return `${name}(${args.join(", ")})`;
	}
}

/** railroad-beta / railroad-{ebnf,abnf,peg}-beta — grammar rules as readable syntax. */
export function renderRailroad(lines: string[], width: number): string[] | null {
	const keyword = (lines[0].trim().split(/\s+/)[0] ?? "").toLowerCase();
	const isIR = keyword === "railroad-beta";
	const altSep = keyword === "railroad-abnf-beta" || keyword === "railroad-peg-beta" ? "/" : "|";
	let text = lines
		.slice(1)
		.join("\n")
		.replace(/\/\*[\s\S]*?\*\//g, " ")
		.replace(/\(\*[\s\S]*?\*\)/g, " ");
	if (keyword === "railroad-peg-beta") text = text.replace(/#[^\n]*/g, " ");
	const titles: string[] = [];
	text = text.replace(/^[ \t]*title\s+("[^"]*"|'[^']*'|[^\n]+)$/gm, (_m, g: string) => {
		titles.push(stripQuotes(g.trim()));
		return "";
	});
	text = text.replace(/^[ \t]*acc(Title|Descr)\b[^\n]*$/gm, "");
	const statements = splitStatements(text, ";");
	const out: string[] = [...titles];
	for (const stmt of statements) {
		const rule = /^([\w-]+)\s*(::=|<-|=)\s*([\s\S]+)$/.exec(stmt);
		if (!rule) continue;
		const name = rule[1];
		const exprText = isIR ? irToText(rule[3]) : collapseSpaces(rule[3]);
		if (!exprText) continue;
		if (!isIR && !/"/.test(exprText) && !altSep) continue;
		const alts = splitTopLevel(exprText, altSep);
		if (alts.length <= 1) {
			const one = `${name} = ${exprText}`;
			if (one.length <= width) out.push(one);
			else {
				const wrapped = wrapWords(one, width - 4);
				out.push(wrapped[0]);
				for (const w of wrapped.slice(1)) out.push(`    ${w}`);
			}
			continue;
		}
		out.push(`${name} =`);
		alts.forEach((alt, i) => {
			const prefix = i === 0 ? "    " : "  | ";
			const wrapped = wrapWords(alt, width - prefix.length);
			out.push(`${prefix}${wrapped[0]}`);
			for (const w of wrapped.slice(1)) out.push(`${" ".repeat(prefix.length)}${w}`);
		});
	}
	return out.length ? out : null;
}

/** info — trivial info panel. */
export function renderInfo(lines: string[], width: number): string[] | null {
	const body = lines
		.slice(1)
		.map((l) => l.trim())
		.filter((l) => l && l !== "showInfo");
	return [`ℹ Mermaid info`, ...body];
}
