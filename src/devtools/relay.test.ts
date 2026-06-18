import { describe, it, expect } from 'vitest';
import type { InterceptReport } from '../engine/page/types';
import type { PanelReportMessage, RelayPort } from './types';
import { ReportRelay, MAX_BUFFERED } from './relay';

type FakePort = {
  posted: PanelReportMessage[];
  postMessage(message: PanelReportMessage): void;
  onDisconnect: { addListener(listener: () => void): void };
  fireDisconnect(): void;
};

const makePort = (): FakePort => {
  const posted: PanelReportMessage[] = [];
  let disc: (() => void) | undefined;
  return {
    posted,
    postMessage: (message: PanelReportMessage) => {
      posted.push(message);
    },
    onDisconnect: {
      addListener: (listener: () => void) => {
        disc = listener;
      },
    },
    fireDisconnect: () => disc?.(),
  };
};

const buildReport = (overrides: Partial<InterceptReport> = {}): InterceptReport => ({
  kind: 'mock',
  method: 'GET',
  url: 'https://api.example.com/users',
  status: 200,
  body: '{"ok":true}',
  ...overrides,
});

const asPort = (port: FakePort): RelayPort => port as unknown as RelayPort;

describe('ReportRelay', () => {
  it('should post only to the matching tab port when several tabs are registered (TC-001)', () => {
    const relay = new ReportRelay();
    const portA = makePort();
    const portB = makePort();
    relay.register(1, asPort(portA));
    relay.register(2, asPort(portB));

    const report = buildReport();
    relay.dispatch(1, report);

    expect(portA.posted).toEqual([{ type: 'report', report }]);
    expect(portB.posted).toHaveLength(0);
  });

  it('should not throw and post nothing when dispatching to an unregistered tab (TC-002)', () => {
    const relay = new ReportRelay();
    const portA = makePort();
    relay.register(1, asPort(portA));

    expect(() => relay.dispatch(999, buildReport())).not.toThrow();
    expect(portA.posted).toHaveLength(0);
  });

  it('should auto-unregister and post nothing after the port disconnects (TC-003)', () => {
    const relay = new ReportRelay();
    const portA = makePort();
    relay.register(1, asPort(portA));

    portA.fireDisconnect();
    relay.dispatch(1, buildReport());

    expect(portA.posted).toHaveLength(0);
  });

  it('should post nothing after an explicit unregister of the tab', () => {
    const relay = new ReportRelay();
    const portA = makePort();
    relay.register(1, asPort(portA));

    relay.unregister(1);
    relay.dispatch(1, buildReport());

    expect(portA.posted).toHaveLength(0);
  });

  it('should route to the new port only when the same tab id is re-registered', () => {
    const relay = new ReportRelay();
    const oldPort = makePort();
    const newPort = makePort();
    relay.register(1, asPort(oldPort));
    relay.register(1, asPort(newPort));

    const report = buildReport();
    relay.dispatch(1, report);

    expect(oldPort.posted).toHaveLength(0);
    expect(newPort.posted).toEqual([{ type: 'report', report }]);
  });

  it('should flush reports buffered before the panel connected on register', () => {
    const relay = new ReportRelay();
    const early = buildReport({ url: 'https://api.x/early' });
    relay.dispatch(1, early);

    const port = makePort();
    relay.register(1, asPort(port));

    expect(port.posted).toEqual([{ type: 'report', report: early }]);
  });

  it('should preserve buffered order and then deliver live reports', () => {
    const relay = new ReportRelay();
    const first = buildReport({ url: 'https://api.x/1' });
    const second = buildReport({ url: 'https://api.x/2' });
    relay.dispatch(1, first);
    relay.dispatch(1, second);

    const port = makePort();
    relay.register(1, asPort(port));
    const live = buildReport({ url: 'https://api.x/3' });
    relay.dispatch(1, live);

    expect(port.posted.map((m) => m.report.url)).toEqual([
      'https://api.x/1',
      'https://api.x/2',
      'https://api.x/3',
    ]);
  });

  it('should not replay the buffer to a second port registered after the first drained it', () => {
    const relay = new ReportRelay();
    relay.dispatch(1, buildReport({ url: 'https://api.x/early' }));

    const first = makePort();
    relay.register(1, asPort(first));
    first.fireDisconnect();

    const second = makePort();
    relay.register(1, asPort(second));

    expect(second.posted).toHaveLength(0);
  });

  it('should cap the buffer at MAX_BUFFERED dropping the oldest', () => {
    const relay = new ReportRelay();
    const total = MAX_BUFFERED + 10;
    for (let index = 0; index < total; index += 1) {
      relay.dispatch(1, buildReport({ url: `https://api.x/${index}` }));
    }

    const port = makePort();
    relay.register(1, asPort(port));

    expect(port.posted).toHaveLength(MAX_BUFFERED);
    expect(port.posted[0].report.url).toBe(`https://api.x/${total - MAX_BUFFERED}`);
    expect(port.posted[MAX_BUFFERED - 1].report.url).toBe(`https://api.x/${total - 1}`);
  });
});
