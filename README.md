![Logo](admin/huum-sauna.png)
# ioBroker.huum-sauna

[![NPM version](http://img.shields.io/npm/v/iobroker.huum-sauna.svg)](https://www.npmjs.com/package/iobroker.huum-sauna)
[![Downloads](https://img.shields.io/npm/dm/iobroker.huum-sauna)](https://www.npmjs.com/package/iobroker.huum-sauna)
![Number of Installations](https://img.shields.io/npm/v/iobroker.huum-sauna/latest)
[![Known Vulnerabilities](https://snyk.io/test/github/chris-1965/ioBroker.huum-sauna/badge.svg)](https://app.snyk.io/org/chris-1965/iobroker.huum-sauna)

[![NPM](https://nodei.co/npm/iobroker.huum-sauna.png?downloads=true)](https://nodei.co/npm/iobroker.huum-sauna/)

This adapter integrates the HUUM sauna control device into iobroker.
The specification of HUUM Devive for the sauna control can be found [here](https://huum.de/)

## Parameters
- 1 + 2 User Credentials for HUUM Webpage "https://api.huum.eu/action/home/"
- 3 refresh     .. Refresh to load HUUM data from the device
- 4 lightpath   .. Optional Lightpath (state) for switching external light. If empty HUUM switch method is used
- 5 AstroLight  .. When set the light is automatically switched on by sunset (for outdoor saunas).
  
## Usage example
![grafik](https://user-images.githubusercontent.com/56934142/150417838-425261da-a6c7-47b3-bf1b-2af6035ffd59.png)

## Changelog

## 0.1.7 
- starting sauna with target temperature and humidity
- switch on light in sauna (also on separat id)
- subscribe also foreign state id 
- minor bugs and code revision
  
## 0.1.6 
- starting sauna with target temperature
- switch on light in sauna (also on separat id)
- get sauna status

## 0.1.5 
- initial version
  
## License
MIT License

"Copyright (c) 2022 Chris <besterquester@live.at>"
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.