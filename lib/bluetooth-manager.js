/* eslint max-classes-per-file: "off" */

const dbus = require('dbus-next');
const noble = require('@abandonware/noble');
const debug = require('debug')('bluetooth-manager');

const SerialOperationQueue = require('./serial-operation-queue');
const UUID = require('./bluetooth-services');

const UUIDToName = Object.fromEntries(
  Object.entries(UUID.CGMServiceCharacteristic).map(([name, uuid]) => [uuid, name]),
);

function scanForPeripheral() {
  const serviceUUIDs = [UUID.TransmitterService.Advertisement, UUID.TransmitterService.CGMService];
  noble.startScanning(serviceUUIDs, true);
}

module.exports = class BluetoothManager {
  constructor(delegate) {
    this.characteristicsMap = new Map();
    this.delegate = delegate;
    this.peripheral = null;
    this.discoverSuccess = false;
    this.discoverFailures = 0;
    this.lastDiscoveredAddress = null;
    this.lastDiscoveredTime = 0;
    this.isConnecting = false;
    this.btQueue = new SerialOperationQueue('BTOps', 50);

    noble.on('stateChange', this.onStateChange.bind(this));
    noble.on('discover', this.didDiscover.bind(this));
    noble.on('scanStart', () => debug('on -> scanStart'));
    noble.on('scanStop', () => debug('on -> scanStop'));
  }

  onStateChange(state) {
    debug(`on -> stateChange: ${state}`);

    if (state === 'poweredOn') {
      debug('starting scanning');
      this.discoverFailures = 0;
      scanForPeripheral();
    } else {
      debug('stopping scanning');
      noble.stopScanning();
    }
  }

  didDiscover(peripheral, retry = false) {
    const addr = peripheral.address || peripheral.id;
    debug(`${Date()}: Found peripheral: ${peripheral.advertisement.localName} | RSSI: ${peripheral.rssi} | State: ${peripheral.state} | retry=${retry} | addr=${addr}`);

    if (this.lastDiscoveredAddress === addr
      && Date.now() - this.lastDiscoveredTime < 3000 && !retry) {
      debug(`→ Ignoring duplicate discovery for ${addr}`);
      return;
    }

    this.lastDiscoveredAddress = addr;
    this.lastDiscoveredTime = Date.now();

    if (!this.delegate.shouldConnect(peripheral)) {
      debug('→ shouldConnect() returned false - skipping');
      return;
    }

    if (peripheral.state !== 'disconnected') {
      debug(`→ Skipping: current state is "${peripheral.state}"`);
      if (['connecting', 'disconnecting'].includes(peripheral.state)) {
        debug('→ Forcing disconnect from stuck state');
        peripheral.disconnect();
      }
      return;
    }

    if (this.isConnecting) {
      debug('→ Already attempting connection - skipping');
      return;
    }

    this.isConnecting = true;
    this.peripheral = peripheral;
    this.discoverSuccess = false;

    const attemptConnect = () => {
      debug(`${Date()}: Attempting to connect to ${peripheral.advertisement.localName} (RSSI ${peripheral.rssi})...`);

      const connectStartTime = Date.now();

      const connectOptions = {
        connectionInterval: 12,
        connectionLatency: 0,
        supervisionTimeout: 5000,
      };

      const connectTimeout = setTimeout(() => {
        const elapsed = Date.now() - connectStartTime;
        debug(`⚠️ CONNECT TIMEOUT after ${elapsed}ms`);
        peripheral.disconnect();
      }, 5000);

      peripheral.once('connect', () => {
        clearTimeout(connectTimeout);
        debug(`→ SUCCESS: Connected after ${Date.now() - connectStartTime}ms`);
        this.discoverSuccess = true;
        this.isConnecting = false;

        peripheral.once('servicesDiscover', this.didDiscoverServices.bind(this));
        peripheral.discoverServices([UUID.TransmitterService.CGMService]);
      });

      peripheral.once('disconnect', (reason) => {
        clearTimeout(connectTimeout);
        debug(`→ DISCONNECTED after ${Date.now() - connectStartTime}ms: ${reason || 'unknown'}`);
        this.peripheral = null;
        this.isConnecting = false;
        peripheral.removeAllListeners();

        if (!this.discoverSuccess && this.discoverFailures < 30) {
          this.discoverFailures += 1;
          setTimeout(() => this.didDiscover(peripheral, true), 2500);
        } else {
          setTimeout(scanForPeripheral, 60000);
          this.delegate.didDisconnect();
        }
      });

      // Error handler
      const onError = (err) => {
        clearTimeout(connectTimeout);
        debug(`→ CONNECT ERROR: ${err.message || err}`);
        this.isConnecting = false;
        peripheral.removeListener('error', onError); // clean up
      };

      peripheral.once('error', onError);

      peripheral.connect(connectOptions);
    };

    if (!retry) {
      debug('→ Stopping scanning...');

      const onScanStop = () => {
        debug('→ scanStop received - starting connect');
        attemptConnect();
      };

      noble.once('scanStop', onScanStop);

      const stopTimeout = setTimeout(() => {
        debug('⚠️ scanStop timeout - proceeding');
        noble.removeListener('scanStop', onScanStop);
        attemptConnect();
      }, 2000);

      noble.stopScanning();
      noble.once('scanStop', () => clearTimeout(stopTimeout));
    } else {
      attemptConnect();
    }
  }

  didDiscoverServices(services) {
    debug('on -> peripheral services discovered');

    // we only searched for one service; assume we only got one
    const service = services[0];
    if (service.uuid !== UUID.TransmitterService.CGMService) {
      debug(`unexpected peripheral service discovered: ${service.uuid}`);
      return;
    }

    this.discoverSuccess = true;

    service.once('characteristicsDiscover', this.didDiscoverCharacteristics.bind(this));
    service.discoverCharacteristics();
  }

  didDiscoverCharacteristics(characteristics) {
    debug('on -> service characteristics discovered');
    const undiscoveredUUIDs = new Set(Object.keys(UUID.CGMServiceCharacteristic)
      .map((k) => UUID.CGMServiceCharacteristic[k]));
    characteristics.forEach((characteristic) => {
      const { uuid } = characteristic;
      if (undiscoveredUUIDs.has(uuid)) {
        this.characteristicsMap.set(uuid, characteristic);
        undiscoveredUUIDs.delete(uuid);
      }
    });
    if (undiscoveredUUIDs.size === 0) {
      this.delegate.isReady(this.peripheral.address);
    } else if (this.delegate.g7Transmitter
      && (undiscoveredUUIDs.size === 1)
      && undiscoveredUUIDs.has(UUID.CGMServiceCharacteristic.Communication)) {
      this.delegate.isReady(this.peripheral.address);
    } else {
      const remaining = [...undiscoveredUUIDs].map((uuid) => ({
        name: UUIDToName[uuid] || 'Unknown',
        uuid,
      }));

      debug(`Remaining: ${remaining.map((r) => `${r.name}(${r.uuid})`).join(', ')}`);
    }
  }

  addDisconnectAbortHandler(operationName) {
    return ({ addCleanup, reject }) => {
      const disconnectHandler = () => {
        reject(new Error(
          `Peripheral disconnected during ${operationName}`,
        ));
      };

      this.peripheral.once('disconnect', disconnectHandler);

      addCleanup(() => {
        this.peripheral.removeListener(
          'disconnect',
          disconnectHandler,
        );
      });
    };
  }

  writeValueAndWait(value, uuid, delay = -1, timeout = 5000) {
    const characteristic = this.characteristicsMap.get(uuid);
    const name = UUIDToName[uuid] || 'Unknown UUID';

    if (!characteristic) {
      return Promise.reject(new Error(`Characteristic ${uuid} not found`));
    }

    return this.btQueue.enqueue({
      operationName: `writeValueAndWait to ${name}(${uuid})`,

      delayMs: delay >= 0 ? delay : this.btQueue.defaultDelayMs,

      onStart: this.addDisconnectAbortHandler(
        `writeValueAndWait from ${name}(${uuid})`,
      ),

      executor: ({ addCleanup }) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Write And Wait timeout for ${name}(${uuid})`));
        }, timeout);

        addCleanup(() => {
          clearTimeout(timer);
        });

        characteristic.write(value, false, (err) => {
          if (err) {
            reject(err);
          } else {
            debug(`Tx ${value.toString('hex')} to ${name}(${uuid})`);
            resolve();
          }
        });
      }),
    });
  }

  readValueAndWait(uuid, firstByte, timeout = 3000) {
    const characteristic = this.characteristicsMap.get(uuid);
    const name = UUIDToName[uuid] || 'Unknown UUID';

    if (!characteristic) {
      return Promise.reject(new Error(`Characteristic ${uuid} not found`));
    }

    return this.btQueue.enqueue({
      operationName: `readValueAndWait from ${name}(${uuid})`,

      delayMs: 0,

      onStart: this.addDisconnectAbortHandler(
        `readValueAndWait from ${name}(${uuid})`,
      ),

      executor: ({ addCleanup }) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Read timeout for ${name}(${uuid})`));
        }, timeout);

        addCleanup(() => {
          clearTimeout(timer);
        });

        characteristic.read((error, data) => {
          if (error) {
            reject(error);
            return;
          }

          if (data) {
            debug(`Rx ${data.toString('hex')} from ${name}(${uuid})`);

            if (!firstByte || data[0] === firstByte) {
              resolve(data);
            } else {
              reject(
                new Error(
                  `received ${data.toString('hex')}, expecting ${firstByte.toString(16)}`,
                ),
              );
            }
          } else {
            reject(new Error('No data received'));
          }
        });
      }),
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

      onStart: this.addDisconnectAbortHandler(
        `setNotifyEnabledAndWait on ${name}(${uuid})`,
      ),

      executor: ({ addCleanup }) => new Promise((resolve, operationReject) => {
        const timer = setTimeout(() => {
          operationReject(
            new Error(
              `Timeout enabling notifications for ${name}(${uuid})`,
            ),
          );
        }, timeout);

        addCleanup(() => {
          clearTimeout(timer);
        });

        characteristic.notify(enabled, (err) => {
          if (err) {
            operationReject(err);
          } else {
            debug(
              `Successfully set notify enabled for ${name}(${uuid}) to ${enabled}`,
            );
            resolve();
          }
        });
      }),
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

      onStart: this.addDisconnectAbortHandler(
        `setupNotification on ${name}(${uuid})`,
      ),

      executor: () => new Promise((resolve, reject) => {
        characteristic.subscribe((err) => {
          if (err) {
            reject(err);
            return;
          }

          if (callback) {
            characteristic.on('data', callback);
          }

          debug(`Subscribed to ${name}(${uuid})`);

          resolve();
        });
      }),
    });
  }

  waitForNotification(uuid, firstByte, timeout = 3000) {
    const characteristic = this.characteristicsMap.get(uuid);
    const name = UUIDToName[uuid] || 'Unknown UUID';

    if (!characteristic) {
      return Promise.reject(new Error(`Characteristic ${uuid} not found`));
    }

    return this.btQueue.enqueue({
      operationName: `waitForNotification on ${name}(${uuid})`,

      delayMs: 0,

      onStart: this.addDisconnectAbortHandler(
        `waitForNotification on ${name}(${uuid})`,
      ),

      executor: ({ addCleanup }) => new Promise((resolve, reject) => {
        const dataHandler = (data) => {
          debug(`Rx ${data.toString('hex')} from ${name}(${uuid})`);

          if (!firstByte || data[0] === firstByte) {
            resolve(data);
          } else {
            reject(new Error(
              `Received ${data[0].toString(16)}, expected ${firstByte.toString(16)}`,
            ));
          }
        };

        const timer = setTimeout(() => {
          reject(new Error(
            `Timeout waiting for notification on ${name}(${uuid})`,
          ));
        }, timeout);

        characteristic.once('data', dataHandler);

        addCleanup(() => {
          clearTimeout(timer);

          characteristic.removeListener(
            'data',
            dataHandler,
          );
        });
      }),
    });
  }

  writeValueAndWaitForNotification(value, uuid, firstByte, delayMs = -1, timeout = 3000) {
    const characteristic = this.characteristicsMap.get(uuid);
    const name = UUIDToName[uuid] || 'Unknown UUID';

    if (!characteristic) {
      return Promise.reject(new Error(`Characteristic ${uuid} not found`));
    }

    return this.btQueue.enqueue({
      operationName: `writeValueAndWaitForNotification to ${name}(${uuid})`,

      delayMs: delay >= 0 ? delay : this.btQueue.defaultDelayMs,

      onStart: this.addDisconnectAbortHandler(
        `writeValueAndWaitForNotification to ${name}(${uuid})`,
      ),

      executor: ({ addCleanup }) => new Promise((resolve, reject) => {
        const dataHandler = (data) => {
          debug(`Rx ${data.toString('hex')} from ${name}(${uuid})`);

          if (!firstByte || data[0] === firstByte) {
            resolve(data);
          } else {
            reject(new Error(
              `Received ${data[0].toString(16)}, expected ${firstByte.toString(16)}`,
            ));
          }
        };

        const timer = setTimeout(() => {
          reject(new Error(
            `Timeout waiting for notification from ${name}(${uuid})`,
          ));
        }, timeout);

        characteristic.once('data', dataHandler);

        addCleanup(() => {
          clearTimeout(timer);

          characteristic.removeListener(
            'data',
            dataHandler,
          );
        });

        characteristic.write(value, false, (err) => {
          if (err) {
            reject(err);
            return;
          }

          debug(`Tx ${value.toString('hex')} to ${name}(${uuid})`);
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

      delayMs: delay >= 0 ? delay : this.queue.defaultDelayMs,

      onStart: this.addDisconnectAbortHandler(
        `writeValueNoWait to ${name}(${uuid})`,
      ),

      executor: () => new Promise((resolve, reject) => {
        characteristic.write(value, true, (err) => {
          if (err) {
            reject(err);
            return;
          }

          debug(`Tx ${value.toString('hex')} to ${name}(${uuid})`);
          resolve();
        });
      }),
    });
  }

  isDevicePaired(adapter) {
    if (!this.peripheral) {
      return Promise.resolve(false);
    }

    const { address } = this.peripheral;

    const hci = process.env.NOBLE_HCI_DEVICE_ID
      || adapter
      || 'hci0';

    const devicePath = `/org/bluez/${hci}/dev_${address
      .toUpperCase()
      .replace(/:/g, '_')}`;

    return this.btQueue.enqueue({
      operationName: `isDevicePaired ${address}`,

      executor: async ({ addCleanup }) => {
        const bus = dbus.systemBus();

        addCleanup(() => {
          bus.disconnect();
        });

        try {
          const obj = await bus.getProxyObject(
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

  unpairDevice(adapter) {
    if (!this.peripheral) {
      return Promise.resolve(false);
    }

    const { address } = this.peripheral;

    const hci = process.env.NOBLE_HCI_DEVICE_ID
      || adapter
      || 'hci0';

    const adapterPath = `/org/bluez/${hci}`;

    const devicePath = `${adapterPath}/dev_${address
      .toUpperCase()
      .replace(/:/g, '_')}`;

    return this.btQueue.enqueue({
      operationName: `unpairDevice ${address}`,

      executor: async ({ addCleanup }) => {
        const bus = dbus.systemBus();

        addCleanup(() => {
          bus.disconnect();
        });

        try {
          const obj = await bus.getProxyObject(
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
          throw err;
        }
      },
    });
  }
};
