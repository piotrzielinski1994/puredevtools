import { describe, it, expect } from 'vitest';
import type { InterceptReport } from '../engine/page/types';
import type { PanelReportMessage, RelayPort } from './types';
import { ReportRelay } from './relay';

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
});
