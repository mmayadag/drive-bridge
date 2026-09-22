export default function roundPercent(completed: number, total: number) {
	return Math.round((completed / (total || 1)) * 10_000) / 100;
}
