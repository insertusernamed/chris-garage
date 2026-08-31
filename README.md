# Chris's Garage

A small weather dashboard for the Raspberry Pi SenseHAT in Chris's garage. It
shows the live temperature, humidity, and pressure, the last hour of traces, and
a lightweight archive you can browse back through.

## Features

- Live temperature, humidity, and pressure
- Last-hour traces with a cursor that previews each reading
- Archive browser with presets from 1 day to 1 year, or a custom date range, for
  temperature, humidity, and pressure
- Celsius / Fahrenheit toggle
- Responsive and accessible

## How it works

A Vue + Vite single page pulls readings from two JSON endpoints served by
[Chris's WeatherServer][weather] on the garage Pi, plus a WebSocket for live
updates. Past data arrives pre-thinned on the server, so browsing years of
history stays fast without overwhelming the Pi.

## Acknowledgements

Made possible by the Pi hardware and two projects from [Christian Barbati][chris]:

- [SenseHat][sensehat]: the library that reads the SenseHAT sensors
- [WeatherServer][weather]: the Spring Boot server on the Pi that stores and
  serves the readings this dashboard consumes

[chris]: https://github.com/chrisbarbati
[sensehat]: https://github.com/chrisbarbati/SenseHat
[weather]: https://github.com/chrisbarbati/WeatherServer