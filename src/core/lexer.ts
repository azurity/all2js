import { SourceLocation } from "estree";

export interface Token {
  type: string | symbol;
  loc: SourceLocation;
}

interface LexerOption {
  classes: {
    type: string;
    regex: string;
  }[];
}

interface Matcher {
  type: string;
  regex: RegExp;
}

const eof = Symbol.for("EOF");

export default class Lexer {
  matchers: Matcher[] = [];
  eof: symbol = eof;
  wordset: Set<string | symbol> = new Set();

  constructor(option: LexerOption) {
    this.wordset.add(eof);
    for (let c of option.classes) {
      if (this.wordset.has(c.type)) {
        throw new Error(`repeated words: ${c.type}`);
      }
      let regex = c.regex;
      if (c.regex.codePointAt(0) !== "^".codePointAt(0)) {
        regex = "^" + c.regex;
      }
      if (regex.length === 1 || regex === "^$") {
        throw new Error("wrong RegExp");
      }
      this.matchers.push({ type: c.type, regex: new RegExp(regex) });
      this.wordset.add(c.type);
    }
  }

  it(code: string) {
    return lexGenerator(code, this);
  }
}

function* lexGenerator(code: string, self: Lexer) {
  let currentCode = code.slice(0);
  let line = 1;
  let column = 0;
  while (currentCode.length > 0) {
    let success = false;
    let match = "";
    for (let m of self.matchers) {
      let result = m.regex.exec(currentCode);
      if (result === null) {
        continue;
      }
      if (typeof result[0] === "string") {
        match = result[0];
        success = true;
        let lines = match.split("\n");
        let start = { line, column };
        line += lines.length - 1;
        if (lines.length > 1) {
          column = 0;
        }
        column += lines[lines.length - 1].length;
        let end = { line, column };
        currentCode = currentCode.slice(match.length);
        if (m.type === "") {
          break;
        }
        yield {
          type: m.type,
          loc: { source: match, start, end }
        } as Token;
        break;
      }
    }
    if (!success) {
      throw "";
    }
  }
  yield {
    type: self.eof,
    loc: { source: "", start: { line, column }, end: { line, column } }
  };
  return;
}
