declare module 'xorshift' {
  class XorShift {
    constructor(seed: [number, number, number, number]);
    randomint(): number;
    random(): number;
  }

  let global: XorShift;
  export default global;
}
