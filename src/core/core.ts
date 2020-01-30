import Lexer from "./lexer";
import Parser from "./parser";
import { MakeNodeType, ArgType } from "./factory";
import clone from "clone";
import { Program, SourceLocation } from "estree";

export interface ProgramWithLang {
  type: "ProgramWithLang";
  sourceType: "script" | "module";
  lang: string;
}

interface CompilerOption {
  lexer: Lexer;
  parser: Parser;
  factory: MakeNodeType;
  post: Map<string, (node: ProgramWithLang) => ProgramWithLang | Program>;
}

interface Option {
  sourceType: "script" | "module";
}

const DefaultCompileOption: Option = {
  sourceType: "script"
};

export class Compiler {
  lexer: Lexer;
  parser: Parser;
  factory: MakeNodeType;
  post: Map<string, (node: ProgramWithLang) => ProgramWithLang | Program>;

  constructor(option: CompilerOption) {
    this.lexer = option.lexer;
    this.parser = option.parser;
    this.factory = option.factory;
    this.post = option.post;
  }

  compile(code: string, option: Option) {
    let opt = Object.assign({}, DefaultCompileOption);
    opt = Object.assign(opt, option);
    //
    let context: any = {};
    let wordStack: ArgType[] = [];
    let NonTermStack: { type: string; node: ArgType }[] = [];
    let stateStack = [0];
    let iter = this.lexer.it(code);
    let word = iter.next();
    let finished = false;
    while (true) {
      if (word.done) {
        if (!finished) {
          throw new Error("unexpected EOF");
        } else {
          break;
        }
      }
      let type: string | symbol | null = word.value.type;
      if (type === this.lexer.eof) {
        type = null;
      }
      if (NonTermStack.length != 0) {
        type = NonTermStack[NonTermStack.length - 1].type;
      }
      let action = this.parser.machine[stateStack[stateStack.length - 1]].get(
        type
      )!;
      if (action === undefined) {
        throw new Error("unknown code");
      }
      if (!action.resolution) {
        if (NonTermStack.length != 0) {
          let NonTerm = NonTermStack.pop()!;
          wordStack.push(NonTerm.node);
          stateStack.push(action.aim);
        } else {
          wordStack.push(word.value as { type: string; loc: SourceLocation });
          stateStack.push(action.aim);
          word = iter.next();
        }
      } else {
        if (action.aim === 0) {
          finished = true;
          word = iter.next();
          continue;
        }
        let len = this.parser.rules[action.aim - 1].len;
        let words = wordStack.slice(wordStack.length - len, wordStack.length);
        wordStack = clone(wordStack.slice(0, wordStack.length - len));
        stateStack = stateStack.slice(0, stateStack.length - len);
        NonTermStack.push({
          type: this.parser.rules[action.aim - 1].left,
          node: this.factory(
            this.parser.rules[action.aim - 1].left,
            opt.sourceType,
            words,
            context
          )
        });
      }
    }
    let node = wordStack[0];
    if (node.type !== "ProgramWithLang" && node.type !== "Program") {
      throw new Error("wrong root node type");
    }
    while (node.type === "ProgramWithLang") {
      let n = node as ProgramWithLang;
      if (!this.post.has(n.lang)) {
        throw new Error(`can't process node ${n.lang}`);
      }
      node = this.post.get(n.lang)!(n);
    }
    return node;
  }

  compileScript(code: string, option: Option) {
    let opt = Object.assign({}, option);
    opt = Object.assign(opt, { sourceType: "script" });
    return this.compile(code, opt);
  }
}
