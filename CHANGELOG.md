# Changelog
<!--
    ## **WORK IN PROGRESS**
-->
## 0.4.4 (2023-02-12)
- adapted temp reached when sauna is stopped from the app
- added an offset for temp reached value when use the intelligent sauna mode

## 0.4.3 (2023-01-31)
- Fixed Switchlight when lightpath is empty

## 0.4.2 (2022-09-25)
- Fixes on presets, no more states for the setting

## 0.4.1 (2022-09-25)
-  Added new Preset states for steam or dry saunamode

## 0.4.0 (2022-08-21)
- fixed light external state issue

## 0.3.9 (2022-08-20)
- added steamerError, when error occurs sauna is switched off and a warning is documented
- saftey issue, reduce targettemperatur when in steam mode
- some minor changes

## 0.3.8 (2022-08-04)
- Add Sauna Sleep Refresh Time as parameter, when set to 0 there is no traffic otherwise update in minutes

## 0.3.7 (2022-02-26)
- add Sauna Images -> adapted from icons-mfd-svg Images
- added sleepRefresh when Sauna is switched off to reduce network traffic (30 minutes)

## 0.3.6 (2022-02-20)
- release script
- fixes

## 0.3.1 (2022-02-20)
- included automated switch on light

## 0.3.0 (2022-02-13)
- create stable version

## 0.2.1 (2022-01-30)
- create npm package

## 0.2.0 (2022-01-30)  - 2022 Release
- minor Version created

## 0.1.10 (2022-01-30)
- added Trigger (state targetTempReached) when sauna temperature is reached
- Minor bug fixes and code revisions

## 0.1.7
- starting sauna with target temperature and humidity
- switch on light in sauna (also on separat id)
- subscribe also foreign state id
- minor bugs and code revision

## 0.1.6
- starting sauna with target temperature
- switch on light in sauna (also on separat id)
- get sauna status

## 0.1.0
- initial version