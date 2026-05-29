import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import App from '../App';

// Simple WebSocket mock that allows tests to push messages
class MockWebSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 1;
    MockWebSocket.instances.push(this);
    // emulate open
    setTimeout(() => this.onopen && this.onopen(), 0);
  }
  send() {}
  close() {}
  static clear() {
    MockWebSocket.instances = [];
  }
  static trigger(msg) {
    const text = JSON.stringify(msg);
    for (const inst of MockWebSocket.instances) {
      if (inst.onmessage) inst.onmessage({ data: text });
    }
  }
}

describe('WebSocket integration (partial/full DEVICES_TRAFFIC)', () => {
  beforeEach(() => {
    // mock global WebSocket
    global.WebSocket = MockWebSocket;
    MockWebSocket.clear();

    // basic fetch mock: /devices and /segments return empty lists
    global.fetch = jest.fn((url) => {
      if (url.includes('/devices')) {
        return Promise.resolve({ json: () => Promise.resolve({ devices: [] }) });
      }
      if (url.includes('/segments')) {
        return Promise.resolve({ json: () => Promise.resolve({ segment_scaffold: null }) });
      }
      if (url.includes('/traffic')) {
        return Promise.resolve({ json: () => Promise.resolve({ mbps: 0 }) });
      }
      if (url.includes('/logs')) {
        return Promise.resolve({ json: () => Promise.resolve({ logs: [] }) });
      }
      return Promise.resolve({ json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    MockWebSocket.clear();
    jest.resetAllMocks();
    delete global.WebSocket;
  });

  test('NEW_DEVICE and partial DEVICES_TRAFFIC update device card', async () => {
    await act(async () => {
      render(<App />);
    });

    // wait for websocket instance to be created
    await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0));

    // send NEW_DEVICE
    act(() => {
      MockWebSocket.trigger({ event: 'NEW_DEVICE', data: { ip: '10.0.0.5', mac: 'aa:bb:cc', vendor: 'TestVendor', device_type: 'Phone', status: 'Allowed', display_name: 'Test Device' } });
    });

    // device IP should appear on the card (may appear multiple times in layout)
    const ipMatches = await screen.findAllByText('10.0.0.5');
    expect(ipMatches.length).toBeGreaterThan(0);

    // send partial traffic update
    act(() => {
      MockWebSocket.trigger({ event: 'DEVICES_TRAFFIC', partial: true, data: { '10.0.0.5': { mbps: 1.23, total_mb: 5, total_bytes: 5242880, history: [] } } });
    });

    // live rate should update (match 1.23x MB/s format)
    const rateMatches = await screen.findAllByText(/1\.23\d*\s*MB\/s/);
    expect(rateMatches.length).toBeGreaterThan(0);
  }, 20000);
});
