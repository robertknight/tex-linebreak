declare module 'xorshift' {
  export class XorShift {
    constructor(seed: [number, number, number, number]);
    randomint(): number;
    random(): number;
  }
}
