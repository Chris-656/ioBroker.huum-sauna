"use strict";

/*
 * Created with @iobroker/create-adapter v2.0.2
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

// Load your modules here, e.g.:
const axios = require("axios").default;
const axiosTimeout = 8000;

const sunCalc = require("suncalc2");               	// https://github.com/andiling/suncalc2

const url = "https://api.huum.eu/action/home/status";


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

		// Put Instanzvariables here
		this.updateInterval = null;
		this.huum = null;

	}

	/**
	 *
	 *
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here

		// Get system configuration
		const sysConf = await this.getForeignObjectAsync("system.config");
		if (sysConf && sysConf.common) {
			this.systemConfig = sysConf.common;
		} else {
			throw (`ioBroker system configuration not found.`);
		}

		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:

		this.log.info(`Login to HUUM User:${this.config.user}`);

		this.getSaunaStatus()
			.then(() => {
				if (this.huum.statusCode === 403) {
					this.setState("info.connection", false, true);
					this.log.warn(`HUUM Request stopped, please check the login credentials: ${this.huum.statusCode}`);
				} else {
					this.setState("info.connection", true, true);
					this.updateInterval = setInterval(() => {
						this.getSaunaStatus();
					}, this.config.refresh * 1000); // in seconds
				}
			})
			.catch((error) => {
				this.log.error(`out Adapter Connection Error: ${error}`);
			});

		this.log.info(`Adapter startet: ${this.config.user}, Update every ${this.config.refresh} seconds`);

		// In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.

		this.subscribeStates("steamerError");
		this.subscribeStates("switchLight");
		this.subscribeStates("switchSauna");
		if (this.config.lightpath) {
			this.subscribeForeignStates(this.config.lightpath);
		}
		// examples for the checkPassword/checkGroup functions
		/*
		let result = await this.checkPasswordAsync("admin", "iobroker");
		this.log.info("check user admin pw iobroker: " + result);

		result = await this.checkGroupAsync("admin", "admin");
		this.log.info("check group user admin group admin: " + result);
		*/
	}

	/**
	 * @param {any} code
	 */
	convStatusCode(code) {
		// 		statusCode:
		// 0: 230 - sauna offline
		// 1: 232 sauna online but not heating
		// 2: 231 - online and heating
		// 3: 233 sauna is beeing used by another user and is locked
		// 4: 400 sauna is put to emergency stop

		let newCode = 0;
		let message = "";

		switch (code) {
			case 230:
				newCode = 0;
				message = "Sauna ist Offline";
				break;
			case 232:
				newCode = 1;
				message = "Sauna ist Online ohne heizen";
				break;
			case 231:
				newCode = 2;
				message = "Sauna ist Online und heizt";
				break;
			case 233:
				newCode = 3;
				message = "Sauna wird von anderem User verwendet";
				break;
			case 400:
				newCode = 4;
				message = "Sauna Error -> Not Stop";
				break;
			default:
				newCode = 5;
				message = "Sauna Error ?";
				break;
		}
		return [newCode, message];
	}

	isDark() {
		//this.log.info(`lat: ${this.systemConfig.latitude} lon: ${this.systemConfig.longitude}`);

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

	setHUUMStates() {
		this.setState("doorStatus", this.huum.door, true);
		this.setState("statusCodeHuum", this.huum.statusCode, true);
		this.setState("statusCode", this.convStatusCode(this.huum.statusCode)[0], true);
		this.setState("statusMessage", this.convStatusCode(this.huum.statusCode)[1], true);
		this.setState("maxHeatingTime", parseInt(this.huum.maxHeatingTime), true);
		this.setState("temperature", parseFloat(this.huum.temperature), true);
		if (this.huum.config)
			this.setState("config", parseInt(this.huum.config), true);

		if (this.huum.statusCode == 231) {
			this.setState("targetTemperature", parseInt(this.huum.targetTemperature), true);
			this.setState("duration", parseInt(this.huum.duration), true);
			this.setState("startDate", parseInt(this.huum.startDate), true);
			this.setState("endDate", parseInt(this.huum.endDate), true);
			if (this.huum.humidity)
				this.setState("humidity", parseInt(this.huum.humidity) * 10, true);
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
			this.huum = response.data;
			this.setHUUMStates();

			this.log.info(`HUUM Request: statusCode: ${this.huum.statusCode} Door:${this.huum.door} Config:${this.huum.config} steamerError:${this.huum.steamerError} temperature:${this.huum.temperature} `);

		} catch (error) {
			this.huum = { "statusCode": 403 };
			this.log.warn(`Warning: + ${error}`);
		}
	}

	/**
	 * @param {string | number | boolean | null} status
	 */
	async switchSauna(status) {
		if (status)
			await this.switchSaunaOn();
		else
			await this.switchSaunaOff();

		// get new status immediately
		await this.getSaunaStatus();
	}

	async switchSaunaOn() {

		const tempstate = await this.getStateAsync("targetTemperature");
		const humstate = await this.getStateAsync("humidity");

		const targettemp = (tempstate) ? tempstate.val : 70;
		// @ts-ignore
		const targethum = (humstate) ? Math.round(humstate.val / 10) : 0;

		try {
			const url = "https://api.huum.eu/action/home/start";

			const param = { targetTemperature: targettemp, humidity: targethum };
			this.log.info(`Start Sauna with TargetTemp:${param.targetTemperature}: TargetHum:${param.humidity}`);

			const response = await axios.post(url, param, {
				auth: {
					username: this.config.user,
					password: this.config.password
				},
				timeout: axiosTimeout
			});

			this.log.info(`Saunadata: Status (${response.data.statusCode})`);
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

			this.log.info(`Sauna stopped`);

			const param = " ";
			const response = await axios.post(url, param, {
				auth: {
					username: this.config.user,
					password: this.config.password
				},
				timeout: axiosTimeout
			});
			this.huum = response.data;
			this.log.info(`HUUM Request: statusCode: ${this.huum.statusCode} Door:${this.huum.door} Config:${this.huum.config} steamerError:${this.huum.steamerError} temperature:${this.huum.temperature} `);

			// switch of the light of the sauna
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
			this.log.info(`Light switched ${(stateVal) ? "on" : "off"} state ${this.config.lightpath} `);
			this.setForeignState(this.config.lightpath, stateVal, true);
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

		this.log.info(`Switch the light ${status})`);

		try {
			const url = "https://api.huum.eu/action/home/light";

			const response = await axios.get(url, {
				auth: {
					username: this.config.user,
					password: this.config.password
				},
				timeout: axiosTimeout
			});
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
			// clearTimeout(timeout2);
			// ...
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
				if (id.indexOf("switchSauna") !== -1) {
					this.switchSauna(state.val);					// Switch sauna on/off
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