const dbus = require('dbus-next');
const debug = require('debug')('bluetooth-manager');

class BluetoothAgent extends dbus.interface.Interface {
  constructor(manager) {
    super('org.bluez.Agent1');

    this.manager = manager;
  }

  // eslint-disable-next-line class-methods-use-this
  Release() {
    debug('[Bluetooth Agent] Release called');
  }

  static extractMacFromPath(devicePath) {
    // Example path: "/org/bluez/hci0/dev_E6_06_75_8C_BC_31"
    const parts = devicePath.split('/');
    const lastPart = parts[parts.length - 1]; // "dev_E6_06_75_8C_BC_31"
    const mac = lastPart.replace('dev_', '').replace(/_/g, ':');
    return mac.toUpperCase();
  }

  static macToDevicePath(mac, adapter = 'hci0') {
    const upperMac = mac.toUpperCase().replace(/:/g, '_');
    return `/org/bluez/${adapter}/dev_${upperMac}`;
  }

  async RequestConfirmation(devicePath, passkey) {
    const deviceMac = BluetoothAgent.extractMacFromPath(devicePath);
    const peripheralMac = this.manager.peripheral?.address.toUpperCase();

    debug(`[Bluetooth Agent] Pairing request from: ${deviceMac} with key ${passkey}`);
    debug(`[Bluetooth Agent] Expected peripheral:  ${peripheralMac}`);

    if (deviceMac === peripheralMac) {
      debug('[Bluetooth Agent] MAC addresses match → Accepting pairing');
      return; // Accept
    }

    debug('[Bluetooth Agent] MAC addresses do NOT match → Rejecting pairing');
    throw new Error('Device MAC does not match expected peripheral');
  }

  // eslint-disable-next-line class-methods-use-this
  async AuthorizeService(device, uuid) {
    debug(`[Bluetooth Agent] Authorizing service ${uuid} for ${device}`);
  }

  async RequestAuthorization(devicePath) {
    const deviceMac = BluetoothAgent.extractMacFromPath(devicePath);
    const peripheralMac = this.manager.peripheral?.address.toUpperCase();

    debug(`[Bluetooth Agent] Auto-authorizing: ${deviceMac}`);
    debug(`[Bluetooth Agent] Expected peripheral:  ${peripheralMac}`);

    if (deviceMac === peripheralMac) {
      debug('[Bluetooth Agent] MAC addresses match → Authorizing');
      return; // Accept
    }

    debug('[Bluetooth Agent] MAC addresses do NOT match → Rejecting authorization');
    throw new Error('Device MAC does not match expected peripheral');
  }

  // eslint-disable-next-line class-methods-use-this
  RequestPasskey(/* device */) {
    return 0;
  }

  // eslint-disable-next-line class-methods-use-this
  Cancel() {
    debug('[Bluetooth Agent] Cancel called');
  }
}

// Cleanup function
const cleanupBluetoothAgent = async (bus, manager, objectPath) => {
  try {
    if (manager && objectPath) {
      await manager.UnregisterAgent(objectPath);
      debug('Bluetooth agent unregistered');
    }
  } catch (err) {
    debug('Error while unregistering agent:', err.message);
  }

  if (bus) {
    bus.disconnect();
    debug('D-Bus connection closed');
  }
};

const setupBluetoothAgentCleanup = async (bus, manager, objectPath) => {
  const shutdown = async () => {
    debug('\nShutting down...');
    await cleanupBluetoothAgent(bus, manager, objectPath);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', () => {
    // Final safety net
    cleanupBluetoothAgent(bus, manager, objectPath).catch(() => {});
  });
};

const registerBluetoothAgent = async (manager) => {
  let bus = null;

  try {
    bus = dbus.systemBus();

    const agent = new BluetoothAgent(manager);

    const objectPath = '/org/bluez/agent';

    // Request a D-Bus name (optional but cleaner)
    await bus.requestName('org.bluez.Agent').catch(() => {
      debug('[Bluetooth Agent] Could not request D-Bus name, continuing anyway...');
    });

    // Export the agent object
    bus.export(objectPath, agent);
    debug(`[Bluetooth Agent] Agent exported at ${objectPath}`);

    // Get AgentManager interface
    const obj = await bus.getProxyObject('org.bluez', '/org/bluez');
    const agentManager = obj.getInterface('org.bluez.AgentManager1');

    // Register the agent
    await agentManager.RegisterAgent(objectPath, 'NoInputNoOutput');
    debug('[Bluetooth Agent] Bluetooth agent registered successfully');

    // Set as default agent
    await agentManager.RequestDefaultAgent(objectPath);
    debug('[Bluetooth Agent] Default agent set');

    // Setup cleanup on exit
    setupBluetoothAgentCleanup(bus, agentManager, objectPath);
  } catch (err) {
    debug(`[Bluetooth Agent] Failed to register Bluetooth agent: ${err.message}`);
    if (bus) {
      bus.disconnect();
    }
  }
};

const trustDevice = async (manager) => {
  let bus = null;

  const envAdapter = process.env.NOBLE_HCI_DEVICE_ID ? `hci${process.env.NOBLE_HCI_DEVICE_ID}` : null;

  const hci = envAdapter
    || adapter
    || 'hci0';

  const macAddress = manager.peripheral?.address;

  if (!macAddress) {
    return;
  }

  try {
    bus = dbus.systemBus();

    const devicePath = BluetoothAgent.macToDevicePath(macAddress, hci);
    const deviceObj = await bus.getProxyObject('org.bluez', devicePath);

    // Get interfaces
    const device = deviceObj.getInterface('org.bluez.Device1');
    const props = deviceObj.getInterface('org.freedesktop.DBus.Properties');

    // 1. Trust the device (this is the key part)
    debug(`Trusting device ${macAddress}...`);
    await props.Set(
      'org.bluez.Device1',
      'Trusted',
      new dbus.Variant('b', true)   // 'b' = boolean
    );
    debug('Device is now trusted');
  } catch (err) {
    debug('Failed to trust/pair device:', err.message);
    throw err;
  }
}

module.exports = {
  registerBluetoothAgent,
  trustDevice,
};
