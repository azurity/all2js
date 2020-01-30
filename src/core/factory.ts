import { Node, SourceLocation } from "estree";

export type ArgType = Node | { type: string; [x: string]: any };

export type MakeNodeType = (
  type: string,
  sourceType: "script" | "module",
  nodes: ArgType[],
  context: any
) => { type: string; [x: string]: any };
