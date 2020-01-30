import clone from "clone";

const S = Symbol.for("START");
// const eof = Symbol.for("EOF");

interface ParserOption {
  rules: {
    left: string;
    right: string[];
  }[];
  k: number;
}

type GrammarSymbol = string | symbol;
type LookupSymbol = GrammarSymbol | null;

type ItemSetContent = {
  rule: { left: GrammarSymbol; content: string[] };
  ruleIndex: number;
  rest: GrammarSymbol[];
  lookup: Set<LookupSymbol>;
}[];

function arrayEqual<T>(arr1: Array<T>, arr2: Array<T>) {
  var length = arr1.length;
  if (length !== arr2.length) return false;
  for (var i = 0; i < length; i++) if (arr1[i] !== arr2[i]) return false;
  return true;
}

function ruleEqual(
  left: { left: GrammarSymbol; content: string[] },
  right: { left: GrammarSymbol; content: string[] }
) {
  return left.left === right.left && arrayEqual(left.content, right.content);
}

function calcFirst(
  rest: string[],
  tail: Set<LookupSymbol>,
  firstSet: Map<GrammarSymbol, Set<LookupSymbol>>
) {
  let result = new Set(tail);
  let nullish = false;
  for (let i = 0; i < rest.length; i++) {
    if (!firstSet.has(rest[i])) {
      result.add(rest[0]);
    } else {
      nullish = false;
      for (let s of firstSet.get(rest[i])!) {
        result.add(s);
        if (s === null) {
          nullish = true;
        }
      }
      if (!nullish) {
        break;
      }
    }
  }
  if (nullish) {
    for (let t of tail) {
      result.add(t);
    }
  }
  return result;
}

class ItemSet {
  items: ItemSetContent = [];
  firstSet: Map<GrammarSymbol, Set<LookupSymbol>>;

  constructor(
    k: number,
    itemSet: ItemSetContent | null,
    rules: Map<GrammarSymbol, { content: string[]; index: number }[]>,
    firstSet: Map<GrammarSymbol, Set<LookupSymbol>>,
    nonterminator: Set<GrammarSymbol>
  ) {
    this.firstSet = firstSet;
    if (itemSet === null) {
      itemSet = [
        {
          rule: { left: S, content: rules.get(S)![0].content },
          ruleIndex: 0,
          rest: ["Program"],
          lookup: new Set([null])
        }
      ];
    }
    this.items = clone(itemSet); // JSON.parse(JSON.stringify(itemSet));
    // closure
    for (let it of this.items) {
      if (it.rest.length === 0) {
        continue;
      }
      if (nonterminator.has(it.rest[0])) {
        for (let r of rules.get(it.rest[0])!) {
          let newItem = {
            rule: { left: it.rest[0], content: r.content },
            ruleIndex: r.index,
            rest: r.content,
            lookup: calcFirst(it.rest.slice(1) as string[], it.lookup, firstSet)
          };
          let exist = false;
          for (let item of this.items) {
            if (
              ruleEqual(item.rule, newItem.rule) &&
              arrayEqual(item.rest, newItem.rest) &&
              item.ruleIndex === newItem.ruleIndex
            ) {
              for (let s of newItem.lookup) {
                item.lookup.add(s);
              }
              exist = true;
              break;
            }
          }
          if (!exist) {
            this.items.push(newItem);
          }
        }
      }
    }
  }

  it() {
    return this.items
      .map(val => (val.rest.length > 0 ? val.rest[0] : null))
      .filter(val => val !== null) as GrammarSymbol[];
  }

  go(gs: GrammarSymbol) {
    return this.items
      .map(value => {
        if (value.rest.length == 0 || value.rest[0] !== gs) {
          return null;
        }
        return {
          rule: value.rule,
          ruleIndex: value.ruleIndex,
          rest: value.rest.slice(1),
          lookup: value.lookup
        };
      })
      .filter(val => val !== null) as ItemSetContent;
  }

  equal(newSet: ItemSet): boolean {
    if (this.items.length !== newSet.items.length) {
      return false;
    }
    let copy = clone(this.items); // JSON.parse(JSON.stringify(this.items));
    for (let it of newSet.items) {
      let found = false;
      for (let i = 0; i < copy.length; i++) {
        if (
          ruleEqual(it.rule, copy[i].rule) &&
          arrayEqual(it.rest, copy[i].rest)
        ) {
          copy.splice(i, 1);
          found = true;
          break;
        }
      }
      if (!found) {
        return false;
      }
    }
    return copy.length === 0;
  }

  resolution() {
    return this.items
      .filter(value => value.rest.length === 0)
      .map(value =>
        [...value.lookup.values()].map(val => ({
          index: val,
          action: { resolution: true, aim: value.ruleIndex }
        }))
      )
      .reduce((pre, val) => pre.concat(val), []);
  }
}

export default class Parser {
  start = S;
  terminator: Set<GrammarSymbol> = new Set();
  nonterminator: Set<GrammarSymbol> = new Set();
  rules: { left: string; len: number }[] = [];
  machine: Map<
    LookupSymbol /* will change if k >= 2 */,
    { resolution: boolean; aim: number }
  >[] = [new Map()];

  constructor(option: ParserOption) {
    let opt = Object.assign({}, option);
    if (opt.k !== 0 && opt.k !== 1) {
      throw new Error("neither LR(0) nor LR(1)");
    }
    let firstSet: Map<GrammarSymbol, Set<LookupSymbol>> = new Map();
    // this.terminator.add(eof);
    this.nonterminator.add(S);
    firstSet.set(S, new Set());
    let ruleMap = new Map<
      GrammarSymbol,
      { content: string[]; index: number }[]
    >();
    for (let i = 0; i < opt.rules.length; i++) {
      let r = opt.rules[i];
      if (!ruleMap.has(r.left)) {
        ruleMap.set(r.left, []);
      }
      ruleMap.get(r.left)!.push({ content: r.right, index: i + 1 });
      this.rules.push({ left: r.left, len: r.right.length });
      this.nonterminator.add(r.left);
      if (!firstSet.has(r.left)) {
        firstSet.set(r.left, new Set());
      }
    }
    ruleMap.set(S, [{ content: ["Program"], index: 0 }]);
    //
    let unfinish = true;
    while (unfinish) {
      unfinish = false;
      for (let r of opt.rules) {
        if (r.right.length === 0) {
          if (!firstSet.get(r.left)!.has(null)) {
            unfinish = true;
            firstSet.get(r.left)!.add(null);
          }
        } else {
          for (let s of r.right) {
            if (!this.nonterminator.has(s)) {
              this.terminator.add(s);
              if (!firstSet.get(r.left)!.has(s)) {
                unfinish = true;
                firstSet.get(r.left)!.add(s);
              }
              break;
            } else {
              let c = false;
              for (let sf of firstSet.get(s)!) {
                if (!firstSet.get(r.left)!.has(sf)) {
                  unfinish = true;
                  firstSet.get(r.left)!.add(sf);
                  if (sf === null) {
                    c = true;
                  }
                }
              }
              if (!c) {
                break;
              }
            }
          }
        }
      }
    }
    //
    let itemSet: ItemSet[] = [];
    itemSet.push(
      new ItemSet(opt.k, null, ruleMap, firstSet, this.nonterminator)
    );
    let searchIndex = 0;
    while (searchIndex < itemSet.length) {
      for (let it of itemSet[searchIndex].it()) {
        let newSet = new ItemSet(
          opt.k,
          itemSet[searchIndex].go(it),
          ruleMap,
          firstSet,
          this.nonterminator
        );
        if (
          !itemSet
            .map(value => value.equal(newSet))
            .reduce((pre, cur) => pre || cur, false)
        ) {
          this.machine[searchIndex].set(it, {
            resolution: false,
            aim: itemSet.length
          });
          itemSet.push(newSet);
          this.machine.push(
            new Map(newSet.resolution().map(val => [val.index, val.action]))
          );
        }
      }
      searchIndex += 1;
    }
  }
}
