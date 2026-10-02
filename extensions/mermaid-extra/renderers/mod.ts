import { renderJourney, renderMindmap, renderPie, renderSankey, renderTimeline } from "./basic.ts";
import { renderKanban, renderPacket } from "./boxes.ts";
import { renderGantt, renderQuadrant, renderXyChart } from "./charts.ts";
import { renderCynefin, renderRadar, renderVenn, renderWardley } from "./charts2.ts";
import { renderC4, renderRequirement, renderUsecase } from "./docs.ts";
import { renderAgentflow, renderEventmodeling, renderZenuml } from "./flows.ts";
import { renderGitGraph } from "./gitgraph.ts";
import { renderArchitecture, renderBlock, renderSwimlane } from "./layout.ts";
import { renderInfo, renderRailroad } from "./railroad.ts";
import { renderIshikawa, renderTreemap, renderTreeView } from "./trees.ts";

/**
 * Render a Mermaid diagram type unsupported by pi's built-in renderer to
 * Unicode text lines, or null to keep the raw code block.
 */
export function renderExtraMermaid(source: string, width: number): string[] | null {
	if (width < 24) return null;
	let lines = source.split("\n").filter((l) => l.trim() !== "" && !l.trim().startsWith("%%"));
	if (lines.length === 0) return null;
	// Strip YAML front matter (--- ... ---).
	if (lines[0].trim() === "---") {
		const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
		if (end > 0) lines = lines.slice(end + 1);
	}
	if (lines.length === 0) return null;
	const type = (lines[0].trim().split(/\s+/, 1)[0] ?? "").toLowerCase();
	let art: string[] | null = null;
	try {
		switch (type) {
			// --- existing types ---
			case "pie":
				art = renderPie(lines, width);
				break;
			case "gantt":
				art = renderGantt(lines, width);
				break;
			case "mindmap":
				art = renderMindmap(lines, width);
				break;
			case "timeline":
				art = renderTimeline(lines, width);
				break;
			case "journey":
				art = renderJourney(lines, width);
				break;
			case "xychart-beta":
				art = renderXyChart(lines, width);
				break;
			case "quadrantchart":
				art = renderQuadrant(lines, width);
				break;
			case "kanban":
				art = renderKanban(lines, width);
				break;
			case "packet-beta":
				art = renderPacket(lines, width);
				break;
			case "sankey-beta":
				art = renderSankey(lines, width);
				break;
			case "gitgraph":
				art = renderGitGraph(lines, width);
				break;
			// --- trees ---
			case "treeview-beta":
				art = renderTreeView(lines, width);
				break;
			case "ishikawa":
			case "ishikawa-beta":
				art = renderIshikawa(lines, width);
				break;
			case "treemap-beta":
				art = renderTreemap(lines, width);
				break;
			// --- charts ---
			case "radar-beta":
				art = renderRadar(lines, width);
				break;
			case "venn-beta":
				art = renderVenn(lines, width);
				break;
			case "cynefin-beta":
				art = renderCynefin(lines, width);
				break;
			case "wardley-beta":
				art = renderWardley(lines, width);
				break;
			// --- layout / boxes ---
			case "block":
			case "block-beta":
				art = renderBlock(lines, width);
				break;
			case "swimlane-beta":
				art = renderSwimlane(lines, width);
				break;
			case "architecture-beta":
				art = renderArchitecture(lines, width);
				break;
			// --- docs ---
			case "requirementdiagram":
				art = renderRequirement(lines, width);
				break;
			case "c4context":
			case "c4container":
			case "c4component":
			case "c4dynamic":
			case "c4deployment":
				art = renderC4(lines, width);
				break;
			case "usecase-beta":
				art = renderUsecase(lines, width);
				break;
			// --- flows ---
			case "agentflow-beta":
				art = renderAgentflow(lines, width);
				break;
			case "eventmodeling":
				art = renderEventmodeling(lines, width);
				break;
			case "zenuml":
				art = renderZenuml(lines, width);
				break;
			// --- grammars ---
			case "railroad-beta":
			case "railroad-ebnf-beta":
			case "railroad-abnf-beta":
			case "railroad-peg-beta":
				art = renderRailroad(lines, width);
				break;
			case "info":
				art = renderInfo(lines, width);
				break;
			default:
				return null;
		}
	} catch {
		return null;
	}
	if (!art || art.length === 0) return null;
	return art.map((l) => (l.length > width ? l.slice(0, width - 1) + "…" : l));
}
