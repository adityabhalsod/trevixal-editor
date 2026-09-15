// Vite turns a stylesheet import into a side effect that injects the CSS.
// TypeScript 6 refuses a side-effect import of a module it has no declaration
// for (TS2882), where 5.x let it pass, and this example is the one package
// here on 6, because that is what Angular's compiler requires.
declare module '*.css'
