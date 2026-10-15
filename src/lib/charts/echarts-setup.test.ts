import { describe, expect, it } from 'vitest';
import { REGISTERED_MODULES, echarts } from './echarts-setup';
import { requiredEchartsModules } from './registry';

describe('echarts-setup', () => {
  it('registers every module any ChartDef lists, and no unused module (rule R-DELETE)', () => {
    const required = requiredEchartsModules();
    const missing = required.filter((m) => !REGISTERED_MODULES.includes(m));
    const unused = REGISTERED_MODULES.filter((m) => !required.includes(m));
    expect(missing).toEqual([]);
    expect(unused).toEqual([]);
  });

  it('exposes the echarts core namespace', () => {
    expect(typeof echarts.init).toBe('function');
    expect(typeof echarts.use).toBe('function');
  });
});
