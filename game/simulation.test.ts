import {describe,expect,it} from 'vitest';
import {advanceDay,initialState,plantPlot,preparePlot,processGinger,sellDried} from './simulation';

describe('Harvest to Harbor simulation',()=>{
 it('prepares then plants a plot',()=>{let s=initialState();s=preparePlot(s,0);s=plantPlot(s,0);expect(s.plots[0].status).toBe('planted');expect(s.cash).toBe(492000);});
 it('grows crops and changes weather',()=>{let s=initialState();s=preparePlot(s,0);s=plantPlot(s,0);s=advanceDay(s,.7);expect(s.day).toBe(2);expect(['rain','storm','sunny']).toContain(s.weather);expect(s.plots[0].growth).toBeGreaterThan(0);});
 it('processes fresh ginger into dried ginger',()=>{let s=initialState();s={...s,freshGinger:1};s=processGinger(s);expect(s.freshGinger).toBe(0);expect(s.driedGinger).toBeCloseTo(.22);});
 it('sells dried ginger and records revenue',()=>{let s=initialState();s={...s,driedGinger:.22};s=sellDried(s);expect(s.driedGinger).toBe(0);expect(s.totalRevenue).toBeGreaterThan(0);});
});
