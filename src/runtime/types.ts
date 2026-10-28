export type Value = {type:string; value:string; id?:string};
export type TraceEvent = {seq:number; kind:string; line:number; file?:string; name?:string; locals?:Record<string,Value>; stack?:string[]; text?:string; world?:{x:number;y:number;direction:number;action:string}; explanation?:string};
export type RunOptions = {code:string; mode:'normal'|'slow'; files?:Record<string,string>; packages?:string[]; inputs?:string[]};
export type RuntimeCallbacks = {onStatus:(status:string)=>void; onOutput:(text:string,channel:'stdout'|'stderr')=>void; onEvent:(event:TraceEvent)=>void; onInput:()=>void; onDone:(error?:string)=>void};
export type Completion = {label:string; kind:string; detail?:string; insertText?:string};
export interface RuntimeClient {init():Promise<void>; run(options:RunOptions):Promise<void>; stop():void; provideInput(text:string):void; dispose():void; install(packages:string[]):Promise<void>}
