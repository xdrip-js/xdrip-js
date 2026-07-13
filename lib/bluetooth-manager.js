/* eslint max-classes-per-file: "off" */

const dbus = require('dbus-next');
const noble = require('noble');
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
    this.connectStartTime = null;
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

  async discoverServicesAndWait(timeout = 10000) {
    return this.btQueue.enqueue({
      operationName: 'discoverServicesAndWait',

      onStart: this.addDisconnectAbortHandler(
        'discoverServicesAndWait',
      ),

      executor: ({ addCleanup }) => new Promise((resolve, reject) => {
        const responseHandler = (services) => {
          debug('discoverServicesAndWait -> peripheral services discovered');

          if (services && services.length > 0) {
            const service = services[0];
            if (service.uuid !== UUID.TransmitterService.CGMService) {
              debug(`unexpected peripheral service discovered: ${service.uuid}`);
              reject(new Error(
                `Unexpected peripheral service discovered: ${service.uuid}`,
              ));
            }

            this.discoverSuccess = true;

            resolve(service);
          } else {
            debug('discoverServicesAndWait -> no peripheral services discovered');
            reject(new Error(
              'No peripheral services discovered',
            ));
          }
        };

        const timer = setTimeout(() => {
          reject(new Error(
            'Timeout waiting for discover services',
          ));
        }, timeout);

        addCleanup(() => {
          clearTimeout(timer);

          this.peripheral.removeListener(
            'servicesDiscover',
            responseHandler,
          );
        });

        this.peripheral.once('servicesDiscover', responseHandler);
        this.peripheral.discoverServices([UUID.TransmitterService.CGMService]);
      }),
    });
  }

  async discoverCharacteristicsAndWait(service, timeout = 10000) {
    return this.btQueue.enqueue({
      operationName: 'discoverCharacteristicsAndWait',

      onStart: this.addDisconnectAbortHandler(
        'discoverServicesAndWait',
      ),

      executor: ({ addCleanup }) => new Promise((resolve, reject) => {
        const responseHandler = (characteristics) => {
          debug('discoverCharacteristicsAndWait -> service characteristics discovered');

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
            resolve(true);
          }

          const remaining = [...undiscoveredUUIDs].map((uuid) => ({
            name: UUIDToName[uuid] || 'Unknown',
            uuid,
          }));

          debug(`Remaining: ${remaining.map((r) => `${r.name}(${r.uuid})`).join(', ')}`);
          resolve(false);
        };

        const timer = setTimeout(() => {
          reject(new Error(
            'Timeout waiting for discover services',
          ));
        }, timeout);

        addCleanup(() => {
          clearTimeout(timer);

          service.removeListener(
            'characteristicsDiscover',
            responseHandler,
          );
        });

        service.once('characteristicsDiscover', responseHandler);
        service.discoverCharacteristics();
      }),
    });
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

    let connectTimer = null;
    let connectHandled = false;

    const connectedHandler = () => {
      if (connectHandled) {
        return;
      }
      connectHandled = true;

      clearTimeout(connectTimer);

      debug(`→ SUCCESS: Connected after ${Date.now() - this.connectStartTime}ms`);
      this.discoverSuccess = true;
      this.isConnecting = false;

      this.peripheral.once('servicesDiscover', this.didDiscoverServices.bind(this));
      this.peripheral.discoverServices([UUID.TransmitterService.CGMService]);
    };

    const connectTimeout = () => {
      const elapsed = Date.now() - this.connectStartTime;
      debug(`⚠️ CONNECT TIMEOUT after ${elapsed}ms: state=${this.peripheral.state}`);
      if (this.peripheral.state === 'connected') {
        debug(`→ SUCCESS: Connected after ${elapsed}ms`);
        connectedHandler();
      }
    };

    const onError = (err) => {
      clearTimeout(connectTimer);
      debug(`→ CONNECT ERROR: ${err.message || err}`);
      this.isConnecting = false;
      this.peripheral.removeListener('error', onError); // clean up
    };

    const disconnectHandler = (reason) => {
      clearTimeout(connectTimer);
      debug(`→ DISCONNECTED after ${Date.now() - this.connectStartTime}ms: ${reason || 'unknown'}`);

      this.peripheral.removeListener('disconnect', disconnectHandler);
      this.peripheral.removeListener('connect', connectedHandler);
      this.peripheral.removeListener('error', onError);

      this.peripheral = null;
      this.isConnecting = false;

      if (!this.discoverSuccess && this.discoverFailures < 30) {
        this.discoverFailures += 1;
        setTimeout(scanForPeripheral, 2500);
      } else {
        setTimeout(scanForPeripheral, 60000);
        this.delegate.didDisconnect();
      }
    };

    const attemptConnect = () => {
      debug(`${Date()}: Attempting to connect to ${peripheral.advertisement.localName} (RSSI ${peripheral.rssi})...`);

      this.connectStartTime = Date.now();

      connectTimer = setTimeout(connectTimeout, 5000);

      const connectOptions = {
        connectionInterval: 12,
        connectionLatency: 0,
        supervisionTimeout: 5000,
      };

      this.peripheral.once('connect', connectedHandler);

      this.peripheral.once('disconnect', disconnectHandler);

      this.peripheral.once('error', onError);

      debug('before connect');
      this.peripheral.connect(connectOptions);
      debug('after connect');
    };

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
  }

  didDiscoverServices(services) {
    debug('on -> peripheral services discovered');

    if (services && services.length > 0) {
      const service = services[0];
      if (service.uuid !== UUID.TransmitterService.CGMService) {
        debug(`unexpected peripheral service discovered: ${service.uuid}`);
        return;
      }

      this.discoverSuccess = true;

      service.once('characteristicsDiscover', this.didDiscoverCharacteristics.bind(this));
      service.discoverCharacteristics();
    } else {
      debug('no peripheral services discovered trying again');

      this.peripheral.once('servicesDiscover', this.didDiscoverServices.bind(this));
      this.peripheral.discoverServices([UUID.TransmitterService.CGMService]);
    }
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
      this.delegate.isReady(this.peripheral.address, true);
    } else if (this.delegate.g7Transmitter
      && (undiscoveredUUIDs.size === 1)
      && undiscoveredUUIDs.has(UUID.CGMServiceCharacteristic.Communication)) {
      this.delegate.isReady(this.peripheral.address, false);
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
            debug(`Tx ${value.toString('hex')} to ${name}(${uuid}) FAILED: ${err.message}`);
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
            debug(`Rx ${data.toString('hex')} from ${name}(${uuid}) FAILED: ${error.message}`);
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
            debug(
              `Set notify enabled for ${name}(${uuid}) to ${enabled} FAILED: ${err.message}`,
            );
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
            debug(`Subscribed to ${name}(${uuid}) FAILED: ${err.message}`);
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

  writeValueAndWaitForNotification(value, uuid, firstByte, delay = -1, timeout = 3000) {
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
            debug(`Tx ${value.toString('hex')} to ${name}(${uuid}) FAILED: ${err.message}`);
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
            debug(`Tx ${value.toString('hex')} to ${name}(${uuid}) FAILED: ${err.message}`);
            reject(err);
            return;
          }

          debug(`Tx ${value.toString('hex')} to ${name}(${uuid})`);
          resolve();
        });
      }),
    });
  }

  async triggerDiscovery(durationMs = 5000, adapter = null) {
    if (!this.peripheral) {
      return Promise.resolve(false);
    }

    const envAdapter = process.env.NOBLE_HCI_DEVICE_ID ? `hci${process.env.NOBLE_HCI_DEVICE_ID}` : null;

    const hci = envAdapter
      || adapter
      || 'hci0';

    const adapterPath = `/org/bluez/${hci}`;

    return this.btQueue.enqueue({
      operationName: `triggerDiscovery ${hci}`,
      executor: async ({ addCleanup }) => {
        const bus = dbus.systemBus();
        addCleanup(() => bus.disconnect());

        try {
          const obj = await bus.getProxyObject('org.bluez', adapterPath);
          const adapterInterface = obj.getInterface('org.bluez.Adapter1');

          debug(`Starting discovery on ${hci}...`);
          await adapterInterface.StartDiscovery();

          await new Promise((resolve) => {
            setTimeout(resolve, durationMs);
          });

          debug(`Stopping discovery on ${hci}...`);
          await adapterInterface.StopDiscovery();

          return true;
        } catch (err) {
          debug(`Discovery trigger failed: ${err.message}`);
          return false;
        }
      },
    });
  }

  isDevicePaired(adapter) {
    if (!this.peripheral) {
      return Promise.resolve(false);
    }

    const { address } = this.peripheral;

    const envAdapter = process.env.NOBLE_HCI_DEVICE_ID ? `hci${process.env.NOBLE_HCI_DEVICE_ID}` : null;

    const hci = envAdapter
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

  async createBond(maxRetries = 3, adapter = null) {
    if (!this.peripheral) {
      return Promise.resolve(false);
    }

    const { address } = this.peripheral;

    const envAdapter = process.env.NOBLE_HCI_DEVICE_ID ? `hci${process.env.NOBLE_HCI_DEVICE_ID}` : null;

    const hci = envAdapter
      || adapter
      || 'hci0';

    const adapterPath = `/org/bluez/${hci}`;
    const devicePath = `${adapterPath}/dev_${address.toUpperCase().replace(/:/g, '_')}`;

    return this.btQueue.enqueue({
      operationName: `createBond ${address}`,

      executor: async ({ addCleanup }) => {
        let lastError = null;

        /* eslint-disable no-await-in-loop -- Authentication is a sequential state machine */
        for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
          const bus = dbus.systemBus();
          addCleanup(() => bus.disconnect());

          try {
            debug(`createBond: Bonding attempt ${attempt}/${maxRetries} for ${address}`);

            // Small delay to let BlueZ register the device object
            if (attempt > 1) {
              await new Promise((r) => {
                setTimeout(r, 800 * attempt);
              });
            }

            const obj = await bus.getProxyObject('org.bluez', devicePath);
            const device = obj.getInterface('org.bluez.Device1');

            const propsIface = obj.getInterface('org.freedesktop.DBus.Properties');
            const props = await propsIface.GetAll('org.bluez.Device1');

            debug('createBond: Full Device1 properties:', JSON.stringify(props, null, 2));

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

            const updatedObj = await bus.getProxyObject('org.bluez', devicePath);

            const updatedPropsIface = updatedObj.getInterface('org.freedesktop.DBus.Properties');
            const updatedProps = await updatedPropsIface.GetAll('org.bluez.Device1');

            debug('createBond: Full Device1 properties:', JSON.stringify(updatedProps, null, 2));

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

  unpairDevice(adapter) {
    if (!this.peripheral) {
      return Promise.resolve(false);
    }

    const { address } = this.peripheral;

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
          return false;
        }
      },
    });
  }

  async sendPairingRequest() {
    debug('G7 requested bonding - initiating SMP pairing');

    const smp = this.getSmp();
    if (smp) {
      this.btQueue.enqueue({
        operationName: `SMP Pairing Request for ${this.peripheral.address}`,

        executor: async () => {
          smp.sendPairingRequest();
          return true;
        },
      });
    } else {
      debug('No SMP object - falling back to D-Bus or bluetoothctl');
    }
  }

  /* eslint-disable no-underscore-dangle -- digging into noble hidden stuff */
  getSmp() {
    if (!this.peripheral || !this.peripheral._noble) {
      debug('No peripheral or noble instance available');
      return null;
    }

    const bindings = this.peripheral._noble._bindings;
    const { address } = this.peripheral;

    // Convert to the internal uuid format used in onLeConnComplete
    const uuid = address.split(':').join('').toLowerCase();

    // Lookup handle
    const handle = bindings._handles[uuid];

    if (handle === undefined) {
      debug(`getSmp: No handle found. Available handles: ${Object.keys(bindings._handles || {})}`);
      return null;
    }

    const aclStream = bindings._aclStreams[handle];

    if (!aclStream) {
      debug(`No ACL stream for handle ${handle}`);
      return null;
    }

    if (!aclStream._smp) {
      debug('ACL stream exists but no SMP object');
      return null;
    }

    debug(`Successfully retrieved SMP object for ${address} (handle ${handle})`);
    return aclStream._smp;
  }
  /* eslint-enable no-underscore-dangle */
};
