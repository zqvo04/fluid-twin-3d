/**
 * Small dense linear algebra for the steady-state solver.
 *
 * Networks handled here are modest (hundreds of nodes), so the Schur-complement
 * system A21 * D^-1 * A12 is solved directly with Gaussian elimination and
 * partial pivoting rather than a sparse factorization. Kept dependency-free so
 * the physics core runs unchanged in Node (tests) and the browser worker.
 */

/**
 * Solve A x = b for a dense, square system by Gaussian elimination with
 * partial pivoting. `A` is row-major and is copied (not mutated). Throws if
 * the matrix is singular to working precision.
 */
export function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  // Augmented matrix copy.
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivot: find the largest magnitude entry in this column.
    let pivotRow = col;
    let pivotVal = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(M[r][col]);
      if (v > pivotVal) {
        pivotVal = v;
        pivotRow = r;
      }
    }
    if (pivotVal < 1e-14) {
      throw new Error('Linear system is singular or ill-conditioned');
    }
    if (pivotRow !== col) {
      const tmp = M[col];
      M[col] = M[pivotRow];
      M[pivotRow] = tmp;
    }

    // Eliminate below.
    const pivot = M[col][col];
    for (let r = col + 1; r < n; r++) {
      const factor = M[r][col] / pivot;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) {
        M[r][c] -= factor * M[col][c];
      }
    }
  }

  // Back-substitution.
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = M[row][n];
    for (let c = row + 1; c < n; c++) {
      sum -= M[row][c] * x[c];
    }
    x[row] = sum / M[row][row];
  }
  return x;
}
