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
    debug(`[Agent] RequestConfirmation(${deviceMac}, passkey=${passkey})`);

    if (deviceMac === this.manager.deviceAddr?.toUpperCase()) {
      debug('[Agent] Auto-accepting pairing with G7');
      return; // This confirms "Yes"
    }

    debug('[Agent] Rejecting unknown device');
    throw new dbus.errors.DBusError('org.bluez.Error.Rejected', 'MAC mismatch');
  }

  // eslint-disable-next-line class-methods-use-this
  async AuthorizeService(device, uuid) {
    debug(`[Bluetooth Agent] Authorizing service ${uuid} for ${device}`);
  }

  async RequestAuthorization(devicePath) {
    const deviceMac = BluetoothAgent.extractMacFromPath(devicePath);
    debug(`[Agent] RequestAuthorization for ${deviceMac}`);

    if (deviceMac === this.manager.deviceAddr?.toUpperCase()) {
      return;
    }
    throw new dbus.errors.DBusError('org.bluez.Error.Rejected', 'MAC mismatch');
  }

  // eslint-disable-next-line class-methods-use-this
  RequestPasskey(devicePath) {
    debug(`[Agent] RequestPasskey for ${devicePath} - returning 000000`);
    return 0; // or any 6-digit number if needed
  }

  // eslint-disable-next-line class-methods-use-this
  Cancel() {
    debug('[Bluetooth Agent] Cancel called');
  }
}

BluetoothAgent.configureMembers({
  methods: {
    Release: {
      inSignature: '',
      outSignature: '',
    },
    RequestConfirmation: {
      inSignature: 'ou',
      outSignature: '',
    },
    AuthorizeService: {
      inSignature: 'os',
      outSignature: '',
    },
    RequestAuthorization: {
      inSignature: 'o',
      outSignature: '',
    },
    RequestPasskey: {
      inSignature: 'o',
      outSignature: 'u',
    },
    Cancel: {
      inSignature: '',
      outSignature: '',
    },
  },
});

// Cleanup function
const cleanupBluetoothAgent = async (manager, objectPath) => {
  try {
    if (manager && objectPath) {
      await manager.UnregisterAgent(objectPath);
      debug('Bluetooth agent unregistered');
    }
  } catch (err) {
    debug('Error while unregistering agent:', err.message);
  }
};

const setupBluetoothAgentCleanup = async (manager, objectPath) => {
  const shutdown = async () => {
    debug('\nShutting down...');
    await cleanupBluetoothAgent(manager, objectPath);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', () => {
    // Final safety net
    cleanupBluetoothAgent(manager, objectPath).catch(() => {});
  });
};

const registerBluetoothAgent = async (manager) => {
  try {
    const agent = new BluetoothAgent(manager);

    const objectPath = '/org/bluez/agent';

    // Request a D-Bus name (optional but cleaner)
    await manager.bus.requestName('org.bluez.Agent').catch(() => {
      debug('[Bluetooth Agent] Could not request D-Bus name, continuing anyway...');
    });

    // Export the agent object
    manager.bus.export(objectPath, agent);
    debug(`[Bluetooth Agent] Agent exported at ${objectPath} with unique bus name: ${manager.bus.name}`);

    // Get AgentManager interface
    const obj = await manager.bus.getProxyObject('org.bluez', '/org/bluez');
    const agentManager = obj.getInterface('org.bluez.AgentManager1');

    // Register the agent
    await agentManager.RegisterAgent(objectPath, 'KeyboardDisplay');
    debug('[Bluetooth Agent] Bluetooth agent registered successfully');

    // Set as default agent
    await agentManager.RequestDefaultAgent(objectPath);
    debug('[Bluetooth Agent] Default agent set');

    // Setup cleanup on exit
    setupBluetoothAgentCleanup(agentManager, objectPath);
  } catch (err) {
    debug(`[Bluetooth Agent] Failed to register Bluetooth agent: ${err.message}`);
  }
};

const trustDevice = async (manager) => {
  const envAdapter = process.env.NOBLE_HCI_DEVICE_ID ? `hci${process.env.NOBLE_HCI_DEVICE_ID}` : null;

  const hci = envAdapter
    || 'hci0';

  const macAddress = manager.deviceAddr;

  if (!macAddress) {
    return;
  }

  try {
    const devicePath = BluetoothAgent.macToDevicePath(macAddress, hci);
    const deviceObj = await manager.bus.getProxyObject('org.bluez', devicePath);

    const props = deviceObj.getInterface('org.freedesktop.DBus.Properties');

    debug(`Trusting device ${macAddress}...`);
    await props.Set(
      'org.bluez.Device1',
      'Trusted',
      new dbus.Variant('b', true),
    );
    debug('Device is now trusted');
  } catch (err) {
    debug('Failed to trust/pair device:', err.message);
    throw err;
  }
};

module.exports = {
  registerBluetoothAgent,
  trustDevice,
};
