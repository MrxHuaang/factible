// Tipos mínimos de jstat: solo lo que usa el motor estadístico.
declare module 'jstat' {
  interface Continua<P extends number[]> {
    pdf(x: number, ...p: P): number
    cdf(x: number, ...p: P): number
    inv(p: number, ...params: P): number
  }
  interface Discreta<P extends number[]> {
    pdf(k: number, ...p: P): number
    cdf(k: number, ...p: P): number
  }
  interface JStat {
    normal: Continua<[media: number, desviacion: number]>
    studentt: Continua<[gl: number]>
    chisquare: Continua<[gl: number]>
    centralF: Continua<[gl1: number, gl2: number]>
    binomial: Discreta<[n: number, p: number]>
    poisson: Discreta<[lambda: number]>
    tukey: {
      cdf(q: number, grupos: number, gl: number): number
      inv(p: number, grupos: number, gl: number): number
    }
  }
  const jStat: JStat
  export default jStat
}
