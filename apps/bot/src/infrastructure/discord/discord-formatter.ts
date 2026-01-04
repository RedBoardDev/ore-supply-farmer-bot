const ORE_ATOMS_PER_ORE = BigInt(100_000_000_000); // TODO utiliser constants
const SOL_LAMPORTS = 1_000_000_000; // TODO utiliser constants

export function formatSol(lamports: bigint): string {
	return (Number(lamports) / SOL_LAMPORTS).toFixed(4);
}

export function formatSignedSol(lamports: bigint): string {
	const value = Number(lamports) / SOL_LAMPORTS;
	return `${value >= 0 ? '+' : ''}${value.toFixed(4)}`;
}

export function formatOre(atoms: bigint): string {
	return (Number(atoms) / Number(ORE_ATOMS_PER_ORE)).toFixed(4);
}

export function buildStakeSummary(stakeLamports: bigint, squareCount: number): string {
	const stakeSol = formatSol(stakeLamports);
	return `${stakeSol} SOL • ${squareCount} square${squareCount === 1 ? '' : 's'}`;
}

export function buildLossSummary(lossesBeforeWin: number): string {
	return `${lossesBeforeWin} loss${lossesBeforeWin === 1 ? '' : 'es'} in a row`;
}

export function buildFooter(roundId: bigint): string {
	const now = new Date();
	return `Round ${roundId.toString()} • ${now.toLocaleString()}`;
}

export function getColorForType(type: string): number {
	const colors: Record<string, number> = {
		win: 0x2ecc71,     // Green
		loss: 0xe74c3c,    // Red
		status: 0x0000ff,  // Blue
		error: 0xff6600,   // Orange
		info: 0x00ffff,    // Cyan
		success: 0x2ecc71, // Green
	};
	return colors[type] ?? 0x808080; // Gray default
}
