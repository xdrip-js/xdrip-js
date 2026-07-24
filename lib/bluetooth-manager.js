const { createBluetooth } = require('node-ble');
const dbus = require('dbus-next');
const debug = require('debug')('bluetooth-manager');
const bluetoothAgent = require('./bluetooth-agent');
const SerialOperationQueue = require('./serial-operation-queue');
const UUID = require('./bluetooth-services');

const UUIDToName = Object.fromEntries(
  Object.entries(UUID.CGMServiceCharacteristic).map(([name, uuid]) => [uuid, name]),
);

module.exports = class BluetoothManager {
  constructor(delegate) {
    this.characteristicsMap = new Map();
    this.delegate = delegate;
    this.CONNECT_TIMEOUT_MS = 10000;
    this.device = null;
    this.connectSuccess = false;
    this.connectsAttempted = 0;
    this.lastDiscoveredAddress = null;
    this.lastDiscoveredTime = 0;
    this.isConnecting = false;
    this.connectStartTime = null;
    this.btQueue = new SerialOperationQueue('BTOps', 50);
    this.seenDevices = new Set();

    this.bus = dbus.systemBus();

    // node-ble session
    const { bluetooth, destroy } = createBluetooth();
    this.bluetooth = bluetooth;
    this.destroyBluetooth = destroy;
    this.adapter = null;

    // No more noble event listeners
    bluetoothAgent.registerBluetoothAgent(this);
  }

  async getAdapter() {
    if (!this.adapter) {
      this.adapter = await this.bluetooth.defaultAdapter();
    }
    return this.adapter;
  }

  async startDeviceDiscovery() {
    debug('Starting discovery...');
    this.keepScanning = true;

    this.startDiscovery();

    this.startDevicePolling(2500);
  }

  async initializeBluetooth() {
    debug('Initializing Bluetooth...');

    try {
      // 1. clear seen devices
      this.seenDevices.clear();

      // 2. Make sure the adapter is powered on
      await this.ensureAdapterPowered();

      this.startDeviceDiscovery();

      debug('Bluetooth initialization complete');
      return true;
    } catch (err) {
      debug(`Bluetooth initialization failed: ${err.message}`);
      throw err;
    }
  }

  startDevicePolling(intervalMs = 2500) {
    this.stopDevicePolling();

    this.devicePoller = setInterval(async () => {
      await this.checkForDevices();
    }, intervalMs);
  }

  async shutdown() {
    debug('Shutting down Bluetooth...');
    this.stopDevicePolling();
    this.stopDiscoveryWatchdog();

    try {
      await this.stopDiscovery();
    } catch (err) {
      debug(`Error stopping discovery: ${err.message}`);
    }

    if (this.destroyBluetooth) {
      this.destroyBluetooth();
    }

    this.bus.disconnect();

    debug('Bluetooth shutdown complete');
  }

  stopDevicePolling() {
    if (this.devicePoller) {
      clearInterval(this.devicePoller);
      this.devicePoller = null;
    }
    this.pollingInProgress = false;
    debug('Device polling stopped');
  }

  async ensureAdapterPowered(adapterName = null) {
    const envAdapter = process.env.NOBLE_HCI_DEVICE_ID
      ? `hci${process.env.NOBLE_HCI_DEVICE_ID}`
      : null;

    const hci = envAdapter || adapterName || 'hci0';
    const adapterPath = `/org/bluez/${hci}`;

    try {
      const obj = await this.bus.getProxyObject('org.bluez', adapterPath);
      const props = obj.getInterface('org.freedesktop.DBus.Properties');

      const poweredVariant = await props.Get('org.bluez.Adapter1', 'Powered');
      const isPowered = poweredVariant.value;

      if (!isPowered) {
        debug(`Adapter ${hci} is powered off. Turning it on...`);
        await props.Set(
          'org.bluez.Adapter1',
          'Powered',
          new dbus.Variant('b', true),
        );

        // Give BlueZ a moment to bring the adapter up
        await new Promise((resolve) => {
          setTimeout(resolve, 1200);
        });
        debug(`Adapter ${hci} powered on`);
      } else {
        debug(`Adapter ${hci} is already powered on`);
      }

      return true;
    } catch (err) {
      debug(`Failed to power on adapter ${hci}: ${err.message}`);
      throw err;
    }
  }

  async startDiscovery() {
    const adapter = await this.getAdapter();
    try {
      if (!(await adapter.isDiscovering())) {
        await adapter.startDiscovery();
        debug('Discovery started (seen devices reset)');
      }
    } catch (err) {
      debug(`startDiscovery error: ${err.message}`);
    }
  }

  async stopDiscovery() {
    try {
      const adapter = await this.getAdapter();
      if (await adapter.isDiscovering()) {
        await adapter.stopDiscovery();
      }
    } catch (err) {
      debug(`stopDiscovery error: ${err.message}`);
    }
  }

  async stopDiscoveryAndWait(timeoutMs = 3000) {
    // Stop the background loops first
    this.stopDevicePolling();

    const adapter = await this.getAdapter();

    try {
      if (await adapter.isDiscovering()) {
        debug('Stopping discovery...');
        await adapter.stopDiscovery();
      }
    } catch (err) {
      debug(`stopDiscovery error: ${err.message}`);
    }

    /* eslint-disable no-await-in-loop -- Authentication is a sequential state machine */
    // Wait until BlueZ reports that discovery is actually stopped
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const stillDiscovering = await adapter.isDiscovering().catch(() => false);
      if (!stillDiscovering) {
        debug('Discovery confirmed stopped');
        return true;
      }
      await new Promise((r) => {
        setTimeout(r, 100);
      });
    }
    /* eslint-enable no-await-in-loop -- Authentication is a sequential state machine */

    debug('Timed out waiting for discovery to stop');
    return false;
  }

  // Polling-based discovery to replace noble 'discover' event
  // Call this periodically or on demand (similar spirit to the old btScanInterval hack)
  async checkForDevices() {
    if (this.checkingDevices) {
      debug('checkForDevices already running');
      return;
    }

    this.checkingDevices = true;

    try {
      const adapter = await this.getAdapter();

      const addresses = await adapter.devices();

      // Only process devices we haven't seen yet in this discovery session
      const newAddresses = addresses.filter((addr) => !this.seenDevices.has(addr));

      if (newAddresses.length === 0) {
        return;
      }

      /* eslint-disable no-await-in-loop -- Authentication is a sequential state machine */
      for (let i = 0; i < newAddresses.length; i += 1) {
        const addr = newAddresses[i];

        try {
          const device = await adapter.getDevice(addr);

          // didDiscoverDevice will return true if it wants to poll the device again
          if (!await this.didDiscoverDevice(device)) {
            this.seenDevices.add(addr);
          }
        } catch (err) {
          debug(`Error processing device ${addr}: ${err.message}`);
        }
      }
      /* eslint-enable no-await-in-loop -- Authentication is a sequential state machine */
    } catch (err) {
      debug(`checkForDevices error: ${err.message}`);
    } finally {
      this.checkingDevices = false;
    }
  }

  async discoverServicesAndWait(timeout = 10000) {
    return this.btQueue.enqueue({
      operationName: 'discoverServicesAndWait',
      onStart: this.addDisconnectAbortHandler('discoverServicesAndWait'),
      executor: async ({ addCleanup }) => {
        const timer = setTimeout(() => {
          throw new Error('Timeout waiting for discover services');
        }, timeout);
        addCleanup(() => clearTimeout(timer));

        if (!this.device) throw new Error('No device');

        const gatt = await this.device.gatt();
        const service = await gatt.getPrimaryService(UUID.TransmitterService.CGMService);

        return service;
      },
    });
  }

  async discoverCharacteristicsAndWait(service, timeout = 10000) {
    return this.btQueue.enqueue({
      operationName: 'discoverCharacteristicsAndWait',
      onStart: this.addDisconnectAbortHandler('discoverCharacteristicsAndWait'),
      executor: async ({ addCleanup }) => {
        const timer = setTimeout(() => {
          throw new Error('Timeout waiting for discover characteristics');
        }, timeout);
        addCleanup(() => clearTimeout(timer));

        const undiscoveredUUIDs = new Set(
          Object.values(UUID.CGMServiceCharacteristic),
        );

        const charUuids = await service.characteristics();

        await Promise.all(charUuids.map(async (uuid) => {
          try {
            const char = await service.getCharacteristic(uuid);
            this.characteristicsMap.set(uuid, char);
            undiscoveredUUIDs.delete(uuid);
          } catch (err) {
            debug(`Failed to get characteristic ${uuid}: ${err.message}`);
          }
        }));

        if (undiscoveredUUIDs.size === 0) return true;

        const remaining = [...undiscoveredUUIDs].map((uuid) => ({
          name: UUIDToName[uuid] || 'Unknown',
          uuid,
        }));
        debug(`Remaining characteristics: ${remaining.map((r) => `${r.name}(${r.uuid})`).join(', ')}`);
        return false;
      },
    });
  }

  async waitForDevice(device, address, intervalMs = 1500, timeoutMs = 3600000) {
    const start = Date.now();
    const adapter = this.getAdapter();
    let workingDevice = device;
    let receivedRSSI = false;
    let rssi = null;

    /* eslint-disable no-await-in-loop */
    while (!receivedRSSI) {
      try {
        if (!workingDevice) {
          workingDevice = await adapter.getDevice(address);
        }

        rssi = await workingDevice.getRSSI().catch(() => null);

        if (typeof rssi === 'number') {
          receivedRSSI = true;
        }
      } catch (err) {
        // Proxy went bad – force a fresh one next iteration
        workingDevice = null;
      }

      if (Date.now() - start >= timeoutMs) {
        throw new Error(`waitForDevice timed out after ${timeoutMs}ms`);
      }

      await new Promise((resolve) => {
        setTimeout(resolve, intervalMs);
      });
    }
    /* eslint-enable no-await-in-loop */

    return rssi;
  }

  // Replacement for noble 'discover' handler
  async didDiscoverDevice(device) {
    const addr = (await device.getAddress()).toUpperCase();
    const name = await device.getName().catch(() => 'Unknown');
    let rssi = await device.getRSSI().catch(() => null);

    if (name === 'Unknown') {
      return false;
    }

    debug(`Found device: ${name} | RSSI: ${rssi} | addr=${addr}`);

    if (this.lastDiscoveredAddress === addr
      && Date.now() - this.lastDiscoveredTime < 3000) {
      debug(`→ Ignoring duplicate discovery for ${addr}`);
      return false;
    }

    this.lastDiscoveredAddress = addr;
    this.lastDiscoveredTime = Date.now();

    if (!this.delegate.shouldConnect(name, addr, rssi)) {
      debug('→ shouldConnect() returned false - skipping');
      return false;
    }

    // if the device is paired, we need to wait for
    // it to start advertising
    if (typeof rssi !== 'number') {
      debug('→ shouldConnect() returned true but no RSSI - waiting for RSSI');
      this.stopDevicePolling();
      rssi = await this.waitForDevice(device, addr);
    }

    const isConnected = await device.isConnected().catch(() => false);
    if (isConnected) {
      debug('→ Skipping: already connected');
      return false;
    }

    if (this.isConnecting) {
      debug('→ Already attempting connection - skipping');
      return true;
    }

    this.isConnecting = true;
    this.device = device;
    this.deviceAddr = addr;
    this.connectSuccess = false;

    try {
      this.connectsAttempted += 1;
      this.connectStartTime = Date.now();
      debug(`Attempting to connect to ${name} (RSSI ${rssi})...`);

      // Attach disconnect listener
      device.once('disconnect', () => this.handleDisconnect());

      await Promise.race([
        device.connect(),
        new Promise((_, reject) => {
          setTimeout(
            () => {
              reject(new Error(`Connect timeout after ${this.CONNECT_TIMEOUT_MS}ms`));
            },
            this.CONNECT_TIMEOUT_MS,
          );
        }),
      ]);

      debug(`→ SUCCESS: Connected after ${Date.now() - this.connectStartTime}ms`);
      this.connectSuccess = true;
      this.isConnecting = false;

      // Discover GATT
      const gatt = await device.gatt();

      // Log every service BlueZ found
      const services = await gatt.services();
      debug('Available services:', services);

      const service = await gatt.getPrimaryService(UUID.TransmitterService.CGMService);

      const undiscovered = new Set(Object.values(UUID.CGMServiceCharacteristic));
      const charUuids = await service.characteristics();

      await Promise.all(charUuids.map(async (uuid) => {
        try {
          const char = await service.getCharacteristic(uuid);
          this.characteristicsMap.set(uuid, char);
          undiscovered.delete(uuid);
        } catch (err) {
          debug(`Failed to get characteristic ${uuid}: ${err.message}`);
        }
      }));

      if (undiscovered.size === 0) {
        this.delegate.isReady(addr, true);
      } else if (this.delegate.g7Transmitter
        && undiscovered.size === 1
        && undiscovered.has(UUID.CGMServiceCharacteristic.Communication)) {
        this.delegate.isReady(addr, false);
      } else {
        const remaining = [...undiscovered].map((uuid) => ({
          name: UUIDToName[uuid] || 'Unknown',
          uuid,
        }));
        debug(`Remaining: ${remaining.map((r) => `${r.name}(${r.uuid})`).join(', ')}`);
      }
    } catch (err) {
      debug(`→ ERROR: ${err.message || err}`);
      this.isConnecting = false;
      this.device = null;

      // Delegate sets keepScanning based on whether it wants us to keep scanning
      if (this.keepScanning && this.connectsAttempted < 10) {
        setTimeout(() => this.startDeviceDiscovery(), 5000);
      } else {
        this.delegate.didDisconnect();
      }
    }

    return true;
  }

  handleDisconnect() {
    debug(`Device disconnected - keepScanning = ${this.keepScanning}`);
    this.device = null;
    this.isConnecting = false;
    this.characteristicsMap.clear();

    if (!this.keepScanning) {
      this.delegate.didDisconnect?.();
    } else {
      setTimeout(() => this.startDeviceDiscovery(), 500);
    }
  }

  addDisconnectAbortHandler(operationName) {
    return ({ addCleanup, reject }) => {
      const disconnectHandler = () => {
        reject(new Error(`Peripheral disconnected during ${operationName}`));
      };
      if (this.device) {
        this.device.once('disconnect', disconnectHandler);
        addCleanup(() => {
          this.device?.removeListener('disconnect', disconnectHandler);
        });
      }
    };
  }

  // === Read / Write / Notify methods (adapted for node-ble) ===

  writeValueAndWait(value, uuid, delay = -1, timeout = 5000) {
    const characteristic = this.characteristicsMap.get(uuid);
    const name = UUIDToName[uuid] || 'Unknown UUID';
    if (!characteristic) {
      return Promise.reject(new Error(`Characteristic ${uuid} not found`));
    }

    return this.btQueue.enqueue({
      operationName: `writeValueAndWait to ${name}(${uuid})`,
      delayMs: delay >= 0 ? delay : this.btQueue.defaultDelayMs,
      onStart: this.addDisconnectAbortHandler(`writeValueAndWait from ${name}(${uuid})`),
      executor: async ({ addCleanup }) => {
        const timer = setTimeout(() => {
          throw new Error(`Write And Wait timeout for ${name}(${uuid})`);
        }, timeout);
        addCleanup(() => clearTimeout(timer));

        try {
          const flags = await characteristic.getFlags().catch((e) => e.message);
          const notifying = await characteristic.isNotifying().catch((e) => e.message);

          debug(`Auth char flags: ${JSON.stringify(flags)}`);
          debug(`Auth char isNotifying: ${notifying}`);
          debug(`About to writeValue (with response): ${value.toString('hex')}`);

          await characteristic.writeValueWithResponse(value); // with response by default
          debug(`Tx ${value.toString('hex')} to ${name}(${uuid})`);
        } catch (err) {
          debug(`Tx ${value.toString('hex')} to ${name}(${uuid}) FAILED: ${err.message}`);
          throw err;
        }
      },
    });
  }

  readValueAndWait(uuid, firstByte = null, delay = -1, timeout = 3000) {
    const characteristic = this.characteristicsMap.get(uuid);
    const name = UUIDToName[uuid] || 'Unknown UUID';
    if (!characteristic) {
      return Promise.reject(new Error(`Characteristic ${uuid} not found`));
    }

    return this.btQueue.enqueue({
      operationName: `readValueAndWait from ${name}(${uuid})`,
      delayMs: delay >= 0 ? delay : this.btQueue.defaultDelayMs,
      onStart: this.addDisconnectAbortHandler(`readValueAndWait from ${name}(${uuid})`),
      executor: async ({ addCleanup }) => {
        const timer = setTimeout(() => {
          throw new Error(`Read timeout for ${name}(${uuid})`);
        }, timeout);
        addCleanup(() => clearTimeout(timer));

        try {
          const data = await characteristic.readValue();
          debug(`Rx ${data.toString('hex')} from ${name}(${uuid})`);

          if (!firstByte || data[0] === firstByte) {
            return data;
          }
          throw new Error(`received ${data.toString('hex')}, expecting ${firstByte.toString(16)}`);
        } catch (err) {
          debug(`Rx from ${name}(${uuid}) FAILED: ${err.message}`);
          throw err;
        }
      },
    });
  }

  setNotifyEnabledAndWait(enabled, uuid, timeout = 3000) {
    const name = UUIDToName[uuid] || 'Unknown UUID';
    const characteristic = this.characteristicsMap.get(uuid);
    if (!characteristic) {
      return Promise.reject(new Error(`Characteristic ${uuid} not found`));
    }

    debug(`setting notify to ${enabled} for ${name}(${uuid})`);

    return this.btQueue.enqueue({
      operationName: `setNotifyEnabledAndWait on ${name}(${uuid})`,
      delayMs: 0,
      onStart: this.addDisconnectAbortHandler(`setNotifyEnabledAndWait on ${name}(${uuid})`),
      executor: async ({ addCleanup }) => {
        const timer = setTimeout(() => {
          throw new Error(`Timeout enabling notifications for ${name}(${uuid})`);
        }, timeout);
        addCleanup(() => clearTimeout(timer));

        if (enabled) {
          await characteristic.startNotifications();
        } else {
          await characteristic.stopNotifications?.(); // if available
        }
        debug(`Successfully set notify enabled for ${name}(${uuid}) to ${enabled}`);
      },
    });
  }

  setupNotification(uuid, callback = null) {
    const characteristic = this.characteristicsMap.get(uuid);
    const name = UUIDToName[uuid] || 'Unknown UUID';
    if (!characteristic) {
      return Promise.reject(new Error(`Characteristic ${uuid} not found`));
    }

    return this.btQueue.enqueue({
      operationName: `setupNotification on ${name}(${uuid})`,
      delayMs: 0,
      onStart: this.addDisconnectAbortHandler(`setupNotification on ${name}(${uuid})`),
      executor: async () => {
        await characteristic.startNotifications();
        if (callback) {
          characteristic.on('valuechanged', callback); // ← changed from 'data'
        }
        debug(`Subscribed to ${name}(${uuid})`);
      },
    });
  }

  waitForNotification(uuid, firstByte = null, timeout = 3000) {
    const characteristic = this.characteristicsMap.get(uuid);
    const name = UUIDToName[uuid] || 'Unknown UUID';
    if (!characteristic) {
      return Promise.reject(new Error(`Characteristic ${uuid} not found`));
    }

    return this.btQueue.enqueue({
      operationName: `waitForNotification on ${name}(${uuid})`,
      delayMs: 0,
      onStart: this.addDisconnectAbortHandler(`waitForNotification on ${name}(${uuid})`),
      executor: ({ addCleanup }) => new Promise((resolve, reject) => {
        const dataHandler = (data) => {
          debug(`Rx ${data.toString('hex')} from ${name}(${uuid})`);
          if (!firstByte || data[0] === firstByte) {
            resolve(data);
          } else {
            reject(new Error(`Received ${data[0].toString(16)}, expected ${firstByte.toString(16)}`));
          }
        };

        const timer = setTimeout(() => {
          reject(new Error(`Timeout waiting for notification on ${name}(${uuid})`));
        }, timeout);

        characteristic.once('valuechanged', dataHandler); // ← changed from 'data'
        addCleanup(() => {
          clearTimeout(timer);
          characteristic.removeListener('valuechanged', dataHandler);
        });
      }),
    });
  }

  writeValueAndWaitForNotification(value, uuid, firstByte = null, delay = -1, timeout = 3000) {
    const characteristic = this.characteristicsMap.get(uuid);
    const name = UUIDToName[uuid] || 'Unknown UUID';
    if (!characteristic) {
      return Promise.reject(new Error(`Characteristic ${uuid} not found`));
    }

    return this.btQueue.enqueue({
      operationName: `writeValueAndWaitForNotification to ${name}(${uuid})`,
      delayMs: delay >= 0 ? delay : this.btQueue.defaultDelayMs,
      onStart: this.addDisconnectAbortHandler(`writeValueAndWaitForNotification to ${name}(${uuid})`),
      executor: ({ addCleanup }) => new Promise((resolve, reject) => {
        const dataHandler = (data) => {
          debug(`Rx ${data.toString('hex')} from ${name}(${uuid})`);
          if (!firstByte || data[0] === firstByte) {
            resolve(data);
          } else {
            reject(new Error(`Received ${data[0].toString(16)}, expected ${firstByte.toString(16)}`));
          }
        };

        const timer = setTimeout(() => {
          reject(new Error(`Timeout waiting for notification from ${name}(${uuid})`));
        }, timeout);

        characteristic.once('valuechanged', dataHandler);
        addCleanup(() => {
          clearTimeout(timer);
          characteristic.removeListener('valuechanged', dataHandler);
        });

        characteristic.writeValueWithResponse(value).then(() => {
          debug(`Tx ${value.toString('hex')} to ${name}(${uuid})`);
        }).catch((err) => {
          debug(`Tx FAILED: ${err.message}`);
          reject(err);
        });
      }),
    });
  }

  writeValueNoWait(value, uuid, delay = -1) {
    const characteristic = this.characteristicsMap.get(uuid);
    const name = UUIDToName[uuid] || 'Unknown UUID';
    if (!characteristic) {
      return Promise.reject(new Error(`Characteristic ${uuid} not found`));
    }

    return this.btQueue.enqueue({
      operationName: `writeValueNoWait to ${name}(${uuid})`,
      delayMs: delay >= 0 ? delay : this.btQueue.defaultDelayMs,
      onStart: this.addDisconnectAbortHandler(`writeValueNoWait to ${name}(${uuid})`),
      executor: async () => {
        await characteristic.writeValueWithoutResponse(value);
        debug(`Tx ${value.toString('hex')} to ${name}(${uuid}) (no response)`);
      },
    });
  }

  isDevicePaired(adapter = null) {
    if (!this.device) {
      return Promise.resolve(false);
    }

    const address = this.deviceAddr;

    const envAdapter = process.env.NOBLE_HCI_DEVICE_ID ? `hci${process.env.NOBLE_HCI_DEVICE_ID}` : null;

    const hci = envAdapter
      || adapter
      || 'hci0';

    const devicePath = `/org/bluez/${hci}/dev_${address
      .toUpperCase()
      .replace(/:/g, '_')}`;

    return this.btQueue.enqueue({
      operationName: `isDevicePaired ${address}`,

      executor: async (/* { addCleanup } */) => {
        try {
          const obj = await this.bus.getProxyObject(
            'org.bluez',
            devicePath,
          );

          const props = obj.getInterface(
            'org.freedesktop.DBus.Properties',
          );

          const paired = await props.Get(
            'org.bluez.Device1',
            'Paired',
          );

          return paired.value;
        } catch (err) {
          debug(
            `Error during query if device paired ${address}: ${err.message}`,
          );

          throw err;
        }
      },
    });
  }

  async createBond(maxRetries = 3, adapter = null) {
    if (!this.device) {
      return Promise.resolve(false);
    }

    const address = this.deviceAddr;

    const envAdapter = process.env.NOBLE_HCI_DEVICE_ID ? `hci${process.env.NOBLE_HCI_DEVICE_ID}` : null;

    const hci = envAdapter
      || adapter
      || 'hci0';

    const adapterPath = `/org/bluez/${hci}`;
    const devicePath = `${adapterPath}/dev_${address.toUpperCase().replace(/:/g, '_')}`;

    return this.btQueue.enqueue({
      operationName: `createBond ${address}`,

      executor: async (/* { addCleanup } */) => {
        let lastError = null;

        /* eslint-disable no-await-in-loop -- Authentication is a sequential state machine */
        for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
          try {
            debug(`createBond: Bonding attempt ${attempt}/${maxRetries} for ${address}`);

            // Small delay to let BlueZ register the device object
            if (attempt > 1) {
              await new Promise((r) => {
                setTimeout(r, 800 * attempt);
              });
            }

            const obj = await this.bus.getProxyObject('org.bluez', devicePath);
            const device = obj.getInterface('org.bluez.Device1');

            const propsIface = obj.getInterface('org.freedesktop.DBus.Properties');
            const props = await propsIface.GetAll('org.bluez.Device1');

            if (props?.Paired?.value) {
              debug(`createBond: ✅ Already bonded with ${address}`);
              return true;
            }

            debug(`createBond: 🔐 Calling Pair() on ${address}...`);

            try {
              // Use a timeout wrapper for Pair()
              const pairPromise = device.Pair();
              const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Pair() timed out')), 2000);
              });

              await Promise.race([pairPromise, timeoutPromise]);

              debug('createBond: Pair() call completed without error');
            } catch (err) {
              if (err.message.includes('timed out')) {
                debug('Pair() call timed out - checking status manually');
              } else {
                debug(`Pair() call error: ${err.message}`);
              }
            }

            // Wait a bit and verify
            await new Promise((r) => {
              setTimeout(r, 1500);
            });

            const updatedObj = await this.bus.getProxyObject('org.bluez', devicePath);

            const updatedPropsIface = updatedObj.getInterface('org.freedesktop.DBus.Properties');
            const updatedProps = await updatedPropsIface.GetAll('org.bluez.Device1');

            if (updatedProps?.Paired?.value) {
              debug(`createBond: ✅ Bonding succeeded with ${address}`);
              return true;
            }

            throw new Error('Pair() completed but Paired flag is still false');
          } catch (err) {
            lastError = err;
            debug(`createBond: Attempt ${attempt} failed: ${err.message}`);

            if (err.message.includes('interface not found')) {
              debug('createBond: BlueZ device object not ready yet - will retry');
            }

            if (attempt < maxRetries) {
              await new Promise((r) => {
                setTimeout(r, 1000);
              });
            }
          }
        }
        /* eslint-enable no-await-in-loop */

        debug(`createBond: ❌ All bonding attempts failed for ${address}. Last error: ${lastError?.message}`);
        return false;
      },
    });
  }

  unpairDevice(adapter = null) {
    if (!this.device) {
      return Promise.resolve(false);
    }

    const address = this.deviceAddr;

    const envAdapter = process.env.NOBLE_HCI_DEVICE_ID ? `hci${process.env.NOBLE_HCI_DEVICE_ID}` : null;

    const hci = envAdapter
      || adapter
      || 'hci0';

    const adapterPath = `/org/bluez/${hci}`;

    const devicePath = `${adapterPath}/dev_${address
      .toUpperCase()
      .replace(/:/g, '_')}`;

    return this.btQueue.enqueue({
      operationName: `unpairDevice ${address}`,

      executor: async (/* { addCleanup } */) => {
        try {
          const obj = await this.bus.getProxyObject(
            'org.bluez',
            adapterPath,
          );

          const adapterInterface = obj.getInterface(
            'org.bluez.Adapter1',
          );

          await adapterInterface.RemoveDevice(devicePath);

          debug(`Successfully unpaired ${address}`);

          return true;
        } catch (err) {
          debug(`Failed to unpair ${address}: ${err.message}`);
          return false;
        }
      },
    });
  }
};
