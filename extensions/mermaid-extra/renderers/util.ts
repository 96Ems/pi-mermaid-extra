export function truncate(s: string, n: number): string {
	if (n <= 0) return "";
	return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

export function padEnd(s: string, n: number): string {
	return s.length >= n ? s : s + " ".repeat(n - s.length);
}

export function clamp(v: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, v));
}

export function stripQuotes(s: string): string {
	return s.trim().replace(/^["']|["']$/g, "");
}
