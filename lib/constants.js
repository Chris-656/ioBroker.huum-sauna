"use strict";
/**
 * @desc    Define adapter constants, which will be available in adapter class instance
 * @author  Chris-1965 <https://github.com/Chris-1965/ioBroker.huum-sauna>
 * @license MIT
 */
module.exports = {
	230: { newCode: 0, message: "Sauna ist Offline" },
	231: { newCode: 1, message: "Sauna ist Online ohne heizen" },
	232: { newCode: 2, message: "Sauna ist Online und heizt" },
	233: { newCode: 3, message: "Sauna wird von anderem User verwendet" },
	400: { newCode: 4, message: "Sauna Error -> Not Stop" },
	401: { newCode: 5, message: "Sauna Error -> request failed" },
};

