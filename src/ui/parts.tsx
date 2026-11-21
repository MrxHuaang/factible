import type { ReactNode } from 'react'

/** Línea de desarrollo en la notación del curso. */
export const F = ({ children, sangria }: { children: ReactNode; sangria?: boolean }) => <p className={'f' + (sangria ? ' sangria' : '')}>{children}</p>

/** Resultado dentro de una línea de desarrollo. */
export const R = ({ children }: { children: ReactNode }) => <mark className="r">{children}</mark>

export const Nota = ({ children, aviso }: { children: ReactNode; aviso?: boolean }) => <p className={'nota' + (aviso ? ' aviso' : '')}>{children}</p>
