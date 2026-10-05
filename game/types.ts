export type PlotStatus = 'empty'|'prepared'|'planted'|'growing'|'ready';
export type QualityGrade = 'A'|'B'|'C';
export type Weather = 'sunny'|'rain'|'storm';
export type Product = 'freshGinger'|'driedGinger'|'gingerPowder';
export interface Plot { id:number; x:number; z:number; status:PlotStatus; growth:number; moisture:number; health:number; }
export interface Mission { id:string; title:string; description:string; target:number; progress:number; reward:number; complete:boolean; }
export interface GameState {
  day:number; cash:number; energy:number; xp:number; reputation:number; level:number;
  plots:Plot[]; freshGinger:number; driedGinger:number; gingerPowder:number;
  processing:number; warehouse:number; workers:number; weather:Weather;
  marketPrice:number; lastRevenue:number; totalRevenue:number; totalExports:number;
  missions:Mission[]; toast:string;
}
