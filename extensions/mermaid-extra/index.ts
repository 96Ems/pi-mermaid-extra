/**
 * mermaid-extra — renders Mermaid diagram types that pi's built-in renderer
 * (grok-mermaid: flowchart, sequence, class, state, ER) does NOT support,
 * directly in the TUI transcript as Unicode text art.
 *
 * Supported: gantt, pie, mindmap, timeline, journey, xychart, quadrant,
 *   kanban, packet, sankey, gitGraph, treeView, treemap, ishikawa, radar,
 *   venn, cynefin, wardley, block, swimlane, architecture, requirement,
 *   C4, usecase, agentflow, eventmodeling, zenuml, railroad, info.
 * Anything else (or a parse failure) falls back to the raw code block.
 *
 * The built-in mermaid transformer runs first, so this only ever sees the
 * mermaid blocks it left behind — no double rendering.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { renderExtraMermaid } from "./renderers/mod.ts";

interface MermaidBlock {
	start: number;
	end: number;
	text: string;
}

/** Find top-level ```mermaid fenced blocks. Fence lines must contain only the fence + language. */
function findMermaidBlocks(markdown: string): MermaidBlock[] {
	const blocks: MermaidBlock[] = [];
	const lines = markdown.split("\n");
	let offset = 0;
	let inFence = false;
	let fenceStart = 0;
	let isMermaid = false;
	let buf: string[] = [];
	for (const line of lines) {
		const lineStart = offset;
		offset += line.length + 1;
		const trimmed = line.trim();
		if (!inFence) {
			const fence = /^(`{3,})\s*([\w-]*)\s*$/.exec(trimmed);
			if (fence) {
				inFence = true;
				fenceStart = lineStart;
				isMermaid = fence[2]?.toLowerCase() === "mermaid";
				buf = [];
			}
			continue;
		}
		if (/^`{3,}\s*$/.test(trimmed)) {
			if (isMermaid) blocks.push({ start: fenceStart, end: offset, text: buf.join("\n") });
			inFence = false;
			isMermaid = false;
			continue;
		}
		if (isMermaid) buf.push(line);
	}
	return blocks;
}

/**
 * Wrap one art line as a Markdown code span so spacing and box-drawing
 * characters survive rendering (same trick as pi's built-in transformer).
 */
function codeSpan(line: string): string {
	const content = line || "\u00a0";
	const longestRun = Math.max(0, ...Array.from(content.matchAll(/`+/g), (m) => m[0].length));
	const fence = "`".repeat(longestRun + 1);
	const padding = content.startsWith("`") || content.endsWith("`") ? " " : "";
	return `${fence}${padding}${content}${padding}${fence}`;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("mermaid-extra", {
		description: "Show mermaid-extra renderer status",
		handler: async (_args, ctx) => {
			ctx.ui.notify(
				"mermaid-extra actif (28 types) : gantt, pie, mindmap, timeline, journey, xychart, quadrant, kanban, packet, sankey, gitGraph, treeView, treemap, ishikawa, radar, venn, cynefin, wardley, block, swimlane, architecture, requirement, C4, usecase, agentflow, eventmodeling, zenuml, railroad",
				"info",
			);
		},
	});

	pi.registerMarkdownTransformer((markdown, context) => {
		// Render only complete messages; partial diagrams mid-stream rarely parse.
		if (context.isStreaming || context.messageType === "assistant-thinking") return markdown;
		const blocks = findMermaidBlocks(markdown);
		if (blocks.length === 0) return markdown;
		let out = "";
		let last = 0;
		for (const block of blocks) {
			out += markdown.slice(last, block.start);
			const art = renderExtraMermaid(block.text, context.availableWidth);
			out += art ? `${art.map(codeSpan).join("  \n")}\n` : markdown.slice(block.start, block.end);
			last = block.end;
		}
		out += markdown.slice(last);
		return out;
	});
}
