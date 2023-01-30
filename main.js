"use strict";

/*
 * Created with @iobroker/create-adapter v2.0.2
 */
// Configuration API found at : https://github.com/horemansp/HUUM
//
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

// Load your modules here, e.g.:
const axios = require("axios").default;
const sunCalc = require("suncalc2");               	// https://github.com/andiling/suncalc2

const url = "https://api.huum.eu/action/home/status";

const axiosTimeout = 8000;
const maxSteamTemperature = 60;
const tempDifferenceInterval = 5;
const steamTreshhold = 3;

const SaunaMode = {
	Standard: 0,
	Dry: 1,
	Steam: 2
};

class HuumSauna extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "huum-sauna",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));

		this.on("unload", this.onUnload.bind(this));
		this.constants = require("./lib/constants.js");

		// Put Instanzvariables here
		this.updateInterval = null;
		this.refresh = 10;   // convert to seconds

		this.huum = null;
		this.systemConfig = {};
	}

	/**
	 *
	 *
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		try {

			this.getForeignObjectAsync("system.config")
				.then((sysConf) => {
					if (sysConf)
						this.systemConfig = sysConf.common;
				})
				.catch((err) => {
					//this.log.error(err);
					throw new Error(err);
				});


			// The adapters config (in the instance object everything under the attribute "native") is accessible via
			// this.config:
			if (!this.config.sleep)
				this.config.sleep = 10;

			this.refresh = this.config.sleep * 60;


			this.log.info(`Logged in to HUUM User:${this.config.user}`);

			this.getSaunaStatus()
				.then(() => {
					if (this.huum.statusCode === 403) {
						this.setState("info.connection", false, true);
						this.log.warn(`HUUM Request stopped, please check the login credentials: ${this.huum.statusCode}`);
					} else {
						this.setState("info.connection", true, true);
						this.updateInterval = setInterval(() => {
							this.getSaunaStatus();
						}, this.refresh * 1000); // in seconds
					}
				})
				.catch((error) => {
					this.log.error(`out Adapter Connection Error: ${error}`);
				});

			this.log.info(`Adapter startet: ${this.config.user}, Update every ${this.config.refresh} seconds; StandBy Mode is set to : ${this.config.sleep} Minutes`);

			// In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.

			//this.subscribeStates("steamerError");
			this.subscribeStates("switchLight");
			this.subscribeStates("switchSauna");
			this.subscribeStates("humidity");
			this.subscribeStates("targetTemperature");
			this.subscribeStates("Presets.startDryMode");
			this.subscribeStates("Presets.startSteamMode");

			if (this.config.lightpath) {
				this.subscribeForeignStates(this.config.lightpath);
			}
		}
		catch (err) {
			this.log.error(err);
		}
	}


	isDark() {

		if (!this.systemConfig.latitude || !this.systemConfig.longitude) {
			this.log.warn("Latitude/Longitude is not defined in your ioBroker main configuration, so you will not be able to use Astro functionality for schedules!");
			return false;
		}
		const now = new Date();
		const times = sunCalc.getTimes(now, this.systemConfig.latitude, this.systemConfig.longitude);
		const sunset = times.sunset;
		if (now > sunset) {
			return true;
		} else {
			return false;
		}
	}

	setHUUMStates(data) {
		this.huum = data;
		if (this.huum.statusCode === 231) {
			this.setState("targetTemperature", parseInt(this.huum.targetTemperature), true);
			this.setState("heatingPeriod.duration", parseInt(this.huum.duration), true);
			this.setState("heatingPeriod.startDate", parseInt(this.huum.startDate), true);
			this.setState("heatingPeriod.endDate", parseInt(this.huum.endDate), true);
			this.setState("switchSauna", true, true);		// Set switchstatus to true
			if (this.huum.humidity) {
				this.setState("humidity", parseInt(this.huum.humidity) * 10, true);
			}
			if (this.config.astrolight && this.isDark()) {
				this.setState("switchLight", true, true);
				this.log.info("Sauna Light switched automatically on");
			}


		} else if (this.huum.statusCode === 232) {
			this.setState("switchSauna", false, true);		// Set switchstatus to false
		}
		// Check if we habe a steamer error no water in container
		this.setState("status-huum.steamerError", (parseInt(this.huum.steamerError) == 1) ? true : false, true);		// Set steamerstatus
		this.setState("status-huum.doorStatus", this.huum.door, true);
		this.setState("status-huum.statusCodeHuum", this.huum.statusCode, true);
		this.setState("heatingPeriod.maxHeatingTime", parseInt(this.huum.maxHeatingTime), true);
		this.setState("statusCode", this.constants[this.huum.statusCode].newCode, true);
		this.setState("statusMessage", this.constants[this.huum.statusCode].message, true);
		this.setState("temperature", parseFloat(this.huum.temperature), true);

		//this.log.info(`DEBUG: ${this.huum.statusCode}  this.huum.light: ${this.huum.light}`);

		if (this.huum.light) {
			this.setState("status-huum.lightStatus", (this.huum.light === 0) ? false : true, true);
		}
		if (this.huum.config) {
			this.setState("status-huum.config", parseInt(this.huum.config), true);
		}

	}
	async checkTempReached() {
		if (this.huum.statusCode == 231) {
			const targetTempReached = await this.getStateAsync("targetTempReached");
			const degreesLeft = parseInt(this.huum.targetTemperature) - parseInt(this.huum.temperature);
			//this.log.info(`DEBUG - Degrees left:${degreesLeft} tempdiff:${tempDifferenceInterval} reached?: ${degreesLeft <= tempDifferenceInterval}`);

			if (targetTempReached && !targetTempReached.val && (degreesLeft <= tempDifferenceInterval)) {
				this.setState("targetTempReached", true, true);
				this.log.info(`Temperature reached: ${this.huum.targetTemperature}`);
			}
		}
	}

	async checkSteamError() {
		if (this.huum.statusCode == 231) {
			// react on steamer error
			const steamerErrorstate = await this.getStateAsync("status-huum.steamerError");
			const humstate = await this.getStateAsync("humidity");

			//this.log.info(`Check Steam Error HUM:${this.huum.humidity*10} and no water in steamer STEAMERR:${this.huum.steamerError}`);

			// @ts-ignore
			if (steamerErrorstate && humstate && steamerErrorstate.val && humstate.val > 0) {
				this.switchSauna(false);
				this.log.warn(`Sauna switched off! Steam Mode with ${this.huum.humidity * 10}% and no water in steamer `);
			}
		}
	}

	async getSaunaStatus() {

		try {
			const response = await axios.get(url, {
				auth: {
					username: this.config.user,
					password: this.config.password
				},
				timeout: axiosTimeout
			});

			if (response.data.statusCode === 403) {
				return;
			}

			this.setHUUMStates(response.data);
			//this.log.info(JSON.stringify(response.data));
			await this.checkTempReached();
			await this.checkSteamError();

			this.log.info(`HUUM Request: statusCode: ${this.huum.statusCode} Door closed:${this.huum.door} Config:${this.huum.config} steamerError:${this.huum.steamerError} temperature:${this.huum.temperature} `);

		} catch (error) {
			this.huum = { "statusCode": 403 };
			this.log.warn(`Warning: + ${error}`);
		}
	}

	/**
	 * @param {string | number | boolean | null} status
	 */
	async switchSauna(status) {

		if (status) {
			await this.switchSaunaOn();
			this.refresh = this.config.refresh;
		}
		else {
			await this.switchSaunaOff();
			this.refresh = this.config.sleep * 60;
		}

		if (this.updateInterval) {
			clearInterval(this.updateInterval);

			this.updateInterval = setInterval(() => { this.getSaunaStatus(); }, this.refresh * 1000);
			this.log.debug(`Switched to new intervall: ${this.refresh}`);
		}

		this.setState("targetTempReached", false, true);
		// update new status immediately from huum device
		await this.getSaunaStatus();
	}

	async switchSaunaOn(mode = SaunaMode.Standard) {
		let tempstate;
		let humstate;
		let targettemp = 70;
		let targethum = 0;

		//this.log.info(`Saunamode: ${mode} DryTempPreset: ${this.config.dryPresetTemp} DrySteamPreset: ${this.config.dryPresetHumidity}`);
		try {
			if (mode === SaunaMode.Standard) {
				tempstate = await this.getStateAsync("targetTemperature");
				humstate = await this.getStateAsync("humidity");
				//  @ts-ignore
				targettemp = tempstate.val;
				targethum = (humstate && humstate.val) ? Math.round(humstate.val / 10) : 0;
			} else if (mode === SaunaMode.Dry) {
				targettemp = this.config.dryPresetTemp;
				targethum = Math.round(this.config.dryPresetHumidity / 10);
			} else {
				targettemp = this.config.steamPresetTemp;
				targethum = Math.round(this.config.steamPresetHumidity / 10);
			}

			if (targethum > steamTreshhold && targettemp > maxSteamTemperature) {
				this.log.warn(` TargetTemperature ${targettemp}° for steam ${targethum * 10}% too high -> setting to :${maxSteamTemperature}°`);
				// adjust temperatur to maxSteamTemperature for safety
				this.setState("targetTemperature", maxSteamTemperature, true);
			}

			const param = { targetTemperature: targettemp, humidity: targethum };
			const url = "https://api.huum.eu/action/home/start";
			this.log.info(`Start Sauna with TargetTemp:${param.targetTemperature}: TargetHum:${param.humidity * 10}%`);
			const response = await axios.post(url, param, {
				auth: {
					username: this.config.user,
					password: this.config.password
				},
				timeout: axiosTimeout
			});

			this.setHUUMStates(response.data);

			if (this.config.astrolight && this.isDark()) {
				this.switchLight(true);
				this.setState("switchLight", true, true);
			}
		} catch (error) {
			this.log.error("Error" + error);
		}
	}

	async switchSaunaOff() {
		try {
			const url = "https://api.huum.eu/action/home/stop";

			this.log.info(`Sauna switched Off`);

			const param = " ";
			const response = await axios.post(url, param, {
				auth: {
					username: this.config.user,
					password: this.config.password
				},
				timeout: axiosTimeout
			});
			this.setHUUMStates(response.data);

			this.log.info(`HUUM Request: statusCode: ${this.huum.statusCode} Door closed:${this.huum.door} Config:${this.huum.config} steamerError:${this.huum.steamerError} temperature:${this.huum.temperature} `);

			// switch off the light of the sauna
			this.switchLight(false);

		} catch (error) {
			this.log.error("Error" + error);
		}
	}

	/**
	 * @param {string | number | boolean | ioBroker.SettableState | null} stateVal
	 */
	async switchLight(stateVal) {

		//this.setState("switchLight", stateVal, true);

		if (this.config.lightpath != "") {
			this.log.info(`Light switched ${(stateVal) ? "On" : "Off"} for the state:${this.config.lightpath} `);
			this.setForeignStateChanged(this.config.lightpath, stateVal, false);

		} else {
			if (this.huum.config)
				if (this.huum.config != 3) {
					this.log.info(`Light switched on HUUM`);
					await this.switchLightonHUUM(stateVal);					// to be tested
				} else {
					this.log.info(`Change Configuration on HUUM device for light usage`);
				}
		}
	}

	/**
	 * @param {string | number | boolean | ioBroker.SettableState | null} status
	 */
	async switchLightonHUUM(status) {

		this.log.info(`Switch the light ${(status) ? "On" : "Off"}`);

		try {
			const url = "https://api.huum.eu/action/home/light";

			const response = await axios.get(url, {
				auth: {
					username: this.config.user,
					password: this.config.password
				},
				params: {
					light: (status) ? 1 : 0
				},
				timeout: axiosTimeout
			});

			this.setHUUMStates(response.data);

			this.log.info(`Saunadata: Status (${response.data.statusCode})`);

		} catch (error) {
			this.log.error("Error" + error);
		}
	}

	/*
	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	/**
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearInterval(interval1);
			if (this.updateInterval) {
				clearInterval(this.updateInterval);
				this.updateInterval = null;
			}

			callback();
		} catch (e) {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			//
			if (state.ack === false) {

				if (id.indexOf("switchLight") !== -1) {
					this.switchLight(state.val);
				}
				if (id.indexOf(this.config.lightpath) !== -1) {
					this.setState("switchLight", state.val, true);
				}
				if (id.indexOf("switchSauna") !== -1) {
					this.switchSauna(state.val);					// Switch sauna on/off
				}
				// start only when heating is on
				if (id.indexOf("targetTemperature") !== -1 && this.huum.statusCode === 231) {
					this.switchSauna(true);
				}

				// start only when heating is on
				if (id.indexOf("humidity") !== -1 && this.huum.statusCode === 231) {
					this.switchSauna(true);
				}
				// switch on sauna modes from states
				if (id.indexOf("Presets.startDryMode") !== -1) {
					this.switchSaunaOn(SaunaMode.Dry);
				}
				// switch on sauna modes from states
				if (id.indexOf("Presets.startSteamMode") !== -1) {
					this.switchSaunaOn(SaunaMode.Steam);
				}
				this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
			}

		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }

}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new HuumSauna(options);
} else {
	// otherwise start the instance directly
	new HuumSauna();
}