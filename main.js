"use strict";

/*
 * Created with @iobroker/create-adapter v2.0.2
 */
// Configuration API found at : https://github.com/horemansp/HUUM
//
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const { stringify } = require("querystring");

// Load your modules here, e.g.:
const axios = require("axios").default;
const sunCalc = require("suncalc2");               	// https://github.com/andiling/suncalc2

const url = "https://api.huum.eu/action/home/status";

const axiosTimeout = 8000;
const maxSteamTemperature = 60;
//const tempDifferenceInterval = 5;
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
			if (!this.config.tempReachedOffset)
				this.config.tempReachedOffset = 0;

			this.refresh = this.config.sleep * 60;


			this.log.info(`Logging in to HUUM User:${this.config.user}`);

			this.getSaunaStatus()
				.then(() => {
					if (this.huum.statusCode == 403) {
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
					this.log.error(`Adapter Connection Error: ${error}`);
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

	syncAppValues(data) {
		this.huum = data;
		// Only status 231 or status 232 a sauna is defined with values
		if (this.huum.statusCode === 231 || this.huum.statusCode === 232) {
			if (this.huum.statusCode === 231) {
				this.setState("targetTemperature", parseInt(this.huum.targetTemperature), true);
				this.setState("heatingPeriod.duration", parseInt(this.huum.duration), true);
				this.setState("heatingPeriod.startDate", parseInt(this.huum.startDate), true);
				this.setState("heatingPeriod.endDate", parseInt(this.huum.endDate), true);
				this.setState("switchSauna", true, true);

				// Set switchstatus to true
				if (this.huum.humidity) {
					this.setState("humidity", parseInt(this.huum.humidity) * 10, true);
				}
				if (this.config.astrolight && this.isDark()) {
					this.setState("switchLight", true, true);
					this.log.info("Sauna Light switched automatically on");
				}

			} else if (this.huum.statusCode === 232) {
				this.setStateChanged("switchSauna", false, true);			// Set switchstatus to false
				this.setStateChanged("targetTempReached", false, true);	    // Set targetTempReched state to false
			}

			this.setState("status-huum.steamerError", (parseInt(this.huum.steamerError) == 1) ? true : false, true);		// Set steamerstatus
			this.setState("status-huum.doorStatus", this.huum.door, true);
			this.setState("heatingPeriod.maxHeatingTime", parseInt(this.huum.maxHeatingTime), true);
			this.setState("temperature", parseFloat(this.huum.temperature), true);

			if ("light" in this.huum) {
				const lightStatus = (this.huum.light === 0) ? false : true;
				this.setState("status-huum.lightStatus", lightStatus, true);
				this.setState("switchLight", lightStatus, true);
			}

			if ("config" in this.huum) {
				this.setState("status-huum.config", parseInt(this.huum.config), true);
			}
		}

		this.setState("status-huum.statusCodeHuum", this.huum.statusCode, true);
		this.setState("statusCode", this.constants[this.huum.statusCode].newCode, true);
		this.setState("statusMessage", this.constants[this.huum.statusCode].message, true);

	}

	changeSchedule(refresh) {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
			this.updateInterval = setInterval(() => { this.getSaunaStatus(); }, refresh * 1000);
			this.log.debug(`Switched to new intervall: ${this.refresh}`);
		}
	}

	async checkTempReached() {
		if (this.huum.statusCode == 231) {
			const targetTempReached = await this.getStateAsync("targetTempReached");
			const degreesLeft = parseInt(this.huum.targetTemperature) - parseInt(this.huum.temperature);
			//this.log.info(`DEBUG - Degrees left:${degreesLeft} tempdiff:${tempDifferenceInterval} reached?: ${degreesLeft <= tempDifferenceInterval}`);

			if (targetTempReached && !targetTempReached.val && (degreesLeft <= this.config.tempReachedOffset)) {
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
				this.setState("humidity", 0, true);
				this.log.warn(`Steam Mode with ${this.huum.humidity * 10}% and no water in steamer `);

				//this.switchSauna(false);
				this.setState("statusMessage", `Error: no water in steamer: ${this.huum.humidity * 10}%`, true);
				this.log.warn(`Sauna humdity ${this.huum.humidity * 10}% set to 0% `);

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

			this.syncAppValues(response.data);

			if (response.data.statusCode == 231) {
				await this.checkTempReached();
				await this.checkSteamError();
				//await this.checkSteamTemperatur();
				this.log.info(`HUUM Request: statusCode: ${this.huum.statusCode} temperature:${this.huum.temperature} targetTemp:${this.huum.targetTemperature} sethumidity:${this.huum.humidity} Door closed:${this.huum.door} Config:${this.huum.config} light:${this.huum.light} steamerError:${this.huum.steamerError}  `);
			} else if (response.data.statusCode == 232) {
				this.log.info(`HUUM Request: statusCode: ${this.huum.statusCode} temperature:${this.huum.temperature}  sethumidity:${this.huum.humidity} Door closed:${this.huum.door} Config:${this.huum.config} light:${this.huum.light} steamerError:${this.huum.steamerError}  `);
			} else {
				this.log.warn(`Warning: Sauna Status: ${this.constants[this.huum.statusCode].message} ${this.huum.statusCode})`);
			}
		} catch (error) {
			this.huum = { "statusCode": 403 };
			this.log.warn(`Warning: + ${error} `);
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

			this.syncAppValues(response.data);

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
			this.syncAppValues(response.data);

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

		if (this.config.lightpath != "") {
			this.log.info(`Light switched ${(stateVal) ? "On" : "Off"} for the state:${this.config.lightpath} `);
			this.setForeignStateChanged(this.config.lightpath, stateVal, false);

		} else {
			if ("config" in this.huum)
				if (this.huum.config != 1) {
					this.log.info(`Light switched on HUUM system`);
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

			this.syncAppValues(response.data);

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

				if (this.config.lightpath !== "" && id.indexOf(this.config.lightpath) !== -1) {
					this.log.info(`in switch light ${state.val}`);
					this.setState("switchLight", state.val, true);
				}
				if (id.indexOf("switchSauna") !== -1) {
					this.switchSauna(state.val);					// Switch sauna on/off
					this.setState("switchSauna", state.val, true);
				}
				// start only when heating is on
				if (id.indexOf("targetTemperature") !== -1) {
					if (this.huum.statusCode === 231) this.switchSauna(true);
					this.setState("targetTemperature", state.val, true);
				}

				// start only when heating is on
				if (id.indexOf("humidity") !== -1) {
					if (this.huum.statusCode === 231) this.switchSauna(true);
					this.setState("humidity", state.val, true);
				}
				// switch on sauna modes from states
				if (id.indexOf("Presets.startDryMode") !== -1) {
					this.switchSaunaOn(SaunaMode.Dry);
					this.setState("Presets.startDryMode", true, true);
				}
				// switch on sauna modes from states
				if (id.indexOf("Presets.startSteamMode") !== -1) {
					this.switchSaunaOn(SaunaMode.Steam);
					this.setState("Presets.startSteamMode", true, true);
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