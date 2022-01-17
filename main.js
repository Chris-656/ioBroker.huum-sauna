"use strict";

/*
 * Created with @iobroker/create-adapter v2.0.2
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

// Load your modules here, e.g.:
const axios = require("axios").default;
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

	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here

		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:
		this.log.info(`Config: ${this.config.user}, Update every ${this.config.refresh} seconds`);

		this.setState("info.connection", true, true);

		this.updateInterval = setInterval(() => {
			this.getSaunaStatus();
		}, this.config.refresh * 1000); // in seconds

		// In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
		//this.subscribeStates("temperature");
		this.subscribeStates("steamerError");
		this.subscribeStates("switchLight");
		this.subscribeStates("switchSauna");

		// examples for the checkPassword/checkGroup functions
		/*
		let result = await this.checkPasswordAsync("admin", "iobroker");
		this.log.info("check user admin pw iobroker: " + result);

		result = await this.checkGroupAsync("admin", "admin");
		this.log.info("check group user admin group admin: " + result);
		*/
	}

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

	async getSaunaStatus() {

		try {
			const response = await axios.get(url, {
				auth: {
					username: this.config.user,
					password: this.config.password
				}
			});
			const huum = response.data;
			this.log.info(`Saunadata: Door(${huum.door}), Temp (${huum.temperature})`);

			this.setState("doorStatus", huum.door, true);
			this.setState("statusCodeHuum", huum.statusCode, true);
			this.setState("statusCode", this.convStatusCode(huum.statusCode)[0], true);
			this.setState("statusMessage", this.convStatusCode(huum.statusCode)[1], true);
			this.setState("maxHeatingTime", parseInt(huum.maxHeatingTime), true);
			this.setState("temperature", parseFloat(huum.temperature), true);
			if (huum.config)
				this.setState("config", parseInt(huum.config), true);

			if (huum.statusCode == 231) {
				this.setState("targetTemperature", parseInt(huum.targetTemperature), true);
				this.setState("duration", parseInt(huum.duration), true);
				this.setState("startDate", parseInt(huum.startDate), true);
				this.setState("endDate", parseInt(huum.endDate), true);
				if (huum.humidity)
					this.setState("humidity", parseInt(huum.humidity) * 10, true);
			}
		} catch (error) {
			this.log.error("Error" + error);
		}
	}

	/*
	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
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
			if (id.indexOf("switchLight") !== -1) {
				this.log.info(`Light switched ${this.config.lightpath}`);
				if (this.config.lightpath != "") {
					this.setForeignState(this.config.lightpath, state.val, true);
				}
			}
			if (id.indexOf("switchSauna") !== -1) {
				this.log.info(`switch Sauna  to ${state.val}`);
				// this.switchSauna()
			}

			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
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