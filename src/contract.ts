import { sum } from "./lib";

const logf = [
  0, 0, 0.6931471805599453, 1.791759469228055, 3.1780538303479458, 4.787491742782046,
  6.579251212010101, 8.525161361065415, 10.60460290274525, 12.801827480081469, 15.104412573075516,
  17.502307845873887, 19.987214495661885, 22.552163853123425, 25.19122118273868, 27.89927138384089,
  30.671860106080672, 33.50507345013689, 36.39544520803305, 39.339884187199495, 42.335616460753485,
  45.38013889847691, 48.47118135183523, 51.60667556776438, 54.78472939811232, 58.00360522298052,
  61.261701761002, 64.55753862700634, 67.88974313718154, 71.25703896716801, 74.65823634883016,
  78.0922235533153, 81.55795945611504, 85.05446701758152, 88.58082754219768, 92.1361756036871,
  95.7196945421432, 99.33061245478743, 102.96819861451381, 106.63176026064346, 110.32063971475739,
  114.0342117814617, 117.77188139974507, 121.53308151543864, 125.3172711493569, 129.12393363912722,
  132.95257503561632, 136.80272263732635, 140.67392364823425, 144.5657439463449, 148.47776695177302,
  152.40959258449735, 156.3608363030788, 160.3311282166309, 164.32011226319517, 168.32744544842765,
  172.3527971391628, 176.39584840699735, 180.45629141754378, 184.53382886144948, 188.6281734236716,
  192.7390472878449, 196.86618167289, 201.00931639928152, 205.1681994826412, 209.34258675253685,
  213.53224149456327, 217.73693411395422, 221.95644181913033, 226.1905483237276, 230.43904356577696,
  234.70172344281826, 238.97838956183432, 243.2688490029827, 247.57291409618688, 251.8904022097232,
  256.22113555000954, 260.5649409718632, 264.9216497985528, 269.2910976510198, 273.6731242856937,
  278.0675734403661, 282.4742926876304, 286.893133295427, 291.3239500942703, 295.76660135076065,
  300.22094864701415, 304.6868567656687, 309.1641935801469, 313.65282994987905, 318.1526396202093,
  322.66349912672615, 327.1852877037752, 331.7178871969285, 336.26118197919845, 340.815058870799,
  345.37940706226686, 349.95411804077025, 354.5390855194408, 359.1342053695754, 363.73937555556347,
];

function binomial(n: number, k: number) {
  return Math.round(Math.exp(logf[n] - logf[n - k] - logf[k]));
}

function range(n: number) {
  return [...Array(n).keys()];
}

function rshift(n: number, bits: number) {
  while (bits > 0) {
    const shift = Math.min(bits, 31);
    n >>= shift;
    bits -= shift;
  }
  return n;
}

const changeCache = new Map<number[], Map<number, Map<number, number>>>();
function makeChange(ns: NS, coins: number[], lastCoinIndex: number, sum: number) {
  if (sum === 0) return 1;

  const cached = changeCache.get(coins)?.get(sum)?.get(lastCoinIndex);
  if (cached !== undefined) {
    return cached;
  }

  let result = 0;
  const lastCoin = coins[lastCoinIndex];
  const maxLastCoins = Math.floor(sum / lastCoin);
  for (let k = 0; k <= maxLastCoins; k++) {
    result += makeChange(ns, coins, lastCoinIndex - 1, sum - k * lastCoin);
  }

  let changeCacheCoins = changeCache.get(coins);
  if (changeCacheCoins === undefined) {
    changeCacheCoins = new Map();
    changeCache.set(coins, changeCacheCoins);
  }

  let changeCacheCoinsSum = changeCacheCoins.get(sum);
  if (changeCacheCoinsSum === undefined) {
    changeCacheCoinsSum = new Map();
    changeCacheCoins.set(sum, changeCacheCoinsSum);
  }

  changeCacheCoinsSum.set(lastCoinIndex, result);

  return result;
}

function shift(s: string, shiftLetter: (code: number, index: number) => number) {
  const codes = s.split("").map((c) => c.charCodeAt(0));
  const shifted = codes.map((code, index) => {
    if (65 <= code && code <= 90) {
      const position = code - 65;
      return 65 + ((position + 26 + shiftLetter(code, index)) % 26);
    } else {
      return code;
    }
  });
  return shifted.map((code) => String.fromCharCode(code)).join("");
}

function findContracts(ns: NS, current = "home", last: string | null = null): [string, string[]][] {
  const contracts = ns.ls(current).filter((file) => file.endsWith(".cct"));
  if (contracts.length > 0) return [[current, contracts]];
  const hostsWithContracts = [];
  for (const next of ns.scan(current)) {
    if (next.startsWith("hacknet-")) continue;
    if (next !== last) {
      hostsWithContracts.push(...findContracts(ns, next, current));
    }
  }
  return hostsWithContracts;
}

class Solvers {
  ns: NS;

  constructor(ns: NS) {
    this.ns = ns;
  }

  "Algorithmic Stock Trader I"(prices: number[]) {
    let highestDiff = 0;
    let lowestPrice = Infinity;
    for (const price of prices) {
      if (price < lowestPrice) lowestPrice = price;
      if (price - lowestPrice > highestDiff) {
        highestDiff = price - lowestPrice;
      }
    }
    this.ns.print(highestDiff);
    return highestDiff;
  }

  "Array Jumping Game"(maxJumps: number[]) {
    const length = maxJumps.length;
    const endAccessibleFrom = new Array(length).fill(false);
    endAccessibleFrom[length - 1] = true;
    for (let index = length - 2; index >= 0; index--) {
      const maxJump = maxJumps[index];
      if (endAccessibleFrom.slice(index + 1, index + maxJump + 1).some((x) => x)) {
        endAccessibleFrom[index] = true;
      }
    }
    this.ns.print(endAccessibleFrom);
    return endAccessibleFrom[0] ? 1 : 0;
  }

  "Array Jumping Game II"(maxJumps: number[]) {
    const length = maxJumps.length;
    const minJumpsFrom: number[] = new Array(length).fill(-1);
    minJumpsFrom[length - 1] = 0;
    for (let index = length - 2; index >= 0; index--) {
      const maxJump = maxJumps[index];
      const jumpable = minJumpsFrom.slice(index + 1, index + maxJump + 1);
      if (jumpable.some((x) => x >= 0)) {
        minJumpsFrom[index] = 1 + Math.min(...jumpable.filter((x) => x >= 0));
      }
    }
    this.ns.print(minJumpsFrom);
    return minJumpsFrom[0] >= 0 ? minJumpsFrom[0] : 0;
  }

  "Compression I: RLE Compression"(input: string) {
    const components = [];

    let runCharacter = input[0];
    let runLength = 1;
    for (const char of input.slice(1).split("")) {
      if (runCharacter === char && runLength < 9) {
        runLength++;
      } else {
        components.push(`${runLength}${runCharacter}`);
        runCharacter = char;
        runLength = 1;
      }
    }
    components.push(`${runLength}${runCharacter}`);

    return components.join("");
  }

  "Encryption I: Caesar Cipher"([encoded, leftShift]: [string, number]) {
    return shift(encoded, () => -leftShift);
  }

  "Encryption II: Vigenère Cipher"([message, key]: [string, string]) {
    return shift(message, (_, index) => key.charCodeAt(index % key.length) - "A".charCodeAt(0));
  }

  "Find Largest Prime Factor"(n: number) {
    for (let k = Math.floor(Math.sqrt(n)) | 1; k >= 3; k -= 2) {
      if (n % k === 0) return k;
    }
    if (n === 2) return 2;
    return n;
  }

  "HammingCodes: Encoded Binary to Integer"(data: string) {
    const codedLength = data.length;
    const bits = data.split("").map((c) => parseInt(c));
    this.ns.print(bits.join(""));

    let incorrectIndex = 0;
    for (let k = 1; k < codedLength; k <<= 1) {
      if ((sum(bits.filter((_, index) => index & k)) & 1) !== 0) {
        // incorrect parity bit.
        incorrectIndex |= k;
      }
    }

    if (incorrectIndex !== 0) {
      bits[incorrectIndex] = 1 - bits[incorrectIndex];
    }
    this.ns.print(incorrectIndex);
    this.ns.print(bits.join(""));

    const regularParityBits = Math.round(Math.log2(codedLength));
    for (let k = 1 << (regularParityBits - 1); k >= 1; k >>= 1) {
      bits.splice(k, 1);
    }
    bits.splice(0, 1);
    this.ns.print(bits.join(""));

    let result = 0;
    bits.reverse();
    for (let i = 0; i < bits.length; i++) {
      result |= bits[i] << i;
    }
    this.ns.print(result);

    return result;
  }

  "HammingCodes: Integer to Encoded Binary"(data: number) {
    const binaryLength = Math.floor(Math.log2(data + 0.001)) + 1;
    let regularParityBits;
    for (regularParityBits = 0; regularParityBits < 100; regularParityBits++) {
      const maxMessageLength = (1 << regularParityBits) - (regularParityBits + 1);
      if (maxMessageLength >= binaryLength) break;
    }
    const codedLength = binaryLength + regularParityBits + 1;
    this.ns.print(`coded length: ${codedLength}`);
    const bits = range(binaryLength)
      .reverse()
      .map((k) => rshift(data, k) & 1);

    // insert overall parity bit and normal parity bits
    bits.splice(0, 0, 2);
    for (let k = 1; k < codedLength; k <<= 1) {
      bits.splice(k, 0, 2);
    }

    // compute parity bits
    for (let k = 1; k < codedLength; k <<= 1) {
      bits[k] = sum(bits.filter((_, index) => index & k)) & 1;
    }

    bits[0] = sum(bits) % 2;

    return bits.join("");
  }

  "Merge Overlapping Intervals"(data: [number, number][]) {
    data.sort(([xMin], [yMin]) => xMin - yMin);
    this.ns.print(data);
    const result = [];
    let workingRange: [number, number] | null = null;
    for (const [min, max] of data) {
      if (workingRange === null) {
        workingRange = [min, max];
      } else {
        // by sorting, lastMin <= min, and if lastMin == min, lastMax <= max.
        const [, lastMax] = workingRange;
        if (lastMax >= min) {
          // overlap, merge intervals
          workingRange[1] = Math.max(max, lastMax);
        } else {
          result.push(workingRange);
          workingRange = [min, max];
        }
      }
    }
    result.push(workingRange);
    this.ns.print(result);
    return result;
  }

  "Minimum Path Sum in a Triangle"(weights: number[][]) {
    const minimumPaths: number[][] = weights.map((row) => new Array(row.length).fill(0));
    minimumPaths[0][0] = weights[0][0];
    for (let row = 1; row < weights.length; row++) {
      for (let col = 0; col < weights[row].length; col++) {
        minimumPaths[row][col] =
          weights[row][col] +
          Math.min(
            minimumPaths[row - 1]?.[col] ?? Infinity,
            minimumPaths[row - 1]?.[col - 1] ?? Infinity
          );
      }
    }
    this.ns.print(weights);
    this.ns.print(minimumPaths);
    return Math.min(...minimumPaths[minimumPaths.length - 1]);
  }

  // "Sanitize Parentheses in Expression"(s: string) {
  // const componentOptions: string[][] = [];
  // let running = 0;
  // const lastComponentStart = 0;
  // for (let k = 0; k < s.length; k++) {
  //   if (s[k] === "(") running++;
  //   else if (s[k] === ")") running--;

  //   if (running < 0) {
  //     // move past all subsequent close parens
  //     while (k + 1 < s.length && s[k + 1] === ")") {
  //       k++;
  //       running--;
  //     }

  //     // now we have the choice of removing one from each run of close parens in the string so far
  //     const unit = s.slice(lastComponentStart, k + 1);
  //   }
  // }
  //   return null;
  // }

  "Total Ways to Sum"(n: number) {
    const coins = [...new Array(n).keys()].slice(1);
    return makeChange(this.ns, coins, coins.length - 1, n);
  }

  "Total Ways to Sum II"([sum, coins]: [number, number[]]) {
    coins.sort();
    return makeChange(this.ns, coins, coins.length - 1, sum);
  }

  "Unique Paths in a Grid I"(data: [number, number]) {
    return binomial(data[0] + data[1] - 2, data[1] - 1);
  }

  "Unique Paths in a Grid II"(data: number[][]) {
    for (const row of data) {
      this.ns.print(row);
    }

    const rows = data.length;
    const cols = data[0].length;
    const paths: number[][] = [];
    for (let i = 0; i < rows; i++) {
      paths.push(new Array(cols).fill(0));
    }

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (data[y][x] === 1) {
          paths[y][x] = 0;
        } else if (y === 0 && x === 0) {
          paths[y][x] = 1;
        } else {
          paths[y][x] = (y > 0 ? paths[y - 1][x] : 0) + (x > 0 ? paths[y][x - 1] : 0);
        }
      }
    }

    this.ns.print("solution");
    for (const row of paths) {
      this.ns.print(row);
    }
    return paths[rows - 1][cols - 1];
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.tail();

  const solvers = new Solvers(ns);

  for (const [host, contracts] of findContracts(ns)) {
    for (const contract of contracts) {
      const type = ns.codingcontract.getContractType(contract, host);
      ns.print(`${host} ${contract} ${type}`);
      if (type in solvers) {
        const data = ns.codingcontract.getData(contract, host);
        ns.print(`solving with data ${data}`);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const solution: string | number | any[] | null = solvers[type](data);
        if (solution !== null) {
          ns.print(`attempting ${solution}`);
          const result = ns.codingcontract.attempt(solution, contract, host, {
            returnReward: true,
          });
          ns.print(result !== "" ? `SUCCESS: ${result}` : "FAILURE");
        }
      }
    }
  }
}
